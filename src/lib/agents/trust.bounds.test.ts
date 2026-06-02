// Property test for the trust engine's BOUNDS + BANDS invariants (task 2.9).
//
// This pins Property 4 ("Trust score stays an integer in [0,100] with correct
// bands"). It is the bounds/band sibling of the trust-direction property (task
// 2.8) and deliberately lives in its own file so the two never clobber each
// other.
//
// `adjustTrust`, `band`, and `INITIAL_TRUST_SCORE` (trust.ts, tasks 2.1/2.2) are
// PURE / TOTAL / DETERMINISTIC, so they are exercised directly with no I/O and no
// mocks. The generators intentionally span junk inputs — negatives, >100,
// non-integers, and the non-finite values NaN / ±Infinity — to prove totality
// and clamping hold for ANY number, not just the well-behaved [0,100] integers.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  adjustTrust,
  band,
  INITIAL_TRUST_SCORE,
  type TrustBand,
  type TrustEvent,
} from './trust'

// Every member of the TrustEvent union (Req 4.3–4.8). Listed explicitly so a
// future event addition surfaces here as a compile error rather than silently
// shrinking coverage.
const EVENTS: readonly TrustEvent[] = [
  'proposal-approved-clean',
  'dry-run-clean',
  'in-scope-run',
  'proposal-dismissed',
  'proposal-heavily-refined',
  'scope-violation',
  'injection-detected',
]

const eventArb: fc.Arbitrary<TrustEvent> = fc.constantFrom(...EVENTS)

// Arbitrary starting score spanning the FULL junk space the engine must absorb:
//   - in-range and out-of-range integers (negative, >100),
//   - arbitrary non-integer doubles (which fast-check seeds with NaN / ±Infinity),
//   - the boundary values where bands meet, plus the non-finite sentinels pinned
//     explicitly so they are always hit, not just probabilistically.
const scoreArb: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: -250, max: 350 }),
  fc.double(), // includes fractional values, NaN, +Infinity, -Infinity
  fc.constantFrom(
    -1,
    0,
    39,
    39.5,
    40,
    79,
    79.9,
    80,
    100,
    100.4,
    101,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ),
)

// Oracle for the band mapping, derived from the SPEC (Req 4.9: 80–100 trusted,
// 40–79 proving, 0–39 watch) plus the design's documented clamping for inputs
// outside [0,100]: >100 clamps up into trusted, <0 clamps down into watch, and a
// non-finite/NaN score is treated as the least-privileged Watch band. Encoding
// the rule independently of the implementation makes this a real check.
function expectedBand(n: number): TrustBand {
  if (Number.isNaN(n)) return 'watch'
  if (n >= 80) return 'trusted'
  if (n >= 40) return 'proving'
  return 'watch'
}

const isValidScore = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100

// Feature: hermes-agents, Property 4: Trust score stays an integer in [0,100] with correct bands
describe('Property 4: Trust score stays an integer in [0,100] with correct bands', () => {
  // Req 4.1 + 4.12: every adjustment yields an integer constrained to [0,100],
  // no matter how malformed the starting score is.
  it('adjustTrust ALWAYS returns an integer in [0,100] for any score + event', () => {
    fc.assert(
      fc.property(scoreArb, eventArb, (score, event) => {
        const next = adjustTrust(score, event)
        return Number.isInteger(next) && next >= 0 && next <= 100
      }),
      { numRuns: 100 },
    )
  })

  // Req 4.9: band() is TOTAL (never throws, always one of three values) and maps
  // every input to the correct band, including the documented out-of-range and
  // non-finite clamping.
  it('band() is total and maps every input to the correct band', () => {
    fc.assert(
      fc.property(scoreArb, (score) => {
        const b = band(score)
        return (
          (b === 'trusted' || b === 'proving' || b === 'watch') &&
          b === expectedBand(score)
        )
      }),
      { numRuns: 100 },
    )
  })

  // The band of an adjusted score (always in [0,100]) lands in the right range —
  // the two helpers agree on the values the engine actually produces.
  it('the band of any adjusted score matches its numeric range', () => {
    fc.assert(
      fc.property(scoreArb, eventArb, (score, event) => {
        const next = adjustTrust(score, event)
        const b = band(next)
        if (next >= 80) return b === 'trusted'
        if (next >= 40) return b === 'proving'
        return b === 'watch'
      }),
      { numRuns: 100 },
    )
  })

  // "no gaps or overlaps at the boundaries" — the exact band edges (Req 4.9).
  it('maps the band boundaries exactly with no gaps or overlaps', () => {
    expect(band(0)).toBe('watch')
    expect(band(39)).toBe('watch')
    expect(band(40)).toBe('proving')
    expect(band(79)).toBe('proving')
    expect(band(80)).toBe('trusted')
    expect(band(100)).toBe('trusted')
  })

  // Req 4.2: a freshly-created Agent starts below the Trusted band (Watch or
  // Proving), and is itself a valid score.
  it('INITIAL_TRUST_SCORE is a valid score below the Trusted band (Req 4.2)', () => {
    expect(isValidScore(INITIAL_TRUST_SCORE)).toBe(true)
    expect(INITIAL_TRUST_SCORE).toBeLessThan(80)
    expect(band(INITIAL_TRUST_SCORE)).not.toBe('trusted')
  })

  // Idempotent clamping: feeding an ALREADY-valid score back through adjustTrust
  // keeps it valid (the clamp never knocks a good value out of range).
  it('keeps an already-valid score valid after another adjustment (idempotent clamp)', () => {
    const validScoreArb = fc.integer({ min: 0, max: 100 })
    fc.assert(
      fc.property(validScoreArb, eventArb, (score, event) => {
        return isValidScore(adjustTrust(score, event))
      }),
      { numRuns: 100 },
    )
  })
})
