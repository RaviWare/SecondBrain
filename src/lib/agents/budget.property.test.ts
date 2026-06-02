// Feature: hermes-agents, Property 9: A run never starts that would exceed any budget cap
// Validates: Requirements 10.4, 10.6, 10.7, 10.8
//
// The universal invariants over ARBITRARY budget state — every mix of per-Run,
// per-Agent, and Squad caps/usage, including unlimited (`<= 0` / non-finite) caps
// and adversarial negative / NaN / ±Infinity inputs smuggled in to prove TOTALITY.
// The concrete worked examples (exact clamp values, each block reason) are pinned
// in budget.test.ts (task 7.2); this file proves the laws hold for EVERY input.
//
// `canStartRun` is PURE / TOTAL / DETERMINISTIC (no I/O, no models), so it is tested
// directly with no mocks. The block-precedence oracle below re-derives the expected
// outcome from `budget.ts`'s DOCUMENTED contract (a cap is ACTIVE iff finite & > 0;
// `used` is sanitized to a non-negative finite number) — it is independent of the
// SUT's internals, so a divergence is a real bug, not a tautology.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { canStartRun, type BudgetInputs, type BudgetBlockReason } from './budget'

// ── Contract oracle (mirrors budget.ts's documented "0 = unlimited" convention) ──
// These re-state the contract, NOT the implementation, so the property can predict
// the block reason / precedence without calling the SUT.

/** A finite token count clamped to `>= 0`; anything non-finite/negative ⇒ 0. */
const sanitizeUsed = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)

/** A cap is ACTIVE (enforceable) only when it is a finite value strictly `> 0`. */
const isActiveCap = (cap: number): boolean => Number.isFinite(cap) && cap > 0

/**
 * The expected block reason (or `undefined` ⇒ allowed) derived purely from the
 * documented priority order: budget-paused → agent-cap-reached → squad-cap-reached.
 */
function expectedReason(b: BudgetInputs): BudgetBlockReason | undefined {
  if (Boolean(b.budgetPaused)) return 'budget-paused'
  if (isActiveCap(b.agentCap) && sanitizeUsed(b.agentUsed) >= b.agentCap) return 'agent-cap-reached'
  if (isActiveCap(b.squadCap) && sanitizeUsed(b.squadUsed) >= b.squadCap) return 'squad-cap-reached'
  return undefined
}

/** Asserts the result is structurally well-formed (used by every property). */
function assertWellFormed(r: ReturnType<typeof canStartRun>): void {
  expect(typeof r.allowed).toBe('boolean')
  expect(typeof r.effective).toBe('object')
  expect(typeof r.effective.perRunTokens).toBe('number')
  expect(typeof r.effective.agentRemaining).toBe('number')
  expect(typeof r.effective.squadRemaining).toBe('number')
  // `reason` is present IFF the run was blocked.
  if (r.allowed) expect(r.reason).toBeUndefined()
  else expect(r.reason).toBeDefined()
}

// ── Generators ───────────────────────────────────────────────────────────────────
// `tokenArb` is biased toward realistic finite values (so allowed paths are well
// represented) but regularly injects edge values — 0 (the "unset = unlimited"
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

const tokenArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 8, arbitrary: fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }) },
  { weight: 1, arbitrary: fc.double({ min: -1_000, max: 1_000_000, noNaN: false }) }, // may emit NaN / ±Infinity
  { weight: 1, arbitrary: fc.constantFrom(...EDGE_VALUES) },
)

const budgetInputsArb: fc.Arbitrary<BudgetInputs> = fc.record({
  budgetPaused: fc.boolean(),
  agentCap: tokenArb,
  agentUsed: tokenArb,
  squadCap: tokenArb,
  squadUsed: tokenArb,
  perRunBudget: tokenArb,
})

// Caps guaranteed INACTIVE (`<= 0`) — for the "unlimited never blocks" property.
const nonPositiveCapArb: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(0, -1, -1_000),
  fc.double({ min: -1_000_000, max: 0, noNaN: true, noDefaultInfinity: true }),
)

