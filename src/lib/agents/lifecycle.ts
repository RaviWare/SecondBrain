// ── Agent lifecycle FSM + runnable predicate ────────────────────────────────────
// Pure, total, deterministic state machine for an Agent's lifecycle stage, plus the
// `isRunnable` predicate the Scheduler (Phase 8) uses to decide whether an Agent may
// be picked up for a scheduled / reactive Run.
//
// See design.md → the `Agent` model (`lifecycle` enum), Requirement 1.9–1.13 and
// 7.9/7.10, and **Property 14** ("Lifecycle transitions are total, gated, and never
// schedule a halted agent"). The fast-check property test is task 4.7 (separate);
// this file is built so that EVERY (state, event) input satisfies Property 14.
//
// Design guarantees enforced here:
//   • TOTALITY — for ANY state + ANY event, `transition` returns a VALID lifecycle
//     state. It never throws and never returns an illegal/undefined value. An event
//     that is not valid from the current state leaves the state UNCHANGED.
//   • DEPLOY GATE (Req 7.10) — a transition INTO `deploy` is permitted ONLY when the
//     Agent has had at least one successful Dry_Run (`hadSuccessfulDryRun === true`),
//     passed in via the context arg. Otherwise the Agent stays in `dry-run`.
//   • RETIRE retains config/history (Req 1.10, 1.12) — it is a STATE, not a delete;
//     this module only moves the state, it deletes nothing.
//   • REACTIVATE (Req 1.11) — restores a retired Agent to a RUNNABLE state with its
//     prior config/history intact (the caller keeps the document; we only set state).

// ── Lifecycle states ─────────────────────────────────────────────────────────────
// EXACTLY the `Agent.lifecycle` enum from `src/lib/models.ts`. Kept as a local union
// (matching the pattern in `trust.ts` / `accent.ts`) so this stays a dependency-free
// pure module; it MUST stay in sync with the model's enum verbatim.
export type LifecycleState =
  | 'describe'
  | 'preview'
  | 'dry-run'
  | 'deploy'
  | 'monitor'
  | 'pause'
  | 'retire'

/** All lifecycle states in their canonical pipeline order (Req 1.9). */
export const LIFECYCLE_STATES: readonly LifecycleState[] = [
  'describe',
  'preview',
  'dry-run',
  'deploy',
  'monitor',
  'pause',
  'retire',
] as const

/** The lifecycle state a freshly-created Agent starts in (Req 1.9, "first defined stage"). */
export const INITIAL_LIFECYCLE_STATE: LifecycleState = 'describe'

// ── Lifecycle events ─────────────────────────────────────────────────────────────
// The events that drive transitions across the FSM. Each names a user/system action;
// the success of a Dry_Run is NOT an event here — it is recorded on the Agent as
// `hadSuccessfulDryRun` (set by the dry-run executor, task 4.4) and consumed by the
// `deploy` gate via the `ctx` arg below.
//
//   describe ──preview──▶ preview ──run-dry-run──▶ dry-run ──deploy(gated)──▶ deploy
//                                                      │                         │
//                                                      └──run-dry-run (re-run)   ├─monitor─▶ monitor
//   (back-nav: preview/dry-run ──describe──▶ describe)                           │            │
//   deploy/monitor ──pause──▶ pause ──resume──▶ monitor                          │            │
//   <any> ──retire──▶ retire ──reactivate──▶ (monitor if dry-run'd, else describe)
export type LifecycleEvent =
  | 'preview' // describe → preview (advance to the preview pane)
  | 'describe' // preview/dry-run → describe (go back to editing the description)
  | 'run-dry-run' // preview/dry-run → dry-run (start or re-run the mandatory Dry_Run)
  | 'deploy' // dry-run → deploy (GATED on hadSuccessfulDryRun — Req 7.10)
  | 'monitor' // deploy → monitor (activate per Schedule and begin monitoring)
  | 'pause' // deploy/monitor → pause (halt; excluded from scheduling)
  | 'resume' // pause → monitor (return to a runnable state)
  | 'retire' // <any> → retire (halt + retain config/history — Req 1.10)
  | 'reactivate' // retire → runnable (restore prior config/history — Req 1.11)

/** All lifecycle events, for exhaustive iteration (legends / property tests). */
export const LIFECYCLE_EVENTS: readonly LifecycleEvent[] = [
  'preview',
  'describe',
  'run-dry-run',
  'deploy',
  'monitor',
  'pause',
  'resume',
  'retire',
  'reactivate',
] as const

/**
 * Context the transition function reads. Only `hadSuccessfulDryRun` matters today
 * (it gates `deploy` and chooses the `reactivate` target). Optional so the function
 * is convenient to call; a missing flag defaults to `false`, the SAFE posture that
 * DENIES deploy (least privilege).
 */
export interface TransitionContext {
  /** Has the Agent completed at least one successful Dry_Run? (Req 7.10) */
  hadSuccessfulDryRun?: boolean
}

