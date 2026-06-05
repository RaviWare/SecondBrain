// Feature: mission-orchestrator, Property 1: The ready-task selector never starts an unsafe or premature task
// Validates: Requirements 3.1, 3.6, 4.1, 4.5, 4.6, 5.11, 5.12, 6.6, 9.11
//
// The universal safety invariants for the pure ready-task selector (`selectReadyTasks`)
// over ARBITRARY task graphs, mission states, concurrency inputs, and ceiling results.
// `selectReadyTasks` is PURE / TOTAL / DETERMINISTIC (no I/O, no models), so it runs
// directly with no mocks.
//
// The oracle below RE-STATES the documented contract from `executor.ts` rather than
// copying its control flow: a task is SAFE to start iff its `status` is `pending` AND
// every key in its `dependsOn` resolves (through the first-wins `key → task` map) to a
// task whose status is `completed`; the mission only starts runs while `missionState`
// is `running`; and a reached ceiling (`stop === true`) halts all new runs. Because the
// oracle is derived from the spec (Property 1), not the implementation, a divergence is
// a real bug rather than a tautology.
//
// NOTE: Property 5 (the concurrency cap) is covered separately in task 1.14's own file;
// this file implements ONLY the Property 1 block per the plan. The slot-cap equality
// asserted in the final test is the documented "input-order prefix capped at the free
// slots" selection rule, used here purely to pin the membership invariants exactly.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  selectReadyTasks,
  type TaskStatus,
  type ExecTask,
  type SelectInput,
} from './executor'
import { MISSION_STATES, type MissionState } from './lifecycle'
import type { MissionCeilingResult, MissionCeilingReason } from './limits'

// ── Generators ─────────────────────────────────────────────────────────────────────

// A small key pool so `dependsOn` edges frequently resolve to a real task (exercising
// the "all deps completed" path) while still occasionally referencing a key that never
// appears as a task (a dangling dependency → treated as "not completed"). Duplicate keys
// across tasks are intentional: they exercise the first-wins dedup discipline.
const KEY_POOL = ['t0', 't1', 't2', 't3', 't4', 't5'] as const
const TASK_STATUSES: readonly TaskStatus[] = ['pending', 'running', 'completed', 'failed', 'blocked']

const keyArb = fc.constantFrom(...KEY_POOL)
const statusArb = fc.constantFrom(...TASK_STATUSES)
const agentArb = fc.constantFrom('agent-a', 'agent-b', 'agent-c')

const taskArb: fc.Arbitrary<ExecTask> = fc.record({
  key: keyArb,
  status: statusArb,
  dependsOn: fc.array(keyArb, { maxLength: 4 }),
  assignedAgentId: agentArb,
})

const tasksArb: fc.Arbitrary<ExecTask[]> = fc.array(taskArb, { maxLength: 8 })

// Concurrency counts biased toward small realistic values but regularly injecting the
// edge values (0, negatives, NaN, ±Infinity) that drive the SUT's sanitization branches.
const COUNT_EDGES = [0, 1, 2, 3, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const
const countArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 6 }) },
  { weight: 1, arbitrary: fc.constantFrom(...COUNT_EDGES) },
)

const CEILING_REASONS: readonly MissionCeilingReason[] = ['mission-token-ceiling', 'mission-cost-ceiling', 'wall-clock']
const ceilingArb: fc.Arbitrary<MissionCeilingResult> = fc.oneof(
  fc.constant({ stop: false } as MissionCeilingResult),
  fc.constantFrom(...CEILING_REASONS).map((reason) => ({ stop: true, reason }) as MissionCeilingResult),
)

// Mission state biased toward `running` so non-empty selections (where the membership
// invariants actually bite) are well represented, while still covering every state.
const missionStateArb: fc.Arbitrary<MissionState> = fc.oneof(
  { weight: 4, arbitrary: fc.constant('running' as MissionState) },
  { weight: 3, arbitrary: fc.constantFrom(...MISSION_STATES) },
)

const inputArb: fc.Arbitrary<SelectInput> = fc.record({
  tasks: tasksArb,
  missionState: missionStateArb,
  runningCount: countArb,
  concurrencyLimit: countArb,
  ceiling: ceilingArb,
})

// A `running` + free-slot scenario that guarantees the selector can actually return
// tasks, so the "only pending / completed-deps" membership checks are exercised on
// non-empty results and a completed task's never-re-selected guarantee is meaningful.
const runningInputArb: fc.Arbitrary<SelectInput> = fc.record({
  tasks: tasksArb,
  missionState: fc.constant('running' as MissionState),
  runningCount: fc.integer({ min: 0, max: 3 }),
  concurrencyLimit: fc.integer({ min: 1, max: 8 }),
  ceiling: fc.constant({ stop: false } as MissionCeilingResult),
})

// ── Contract oracle (re-states executor.ts's documented contract) ──────────────────

/** A finite count clamped to `>= 0`; anything non-finite/negative ⇒ 0 (== `nonNegFinite`). */
const sanitizeCount = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)

/** The first-wins `key → task` lookup the selector reads dependency statuses through. */
function buildByKey(tasks: ExecTask[]): Map<string, ExecTask> {
  const m = new Map<string, ExecTask>()
  for (const t of tasks) {
    if (t && typeof t.key === 'string' && t.key.length > 0 && !m.has(t.key)) m.set(t.key, t)
  }
  return m
}

/** A task is SAFE to start iff it is `pending` and every dependency resolves to `completed`. */
function isSafeToStart(task: ExecTask, byKey: Map<string, ExecTask>): boolean {
  if (task.status !== 'pending') return false
  return task.dependsOn.every((dep) => byKey.get(dep)?.status === 'completed')
}

