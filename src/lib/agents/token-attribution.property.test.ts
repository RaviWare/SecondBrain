// Property test for the conserved token attribution (task 7.8).
//
// Feature: hermes-agents, Property 18: Token attribution is conserved
// Validates: Requirements 10.2
//
// The universal claim over ARBITRARY `AgentRun`-shaped rows: `attributeTokens` is
// PURE / TOTAL (never throws — even on `[]`, `null`, `undefined`, and malformed
// rows carrying negative / NaN / non-finite / missing token counts), and it
// CONSERVES the grand total — for ANY input, the tokens summed across Agents and
// the tokens summed across Skills (incl. the `UNATTRIBUTED_SKILL` bucket) each
// equal `result.total`, so nothing is lost or double-counted. Every bucket value
// and the total are non-negative, and empty / nullish input fabricates nothing
// (all zeros). The concrete reconciliation examples (meter-vs-trace surplus,
// skillId:null bucketing, agentless rows) are pinned separately in the unit tests.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  attributeTokens,
  allowanceVsConsumed,
  UNATTRIBUTED_SKILL,
  UNKNOWN_AGENT,
  type RunLike,
} from './token-attribution'

// ── Helpers ──────────────────────────────────────────────────────────────────────
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

// ── Generators ─────────────────────────────────────────────────────────────────
// A small pool of agent ids: a few "real" ids plus values that must all route to
// the UNKNOWN_AGENT bucket (missing / null / empty / whitespace-only — agentKey
// trims before deciding). Keeping the pool small forces collisions so the byAgent
// buckets actually accumulate across many runs.
const agentIdArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  fc.constantFrom('agent-alpha', 'agent-beta', 'agent-gamma'),
  fc.constantFrom('', '   ', null, undefined),
)

// A small pool of skill ids: a few "real" skills plus null / undefined, which the
// aggregator routes into the UNATTRIBUTED_SKILL bucket.
const skillIdArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  fc.constantFrom('skill-ingest', 'skill-synthesis', 'skill-connect'),
  fc.constantFrom(null, undefined),
)

// FINITE token arbitrary used for the conservation assertions. Mostly small
// non-negative ints, occasionally exact 0, negative ints, NaN, null, or undefined.
// Every one of these clamps to a FINITE value (NaN / negative / missing → 0), so
// integer sums stay exact and strict `===` equality is meaningful.
const finiteTokenArb: fc.Arbitrary<number | null | undefined> = fc.oneof(
  { weight: 6, arbitrary: fc.nat({ max: 10_000 }) },
  { weight: 1, arbitrary: fc.constant(0) },
  { weight: 1, arbitrary: fc.integer({ min: -10_000, max: -1 }) },
  { weight: 1, arbitrary: fc.constantFrom(Number.NaN, null, undefined) },
)

// WILD token arbitrary additionally injects +Infinity (an unbounded meter, which
// `clampTokens` preserves). Used ONLY for the totality assertion, where Infinity
// arithmetic is degenerate and strict-equality conservation would not apply.
const wildTokenArb: fc.Arbitrary<number | null | undefined> = fc.oneof(
  { weight: 8, arbitrary: finiteTokenArb },
  { weight: 1, arbitrary: fc.constantFrom(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY) },
)

function traceArb(tokenArb: fc.Arbitrary<number | null | undefined>): fc.Arbitrary<RunLike['trace']> {
  const stepArb = fc.record({ skillId: skillIdArb, tokens: tokenArb })
  return fc.oneof(
    { weight: 8, arbitrary: fc.array(stepArb, { maxLength: 8 }) },
    { weight: 1, arbitrary: fc.constantFrom(null, undefined) },
  )
}

function runArb(tokenArb: fc.Arbitrary<number | null | undefined>): fc.Arbitrary<RunLike> {
  return fc.record({
    agentId: agentIdArb,
    tokensUsed: tokenArb,
    trace: traceArb(tokenArb),
  })
}

const finiteRunsArb = fc.array(runArb(finiteTokenArb), { maxLength: 30 })
const wildRunsArb = fc.array(runArb(wildTokenArb), { maxLength: 30 })

