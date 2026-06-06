// Property test for the Mission observability tally helpers (task 1.19).
//
// Feature: mission-orchestrator, Property 13: Observability tallies conserve real usage and are honest about zero
// Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
//
// The universal claim over ARBITRARY Mission_Task (`TaskTallyRow`) + `AgentRun`
// (`RunUsageRow`) fixtures:
//   • per-status counts equal the true tallies — every `TaskStatus` key present and
//     off-union "garbage" statuses ignored (Req 11.1);
//   • accumulated tokens/cost equal the sum of the underlying real records with no
//     loss and no double-count, AND `Σ` of the per-Agent contribution tokens/cost
//     (over runs carrying an agentId) equals `tallyUsage` of those same runs — i.e.
//     usage is conserved across the per-Agent breakdown (Req 11.2, 11.3);
//   • an absence of records yields an all-zero state, never a fabricated non-zero
//     value (empty → all-zero counts, {tokensUsed:0,costUsed:0}, [] contributions)
//     (Req 11.5, 11.6);
//   • `usageVsCeiling` honors the "0 / non-finite = unlimited" convention (unlimited
//     ⇒ +Infinity remaining, null ratio) and is honest about zero (Req 11.4).
//
// Oracles are recomputed INDEPENDENTLY of the implementation (filter().length and
// a from-scratch clamp/group, formulated differently than the module's `reduce` +
// shared `nonNegFinite`/`idOrNull` helpers) so they are genuine ground truth.
//
// Numeric magnitudes are generated as INTEGERS on purpose: integer addition is exact
// and associative, so the cross-grouping conservation check (Σ per-Agent vs the flat
// total) holds with strict equality and never flakes on floating-point reassociation.
// Negative / NaN / ±Infinity / null / undefined are still generated to prove they
// contribute exactly 0.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  tallyTaskStatuses,
  tallyUsage,
  tallyAgentContributions,
  usageVsCeiling,
  TASK_STATUSES,
  type TaskStatus,
  type TaskTallyRow,
  type RunUsageRow,
} from './timeline'

// ── Generators ─────────────────────────────────────────────────────────────────

// Off-union "garbage" statuses the union forbids; injected via `as TaskStatus` to
// prove the tally ignores them rather than counting/throwing.
const GARBAGE_STATUSES = ['done', 'in-progress', '', 'PENDING', 'unknown', 'cancelled', 'completed ']

const statusArb: fc.Arbitrary<TaskStatus> = fc.oneof(
  fc.constantFrom(...TASK_STATUSES),
  fc.constantFrom(...GARBAGE_STATUSES) as fc.Arbitrary<TaskStatus>,
)

// agentId space: real ids, plus the values that must resolve to "no agent"
// (null / undefined / empty string → excluded from the per-Agent view).
const agentIdArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  fc.constantFrom('agent-a', 'agent-b', 'agent-c', 'agent-d'),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(''),
)

// A token/cost magnitude: a valid non-negative integer (incl. 0), OR a value that
// MUST be treated as 0 (negative, NaN, ±Infinity, null, undefined). Integers keep
// the conservation sums exact regardless of grouping order.
const valueArb: fc.Arbitrary<number | null | undefined> = fc.oneof(
  fc.integer({ min: 0, max: 1_000_000 }),
  fc.integer({ min: -1_000_000, max: -1 }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
  fc.constant(null),
  fc.constant(undefined),
)

const taskRowArb: fc.Arbitrary<TaskTallyRow> = fc.record({
  status: statusArb,
  assignedAgentId: agentIdArb,
})

const runRowArb: fc.Arbitrary<RunUsageRow> = fc.record({
  agentId: agentIdArb,
  tokensUsed: valueArb,
  cost: valueArb,
})

// A Mission_Budget ceiling value: an active cap (finite, > 0), OR an "unlimited"
// sentinel (0, negative, NaN, +Infinity).
const ceilingArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 1, max: 5_000_000 }),
  fc.constant(0),
  fc.integer({ min: -5_000, max: -1 }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY),
)

// A usage scalar fed to usageVsCeiling (numbers only, but incl. the non-finite /
// negative ones that must clamp to 0).
const usageArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0, max: 5_000_000 }),
  fc.integer({ min: -5_000, max: -1 }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
)

// ── Independent oracle helpers (formulated differently than the implementation) ───

/** Ground-truth clamp: anything not a finite, strictly-positive number ⇒ 0. */
function clampNonNeg(n: number | null | undefined): number {
  if (n === null || n === undefined) return 0
  if (typeof n !== 'number') return 0
  if (Number.isNaN(n)) return 0
  if (n === Number.POSITIVE_INFINITY || n === Number.NEGATIVE_INFINITY) return 0
  return n > 0 ? n : 0
}