describe('Property 9: A run never starts that would exceed any budget cap', () => {
  // 1. TOTALITY (Req 10.4): never throws; always returns a well-formed result with
  //    three numeric `effective` fields and a `reason` present iff blocked.
  it('is total: never throws and always returns a well-formed result for any input', () => {
    fc.assert(
      fc.property(budgetInputsArb, (b) => {
        let result!: ReturnType<typeof canStartRun>
        expect(() => {
          result = canStartRun(b)
        }).not.toThrow()
        assertWellFormed(result)
      }),
      { numRuns: 200 },
    )
  })

  // 2. THE CORE INVARIANT (the heart of Property 9): when ALLOWED, the effective
  //    per-Run allowance never exceeds any ACTIVE remaining cap and is `>= 0`.
  //    Asserting against `effective.agentRemaining` / `squadRemaining` directly is
  //    the cleanest form: those fields ARE the live headroom (`+Infinity` when a
  //    level is unlimited, so the `<=` is trivially satisfied there).
  it('allowed ⇒ effective per-run budget never exceeds either remaining cap and is >= 0', () => {
    fc.assert(
      fc.property(budgetInputsArb, (b) => {
        const r = canStartRun(b)
        if (!r.allowed) return // invariant only constrains the started-run case.

        expect(r.effective.perRunTokens).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(r.effective.perRunTokens)).toBe(true)
        expect(r.effective.perRunTokens).toBeLessThanOrEqual(r.effective.agentRemaining)
        expect(r.effective.perRunTokens).toBeLessThanOrEqual(r.effective.squadRemaining)

        // Cross-check the remaining fields against the contract: an active cap's
        // headroom is `max(0, cap - sanitizedUsed)`; an inactive cap is +Infinity.
        if (isActiveCap(b.agentCap)) {
          expect(r.effective.agentRemaining).toBe(Math.max(0, b.agentCap - sanitizeUsed(b.agentUsed)))
          // ⇒ the per-run allowance also never exceeds the raw active cap headroom.
          expect(r.effective.perRunTokens).toBeLessThanOrEqual(Math.max(0, b.agentCap - sanitizeUsed(b.agentUsed)))
        } else {
          expect(r.effective.agentRemaining).toBe(Number.POSITIVE_INFINITY)
        }
        if (isActiveCap(b.squadCap)) {
          expect(r.effective.squadRemaining).toBe(Math.max(0, b.squadCap - sanitizeUsed(b.squadUsed)))
          expect(r.effective.perRunTokens).toBeLessThanOrEqual(Math.max(0, b.squadCap - sanitizeUsed(b.squadUsed)))
        } else {
          expect(r.effective.squadRemaining).toBe(Number.POSITIVE_INFINITY)
        }
      }),
      { numRuns: 200 },
    )
  })

  // 3. BLOCK CORRECTNESS + PRIORITY (Req 10.6, 10.7, 10.8): the allowed flag and the
  //    block reason match the documented precedence exactly, in BOTH directions.
  it('blocks with the correct reason in priority order (paused → agent cap → squad cap), else allows', () => {
    fc.assert(
      fc.property(budgetInputsArb, (b) => {
        const r = canStartRun(b)
        const reason = expectedReason(b)

        expect(r.allowed).toBe(reason === undefined)
        expect(r.reason).toBe(reason)
      }),
      { numRuns: 200 },
    )
  })

  // 4. UNLIMITED NEVER BLOCKS BY ITSELF (Req 10.4): with no pause and every cap
  //    `<= 0` (unset = unlimited), the run is ALWAYS allowed regardless of usage.
  it('with budgetPaused=false and all caps <= 0 (unlimited), the run is always allowed', () => {
    fc.assert(
      fc.property(nonPositiveCapArb, tokenArb, nonPositiveCapArb, tokenArb, tokenArb, (agentCap, agentUsed, squadCap, squadUsed, perRunBudget) => {
        const r = canStartRun({ budgetPaused: false, agentCap, agentUsed, squadCap, squadUsed, perRunBudget })

        expect(r.allowed).toBe(true)
        expect(r.reason).toBeUndefined()
        // Unlimited levels contribute +Infinity headroom, so they never constrain.
        expect(r.effective.agentRemaining).toBe(Number.POSITIVE_INFINITY)
        expect(r.effective.squadRemaining).toBe(Number.POSITIVE_INFINITY)
        expect(r.effective.perRunTokens).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 200 },
    )
  })

  // 5. BLOCKED ⇒ NO POSITIVE START BUDGET (Req 10.6, 10.8): a refused run can never
  //    hand back a positive allowance — its effective per-run budget is exactly 0.
  it('blocked ⇒ effective.perRunTokens === 0 (a refused run gets no start budget)', () => {
    fc.assert(
      fc.property(budgetInputsArb, (b) => {
        const r = canStartRun(b)
        if (r.allowed) return
        expect(r.effective.perRunTokens).toBe(0)
      }),
      { numRuns: 200 },
    )
  })
})
