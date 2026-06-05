// ── Mission lifecycle FSM + executable predicate ─────────────────────────────────
// Pure, total, deterministic state machine for a Mission's lifecycle state, plus the
// `isExecutable` predicate the Mission Executor (Phase 3) uses to decide whether a
// Mission may start NEW Mission_Task Runs.
//
// See design.md → "Components and Interfaces · 1. Mission lifecycle FSM", Requirement
// 3.1/3.4/3.7 and 9.1–9.11, and **Property 3** ("Mission lifecycle transitions are
// total, gated, and terminal-absorbing"). The fast-check property test is task 1.2
// (separate); this file is built so that EVERY (state, event) input satisfies it.
//
// It follows the EXACT pattern of `src/lib/agents/lifecycle.ts` (the Agent lifecycle
// FSM): a local union kept in sync with the model enum, a deterministic transition
// table, a TOTAL `transition`, and a small runnable/executable predicate.
//
// Design guarantees enforced here:
//   • TOTALITY — for ANY state + ANY event, `transition` returns a VALID MissionState.
//     It never throws and never returns an illegal/undefined value. An event that is
//     not permitted from the current state leaves the state UNCHANGED (Req 9.10).
//   • TERMINAL-ABSORBING — `completed`, `failed`, and `aborted` are absorbing: no event
//     leaves them, so a terminal Mission can never restart a Run (Req 9.11).
//   • APPROVAL GATE (Req 3.4, 3.7) — `approve` is the ONLY edge into `running` from
//     `awaiting-plan-approval`, which makes "no transition to running without an
//     explicit Plan_Approval" an FSM invariant — execution can never begin unbidden.

// ── Mission lifecycle states ─────────────────────────────────────────────────────
// EXACTLY the planned `Mission.lifecycle` enum from `src/lib/models.ts`. Kept as a
// local union (matching the pattern in `lifecycle.ts` / `trust.ts`) so this stays a
// dependency-free pure module; it MUST stay in sync with the model's enum verbatim.
export type MissionState =
  | 'planning'
  | 'awaiting-plan-approval'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'aborted'

/** All mission states in their canonical lifecycle order (Req 9.1). */
export const MISSION_STATES: readonly MissionState[] = [
  'planning',
  'awaiting-plan-approval',
  'running',
  'paused',
  'completed',
  'failed',
  'aborted',
] as const

/** The lifecycle state a freshly-created Mission starts in (Req 1.1, 9.2). */
export const INITIAL_MISSION_STATE: MissionState = 'planning'

// ── Mission lifecycle events ─────────────────────────────────────────────────────
// The events that drive transitions across the FSM. Each names a user/system action
// that moves the Mission forward; an event that is not valid from the current state is
// a no-op (the state is returned unchanged), which is what keeps `transition` TOTAL.
//
//   planning ──decomposed-ok──▶ awaiting-plan-approval ──approve──▶ running
//      │                              │                                │
//      └─decomposition-failed─▶ failed└─reject─▶ aborted   running ⇄ paused (pause/resume)
//                                                          running/paused ──abort──▶ aborted
//                                                          running ──complete──▶ completed
//   completed | failed | aborted: absorbing (no event leaves them) (Req 9.11)
export type MissionEvent =
  | 'decomposed-ok' // planning → awaiting-plan-approval (acyclic + within Graph_Limit) (Req 9.3)
  | 'decomposition-failed' // planning → failed (cyclic OR Graph_Limit exceeded) (Req 2.7, 5.2, 9.8)
  | 'approve' // awaiting-plan-approval → running (explicit Plan_Approval) (Req 3.4, 9.4)
  | 'reject' // awaiting-plan-approval → aborted (Req 3.6)
  | 'pause' // running → paused (Kill_Switch pause) (Req 5.11, 9.5)
  | 'resume' // paused → running (Req 9.6)
  | 'complete' // running → completed (all terminal, ≥1 completed) (Req 9.7)
  | 'abort' // running|paused → aborted (Kill_Switch abort OR safety ceiling) (Req 5.6, 5.9, 5.12, 9.9)

