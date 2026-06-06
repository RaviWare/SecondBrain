// Feature: mission-orchestrator, Property 5: The concurrency cap is never exceeded
// Validates: Requirements 5.3, 5.4
//
// The universal invariant over ARBITRARY task sets, `runningCount`, and
// `concurrencyLimit` for `selectReadyTasks` (src/lib/agents/mission/executor.ts):
// the number of tasks it returns is AT MOST `max(0, concurrencyLimit − runningCount)`
// and is NEVER negative, so the count of simultaneously running Mission_Tasks can never
// exceed the Concurrency_Limit (Req 5.3) and a full mission defers extra ready tasks
// (Req 5.4).
//
// `selectReadyTasks` is PURE / TOTAL / DETERMINISTIC (no I/O, no models), so it is driven
// directly with no mocks. To make the CAP — not readiness, the mission state, or a
// ceiling — the binding constraint, the scenario generators below hold
// `missionState: 'running'` and `ceiling: { stop: false }` fixed and produce PLENTY of
// ready `pending` tasks (no deps, or deps that are all `completed`). Adversarial
// non-finite / negative `runningCount` / `concurrencyLimit` are injected to confirm the
// result length is still 0 when the cap collapses to no free slots.
//
// The cap oracle below re-derives the expected bound from executor.ts's DOCUMENTED
// contract — both concurrency inputs are sanitized to non-negative finite values
// (`Number.isFinite(n) && n > 0 ? n : 0`), then the free-slot count is
// `max(0, sanitize(concurrencyLimit) − sanitize(runningCount))`. The oracle restates the
// contract, NOT the implementation, so a divergence is a real bug, not a tautology.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { selectReadyTasks, type ExecTask, type TaskStatus, type SelectInput } from './executor'

// ── Fixed gate inputs: isolate the concurrency cap ───────────────────────────────
// A `running` mission with no reached ceiling — the only gate left standing is the
// Concurrency_Limit, so the returned count is governed purely by the cap (Properties 1,
// 3, and 4 cover the readiness / lifecycle / ceiling gates separately).
const RUNNING: SelectInput['missionState'] = 'running'
const NO_CEILING: SelectInput['ceiling'] = { stop: false }

// ── Contract oracle (mirrors executor.ts's documented sanitization convention) ──
// Identical to `nonNegFinite` in executor.ts / limits.ts: any non-finite (NaN /
// ±Infinity) or `<= 0` value collapses to 0.
const sanitize = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)

/** The documented free-slot count: never negative, sanitized on both operands. */
const freeSlots = (runningCount: number, concurrencyLimit: number): number =>
  Math.max(0, sanitize(concurrencyLimit) - sanitize(runningCount))

// ── Generators ───────────────────────────────────────────────────────────────────

const STATUSES: readonly TaskStatus[] = ['pending', 'running', 'completed', 'failed', 'blocked']

// A free-form task: arbitrary status / dependencies, for the universal upper-bound
// property where the exact ready-count is irrelevant (only the cap matters).
const anyTaskArb: fc.Arbitrary<ExecTask> = fc.record({
  key: fc.string(),
  status: fc.constantFrom(...STATUSES),
  dependsOn: fc.array(fc.string(), { maxLength: 4 }),
  assignedAgentId: fc.string(),
})

// A count generator biased toward small realistic non-negative values, but regularly
// injecting the adversarial edges — 0, negatives, and the non-finite sentinels NaN /
// ±Infinity — that drive the totality + sanitization branches of the SUT.
const EDGE_COUNTS = [0, -1, -1_000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const
const countArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 7, arbitrary: fc.integer({ min: 0, max: 12 }) },
  { weight: 1, arbitrary: fc.double({ min: -1_000, max: 1_000, noNaN: false }) },
  { weight: 1, arbitrary: fc.constantFrom(...EDGE_COUNTS) },
)

// A count that collapses the cap to 0 free slots: non-finite or `<= 0` ⇒ sanitize → 0.
const unsetCountArb: fc.Arbitrary<number> = fc.constantFrom(...EDGE_COUNTS)

/**
 * A scenario with PLENTY of ready `pending` tasks so the cap is the binding constraint.
 * `completedKeys` anchor a pool of `completed` tasks; each `pending` task depends on a
 * (possibly empty) SUBSET of those completed keys, so EVERY pending task is `ready`
 * (no deps, or all-`completed` deps). `pendingDeps.length` is therefore the exact
 * ready-count. Finite small `runningCount` / `concurrencyLimit` keep the free-slot count
 * frequently below the ready-count, so the cap (not readiness) binds.
 */
const readyScenarioArb = fc.integer({ min: 0, max: 5 }).chain((completedCount) => {
  const completedKeys = Array.from({ length: completedCount }, (_, i) => `c${i}`)
  return fc.record({
    completedKeys: fc.constant(completedKeys),
    // One entry per pending task = its dependsOn (a subset of completed ⇒ all ready).
    pendingDeps: fc.array(fc.subarray(completedKeys), { minLength: 0, maxLength: 30 }),
    runningCount: fc.integer({ min: 0, max: 10 }),
    concurrencyLimit: fc.integer({ min: 0, max: 10 }),
  })
})

