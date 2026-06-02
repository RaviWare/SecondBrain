// ── Skill periodic re-scan — auto-disable + surface to the Aegis Queue ────────
// Task 6.6 · Req 9.10, 9.11. The design's Skills Library specifies a PERIODIC
// re-scan that re-runs the same blocking `Security_Scan` (`scanSkill`) on the
// user's INSTALLED Skills — because the catalog definition may have changed since
// install (a bumped version, a re-vetting that now flags it). A Skill that now
// FAILS is AUTO-DISABLED and a corresponding item is surfaced to the Aegis_Queue:
//
//   for each InstalledSkill record:
//     resolve the CURRENT catalog def (getSkill) → run scanSkill(def)
//       • PASS  → refresh scanStatus='passed' + lastScannedAt (leave enabled as-is;
//                 we NEVER auto-re-enable — re-enabling is a deliberate user/install
//                 action, out of scope here).
//       • FAIL  → if currently enabled: AUTO-DISABLE
//                   enabled=false, autoDisabledByScan=true, scanStatus='failed',
//                   scanReasons=[...], lastScannedAt=now
//                 …and surface ONE pending Proposal to the Aegis_Queue describing
//                 the auto-disable. An ALREADY-disabled failing Skill is refreshed
//                 (scanStatus/reasons/lastScannedAt) but NOT re-disabled and surfaces
//                 NO duplicate proposal (it's already off + already surfaced).
//
// SPLIT: the scan decision is a PURE helper (`rescanSkillDef` / `rescanInstalledSkill`)
// so the auto-disable logic Property 13 (task 6.11) targets has no I/O, clock, or
// randomness; `rescanUserSkills` layers the DB load + writes on top.
//
// SURFACE: the design's only Aegis_Queue mechanism is a PENDING `Proposal`
// (the dashboard/Inbox/Work-Board all read `Proposal.find({ status:'pending' })`).
// A re-scan finding isn't tied to an Agent run, so it carries no `agentId`/`runId`
// — those fields are additively optional on the Proposal model (default null, Req
// 11.8) precisely so a SYSTEM-originated queue item can exist. We reuse the
// existing `flagged-content` kind: it is the non-factual hold kind (no citation
// required, `plan:null`, a no-op on approve) — exactly the right shape for a
// "this Skill was auto-disabled, review it" notice. No new enum value is invented.
//
// WIRING NOTE (task 6.8): the protected periodic trigger lives in the route layer.
// `/api/skills` (task 6.8) should call `rescanUserSkills(userId)` from its re-scan
// handler (and/or a scheduled tick). THIS module does NOT touch any route.

import { connectDB } from '@/lib/mongodb'
import { InstalledSkill, Proposal } from '@/lib/models'
import { getSkill } from './catalog'
import { scanSkill, type SkillScanResult, type SkillScanReason } from './security-scan'

// ── Pure part (Property 13 target) ────────────────────────────────────────────

/**
 * The minimal slice of an `InstalledSkill` the pure re-scan reads. Structural (not
 * the Mongoose doc) so the helper stays I/O-free and a `.lean()` row, a plain
 * fixture, or a full hydrated document all satisfy it.
 */
export interface RescanInput {
  skillId: string
  /** whether the Skill is currently enabled BEFORE this re-scan */
  enabled: boolean
}

/**
 * The decision a single re-scan produces for one installed Skill. PURE — derived
 * entirely from the current catalog def's scan verdict + the record's prior
 * `enabled` flag. The caller (`rescanUserSkills`) turns this into the persisted
 * field writes and the optional surfaced Proposal.
 *
 *  - `action: 'auto-disable'` — the scan FAILED and the Skill was enabled; it must
 *    be auto-disabled AND surfaced. Carries the failure `reasons`.
 *  - `action: 'refresh-failed'` — the scan FAILED but the Skill was ALREADY
 *    disabled; refresh its scan fields, do NOT re-disable, do NOT surface a
 *    duplicate. Carries the failure `reasons`.
 *  - `action: 'pass'` — the scan PASSED; refresh scanStatus/lastScannedAt and
 *    leave `enabled` untouched (no auto-re-enable).
 *  - `action: 'unknown-skill'` — no catalog def resolves for this id; nothing to
 *    scan (the install lifecycle owns cleanup of orphaned installs).
 */
