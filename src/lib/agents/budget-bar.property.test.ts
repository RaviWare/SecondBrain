// Feature: hermes-agents, Property 10: Per-run budget bar state is a total function of usage
// Validates: Requirements 10.9, 10.10
//
// The universal invariants of `budgetBarState(used, cap)` over ARBITRARY inputs:
// it is a TOTAL function (always returns one of 'ok' | 'amber' | 'over', never
// throws), DETERMINISTIC, and respects the documented thresholds and monotonicity
// on the main domain (positive finite cap, non-negative finite used), plus the
// unlimited / no-budget edge caps. Concrete boundary examples are pinned
// separately in budget.test.ts.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { budgetBarState, type BudgetBarState } from './budget'

// ── Helpers ──────────────────────────────────────────────────────────────────────

const STATES: readonly BudgetBarState[] = ['ok', 'amber', 'over']

/** Mirror of the SUT's `used` sanitization: negative / NaN / non-finite ⇒ 0. */
function sanitizeUsed(used: number): number {
  return Number.isFinite(used) && used > 0 ? used : 0
}

/** Total order of the three states (ok < amber < over). */
function rank(state: BudgetBarState): number {
  return state === 'ok' ? 0 : state === 'amber' ? 1 : 2
}

// ── Generators ─────────────────────────────────────────────────────────────────
// `usedArb` / `capArb` cover the documented domain (non-negative used, positive
// cap) AND inject the totality edge values (0, negative, NaN, ±Infinity) so every
// property proves the function stays total over junk inputs.

const EDGE_NUMBERS = [
  0,
  -0,
  -1,
  -1_000_000,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  Number.MAX_SAFE_INTEGER,
  Number.MIN_VALUE,
] as const

const usedArb = fc.oneof(
  fc.double({ min: 0, max: 1e9, noNaN: true }),
  fc.nat(),
  fc.constantFrom(...EDGE_NUMBERS),
  fc.double(), // unconstrained: may be NaN / ±Infinity / negative
)

const capArb = fc.oneof(
  fc.double({ min: 1, max: 1e9, noNaN: true }),
  fc.integer({ min: 1, max: 1_000_000 }),
  fc.constantFrom(...EDGE_NUMBERS),
  fc.double(), // unconstrained
)

// A strictly-positive finite cap for the "main domain" properties.
const positiveCapArb = fc.double({ min: 1, max: 1e9, noNaN: true })

// ── Property 10 ──────────────────────────────────────────────────────────────────
// Feature: hermes-agents, Property 10: Per-run budget bar state is a total function of usage
// Validates: Requirements 10.9, 10.10
describe('Property 10: Per-run budget bar state is a total function of usage', () => {
  it('is total & well-typed: any (used, cap) returns exactly one of ok|amber|over and never throws', () => {
    fc.assert(
      fc.property(usedArb, capArb, (used, cap) => {
        let state: BudgetBarState
        expect(() => {
          state = budgetBarState(used, cap)
        }).not.toThrow()
        expect(STATES).toContain(state!)
      }),
      { numRuns: 300 },
    )
  })

  it('is deterministic: the same inputs always yield the same state', () => {
    fc.assert(
      fc.property(usedArb, capArb, (used, cap) => {
        expect(budgetBarState(used, cap)).toBe(budgetBarState(used, cap))
      }),
      { numRuns: 200 },
    )
  })

  it('respects the thresholds on the main domain: ratio<0.8 ⇒ ok, [0.8,1) ⇒ amber, >=1 ⇒ over (Req 10.9, 10.10)', () => {
    fc.assert(
      fc.property(
        positiveCapArb,
        // `factor` scales `used` relative to the cap so we straddle every band:
        // well under 80%, exactly 80%, between, exactly 100%, and well over.
        fc.oneof(
          fc.double({ min: 0, max: 3, noNaN: true }),
          fc.constantFrom(0, 0.5, 0.79, 0.8, 0.95, 1, 1.5, 2),
        ),
        (cap, factor) => {
          const used = cap * factor
          const ratio = sanitizeUsed(used) / cap
          const state = budgetBarState(used, cap)

          if (ratio >= 1) {
            expect(state).toBe('over')
          } else if (ratio >= 0.8) {
            expect(state).toBe('amber')
          } else {
            expect(state).toBe('ok')
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('handles the exact boundaries: ratio === 0.8 ⇒ amber and ratio === 1 ⇒ over', () => {
    fc.assert(
      // Build the cap as 5*k so that used = 4*k gives a ratio of EXACTLY 0.8
      // (4k/5k === 0.8 in IEEE-754, unlike cap*0.8 which rounds below 0.8 for
      // many caps). This pins the lower edge of the amber band precisely.
      fc.property(fc.integer({ min: 1, max: 200_000_000 }), (k) => {
        const cap = 5 * k
        const used = 4 * k
        // ratio exactly 0.8 ⇒ amber (lower edge of the amber band, Req 10.9).
        expect(used / cap).toBe(0.8)
        expect(budgetBarState(used, cap)).toBe('amber')
        // ratio exactly 1 ⇒ over (cap reached, Req 10.10).
        expect(budgetBarState(cap, cap)).toBe('over')
      }),
      { numRuns: 100 },
    )
  })

  it('is monotonic in usage for a fixed cap: used1 <= used2 ⇒ rank(state) never decreases', () => {
    fc.assert(
      fc.property(
        positiveCapArb,
        fc.double({ min: 0, max: 1e9, noNaN: true }),
        fc.double({ min: 0, max: 1e9, noNaN: true }),
        (cap, a, b) => {
          const lo = Math.min(a, b)
          const hi = Math.max(a, b)
          expect(rank(budgetBarState(lo, cap))).toBeLessThanOrEqual(
            rank(budgetBarState(hi, cap)),
          )
        },
      ),
      { numRuns: 300 },
    )
  })

  it("unlimited cap (+Infinity) is always 'ok' regardless of usage", () => {
    fc.assert(
      fc.property(usedArb, (used) => {
        expect(budgetBarState(used, Number.POSITIVE_INFINITY)).toBe('ok')
      }),
      { numRuns: 100 },
    )
  })

  it("no-budget caps (cap <= 0) are 'over' iff sanitized used > 0, else 'ok'", () => {
    fc.assert(
      fc.property(
        usedArb,
        fc.oneof(
          fc.double({ min: -1e9, max: 0, noNaN: true }),
          fc.constantFrom(0, -0, -1, -1_000_000),
        ),
        (used, cap) => {
          const expected = sanitizeUsed(used) > 0 ? 'over' : 'ok'
          expect(budgetBarState(used, cap)).toBe(expected)
        },
      ),
      { numRuns: 200 },
    )
  })
})