// ── Property 18 ──────────────────────────────────────────────────────────────────
describe('Property 18: Token attribution is conserved', () => {
  it('never throws — total over arbitrary, malformed, and non-finite inputs (Req 10.2)', () => {
    fc.assert(
      fc.property(wildRunsArb, (runs) => {
        // Totality: a well-formed result is always produced; never throws.
        expect(() => attributeTokens(runs)).not.toThrow()
        const result = attributeTokens(runs)
        expect(typeof result.total).toBe('number')
        expect(result.byAgent).toBeTypeOf('object')
        expect(result.bySkill).toBeTypeOf('object')
        // Non-negativity holds even with +Infinity in play (Infinity ≥ 0).
        expect(result.total).toBeGreaterThanOrEqual(0)
        for (const v of Object.values(result.byAgent)) expect(v).toBeGreaterThanOrEqual(0)
        for (const v of Object.values(result.bySkill)) expect(v).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 100 },
    )
  })

  it('conserves the grand total across Agents and across Skills (Req 10.2)', () => {
    fc.assert(
      fc.property(finiteRunsArb, (runs) => {
        const result = attributeTokens(runs)

        // Conservation by Agent: every token attributed to some agent bucket.
        expect(sum(Object.values(result.byAgent))).toBe(result.total)
        // Conservation by Skill: bySkill INCLUDES the UNATTRIBUTED_SKILL bucket,
        // so it too sums exactly to the grand total.
        expect(sum(Object.values(result.bySkill))).toBe(result.total)

        // Non-negativity: no bucket and not the total can ever go negative.
        expect(result.total).toBeGreaterThanOrEqual(0)
        for (const v of Object.values(result.byAgent)) expect(v).toBeGreaterThanOrEqual(0)
        for (const v of Object.values(result.bySkill)) expect(v).toBeGreaterThanOrEqual(0)

        // Determinism: same input → identical breakdown.
        expect(attributeTokens(runs)).toEqual(result)
      }),
      { numRuns: 100 },
    )
  })

  it('routes agentless / skill-less / surplus tokens into the conservation buckets (Req 10.2)', () => {
    fc.assert(
      fc.property(finiteRunsArb, (runs) => {
        const result = attributeTokens(runs)
        // Whatever lands in the UNKNOWN_AGENT / UNATTRIBUTED_SKILL buckets is still
        // counted toward the total — present-or-absent, it never breaks the sum.
        const unknownAgent = result.byAgent[UNKNOWN_AGENT] ?? 0
        const unattributed = result.bySkill[UNATTRIBUTED_SKILL] ?? 0
        expect(unknownAgent).toBeGreaterThanOrEqual(0)
        expect(unattributed).toBeGreaterThanOrEqual(0)
        expect(unknownAgent).toBeLessThanOrEqual(result.total)
        expect(unattributed).toBeLessThanOrEqual(result.total)
      }),
      { numRuns: 100 },
    )
  })

  it('fabricates nothing from empty / nullish input — all zeros (Req 10.2)', () => {
    for (const empty of [[], null, undefined] as const) {
      expect(attributeTokens(empty)).toEqual({ total: 0, byAgent: {}, bySkill: {} })
    }
    // A run that carries only zero / negative / NaN tokens contributes nothing and
    // creates no fabricated buckets beyond the zero-valued agent bucket it touches.
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            agentId: agentIdArb,
            tokensUsed: fc.constantFrom(0, -5, Number.NaN, null, undefined),
            trace: fc.array(
              fc.record({ skillId: skillIdArb, tokens: fc.constantFrom(0, -5, Number.NaN, null, undefined) }),
              { maxLength: 5 },
            ),
          }),
          { maxLength: 10 },
        ),
        (runs) => {
          const result = attributeTokens(runs)
          expect(result.total).toBe(0)
          // Conservation still holds at zero.
          expect(sum(Object.values(result.byAgent))).toBe(0)
          expect(sum(Object.values(result.bySkill))).toBe(0)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('allowanceVsConsumed reports remaining = max(0, allowance − consumed) (Req 10.2/10.3)', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000 }), fc.nat({ max: 1_000_000 }), (allowance, consumed) => {
        const { remaining } = allowanceVsConsumed(allowance, consumed)
        expect(remaining).toBe(Math.max(0, allowance - consumed))
        if (consumed >= allowance) expect(remaining).toBe(0)
      }),
      { numRuns: 100 },
    )
  })
})