export type RescanOutcome =
  | { skillId: string; action: 'auto-disable'; scan: SkillScanResult; reasons: SkillScanReason[] }
  | { skillId: string; action: 'refresh-failed'; scan: SkillScanResult; reasons: SkillScanReason[] }
  | { skillId: string; action: 'pass'; scan: SkillScanResult }
  | { skillId: string; action: 'unknown-skill' }

/**
 * Run `scanSkill` on a CURRENT catalog def — the pure scan half of the re-scan.
 * Same contract as `scanSkill` (total/deterministic); exposed so callers/tests can
 * target the raw verdict for a def directly.
 */
export function rescanSkillDef(def: Parameters<typeof scanSkill>[0]): SkillScanResult {
  return scanSkill(def)
}

/**
 * Decide what a periodic re-scan should do for ONE installed Skill (PURE / TOTAL /
 * DETERMINISTIC). Resolves the CURRENT catalog def for `record.skillId`, runs
 * `scanSkill`, and folds the verdict together with the record's prior `enabled`
 * flag into a {@link RescanOutcome}. No I/O, clock, or randomness — this is the
 * helper Property 13 ("a failing re-scan auto-disables the skill and surfaces it")
 * targets.
 *
 * @param record the installed Skill's id + current enabled flag
 * @param resolve catalog resolver (defaults to `getSkill`); injectable for tests
 */
export function rescanInstalledSkill(
  record: RescanInput,
  resolve: (id: string) => Parameters<typeof scanSkill>[0] | undefined = getSkill,
): RescanOutcome {
  const def = resolve(record.skillId)
  if (!def) return { skillId: record.skillId, action: 'unknown-skill' }

  const scan = scanSkill(def)

  if (scan.status === 'passed') {
    return { skillId: record.skillId, action: 'pass', scan }
  }

  // scan FAILED — auto-disable only if it is currently enabled; otherwise just
  // refresh its failed state (already off, already surfaced → no duplicate).
  if (record.enabled === true) {
    return { skillId: record.skillId, action: 'auto-disable', scan, reasons: scan.reasons }
  }
  return { skillId: record.skillId, action: 'refresh-failed', scan, reasons: scan.reasons }
}

// ── Surfaced Aegis_Queue item ─────────────────────────────────────────────────

/** Human-register title for the auto-disable queue item. */
function autoDisableTitle(skillId: string, def: { name?: string } | undefined): string {
  const label = def?.name ? `${def.name} (${skillId})` : skillId
  return `Skill auto-disabled by security re-scan: ${label}`
}

/** Plain-language "why" for the auto-disable queue item. */
function autoDisableRationale(skillId: string, reasons: readonly SkillScanReason[]): string {
  const list = reasons.length > 0 ? reasons.join(', ') : 'security re-scan failure'
  return (
    `The installed Skill "${skillId}" failed a periodic Security_Scan (${list}) and ` +
    `has been automatically disabled. It can no longer be granted to or invoked by any ` +
    `Agent. Re-install the Skill once the issue is resolved to re-enable it.`
  )
}

// ── Summary ────────────────────────────────────────────────────────────────────

/** What `rescanUserSkills` did across one user's installed Skills. */
export interface RescanSummary {
  userId: string
  /** how many installed Skill records were scanned */
  scanned: number
  /** how many were auto-disabled this run (enabled→false + surfaced) */
  autoDisabled: number
  /** the skillIds that were auto-disabled this run */
  autoDisabledSkillIds: string[]
  /** the ids of the pending Proposals surfaced to the Aegis_Queue this run */
  surfacedProposalIds: string[]
}

// ── Impure orchestration (DB load + writes) ────────────────────────────────────

