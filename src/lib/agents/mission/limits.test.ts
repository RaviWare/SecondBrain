// Feature: mission-orchestrator, Property 4: A mission stops starting runs exactly when one of its own ceilings is reached
// Validates: Requirements 5.5, 5.6, 5.8, 5.9
//
// The universal invariants for the mission's OWN fourth ceiling (`missionCeilingReached`
// + `missionGate`) over ARBITRARY `MissionBudget` and timing inputs — every mix of
// finite / zero / negative / NaN / ±Infinity token & cost ceilings and usages, and every
// mix of `startedAt` / `now` / `wallClockLimitMs`. This exercises the "0 / non-finite =
// unlimited" convention, the literal `used >= ceiling` threshold equality, and the fixed
// token → cost → wall-clock precedence.
//
// Both targets are PURE / TOTAL / DETERMINISTIC (no I/O, no models), so they run directly
// with no mocks. The oracle below RE-STATES the documented contract from `limits.ts`
// (a ceiling is ACTIVE iff finite & > 0; usage / timing are sanitized to non-negative
// finite numbers; precedence token → cost → wall-clock) — it is independent of the SUT's
// internals, so a divergence is a real bug, not a tautology.
//
// NOTE: Property 10 (`canSpawnSubAgent`) is covered separately in task 1.11; this file
// implements ONLY the Property 4 block per the plan.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  missionCeilingReached,
  missionGate,
  type MissionBudget,
  type MissionTiming,
  type MissionCeilingReason,
  type MissionCeilingResult,
} from './limits'

// ── Contract oracle (mirrors limits.ts's documented convention) ────────────────────
// These re-state the contract, NOT the implementation, so the property can predict the
// stop reason / precedence without calling the SUT.

/** A finite count clamped to `>= 0`; anything non-finite/negative ⇒ 0 (== `nonNegFinite`). */
const sanitize = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)

/** A ceiling is ACTIVE (enforceable) only when it is a finite value strictly `> 0`. */
const isActiveCeiling = (c: number): boolean => Number.isFinite(c) && c > 0

/**
 * The expected stop reason (or `undefined` ⇒ no stop) derived purely from the documented
 * precedence: token ceiling → cost ceiling → wall-clock. Token vs cost are distinguished
 * (Req 5.6) so the abort record can name the exact spend limit.
 */
function expectedReason(budget: MissionBudget, timing: MissionTiming): MissionCeilingReason | undefined {
  if (isActiveCeiling(budget.tokenCeiling) && sanitize(budget.tokensUsed) >= budget.tokenCeiling) {
    return 'mission-token-ceiling'
  }
  if (isActiveCeiling(budget.costCeiling) && sanitize(budget.costUsed) >= budget.costCeiling) {
    return 'mission-cost-ceiling'
  }
  if (isActiveCeiling(timing.wallClockLimitMs) && sanitize(timing.now) - sanitize(timing.startedAt) >= timing.wallClockLimitMs) {
    return 'wall-clock'
  }
  return undefined
}

/** Asserts the result is structurally well-formed (`reason` present iff `stop`). */
function assertWellFormed(r: MissionCeilingResult): void {
  expect(typeof r.stop).toBe('boolean')
  if (r.stop) {
    expect(['mission-token-ceiling', 'mission-cost-ceiling', 'wall-clock']).toContain(r.reason)
  } else {
    // `{ stop: false }` carries no reason field.
    expect((r as { reason?: unknown }).reason).toBeUndefined()
  }
}

// ── Generators ─────────────────────────────────────────────────────────────────────
// `numArb` is biased toward realistic finite values (so reached / not-reached paths are
// both well represented) but regularly injects edge values — 0 (the "unset = unlimited"
// sentinel), negatives, NaN, and ±Infinity — to drive the totality + sanitization
// branches of the SUT.
const EDGE_VALUES = [
  0,
  1,
  -1,
  -1_000,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
] as const

const numArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 8, arbitrary: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }) },
  { weight: 1, arbitrary: fc.double({ min: -1_000, max: 1_000_000, noNaN: false }) }, // may emit NaN / ±Infinity
  { weight: 1, arbitrary: fc.constantFrom(...EDGE_VALUES) },
)

