// ── Mission safety gate + Mission_Budget (the NEW fourth ceiling) ────────────────
// Pure, total, deterministic helpers for the mission-level safety controls that sit
// ON TOP of the existing three-level token Budget (`canStartRun` in
// `src/lib/agents/budget.ts`). This is the **fourth ceiling**, never a replacement:
// when `missionGate` allows a task Run, `runAgentOnce` STILL applies the existing
// per-Run / per-Agent / Squad guard afterward (Req 5.7) — this module only adds a
// mission-wide ceiling on top of it, it can never weaken `canStartRun`.
//
// See design.md → "Components and Interfaces · 4. Safety gate + Mission_Budget" and
// Requirements 5.5, 5.6, 5.8, 5.9, 6.2, 6.3. Like `budget.ts`, this module has NO I/O
// and imports no Mongoose model: the async executor (task 3.2) reads the real
// `Mission.usage` / `Mission.limits` / `Mission.startedAt` fields and the live `now`,
// then passes PLAIN NUMBERS in, so the property tests (Properties 4 & 10, tasks
// 1.10/1.11) can drive these functions directly.
//
// The only import is the `MissionState` union from the pure lifecycle FSM, so the
// gate can express its "only a `running` mission may start new Runs" rule against the
// canonical state type (and reuse `isExecutable` as the single source of truth).
//
// ── The "0 / non-finite ceiling means UNLIMITED" convention ──────────────────────
// Identical to `budget.ts`: a mission ceiling that is `<= 0` or non-finite means "not
// configured" — it is UNLIMITED, can never be "reached", and never stops the mission.
// A ceiling is ACTIVE only when it is a finite value strictly `> 0`, and only an active
// ceiling can stop the mission via the literal `used >= ceiling` rule. The same applies
// to the Wall_Clock_Limit: a `0` / non-finite `wallClockLimitMs` means no wall-clock
// bound. This keeps an unset mission entirely unbounded by its own ceilings (the
// existing `canStartRun` guard still bounds spend), which is what the model's `0`
// defaults expect.
//
// TOTALITY: negative / NaN / Infinity inputs are sanitized; these functions never throw
// and always return a well-formed result.

import type { MissionState } from './lifecycle'
import { isExecutable } from './lifecycle'

// ── Mission_Budget ───────────────────────────────────────────────────────────────

/**
 * The accumulated mission spend vs its OWN ceilings (design.md → Mission_Budget).
 * `tokensUsed` / `costUsed` are summed from the real `AgentRun` records of this
 * mission's tasks (Req 11.2); `tokenCeiling` / `costCeiling` are the hard caps from
 * `Mission.limits`. A `0` / non-finite ceiling means UNLIMITED (same convention as
 * `budget.ts`).
 */
export interface MissionBudget {
  /** Hard cap on total mission tokens (`Mission.limits.tokenCeiling`). `<= 0` / non-finite ⇒ unlimited. */
  tokenCeiling: number
  /** Hard cap on total mission cost (`Mission.limits.costCeiling`). `<= 0` / non-finite ⇒ unlimited. */
  costCeiling: number
  /** Tokens accumulated across this mission's task Runs (`Mission.usage.tokensUsed`, Req 11.2). */
  tokensUsed: number
  /** Cost accumulated across this mission's task Runs (`Mission.usage.costUsed`, Req 11.2). */
  costUsed: number
}

/** The wall-clock timing inputs for the Wall_Clock_Limit check (all in ms epoch / ms). */
export interface MissionTiming {
  /** When the mission entered `running` — `Mission.startedAt` as ms epoch (anchors Wall_Clock). */
  startedAt: number
  /** The current instant as ms epoch. */
  now: number
  /** Wall_Clock_Limit in ms (`Mission.limits.wallClockLimitMs`). `<= 0` / non-finite ⇒ unlimited. */
  wallClockLimitMs: number
}

/**
 * The specific ceiling a mission reached, so the abort record can name the exact limit
 * type (Req 5.6, 5.9). Token vs cost are distinguished deliberately.
 */
