// ── Skill install flow — the scan-gated Capability_Grant ──────────────────────
// `installSkill` is the single entry point for installing a catalog Skill into a
// user's runtime (task 6.4 · Req 9.3, 9.4, 9.5, 9.6). It enforces the blocking
// install gate from the design's Skills Library flow:
//
//   resolve catalog SkillDef → run the blocking Security_Scan (`scanSkill`) →
//     • scan FAILS  → BLOCK: add NOTHING to the runtime, no enabled grant.
//     • scan PASSES → create the InstalledSkill **Capability_Grant**.
//
// CAPABILITY vs AUTHORITY (Req 9.6 — the load-bearing distinction):
//   Installing a Skill is a *Capability_Grant*: the Skill now EXISTS in the user's
//   gstack runtime and its metadata is readable. It grants NO Agent the right to
//   invoke it. Granting an Agent the right to use an installed+enabled Skill is a
//   separate *Authority_Grant* (task 6.5), which writes `Agent.assignedSkillIds`.
//   THIS MODULE NEVER TOUCHES `Agent` — it imports only `InstalledSkill`. That is
//   the structural proof that installation confers existence/visibility, never
//   authority. (Property 12, task 6.10, property-tests this invariant.)
//
// The scan-gate decision is factored into a PURE / TOTAL / DETERMINISTIC helper
// (`decideInstall`) so the install logic the property test targets has no I/O,
// clock, or randomness; `installSkill` layers the DB upsert on top.

import { connectDB } from '@/lib/mongodb'
import { InstalledSkill } from '@/lib/models'
import { getSkill, type SkillDef } from './catalog'
import { scanSkill, type SkillScanReason } from './security-scan'

/**
 * The pure scan-gate decision for a known Skill definition. No persistence — just
 * "would this install be blocked, and with what scan verdict?". Total &
 * deterministic: same `def` ⇒ same decision (mirrors `scanSkill`'s contract).
 */
export type InstallDecision =
  | { gate: 'pass'; scanStatus: 'passed'; installedVersion: string; scanReasons: [] }
  | { gate: 'block'; scanStatus: 'failed'; scanReasons: SkillScanReason[] }

/**
 * Result of an install attempt.
 *  - `installed`     — scan passed; the InstalledSkill Capability_Grant exists
 *                      (enabled, scanStatus 'passed'). `created` distinguishes a
 *                      first install from an idempotent re-install.
 *  - `blocked`       — scan failed; NOTHING was added to the runtime. Carries the
 *                      scan `reasons` for display.
 *  - `unknown-skill` — no catalog Skill with that id; no record created.
 */
export type InstallResult =
  | {
      ok: true
      status: 'installed'
      skillId: string
      installedVersion: string
      enabled: true
      scanStatus: 'passed'
      created: boolean
    }
  | {
      ok: false
      status: 'blocked'
      skillId: string
      scanStatus: 'failed'
      reasons: SkillScanReason[]
    }
  | {
      ok: false
      status: 'unknown-skill'
      skillId: string
    }

/**
 * Decide the install gate for a resolved catalog Skill (PURE).
 *
 * The Skill is installable iff its blocking Security_Scan passes. A failing scan
 * blocks the install and carries the failure reasons; nothing is persisted by
 * this function regardless of outcome.
 */
export function decideInstall(def: SkillDef): InstallDecision {
  const scan = scanSkill(def)
  if (scan.status === 'failed') {
    return { gate: 'block', scanStatus: 'failed', scanReasons: scan.reasons }
  }
  return {
    gate: 'pass',
    scanStatus: 'passed',
    installedVersion: def.version,
    scanReasons: [],
  }
}

/**
 * Install a catalog Skill for a user, gated by the blocking Security_Scan.
 *
 * @param userId  Clerk user id the install belongs to.
 * @param skillId Catalog Skill id (`SKILLS[].id`).
 * @param opts.now Injectable clock for `lastScannedAt` (defaults to `new Date()`),
 *                 used to keep tests deterministic.
 *
 * On a PASSING scan this performs the Capability_Grant: it upserts the per-user
 * `InstalledSkill` (unique on `userId`+`skillId`, so re-install is idempotent) as
 * `enabled: true, scanStatus: 'passed'`, recording `installedVersion =
 * def.version`. It does NOT write to `Agent` — no Agent gains authority to invoke
 * the Skill as a side effect of installation (Req 9.6).
 *
 * On a FAILING scan it BLOCKS: it adds nothing to the runtime (no enabled grant)
 * and returns the scan reasons (Req 9.4). On an unknown id it fails cleanly with
 * no record created.
 */
export async function installSkill(
  userId: string,
  skillId: string,
  opts: { now?: Date } = {},
): Promise<InstallResult> {
  const def = getSkill(skillId)
  if (!def) {
    // Unknown Skill — fail cleanly, create nothing.
    return { ok: false, status: 'unknown-skill', skillId }
  }

  const decision = decideInstall(def)
  if (decision.gate === 'block') {
    // Scan FAILED → block installation, add NOTHING to the runtime (Req 9.4).
    // We intentionally persist no record here: the design default is "add nothing
    // to the runtime", so a blocked install leaves no enabled grant — and no row
    // at all — behind. (Property 12: a failing scan never produces an enabled
    // InstalledSkill.)
    return {
      ok: false,
      status: 'blocked',
      skillId,
      scanStatus: 'failed',
      reasons: decision.scanReasons,
    }
  }

  // Scan PASSED → complete the Capability_Grant (Req 9.5). Upsert keyed on the
  // unique { userId, skillId } so a re-install is idempotent. We re-assert the
  // passed/enabled state (clearing any prior auto-disable) and pin the installed
  // version to the catalog's current `version`.
  await connectDB()
  const now = opts.now ?? new Date()
  const result = await InstalledSkill.findOneAndUpdate(
    { userId, skillId },
    {
      $set: {
        installedVersion: decision.installedVersion,
        enabled: true,
        scanStatus: 'passed',
        scanReasons: [],
        lastScannedAt: now,
        autoDisabledByScan: false,
      },
      $setOnInsert: { userId, skillId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, rawResult: true },
  )

  // `rawResult` exposes whether this upsert inserted a new doc (first install) vs
  // updated an existing one (idempotent re-install). Tolerant of mongoose driver
  // shape differences so the flag is best-effort, never throwing.
  const created = isUpsertedInsert(result)

  return {
    ok: true,
    status: 'installed',
    skillId,
    installedVersion: decision.installedVersion,
    enabled: true,
    scanStatus: 'passed',
    created,
  }
}

/**
 * Best-effort "did this upsert insert a brand-new document?" check across the
 * shapes `findOneAndUpdate(..., { rawResult: true })` can return. Returns `false`
 * (treat as an update) when the shape is unrecognized — never throws.
 */
function isUpsertedInsert(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as {
    lastErrorObject?: { updatedExisting?: boolean; upserted?: unknown }
    upsertedCount?: number
  }
  if (r.lastErrorObject && typeof r.lastErrorObject.updatedExisting === 'boolean') {
    return r.lastErrorObject.updatedExisting === false
  }
  if (r.lastErrorObject && 'upserted' in r.lastErrorObject) {
    return r.lastErrorObject.upserted != null
  }
  if (typeof r.upsertedCount === 'number') return r.upsertedCount > 0
  return false
}