// ── The deterministic transition table ───────────────────────────────────────────
// Non-gated transitions only. Context-dependent events (`deploy`, `reactivate`) are
// handled explicitly in `transition` and intentionally omitted here. Any (state,
// event) pair absent from this table is an invalid move and leaves the state
// unchanged — that fallback is what makes the function TOTAL.
const TRANSITIONS: Record<LifecycleState, Partial<Record<LifecycleEvent, LifecycleState>>> = {
  describe: {
    preview: 'preview',
    retire: 'retire',
  },
  preview: {
    describe: 'describe',
    'run-dry-run': 'dry-run',
    retire: 'retire',
  },
  'dry-run': {
    describe: 'describe',
    'run-dry-run': 'dry-run', // re-run the Dry_Run; stays in dry-run
    // 'deploy' is handled by the gate in `transition` (Req 7.10)
    retire: 'retire',
  },
  deploy: {
    monitor: 'monitor',
    pause: 'pause',
    retire: 'retire',
  },
  monitor: {
    pause: 'pause',
    retire: 'retire',
  },
  pause: {
    resume: 'monitor',
    retire: 'retire',
  },
  retire: {
    // 'reactivate' is handled explicitly in `transition` (context-dependent target)
  },
}

/**
 * Advance the Agent lifecycle FSM. PURE, TOTAL, DETERMINISTIC — no I/O.
 *
 * For ANY `state` + ANY `event` it returns a valid `LifecycleState`:
 *   • a valid move returns the target state,
 *   • the `deploy` move is GATED — `dry-run` → `deploy` only when
 *     `ctx.hadSuccessfulDryRun` is true, otherwise the Agent stays in `dry-run`
 *     (Req 7.10 / Property 14),
 *   • `reactivate` from `retire` returns a runnable state — `monitor` if the Agent
 *     previously had a successful Dry_Run, else `describe` (Req 1.11); it never
 *     bypasses the deploy gate,
 *   • any invalid (state, event) pair returns `state` UNCHANGED (total + safe).
 *
 * It never throws and never returns an illegal/undefined state. Property test: 4.7.
 */
export function transition(
  state: LifecycleState,
  event: LifecycleEvent,
  ctx: TransitionContext = {},
): LifecycleState {
  // Normalize an off-union/garbage input state (e.g. a value read back from the
  // DB/API that bypasses the type system) to the SAFE initial state. The Mongoose
  // enum normally prevents this, but `transition` must be TOTAL-TO-VALID per its
  // contract: it always RETURNS a valid `LifecycleState` and never an illegal one.
  // A corrupt state resets to the most conservative stage (`describe`), from which
  // the Agent must re-earn the deploy gate — never a privilege gain.
  const s: LifecycleState = (LIFECYCLE_STATES as readonly string[]).includes(state)
    ? state
    : INITIAL_LIFECYCLE_STATE

  // Deploy gate (Req 7.10): the ONLY transition into `deploy` is from `dry-run`, and
  // only when the Agent has had at least one successful Dry_Run. Otherwise: unchanged.
  if (event === 'deploy') {
    return s === 'dry-run' && ctx.hadSuccessfulDryRun === true ? 'deploy' : s
  }

  // Reactivate (Req 1.11): only meaningful from `retire`. Restore to a runnable state
  // with prior config/history intact — `monitor` if the Agent was already proven via a
  // successful Dry_Run, otherwise back to `describe` so it re-earns the deploy gate.
  if (event === 'reactivate') {
    if (s !== 'retire') return s
    return ctx.hadSuccessfulDryRun === true ? 'monitor' : 'describe'
  }

  // All other events: table lookup on the normalized state, with "unchanged" as the
  // total/safe fallback for an event that is not valid from `s`. The own-property
  // guard prevents an off-union event that collides with an Object.prototype member
  // (e.g. 'toString', 'constructor', 'valueOf') from resolving to an inherited
  // function instead of a real target state — so the result is always a valid state.
  const row = TRANSITIONS[s]
  return Object.prototype.hasOwnProperty.call(row, event) ? (row[event] ?? s) : s
}

// ── Runnable predicate ───────────────────────────────────────────────────────────

/**
 * The minimal structural shape `isRunnable` reads — just the two fields that decide
 * runnability. Accepts any object with these (e.g. a full `Agent` document or a plain
 * test fixture) so it is trivially testable without a DB.
 */
export interface RunnableAgent {
  lifecycle: LifecycleState
  budgetPaused: boolean
}

/**
 * Is this Agent eligible to be started by the Scheduler? PURE, TOTAL, DETERMINISTIC.
 *
 * Returns FALSE when the Agent is HALTED — i.e. its lifecycle is `pause` or `retire`
 * (Req 1.13), or it is Budget_Paused (`budgetPaused === true`, Req 10.6/10.7) — and
 * TRUE for every other state. The Scheduler (Phase 8) calls this before enqueuing any
 * scheduled or reactive Run, so a halted Agent is never scheduled (Property 14).
 */
export function isRunnable(agent: RunnableAgent): boolean {
  if (agent.budgetPaused === true) return false
  if (agent.lifecycle === 'pause' || agent.lifecycle === 'retire') return false
  return true
}