export type MissionCeilingReason = 'mission-token-ceiling' | 'mission-cost-ceiling' | 'wall-clock'

/** The result of {@link missionCeilingReached}: either no stop, or a stop with its reason. */
export type MissionCeilingResult = { stop: false } | { stop: true; reason: MissionCeilingReason }

/** Why the {@link missionGate} disallowed a new task Run; present iff `allowed === false`. */
export type MissionGateReason = 'not-running' | 'concurrency-full' | MissionCeilingReason

/** The return shape of {@link missionGate}. `reason` is present iff `allowed === false`. */
export interface MissionGateResult {
  allowed: boolean
  reason?: MissionGateReason
}

// ── Numeric helpers (keep everything total) ──────────────────────────────────────

/** A finite count clamped to `>= 0`; anything non-finite/negative ⇒ 0. */
function nonNegFinite(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** A ceiling is ACTIVE (enforceable) only when it is a finite value strictly `> 0`. */
function isActiveCeiling(ceiling: number): boolean {
  return Number.isFinite(ceiling) && ceiling > 0
}

// ── missionCeilingReached ──────────────────────────────────────────────────────────

/**
 * Has the mission hit one of its OWN ceilings? PURE, TOTAL, DETERMINISTIC. No I/O.
 * PBT target (Property 4, task 1.10).
 *
 * Reports `{ stop: true; reason }` when ANY active ceiling is reached, checked in a
 * fixed DETERMINISTIC precedence so the abort record names a single, stable limit when
 * more than one is simultaneously hit:
 *
 *   1. token ceiling  — ACTIVE `tokenCeiling` with `tokensUsed >= tokenCeiling`  → `'mission-token-ceiling'`
 *   2. cost ceiling   — ACTIVE `costCeiling`  with `costUsed   >= costCeiling`   → `'mission-cost-ceiling'`
 *   3. wall-clock     — ACTIVE `wallClockLimitMs` with `now - startedAt >= wallClockLimitMs` → `'wall-clock'`
 *
 * The order (token → cost → wall-clock) is the documented precedence: token and cost
 * are distinguished (Req 5.6) so the mission can record exactly which spend limit it
 * tripped, and the wall-clock bound is reported only when neither spend ceiling stops
 * the mission first.
 *
 * An UNSET ceiling (`0` / non-finite, per the `budget.ts` convention) is never active
 * and so never stops the mission — an entirely unconfigured `MissionBudget`/timing
 * always returns `{ stop: false }` (Req 5.5, 5.8). Negative / NaN usage is treated as
 * `0`. Never throws.
 */
export function missionCeilingReached(budget: MissionBudget, timing: MissionTiming): MissionCeilingResult {
  const tokenCeiling = budget?.tokenCeiling as number
  const costCeiling = budget?.costCeiling as number
  const tokensUsed = nonNegFinite(budget?.tokensUsed)
  const costUsed = nonNegFinite(budget?.costUsed)

  // 1. Token ceiling (active ceiling only) — Req 5.5, 5.6.
  if (isActiveCeiling(tokenCeiling) && tokensUsed >= tokenCeiling) {
    return { stop: true, reason: 'mission-token-ceiling' }
  }

  // 2. Cost ceiling (active ceiling only) — distinguished from tokens (Req 5.6).
  if (isActiveCeiling(costCeiling) && costUsed >= costCeiling) {
    return { stop: true, reason: 'mission-cost-ceiling' }
  }

  // 3. Wall-clock (active limit only) — elapsed since the mission started (Req 5.8, 5.9).
  const wallClockLimitMs = timing?.wallClockLimitMs as number
  if (isActiveCeiling(wallClockLimitMs)) {
    const startedAt = nonNegFinite(timing?.startedAt)
    const now = nonNegFinite(timing?.now)
    if (now - startedAt >= wallClockLimitMs) {
      return { stop: true, reason: 'wall-clock' }
    }
  }

  return { stop: false }
}

// ── missionGate ────────────────────────────────────────────────────────────────────

/**
 * The single pre-flight a mission task Run must pass BEFORE `runAgentOnce`. PURE,
 * TOTAL, DETERMINISTIC. No I/O. PBT target alongside Property 4 (task 1.10).
 *
 * `allowed === true` IFF ALL of the following hold:
 *   • `missionState === 'running'`                       (no Run before Plan_Approval,
 *     none while paused/terminal — via `isExecutable`, Req 3.1, 9.11)
 *   • `missionCeilingReached(budget, timing).stop === false`  (no Mission_Budget /
 *     Wall_Clock ceiling reached, Req 5.6, 5.9)
 *   • `runningCount < concurrencyLimit`                  (a free Concurrency_Limit slot,
 *     Req 5.3, 5.4)
 *
 * When disallowed, `reason` names the FIRST failing check in this priority order:
 *   1. `'not-running'`         — the mission is not in `running`
 *   2. the ceiling reason      — `'mission-token-ceiling' | 'mission-cost-ceiling' | 'wall-clock'`
 *   3. `'concurrency-full'`    — no remaining concurrency slot
 *
 * Checking state first means a paused/terminal mission is reported as `'not-running'`
 * rather than leaking a ceiling/concurrency detail. When allowed, `runAgentOnce` STILL
 * applies the existing three-level `canStartRun` guard (Req 5.7) — this gate never
 * weakens it, it only layers a mission ceiling on top. Never throws.
 */
export function missionGate(input: {
  missionState: MissionState
  budget: MissionBudget
  timing: MissionTiming
  runningCount: number
  concurrencyLimit: number
}): MissionGateResult {
  // 1. Only a `running` mission may start NEW task Runs (single source of truth: the
  //    lifecycle FSM's `isExecutable`). Covers planning / awaiting-plan-approval /
  //    paused / completed / failed / aborted (Req 3.1, 9.11).
  if (!isExecutable(input?.missionState)) {
    return { allowed: false, reason: 'not-running' }
  }

  // 2. The mission's own ceilings (Mission_Budget token/cost + Wall_Clock) — Req 5.6, 5.9.
  const ceiling = missionCeilingReached(input.budget, input.timing)
  if (ceiling.stop) {
    return { allowed: false, reason: ceiling.reason }
  }

  // 3. A free Concurrency_Limit slot must remain (Req 5.3, 5.4). Sanitized so a
  //    non-finite/negative limit or count can never spuriously authorize a Run: an
  //    unset/<=0 concurrency limit leaves no slot.
  const runningCount = nonNegFinite(input?.runningCount)
  const concurrencyLimit = nonNegFinite(input?.concurrencyLimit)
  if (runningCount < concurrencyLimit) {
    return { allowed: true }
  }
  return { allowed: false, reason: 'concurrency-full' }
}

// ── canSpawnSubAgent ────────────────────────────────────────────────────────────────

/**
 * Mission Sub_Agent nesting bound (Req 6.2, 6.3). PURE, TOTAL, DETERMINISTIC. PBT
 * target (Property 10, task 1.11).
 *
 * Permits a spawn IFF `currentDepth < graphLimitDepth` — a Sub_Agent may nest only
 * while it stays strictly below the Graph_Limit depth, so a spawn that would reach or
 * exceed the depth is refused. The mission path adds ONLY this depth bound on top of
 * the verbatim-reused `resolveSubScope` / `spawnSubAgent` (scope ⊆ parent); it never
 * widens scope.
 *
 * Inputs are sanitized to non-negative finite values so a NaN / Infinity / negative
 * depth can never accidentally authorize an unbounded spawn: a non-finite or `<= 0`
 * `graphLimitDepth` leaves no headroom and refuses every spawn. Never throws.
 */
export function canSpawnSubAgent(currentDepth: number, graphLimitDepth: number): boolean {
  return nonNegFinite(currentDepth) < nonNegFinite(graphLimitDepth)
}
