// Feature: hermes-agents, Property 3: Trust adjustment moves in the correct direction
//
// Validates: Requirements 3.9, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
//
// `adjustTrust(score, event)` is a PURE, TOTAL, DETERMINISTIC function that folds a
// single track-record `TrustEvent` into a Trust_Score. This file is the
// property-based-test target for Property 3 (task 2.8). It asserts the directional
// invariant over arbitrary starting scores — including out-of-range, non-integer,
// and non-finite values, to exercise the function's totality — and arbitrary
// events:
//
//   (a) POSITIVE events (`proposal-approved-clean`, `dry-run-clean`, `in-scope-run`)
//       NEVER DECREASE the score (Req 4.3, 4.4, 4.5).
//   (b) NEGATIVE events (`proposal-dismissed`, `proposal-heavily-refined`,
//       `scope-violation`, `injection-detected`) NEVER INCREASE the score
//       (Req 4.6, 4.7, 4.8).
//   (c) A `scope-violation` (the event a scope-violating Dry_Run emits) SPECIFICALLY
//       never raises trust (Req 4.4, 4.7).
//
// Because `adjustTrust` normalizes its input first (`clampScore`: non-finite ⇒ 0,
// round, clamp to [0,100]), the directional invariant is asserted relative to that
// normalized baseline — i.e. the comparison is against `clampScore(score)`, not the
// raw input. The baseline math is mirrored locally (clampScore is not exported),
// matching the function's documented normalization so the generators stay honest.
//
// Tested directly (no I/O, no mocks) since the engine is pure.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { adjustTrust, type TrustEvent } from './trust'

// ── Event partitions (mirror trust.ts → TRUST_DELTAS sign classes) ─────────────
const POSITIVE_EVENTS: readonly TrustEvent[] = [
  'proposal-approved-clean',
  'dry-run-clean',
  'in-scope-run',
]
const NEGATIVE_EVENTS: readonly TrustEvent[] = [
  'proposal-dismissed',
  'proposal-heavily-refined',
  'scope-violation',
  'injection-detected',
]

const positiveEvent: fc.Arbitrary<TrustEvent> = fc.constantFrom(...POSITIVE_EVENTS)
const negativeEvent: fc.Arbitrary<TrustEvent> = fc.constantFrom(...NEGATIVE_EVENTS)

// ── Starting-score generator ───────────────────────────────────────────────────
// Spans every band plus out-of-range, non-integer, and non-finite inputs so the
// directional invariant is proven for ALL inputs (the function's totality
// guarantee), each compared against its OWN normalized baseline.
const anyStartScore: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0, max: 100 }), // in-range integers
  fc.integer({ min: -100, max: 200 }), // out-of-range integers
  fc.double({ min: -50, max: 150, noNaN: true }), // non-integer (rounded by clampScore)
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY), // non-finite ⇒ 0
)

// Mirror of trust.ts → clampScore: the normalized baseline adjustTrust starts from.
// non-finite ⇒ 0, round to nearest integer, clamp to [0,100].
function normalizedBaseline(score: number): number {
  if (!Number.isFinite(score)) return 0
  const rounded = Math.round(score)
  if (rounded < 0) return 0
  if (rounded > 100) return 100
  return rounded
}

// ── Property 3 ──────────────────────────────────────────────────────────────────
describe('adjustTrust — Property 3 (trust adjustment moves in the correct direction)', () => {
  // (a) Positive events never DECREASE the score (Req 4.3, 4.4, 4.5).
  it('(a) a positive event never decreases the normalized score', () => {
    fc.assert(
      fc.property(anyStartScore, positiveEvent, (score, event) => {
        const baseline = normalizedBaseline(score)
        expect(adjustTrust(score, event)).toBeGreaterThanOrEqual(baseline)
      }),
      { numRuns: 100 },
    )
  })

  // (b) Negative events never INCREASE the score (Req 4.6, 4.7, 4.8).
  it('(b) a negative event never increases the normalized score', () => {
    fc.assert(
      fc.property(anyStartScore, negativeEvent, (score, event) => {
        const baseline = normalizedBaseline(score)
        expect(adjustTrust(score, event)).toBeLessThanOrEqual(baseline)
      }),
      { numRuns: 100 },
    )
  })

  // (c) A scope-violating event SPECIFICALLY never raises trust (Req 4.4, 4.7):
  // this is the event a scope-violating Dry_Run emits, so such a Dry_Run can never
  // increase the Trust_Score.
  it('(c) a scope violation never raises trust', () => {
    fc.assert(
      fc.property(anyStartScore, (score) => {
        const baseline = normalizedBaseline(score)
        expect(adjustTrust(score, 'scope-violation')).toBeLessThanOrEqual(baseline)
      }),
      { numRuns: 100 },
    )
  })
})
