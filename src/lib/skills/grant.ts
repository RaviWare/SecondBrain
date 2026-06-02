// ── Skill Authority_Grant — assign an installed+enabled Skill to an Agent ─────
// Task 6.5 · Req 9.7, 9.8, 9.12. This is the SECOND of the two-step grant model
// from the design's Skills Library flow, and the structural counterpart to the
// install flow (`install.ts`, task 6.4):
//
//   • Capability_Grant (install.ts) — installing a Skill makes it EXIST in the
//     user's runtime (an `InstalledSkill` row). It grants NO Agent the right to
//     invoke it. Install NEVER touches `Agent`.
//   • Authority_Grant (THIS module)  — assigning an installed+ENABLED Skill to a
//     specific Agent grants that Agent the right to use it within its
//     Trust_Scope. This is the ONLY place a Skill id is written to
//     `Agent.assignedSkillIds`.
//
// THE DISABLED-SKILL INVARIANT (Property 11, task 6.9 — "a disabled skill is
// never grantable and never invokable", Req 9.8 + 9.12) is enforced on BOTH ends
// and both ends live in this file:
//
//   1. GRANT TIME (Req 9.8) — `grantSkillToAgent` BLOCKS the Authority_Grant for a
//      Skill that is not installed, or installed but disabled (including a Skill
//      auto-disabled by a failing periodic re-scan, `autoDisabledByScan`). It
//      writes nothing on a blocked grant.
//   2. RUN TIME (Req 9.12) — `invocableSkillIds` / `isSkillInvocable` filter an
//      Agent's `assignedSkillIds` down to only those still installed AND enabled.
//      The run path (`/api/agents/[id]/run`) feeds the runner the invocable set
//      ONLY, so a Skill that was disabled AFTER it was granted (and therefore
//      still lingers in `assignedSkillIds`) is never invoked during a Run.
//
// The run-time guard (`invocableSkillIds` / `isSkillInvocable`) is PURE — no I/O,
// clock, or randomness — so Property 11 (task 6.9) can target it directly.

import { connectDB } from '@/lib/mongodb'
import { Agent, InstalledSkill } from '@/lib/models'

// ── Run-time invocability guard (PURE · Req 9.12) ─────────────────────────────

/**
 * The minimal slice of an `InstalledSkill` the invocability guard reads. Kept
 * structural (not the Mongoose doc) so the pure helpers stay I/O-free and a
 * `.lean()` row, a plain fixture, or a full document all satisfy it.
 */
export interface InstalledSkillState {
  skillId: string
  enabled: boolean
}

/**
 * Is `skillId` invocable right now? True iff there is an installed record for it
 * AND that record is `enabled`. A disabled record (manual or auto-disabled by a
 * failing re-scan) and a missing record both yield `false` (Req 9.12).
 *
 * PURE / TOTAL / DETERMINISTIC — no I/O.
 */
export function isSkillInvocable(
  skillId: string,
  installedRecords: readonly InstalledSkillState[],
): boolean {
  if (typeof skillId !== 'string' || !skillId) return false
  const rec = (installedRecords ?? []).find((r) => r && r.skillId === skillId)
  return Boolean(rec && rec.enabled === true)
}

/**
 * Filter an Agent's `assignedSkillIds` down to only those that are STILL
 * installed and enabled — the run-time enforcement of Req 9.12. Order is
 * preserved and duplicates are collapsed. A Skill disabled (or uninstalled)
 * after it was granted is excluded here even though it may still appear in
 * `assignedSkillIds`, so it is never invoked during a Run.
 *
 * PURE / TOTAL / DETERMINISTIC — this is the helper Property 11 targets.
 */
export function invocableSkillIds(
  assignedSkillIds: readonly string[] | null | undefined,
  installedRecords: readonly InstalledSkillState[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of assignedSkillIds ?? []) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue
    seen.add(id)
    if (isSkillInvocable(id, installedRecords)) out.push(id)
  }
  return out
}

// ── Grant-time results (Req 9.7, 9.8) ─────────────────────────────────────────

/** Why an Authority_Grant was blocked (Req 9.8). */
export type GrantBlockReason = 'not-installed' | 'disabled' | 'auto-disabled-by-scan'