/**
 * The complete safe set: every task the mission is permitted to start RIGHT NOW, in
 * input order. Empty unless the mission is `running` and no ceiling has been reached.
 */
function safeSet(input: SelectInput): ExecTask[] {
  if (input.missionState !== 'running') return []
  if (input.ceiling.stop === true) return []
  const byKey = buildByKey(input.tasks)
  return input.tasks.filter((t) => isSafeToStart(t, byKey))
}

/** The free Concurrency_Limit slots, clamped at zero (never negative). */
function freeSlots(input: SelectInput): number {
  return Math.max(0, sanitizeCount(input.concurrencyLimit) - sanitizeCount(input.runningCount))
}

// ── Property 1 ─────────────────────────────────────────────────────────────────────

describe('Property 1: The ready-task selector never starts an unsafe or premature task', () => {
  // 1. CORE SAFETY MEMBERSHIP (Req 4.1, 4.5, 4.6, 6.6): every returned task is `pending`
  //    (run-at-most-once: a completed/running/failed/blocked task is never selected) and
  //    has NO dependency that is anything other than `completed` — in particular never a
  //    `failed` or `blocked` dependency. Every returned task is therefore in the safe set.
  it('returns only pending tasks whose every dependency is completed (never a failed/blocked/unmet dep)', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = selectReadyTasks(input)
        const byKey = buildByKey(input.tasks)
        const safe = safeSet(input)

        for (const t of result) {
          // Guarantee 1 — run-at-most-once: only a `pending` task is ever started (Req 6.6).
          expect(t.status).toBe('pending')

          for (const dep of t.dependsOn) {
            const depStatus = byKey.get(dep)?.status
            // Guarantee 2 — no premature start: a dependency must be `completed` (Req 4.1)...
            expect(depStatus).toBe('completed')
            // ...and explicitly never a failed/blocked (poisoned) dependency (Req 4.5, 4.6).
            expect(depStatus === 'failed' || depStatus === 'blocked').toBe(false)
          }

          // Membership: the selector never invents a task outside the safe set.
          expect(safe).toContain(t)
        }
      }),
      { numRuns: 200 },
    )
  })

  // 2. NOT RUNNING ⇒ NOTHING STARTS (Req 3.1, 5.11, 9.11): in every non-`running` state —
  //    planning / awaiting-plan-approval (no Run before Plan_Approval), paused (Kill_Switch
  //    pause), and the absorbing terminals completed / failed / aborted — the selector
  //    returns the empty set, regardless of tasks, concurrency, or ceiling.
  it('returns [] whenever missionState is not running, for any tasks/concurrency/ceiling', () => {
    const nonRunning = MISSION_STATES.filter((s) => s !== 'running')
    fc.assert(
      fc.property(
        tasksArb,
        fc.constantFrom(...nonRunning),
        countArb,
        countArb,
        ceilingArb,
        (tasks, missionState, runningCount, concurrencyLimit, ceiling) => {
          expect(selectReadyTasks({ tasks, missionState, runningCount, concurrencyLimit, ceiling })).toEqual([])
        },
      ),
      { numRuns: 100 },
    )
  })

  // 3. CEILING REACHED ⇒ NOTHING STARTS (Req 5.12): when a safety ceiling reports
  //    `stop === true`, no new Run starts even for a `running` mission with free slots and
  //    plenty of ready tasks. (Kill_Switch abort / Mission_Budget / Wall_Clock all surface
  //    here as a `{ stop: true }` ceiling.)
  it('returns [] whenever a safety ceiling is reached (stop === true), for any state/tasks/concurrency', () => {
    fc.assert(
      fc.property(
        tasksArb,
        missionStateArb,
        countArb,
        countArb,
        fc.constantFrom(...CEILING_REASONS),
        (tasks, missionState, runningCount, concurrencyLimit, reason) => {
          const ceiling: MissionCeilingResult = { stop: true, reason }
          expect(selectReadyTasks({ tasks, missionState, runningCount, concurrencyLimit, ceiling })).toEqual([])
        },
      ),
      { numRuns: 100 },
    )
  })

  // 4. A COMPLETED TASK IS NEVER RE-SELECTED (Req 6.6): because selection is `pending`-only,
  //    no task that already reached `completed` is ever returned — driven on a `running`,
  //    free-slot scenario so completed tasks coexist with selectable ones.
  it('never re-selects a completed (or otherwise non-pending) task', () => {
    fc.assert(
      fc.property(runningInputArb, (input) => {
        const result = selectReadyTasks(input)
        const completed = input.tasks.filter((t) => t.status === 'completed')
        for (const t of result) expect(t.status).not.toBe('completed')
        // No already-completed input task object appears in the selection.
        for (const done of completed) expect(result).not.toContain(done)
      }),
      { numRuns: 100 },
    )
  })

  // 5. EXACT ORACLE EQUIVALENCE: the selection is precisely the input-order safe set
  //    capped at the free slots — `max(0, concurrencyLimit − runningCount)`, never
  //    negative. This single law binds every invariant above (pending-only, deps-completed,
  //    not-running ⇒ [], ceiling ⇒ []) to an independent recomputation of the safe set.
  it('selects exactly the input-order safe prefix capped at the free slots (never negative)', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = selectReadyTasks(input)
        const slots = freeSlots(input)
        const expected = safeSet(input).slice(0, slots)

        expect(result).toEqual(expected)
        expect(result.length).toBeLessThanOrEqual(slots)
        expect(result.length).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 200 },
    )
  })
})