/**
 * Periodically re-scan ALL of a user's installed Skills and auto-disable any that
 * now fail (Req 9.10, 9.11).
 *
 * For each `InstalledSkill` record (scoped to `userId`):
 *   1. resolve the CURRENT catalog def and run `scanSkill` via the pure
 *      `rescanInstalledSkill`;
 *   2. PASS  → refresh `scanStatus='passed'` + `scanReasons=[]` + `lastScannedAt`
 *              (leave `enabled` untouched — never auto-re-enable);
 *   3. FAIL while ENABLED → AUTO-DISABLE: set
 *              `enabled=false, autoDisabledByScan=true, scanStatus='failed',
 *               scanReasons=[...], lastScannedAt=now`, and surface ONE pending
 *              `Proposal` (kind `flagged-content`) to the Aegis_Queue;
 *   4. FAIL while ALREADY DISABLED → refresh the failed scan fields only; do NOT
 *              re-disable and do NOT surface a duplicate proposal;
 *   5. unknown catalog id → skip (the install lifecycle owns orphan cleanup).
 *
 * Returns a {@link RescanSummary} (scanned / auto-disabled counts, the disabled
 * skillIds, and the surfaced proposal ids). Per-record failures are isolated so
 * one bad record never aborts the whole sweep.
 *
 * @param userId the Clerk user id whose installed Skills to re-scan
 * @param opts.now injectable clock for `lastScannedAt` (defaults to `new Date()`)
 */
export async function rescanUserSkills(
  userId: string,
  opts: { now?: Date } = {},
): Promise<RescanSummary> {
  await connectDB()
  const now = opts.now ?? new Date()

  const records = await InstalledSkill.find({ userId }).lean<Array<RescanInput & { _id?: unknown }>>()

  const summary: RescanSummary = {
    userId,
    scanned: 0,
    autoDisabled: 0,
    autoDisabledSkillIds: [],
    surfacedProposalIds: [],
  }

  for (const record of records) {
    const outcome = rescanInstalledSkill({ skillId: record.skillId, enabled: record.enabled })
    summary.scanned += 1

    if (outcome.action === 'unknown-skill') continue

    if (outcome.action === 'pass') {
      // Refresh the passing scan state; never auto-re-enable a disabled Skill.
      await InstalledSkill.updateOne(
        { userId, skillId: outcome.skillId },
        { $set: { scanStatus: 'passed', scanReasons: [], lastScannedAt: now } },
      )
      continue
    }

    if (outcome.action === 'refresh-failed') {
      // Already disabled → refresh the failed verdict only; no re-disable, no
      // duplicate Aegis item. (autoDisabledByScan is left as it already is.)
      await InstalledSkill.updateOne(
        { userId, skillId: outcome.skillId },
        { $set: { scanStatus: 'failed', scanReasons: outcome.reasons, lastScannedAt: now } },
      )
      continue
    }

    // outcome.action === 'auto-disable' — the load-bearing Req 9.11 path.
    await InstalledSkill.updateOne(
      { userId, skillId: outcome.skillId },
      {
        $set: {
          enabled: false,
          autoDisabledByScan: true,
          scanStatus: 'failed',
          scanReasons: outcome.reasons,
          lastScannedAt: now,
        },
      },
    )

    // Surface ONE pending Proposal to the Aegis_Queue (Req 9.11). System-originated:
    // no agentId/runId (additively optional, default null), kind 'flagged-content'
    // (non-factual hold — no citation, null plan, no-op on approve). It carries the
    // failure reasons in scanResult so the queue can render "why".
    const def = getSkill(outcome.skillId)
    const proposal = await Proposal.create({
      userId,
      kind: 'flagged-content',
      title: autoDisableTitle(outcome.skillId, def),
      rationale: autoDisableRationale(outcome.skillId, outcome.reasons),
      citations: [],
      plan: null,
      stakes: 'sign-off-required',
      status: 'pending',
      scanResult: { source: 'skill-rescan', skillId: outcome.skillId, reasons: outcome.reasons },
    })

    summary.autoDisabled += 1
    summary.autoDisabledSkillIds.push(outcome.skillId)
    summary.surfacedProposalIds.push(String((proposal as { _id?: unknown })._id))
  }

  return summary
}