/** Ground-truth id resolution: null/undefined/'' ⇒ no agent, else the string id. */
function resolveAgent(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const s = String(v)
  return s.length > 0 ? s : null
}

/** A cap is active iff it is a finite, strictly-positive number. */
function isActive(cap: number): boolean {
  return typeof cap === 'number' && Number.isFinite(cap) && cap > 0
}

// ── Property 13 ──────────────────────────────────────────────────────────────────
describe('Property 13: Observability tallies conserve real usage and are honest about zero', () => {
  it('per-status counts equal the true tallies; every status key present, off-union ignored (Req 11.1, 11.6)', () => {
    fc.assert(
      fc.property(fc.array(taskRowArb, { maxLength: 50 }), (tasks) => {
        const counts = tallyTaskStatuses(tasks)

        // Exactly the five real keys, no more, no less.
        expect(Object.keys(counts).sort()).toEqual([...TASK_STATUSES].sort())

        // Each key equals an independent filter().length over the same ground truth.
        let sumOfCounts = 0
        for (const status of TASK_STATUSES) {
          const truth = tasks.filter((t) => t.status === status).length
          expect(counts[status]).toBe(truth)
          expect(Number.isInteger(counts[status])).toBe(true)
          expect(counts[status]).toBeGreaterThanOrEqual(0)
          sumOfCounts += counts[status]
        }

        // Off-union statuses are ignored: the total counted is exactly the number of
        // tasks whose status is in the real union — never the full population.
        const inUnion = tasks.filter((t) =>
          (TASK_STATUSES as readonly string[]).includes(t.status as string),
        ).length
        expect(sumOfCounts).toBe(inUnion)
        expect(sumOfCounts).toBeLessThanOrEqual(tasks.length)
      }),
      { numRuns: 100 },
    )
  })

  it('accumulated tokens/cost equal the summed real records — no loss, no double-count (Req 11.2, 11.6)', () => {
    fc.assert(
      fc.property(fc.array(runRowArb, { maxLength: 50 }), (runs) => {
        const totals = tallyUsage(runs)

        // Independent re-sum with a differently-formulated clamp.
        const expTokens = runs.reduce((acc, r) => acc + clampNonNeg(r.tokensUsed), 0)
        const expCost = runs.reduce((acc, r) => acc + clampNonNeg(r.cost), 0)

        expect(totals.tokensUsed).toBe(expTokens)
        expect(totals.costUsed).toBe(expCost)

        // Never negative, never NaN/Infinity (garbage inputs cannot leak through).
        expect(Number.isFinite(totals.tokensUsed)).toBe(true)
        expect(Number.isFinite(totals.costUsed)).toBe(true)
        expect(totals.tokensUsed).toBeGreaterThanOrEqual(0)
        expect(totals.costUsed).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 100 },
    )
  })

  it('Σ per-Agent contribution tokens/cost equals tallyUsage of the agent-attributed runs (conservation, Req 11.2, 11.3)', () => {
    fc.assert(
      fc.property(
        fc.array(taskRowArb, { maxLength: 50 }),
        fc.array(runRowArb, { maxLength: 50 }),
        (tasks, runs) => {
          const contributions = tallyAgentContributions({ tasks, runs })

          // Conservation target: only runs that carry a resolvable agentId can be
          // attributed to an Agent.
          const runsWithAgent = runs.filter((r) => resolveAgent(r.agentId) !== null)
          const attributable = tallyUsage(runsWithAgent)

          const sumTokens = contributions.reduce((a, c) => a + c.tokensUsed, 0)
          const sumCost = contributions.reduce((a, c) => a + c.costUsed, 0)

          // No loss, no double-count across the per-Agent breakdown.
          expect(sumTokens).toBe(attributable.tokensUsed)
          expect(sumCost).toBe(attributable.costUsed)

          // tasksCompleted is likewise conserved: exactly the completed tasks that
          // carry a resolvable assignedAgentId, attributed to one Agent each.
          const completedWithAgent = tasks.filter(
            (t) => resolveAgent(t.assignedAgentId) !== null && t.status === 'completed',
          ).length
          const sumCompleted = contributions.reduce((a, c) => a + c.tasksCompleted, 0)
          expect(sumCompleted).toBe(completedWithAgent)

          // Each Agent appears at most once (no double-count) and only Agents with a
          // resolvable id are reported.
          const ids = contributions.map((c) => c.agentId)
          expect(new Set(ids).size).toBe(ids.length)
          for (const id of ids) {
            expect(typeof id).toBe('string')
            expect(id.length).toBeGreaterThan(0)
          }

          // Per-Agent figures match an independent group-by oracle exactly.
          const oracle = new Map<string, { tokens: number; cost: number; completed: number }>()
          for (const r of runs) {
            const id = resolveAgent(r.agentId)
            if (!id) continue
            const row = oracle.get(id) ?? { tokens: 0, cost: 0, completed: 0 }
            row.tokens += clampNonNeg(r.tokensUsed)
            row.cost += clampNonNeg(r.cost)
            oracle.set(id, row)
          }
          for (const t of tasks) {
            const id = resolveAgent(t.assignedAgentId)
            if (!id || t.status !== 'completed') continue
            const row = oracle.get(id) ?? { tokens: 0, cost: 0, completed: 0 }
            row.completed += 1
            oracle.set(id, row)
          }
          for (const c of contributions) {
            const truth = oracle.get(c.agentId)
            expect(truth).toBeDefined()
            expect(c.tokensUsed).toBe(truth!.tokens)
            expect(c.costUsed).toBe(truth!.cost)
            expect(c.tasksCompleted).toBe(truth!.completed)
          }
          // Every oracle Agent (one with usage or a completed task) is reported back.
          expect(contributions.length).toBe(oracle.size)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('an absence of records yields an all-zero state, never a fabricated value (Req 11.5, 11.6)', () => {
    expect(tallyTaskStatuses([])).toEqual({
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      blocked: 0,
    })
    expect(tallyUsage([])).toEqual({ tokensUsed: 0, costUsed: 0 })
    expect(tallyAgentContributions({ tasks: [], runs: [] })).toEqual([])

    // Runs/tasks that exist but carry only zero / unattributable data still produce
    // the honest zero state — no Agent is invented and no non-zero value appears.
    fc.assert(
      fc.property(
        fc.array(fc.constant({ status: 'pending' as TaskStatus, assignedAgentId: null }), {
          maxLength: 20,
        }),
        fc.array(fc.constant({ agentId: null, tokensUsed: 0, cost: 0 }), { maxLength: 20 }),
        (tasks, runs) => {
          expect(tallyUsage(runs)).toEqual({ tokensUsed: 0, costUsed: 0 })
          // No run carries an agentId and no task is completed ⇒ no contributions.
          expect(tallyAgentContributions({ tasks, runs })).toEqual([])
        },
      ),
      { numRuns: 100 },
    )
  })

  it('usageVsCeiling honors the "0 / non-finite = unlimited" convention and is honest about zero (Req 11.4, 11.5)', () => {
    fc.assert(
      fc.property(usageArb, usageArb, ceilingArb, ceilingArb, (rawTokens, rawCost, tokenCeiling, costCeiling) => {
        const result = usageVsCeiling(
          { tokensUsed: rawTokens, costUsed: rawCost },
          { tokenCeiling, costCeiling },
        )

        const usedTokens = clampNonNeg(rawTokens)
        const usedCost = clampNonNeg(rawCost)

        // Used is always the honest clamped value — never fabricated, never negative.
        expect(result.tokensUsed).toBe(usedTokens)
        expect(result.costUsed).toBe(usedCost)

        // Token axis.
        if (isActive(tokenCeiling)) {
          expect(result.tokenCeiling).toBe(tokenCeiling)
          expect(result.tokenRemaining).toBe(Math.max(0, tokenCeiling - usedTokens))
          expect(result.tokenRatio).toBe(usedTokens / tokenCeiling)
          expect(Number.isFinite(result.tokenRemaining)).toBe(true)
          // Honest about zero: zero usage ⇒ full ceiling remaining, ratio 0.
          if (usedTokens === 0) {
            expect(result.tokenRemaining).toBe(tokenCeiling)
            expect(result.tokenRatio).toBe(0)
          }
        } else {
          // Unlimited: ceiling reported as 0, +Infinity remaining, null ratio.
          expect(result.tokenCeiling).toBe(0)
          expect(result.tokenRemaining).toBe(Number.POSITIVE_INFINITY)
          expect(result.tokenRatio).toBeNull()
        }

        // Cost axis (same convention).
        if (isActive(costCeiling)) {
          expect(result.costCeiling).toBe(costCeiling)
          expect(result.costRemaining).toBe(Math.max(0, costCeiling - usedCost))
          expect(result.costRatio).toBe(usedCost / costCeiling)
          expect(Number.isFinite(result.costRemaining)).toBe(true)
          if (usedCost === 0) {
            expect(result.costRemaining).toBe(costCeiling)
            expect(result.costRatio).toBe(0)
          }
        } else {
          expect(result.costCeiling).toBe(0)
          expect(result.costRemaining).toBe(Number.POSITIVE_INFINITY)
          expect(result.costRatio).toBeNull()
        }
      }),
      { numRuns: 100 },
    )
  })
})