/**
 * Outcome of an Authority_Grant attempt.
 *  - `granted`         — Skill is installed+enabled; it is now (or already was) in
 *                        the Agent's `assignedSkillIds`. `added` distinguishes a
 *                        fresh grant from an idempotent re-grant.
 *  - `blocked`         — Skill is not installed, or installed but disabled; the
 *                        grant wrote NOTHING. `reason` says which.
 *  - `agent-not-found` — no Agent with that id for this user; nothing written.
 */
export type GrantResult =
  | { ok: true; status: 'granted'; agentId: string; skillId: string; added: boolean }
  | {
      ok: false
      status: 'blocked'
      agentId: string
      skillId: string
      reason: GrantBlockReason
    }
  | { ok: false; status: 'agent-not-found'; agentId: string; skillId: string }

/** Outcome of a revoke (symmetry for the UI/route). */
export type RevokeResult =
  | { ok: true; status: 'revoked'; agentId: string; skillId: string; removed: boolean }
  | { ok: false; status: 'agent-not-found'; agentId: string; skillId: string }

/**
 * Authority_Grant: assign an installed, enabled Skill to an Agent (Req 9.7).
 *
 * Loads the user's `InstalledSkill` for `skillId`. The grant is BLOCKED (and
 * writes nothing) when the Skill is:
 *   • not installed                         → reason `'not-installed'`
 *   • installed but auto-disabled by a scan → reason `'auto-disabled-by-scan'`
 *   • installed but otherwise disabled      → reason `'disabled'`
 * (Req 9.8 — a disabled Skill is never grantable.)
 *
 * When the Skill is installed AND enabled, it adds `skillId` to the Agent's
 * `assignedSkillIds` via `$addToSet` (idempotent — never a duplicate), scoped to
 * `{ _id: agentId, userId }` so a user can only grant to their own Agent.
 *
 * @returns a {@link GrantResult}; `added` is `false` on an idempotent re-grant.
 */
export async function grantSkillToAgent(
  userId: string,
  agentId: string,
  skillId: string,
): Promise<GrantResult> {
  await connectDB()

  // 1. Resolve the per-user install state. No record ⇒ not installed ⇒ blocked.
  const installed = await InstalledSkill.findOne({ userId, skillId })
  if (!installed) {
    return { ok: false, status: 'blocked', agentId, skillId, reason: 'not-installed' }
  }

  // 2. Disabled (manual or auto-disabled-by-scan) ⇒ blocked (Req 9.8). Write nothing.
  if (installed.enabled !== true) {
    const reason: GrantBlockReason = installed.autoDisabledByScan
      ? 'auto-disabled-by-scan'
      : 'disabled'
    return { ok: false, status: 'blocked', agentId, skillId, reason }
  }

  // 3. Installed + enabled ⇒ perform the Authority_Grant. Read the Agent first
  //    (scoped to the user) so we can both confirm ownership and report whether
  //    this is a fresh grant vs an idempotent re-grant.
  const agent = await Agent.findOne({ _id: agentId, userId })
  if (!agent) {
    return { ok: false, status: 'agent-not-found', agentId, skillId }
  }

  const already = (agent.assignedSkillIds ?? []).includes(skillId)
  if (!already) {
    // $addToSet keeps the grant idempotent (no duplicates) even under races.
    await Agent.updateOne({ _id: agentId, userId }, { $addToSet: { assignedSkillIds: skillId } })
  }

  return { ok: true, status: 'granted', agentId, skillId, added: !already }
}

/**
 * Revoke an Authority_Grant: remove `skillId` from the Agent's `assignedSkillIds`
 * (symmetry with {@link grantSkillToAgent}; the UI/route can use it to un-assign a
 * Skill). Scoped to `{ _id: agentId, userId }`. `removed` is `false` when the
 * Skill was not assigned in the first place (idempotent).
 */
export async function revokeSkillFromAgent(
  userId: string,
  agentId: string,
  skillId: string,
): Promise<RevokeResult> {
  await connectDB()

  const agent = await Agent.findOne({ _id: agentId, userId })
  if (!agent) {
    return { ok: false, status: 'agent-not-found', agentId, skillId }
  }

  const had = (agent.assignedSkillIds ?? []).includes(skillId)
  if (had) {
    await Agent.updateOne({ _id: agentId, userId }, { $pull: { assignedSkillIds: skillId } })
  }

  return { ok: true, status: 'revoked', agentId, skillId, removed: had }
}