/** All mission events, for exhaustive iteration (legends / property tests). */
export const MISSION_EVENTS: readonly MissionEvent[] = [
  'decomposed-ok',
  'decomposition-failed',
  'approve',
  'reject',
  'pause',
  'resume',
  'complete',
  'abort',
] as const

// ── The deterministic transition table ───────────────────────────────────────────
// Permitted moves only. Any (state, event) pair absent from this table is an invalid
// move and leaves the state unchanged — that fallback is what makes `transition` TOTAL.
// The three terminal states (`completed`, `failed`, `aborted`) intentionally have EMPTY
// rows: they are absorbing, so no event ever leaves them (Req 9.11).
const TRANSITIONS: Record<MissionState, Partial<Record<MissionEvent, MissionState>>> = {
  planning: {
    'decomposed-ok': 'awaiting-plan-approval',
    'decomposition-failed': 'failed',
  },
  'awaiting-plan-approval': {
    approve: 'running', // the ONLY edge into `running` (Req 3.4, 3.7)
    reject: 'aborted',
  },
  running: {
    pause: 'paused',
    complete: 'completed',
    abort: 'aborted',
  },
  paused: {
    resume: 'running',
    abort: 'aborted',
  },
  completed: {}, // absorbing terminal state (Req 9.11)
  failed: {}, // absorbing terminal state (Req 9.11)
  aborted: {}, // absorbing terminal state (Req 9.11)
}

/**
 * Advance the Mission lifecycle FSM. PURE, TOTAL, DETERMINISTIC — no I/O.
 *
 * For ANY `state` + ANY `event` it returns a valid `MissionState`:
 *   • a permitted move returns the target state,
 *   • a terminal state (`completed` | `failed` | `aborted`) is absorbing — no event
 *     leaves it, so a finished Mission can never restart a Run (Req 9.11),
 *   • any non-permitted (state, event) pair returns `state` UNCHANGED (Req 9.10).
 *
 * It never throws and never returns an illegal/undefined state. Because `approve` is
 * the only edge into `running` from `awaiting-plan-approval`, "no transition to running
 * without an explicit Plan_Approval" holds as an FSM invariant (Req 3.4, 3.7). Property
 * test: 1.2 (Property 3).
 */
export function transition(state: MissionState, event: MissionEvent): MissionState {
  // Normalize an off-union/garbage input state (e.g. a value read back from the
  // DB/API that bypasses the type system) to the SAFE initial state. The Mongoose
  // enum normally prevents this, but `transition` must be TOTAL-TO-VALID per its
  // contract: it always RETURNS a valid `MissionState` and never an illegal one. A
  // corrupt state resets to the most conservative stage (`planning`), from which the
  // Mission must re-earn the Plan_Approval gate — never a privilege gain.
  const s: MissionState = (MISSION_STATES as readonly string[]).includes(state)
    ? state
    : INITIAL_MISSION_STATE

  // Table lookup on the normalized state, with "unchanged" as the total/safe fallback
  // for an event that is not permitted from `s`. The own-property guard prevents an
  // off-union event that collides with an Object.prototype member (e.g. 'toString',
  // 'constructor', 'valueOf') from resolving to an inherited function instead of a real
  // target state — so the result is always a valid state.
  const row = TRANSITIONS[s]
  return Object.prototype.hasOwnProperty.call(row, event) ? (row[event] ?? s) : s
}

// ── Executable predicate ─────────────────────────────────────────────────────────

/**
 * May the Mission Executor start NEW Mission_Task Runs for a Mission in this state?
 * PURE, TOTAL, DETERMINISTIC.
 *
 * Returns TRUE iff the Mission is `running`. Every other state — `planning` and
 * `awaiting-plan-approval` (no Run before the user approves the plan, Req 3.1), `paused`
 * (Kill_Switch pause, Req 5.11), and the absorbing terminals `completed` / `failed` /
 * `aborted` (Req 9.11) — yields FALSE, so the Executor never starts a Run unless the
 * Mission is actively running.
 */
export function isExecutable(state: MissionState): boolean {
  return state === 'running'
}
