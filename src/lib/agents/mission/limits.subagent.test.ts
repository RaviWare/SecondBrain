// Feature: mission-orchestrator, Property 10: Sub_Agent nesting depth is bounded by the Graph_Limit depth
// Validates: Requirements 6.2, 6.3
//
// The universal invariant over ARBITRARY (currentDepth, graphLimitDepth) pairs for the
// mission Sub_Agent nesting bound `canSpawnSubAgent` (src/lib/agents/mission/limits.ts).
// The mission path adds ONLY this depth bound on top of the verbatim-reused
// `resolveSubScope` / `spawnSubAgent` (scope ⊆ parent); a Sub_Agent may nest only while
// it stays strictly below the Graph_Limit depth (Req 6.2). A spawn that would reach OR
// exceed the depth is refused; one strictly within it is not refused on the depth basis
// (Req 6.3).
//
// `canSpawnSubAgent` is PURE / TOTAL / DETERMINISTIC (no I/O, no models), so it is tested
// directly with no mocks. The oracle below re-derives the expected verdict from
// limits.ts's DOCUMENTED contract — inputs are sanitized to non-negative finite values
// (`Number.isFinite(n) && n > 0 ? n : 0`), then the spawn is permitted IFF
// `sanitized(currentDepth) < sanitized(graphLimitDepth)`. The oracle restates the
// contract, NOT the implementation, so a divergence is a real bug, not a tautology.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { canSpawnSubAgent } from './limits'

// ── Contract oracle (mirrors limits.ts's documented sanitization convention) ─────
// A depth is sanitized to a non-negative finite value: anything non-finite (NaN /
// ±Infinity) or `<= 0` collapses to 0. This is the SAME "0 / non-finite = unset"
// discipline as budget.ts.
const sanitizeDepth = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)

/** The expected verdict derived purely from the documented contract. */
const expectedPermit = (currentDepth: number, graphLimitDepth: number): boolean =>
  sanitizeDepth(currentDepth) < sanitizeDepth(graphLimitDepth)

// ── Generators ───────────────────────────────────────────────────────────────────
// `depthArb` is biased toward realistic small non-negative depths (so both permit and
// refuse paths are well represented) but regularly injects edge values — 0 (the
// "unset" sentinel), negatives, and the non-finite sentinels NaN / ±Infinity — to drive
// the totality + sanitization branches of the SUT.
const EDGE_VALUES = [
  0,
  1,
  -1,
  -1_000,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
] as const

const depthArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 8, arbitrary: fc.integer({ min: 0, max: 16 }) },
  { weight: 1, arbitrary: fc.double({ min: -1_000, max: 1_000, noNaN: false }) }, // may emit NaN / ±Infinity
  { weight: 1, arbitrary: fc.constantFrom(...EDGE_VALUES) },
)

describe('Property 10: Sub_Agent nesting depth is bounded by the Graph_Limit depth', () => {
  // 1. TOTALITY: never throws; always returns a boolean for ANY input, including the
  //    adversarial non-finite / negative depths.
  it('is total: never throws and always returns a boolean for any input', () => {
    fc.assert(
      fc.property(depthArb, depthArb, (currentDepth, graphLimitDepth) => {
        let result!: boolean
        expect(() => {
          result = canSpawnSubAgent(currentDepth, graphLimitDepth)
        }).not.toThrow()
        expect(typeof result).toBe('boolean')
      }),
      { numRuns: 100 },
    )
  })

  // 2. THE CORE INVARIANT (the heart of Property 10): a spawn is permitted IFF the
  //    sanitized current depth is strictly below the sanitized Graph_Limit depth —
  //    reach-or-exceed is refused, strictly-within is not refused on the depth basis
  //    (Req 6.2, 6.3). Asserted in BOTH directions against the contract oracle.
  it('permits the spawn iff currentDepth < graphLimitDepth (sanitized)', () => {
    fc.assert(
      fc.property(depthArb, depthArb, (currentDepth, graphLimitDepth) => {
        expect(canSpawnSubAgent(currentDepth, graphLimitDepth)).toBe(
          expectedPermit(currentDepth, graphLimitDepth),
        )
      }),
      { numRuns: 100 },
    )
  })

  // 3. REACH-OR-EXCEED IS REFUSED (Req 6.3): for finite non-negative depths, a spawn at
  //    or beyond the limit is always refused. Drawn from an ordered pair so
  //    `currentDepth >= graphLimitDepth` holds by construction.
  it('refuses every spawn that would reach or exceed the Graph_Limit depth', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 32 }),
        fc.integer({ min: 0, max: 32 }),
        (a, b) => {
          const graphLimitDepth = Math.min(a, b)
          const currentDepth = Math.max(a, b) // currentDepth >= graphLimitDepth
          expect(canSpawnSubAgent(currentDepth, graphLimitDepth)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  // 4. STRICTLY-WITHIN IS PERMITTED (Req 6.2, 6.3): for finite non-negative depths with
  //    a real positive headroom, a spawn strictly below the limit is never refused on
  //    the depth basis. Built so `currentDepth < graphLimitDepth` holds by construction.
  it('permits every spawn that stays strictly within the Graph_Limit depth', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 31 }),
        fc.integer({ min: 1, max: 32 }),
        (currentDepth, headroom) => {
          const graphLimitDepth = currentDepth + headroom // strictly greater
          expect(canSpawnSubAgent(currentDepth, graphLimitDepth)).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  // 5. NON-FINITE / NEGATIVE INPUTS REFUSE (TOTALITY, sanitized to 0): a non-finite or
  //    `<= 0` graphLimitDepth leaves no headroom, so EVERY spawn is refused regardless
  //    of currentDepth — a NaN / Infinity / negative depth can never accidentally
  //    authorize an unbounded spawn.
  it('refuses every spawn when graphLimitDepth is non-finite or <= 0 (sanitized to 0)', () => {
    const unsetLimitArb = fc.constantFrom(
      0,
      -1,
      -1_000,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    )
    fc.assert(
      fc.property(depthArb, unsetLimitArb, (currentDepth, graphLimitDepth) => {
        expect(canSpawnSubAgent(currentDepth, graphLimitDepth)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })
})