// Timestamps span a wide finite range (plus the edge values) so wall-clock differences
// `now - startedAt` are frequently meaningful in either direction.
const timeArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 8, arbitrary: fc.double({ min: 0, max: 5_000_000, noNaN: true, noDefaultInfinity: true }) },
  { weight: 1, arbitrary: fc.constantFrom(...EDGE_VALUES) },
)

const budgetArb: fc.Arbitrary<MissionBudget> = fc.record({
  tokenCeiling: numArb,
  costCeiling: numArb,
  tokensUsed: numArb,
  costUsed: numArb,
})

const timingArb: fc.Arbitrary<MissionTiming> = fc.record({
  startedAt: timeArb,
  now: timeArb,
  wallClockLimitMs: numArb,
})

// Ceilings guaranteed INACTIVE (`<= 0` / non-finite) — for the "unlimited never stops"
// property.
const inactiveCeilingArb: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(0, -1, -1_000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
  fc.double({ min: -1_000_000, max: 0, noNaN: true, noDefaultInfinity: true }),
)

// A strictly-positive, finite active ceiling — for the threshold-equality property.
const activeCeilingArb: fc.Arbitrary<number> = fc.double({
  min: 1,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true,
})

describe('Property 4: A mission stops starting runs exactly when one of its own ceilings is reached', () => {
  // 1. TOTALITY (Req 5.5, 5.8): never throws; always returns a well-formed result with a
  //    `reason` present iff `stop` is true.
  it('is total: never throws and always returns a well-formed result for any input', () => {
    fc.assert(
      fc.property(budgetArb, timingArb, (budget, timing) => {
        let result!: MissionCeilingResult
        expect(() => {
          result = missionCeilingReached(budget, timing)
        }).not.toThrow()
        assertWellFormed(result)
      }),
      { numRuns: 200 },
    )
  })

  // 2. THE CORE INVARIANT (Req 5.5, 5.6, 5.8, 5.9): the stop flag and the reason match
  //    the documented precedence EXACTLY, in both directions. This single law subsumes:
  //    the token / cost / wall-clock thresholds (`used >= ceiling`, `now - startedAt >=
  //    wallClockLimitMs`); the token-vs-cost distinction; and that an unset ceiling never
  //    contributes (the oracle only fires on ACTIVE ceilings).
  it('reports stop + reason exactly per the token → cost → wall-clock precedence, else no stop', () => {
    fc.assert(
      fc.property(budgetArb, timingArb, (budget, timing) => {
        const r = missionCeilingReached(budget, timing)
        const reason = expectedReason(budget, timing)

        expect(r.stop).toBe(reason !== undefined)
        if (r.stop) expect(r.reason).toBe(reason)
      }),
      { numRuns: 300 },
    )
  })

  // 3. UNSET CEILINGS NEVER STOP (Req 5.5, 5.8): with every ceiling `<= 0` / non-finite
  //    (unset = unlimited), the mission NEVER stops regardless of usage or elapsed time.
  it('an unset (0 / non-finite) ceiling never triggers a stop, whatever the usage / timing', () => {
    fc.assert(
      fc.property(inactiveCeilingArb, inactiveCeilingArb, inactiveCeilingArb, numArb, numArb, timeArb, timeArb, (tokenCeiling, costCeiling, wallClockLimitMs, tokensUsed, costUsed, startedAt, now) => {
        const r = missionCeilingReached(
          { tokenCeiling, costCeiling, tokensUsed, costUsed },
          { startedAt, now, wallClockLimitMs },
        )
        expect(r.stop).toBe(false)
      }),
      { numRuns: 200 },
    )
  })

  // 4. THRESHOLD EQUALITY + TOKEN-VS-COST DISTINCTION (Req 5.5, 5.6): for an isolated
  //    ACTIVE token ceiling, `used >= ceiling` stops with `mission-token-ceiling` and
  //    `used < ceiling` does not; symmetrically for the cost ceiling — and the two are
  //    never confused. Driving `used ∈ {ceiling, ceiling - δ, ceiling + δ}` pins the
  //    boundary itself (`>=`, not `>`).
  it("token ceiling alone: stop ⇔ tokensUsed >= tokenCeiling, reason 'mission-token-ceiling'", () => {
    fc.assert(
      fc.property(activeCeilingArb, fc.double({ min: 0, max: 2_000_000, noNaN: true, noDefaultInfinity: true }), (tokenCeiling, tokensUsed) => {
        // Cost + wall-clock left UNSET so only the token ceiling can stop the mission.
        const r = missionCeilingReached(
          { tokenCeiling, costCeiling: 0, tokensUsed, costUsed: 0 },
          { startedAt: 0, now: 0, wallClockLimitMs: 0 },
        )
        if (tokensUsed >= tokenCeiling) {
          expect(r).toEqual({ stop: true, reason: 'mission-token-ceiling' })
        } else {
          expect(r.stop).toBe(false)
        }
      }),
      { numRuns: 200 },
    )
  })

  it("cost ceiling alone: stop ⇔ costUsed >= costCeiling, reason 'mission-cost-ceiling'", () => {
    fc.assert(
      fc.property(activeCeilingArb, fc.double({ min: 0, max: 2_000_000, noNaN: true, noDefaultInfinity: true }), (costCeiling, costUsed) => {
        // Token + wall-clock left UNSET so only the cost ceiling can stop the mission.
        const r = missionCeilingReached(
          { tokenCeiling: 0, costCeiling, tokensUsed: 0, costUsed },
          { startedAt: 0, now: 0, wallClockLimitMs: 0 },
        )
        if (costUsed >= costCeiling) {
          expect(r).toEqual({ stop: true, reason: 'mission-cost-ceiling' })
        } else {
          expect(r.stop).toBe(false)
        }
      }),
      { numRuns: 200 },
    )
  })

  // 5. PRECEDENCE: when BOTH the token and cost ceilings are active and reached, the
  //    token ceiling is reported (token checked before cost, Req 5.6).
  it('token ceiling takes precedence over the cost ceiling when both are reached', () => {
    fc.assert(
      fc.property(activeCeilingArb, activeCeilingArb, (tokenCeiling, costCeiling) => {
        const r = missionCeilingReached(
          { tokenCeiling, costCeiling, tokensUsed: tokenCeiling, costUsed: costCeiling },
          { startedAt: 0, now: 0, wallClockLimitMs: 0 },
        )
        expect(r).toEqual({ stop: true, reason: 'mission-token-ceiling' })
      }),
      { numRuns: 200 },
    )
  })

  // 6. WALL-CLOCK THRESHOLD (Req 5.8, 5.9): with both spend ceilings UNSET, an active
  //    `wallClockLimitMs` stops the mission iff `now - startedAt >= wallClockLimitMs`
  //    (with `now` / `startedAt` sanitized to non-negative finite values).
  it("wall-clock alone: stop ⇔ now - startedAt >= wallClockLimitMs, reason 'wall-clock'", () => {
    fc.assert(
      fc.property(activeCeilingArb, timeArb, timeArb, (wallClockLimitMs, startedAt, now) => {
        const r = missionCeilingReached(
          { tokenCeiling: 0, costCeiling: 0, tokensUsed: 0, costUsed: 0 },
          { startedAt, now, wallClockLimitMs },
        )
        const elapsed = sanitize(now) - sanitize(startedAt)
        if (elapsed >= wallClockLimitMs) {
          expect(r).toEqual({ stop: true, reason: 'wall-clock' })
        } else {
          expect(r.stop).toBe(false)
        }
      }),
      { numRuns: 200 },
    )
  })

  // 7. GATE LINKAGE (Req 5.6, 5.9): whenever `missionCeilingReached` reports a stop, a
  //    `running` mission WITH a free concurrency slot is STILL refused a new Run by
  //    `missionGate`, and the gate surfaces the SAME ceiling reason. Conversely, with no
  //    ceiling reached, a running mission with a free slot is allowed — so the ceiling is
  //    exactly what flips the gate.
  it('whenever a stop is reported, missionGate (running + free slot) disallows a new run with the same reason', () => {
    fc.assert(
      fc.property(budgetArb, timingArb, (budget, timing) => {
        const ceiling = missionCeilingReached(budget, timing)
        // `running` state + a guaranteed free slot (0 of 1 used) isolate the ceiling as
        // the only thing that can disallow the Run.
        const gate = missionGate({
          missionState: 'running',
          budget,
          timing,
          runningCount: 0,
          concurrencyLimit: 1,
        })

        if (ceiling.stop) {
          expect(gate.allowed).toBe(false)
          expect(gate.reason).toBe(ceiling.reason)
        } else {
          expect(gate.allowed).toBe(true)
          expect(gate.reason).toBeUndefined()
        }
      }),
      { numRuns: 300 },
    )
  })
})