type ReadyScenario = {
  completedKeys: string[]
  pendingDeps: string[][]
  runningCount: number
  concurrencyLimit: number
}

/** Build the task list (completed anchors first, then the all-ready pending tasks). */
const buildTasks = (s: ReadyScenario): { tasks: ExecTask[]; readyCount: number } => {
  const completedTasks: ExecTask[] = s.completedKeys.map((key, i) => ({
    key,
    status: 'completed',
    dependsOn: [],
    assignedAgentId: `ca${i}`,
  }))
  const pendingTasks: ExecTask[] = s.pendingDeps.map((deps, i) => ({
    key: `p${i}`,
    status: 'pending',
    dependsOn: deps, // every dep is a completed key ⇒ task is ready
    assignedAgentId: `pa${i}`,
  }))
  return { tasks: [...completedTasks, ...pendingTasks], readyCount: pendingTasks.length }
}

describe('Property 5: The concurrency cap is never exceeded', () => {
  // 1. TOTALITY: never throws; always returns an array whose length respects the cap,
  //    for ANY task set and ANY (incl. adversarial non-finite / negative) counts.
  it('is total: never throws and returns at most max(0, limit − running) tasks for any input', () => {
    fc.assert(
      fc.property(
        fc.array(anyTaskArb, { maxLength: 40 }),
        countArb,
        countArb,
        (tasks, runningCount, concurrencyLimit) => {
          let result!: ExecTask[]
          expect(() => {
            result = selectReadyTasks({
              tasks,
              missionState: RUNNING,
              runningCount,
              concurrencyLimit,
              ceiling: NO_CEILING,
            })
          }).not.toThrow()
          const cap = freeSlots(runningCount, concurrencyLimit)
          expect(Array.isArray(result)).toBe(true)
          expect(result.length).toBeGreaterThanOrEqual(0)
          expect(result.length).toBeLessThanOrEqual(cap)
        },
      ),
      { numRuns: 200 },
    )
  })

  // 2. THE CORE INVARIANT (the heart of Property 5): with plenty of ready pending tasks
  //    making the CAP the binding constraint, the count returned is EXACTLY
  //    min(readyCount, max(0, limit − running)) — it tops out at the free-slot count and
  //    never exceeds it. Every returned task is a distinct `pending` task (Req 5.3, 5.4).
  it('returns exactly min(readyCount, free slots) when the cap is the binding constraint', () => {
    fc.assert(
      fc.property(readyScenarioArb, (s) => {
        const { tasks, readyCount } = buildTasks(s)
        const cap = freeSlots(s.runningCount, s.concurrencyLimit)
        const result = selectReadyTasks({
          tasks,
          missionState: RUNNING,
          runningCount: s.runningCount,
          concurrencyLimit: s.concurrencyLimit,
          ceiling: NO_CEILING,
        })

        // The cap is never exceeded, and is saturated whenever ready tasks remain.
        expect(result.length).toBeLessThanOrEqual(cap)
        expect(result.length).toBe(Math.min(readyCount, cap))

        // Everything returned is a distinct, pending task (no slot double-counted).
        const keys = new Set(result.map((t) => t.key))
        expect(keys.size).toBe(result.length)
        for (const t of result) expect(t.status).toBe('pending')
      }),
      { numRuns: 200 },
    )
  })

  // 3. A FULL MISSION DEFERS (Req 5.4): when `runningCount >= concurrencyLimit` (no free
  //    slot), NO ready task is started regardless of how many are pending. Built from an
  //    ordered finite pair so `runningCount >= concurrencyLimit` holds by construction.
  it('starts nothing when the mission is already at (or over) its concurrency cap', () => {
    fc.assert(
      fc.property(
        readyScenarioArb,
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        (s, a, b) => {
          const concurrencyLimit = Math.min(a, b)
          const runningCount = Math.max(a, b) // runningCount >= concurrencyLimit
          const { tasks } = buildTasks(s)
          const result = selectReadyTasks({
            tasks,
            missionState: RUNNING,
            runningCount,
            concurrencyLimit,
            ceiling: NO_CEILING,
          })
          expect(result.length).toBe(0)
        },
      ),
      { numRuns: 100 },
    )
  })

  // 4. ADVERSARIAL COUNTS COLLAPSE THE CAP TO 0 (TOTALITY, Req 5.4): a non-finite or
  //    `<= 0` `concurrencyLimit` sanitizes to 0 free slots, so EVERY ready task is
  //    deferred — a NaN / Infinity / negative limit can never fabricate a phantom slot,
  //    even with plenty of ready pending tasks and any (also adversarial) runningCount.
  it('returns 0 when the concurrency limit is non-finite or <= 0 (sanitized to 0 slots)', () => {
    fc.assert(
      fc.property(readyScenarioArb, unsetCountArb, countArb, (s, concurrencyLimit, runningCount) => {
        const { tasks } = buildTasks(s)
        const result = selectReadyTasks({
          tasks,
          missionState: RUNNING,
          runningCount,
          concurrencyLimit,
          ceiling: NO_CEILING,
        })
        expect(freeSlots(runningCount, concurrencyLimit)).toBe(0)
        expect(result.length).toBe(0)
      }),
      { numRuns: 100 },
    )
  })
})
