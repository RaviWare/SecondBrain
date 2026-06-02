// Property test for the Agent lifecycle FSM + `isRunnable` predicate (task 4.7).
//
// Feature: hermes-agents, Property 14: Lifecycle transitions are total, gated, and never schedule a halted agent
// Validates: Requirements 1.9, 1.13, 7.10, 10.7, 1.5
//
// The universal invariants over ARBITRARY inputs — ALL states × ALL events × an
// arbitrary `TransitionContext` (hadSuccessfulDryRun true/false/undefined), plus
// off-union "garbage" states/events smuggled through `as` casts to prove the total
// fallback. The concrete decision tables and worked examples are pinned separately
// in lifecycle.test.ts (task 4.1); this file proves the laws hold for EVERY input.
//
// `transition` and `isRunnable` are PURE / TOTAL / DETERMINISTIC, so they are tested
// directly with no I/O and no mocks.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  transition,
  isRunnable,
  LIFECYCLE_STATES,
  LIFECYCLE_EVENTS,
  type LifecycleState,
  type LifecycleEvent,
  type TransitionContext,
} from './lifecycle'

// ── Generators ─────────────────────────────────────────────────────────────────
// Draw states/events from the REAL unions so every valid move is well represented,
// but also mix in unknown/garbage values (and adversarial near-misses) so the
// property exercises TOTALITY: any (state, event) — typed or not — must resolve to a
// VALID lifecycle state without throwing.

const GARBAGE = [
  '',
  ' ',
  'deploy ',
  'Deploy',
  'DEPLOY',
  'retired',
  'Retire',
  'running',
  'unknown',
  'constructor',
  'prototype',
  '__proto__',
  'toString',
] as const

// `as LifecycleState` / `as LifecycleEvent` deliberately smuggle off-union values
// through the type boundary to prove the runtime fallback holds for inputs that
// TypeScript can't catch (e.g. data read back from the DB / API).
const stateArb = fc.oneof(
  fc.constantFrom(...LIFECYCLE_STATES),
  fc.constantFrom(...(GARBAGE as readonly string[])),
  fc.string(),
) as fc.Arbitrary<LifecycleState>

const eventArb = fc.oneof(
  fc.constantFrom(...LIFECYCLE_EVENTS),
  fc.constantFrom(...(GARBAGE as readonly string[])),
  fc.string(),
) as fc.Arbitrary<LifecycleEvent>

// A "clean" state generator drawn only from the real union — used where we assert
// the precise gated outcome (deploy / reactivate), which is only defined for valid
// states. (Garbage states are covered by the totality property above.)
const validStateArb = fc.constantFrom(...LIFECYCLE_STATES)

// Arbitrary context: hadSuccessfulDryRun true / false / undefined (missing). The
// `undefined` case proves the SAFE default that DENIES deploy (least privilege).
const ctxArb: fc.Arbitrary<TransitionContext> = fc.record(
  { hadSuccessfulDryRun: fc.option(fc.boolean(), { nil: undefined }) },
  { requiredKeys: [] },
)

// Halted lifecycle states (Req 1.13): excluded from scheduling.
const HALTED_STATES: readonly LifecycleState[] = ['pause', 'retire']

// ── Property 14 ────────────────────────────────────────────────────────────────
describe('Property 14: Lifecycle transitions are total, gated, and never schedule a halted agent', () => {
  // 1. TOTALITY (Req 1.9): for ANY state × ANY event × ANY ctx, the result is a
  // valid lifecycle state and the call never throws — including garbage inputs.
  it('is total: transition always returns a valid lifecycle state and never throws (Req 1.9)', () => {
    fc.assert(
      fc.property(stateArb, eventArb, ctxArb, (state, event, ctx) => {
        let next: LifecycleState
        expect(() => {
          next = transition(state, event, ctx)
        }).not.toThrow()
        // The returned value is always one of the canonical lifecycle states...
        expect(LIFECYCLE_STATES).toContain(next!)
      }),
      { numRuns: 100 },
    )
  })

  it('is total for an absent context argument too (defaults safely, never throws)', () => {
    fc.assert(
      fc.property(stateArb, eventArb, (state, event) => {
        const next = transition(state, event)
        expect(LIFECYCLE_STATES).toContain(next)
      }),
      { numRuns: 100 },
    )
  })

  // 2. DEPLOY GATE (Req 7.10): deploy succeeds IFF (state === 'dry-run' AND
  // hadSuccessfulDryRun === true); otherwise the state is returned UNCHANGED.
  // Asserted in BOTH directions over arbitrary state × ctx.
  it('gates deploy: result is "deploy" IFF from dry-run with a successful dry-run, else unchanged (Req 7.10)', () => {
    fc.assert(
      fc.property(validStateArb, ctxArb, (state, ctx) => {
        const result = transition(state, 'deploy', ctx)
        const shouldDeploy = state === 'dry-run' && ctx.hadSuccessfulDryRun === true

        if (shouldDeploy) {
          // Forward direction: the only way IN to deploy.
          expect(result).toBe('deploy')
        } else {
          // Reverse direction: any other (state, ctx) leaves the state unchanged —
          // never silently entering deploy without a proven dry-run.
          expect(result).toBe(state)
          expect(result === 'deploy').toBe(state === 'deploy')
        }
      }),
      { numRuns: 100 },
    )
  })

  // 3. NEVER SCHEDULE A HALTED AGENT (Req 1.13, 10.7): isRunnable is FALSE when the
  // lifecycle is pause/retire OR budgetPaused === true, and TRUE otherwise.
  it('never schedules a halted agent: isRunnable FALSE iff paused/retired or budget-paused (Req 1.13, 10.7)', () => {
    fc.assert(
      fc.property(validStateArb, fc.boolean(), (lifecycle, budgetPaused) => {
        const runnable = isRunnable({ lifecycle, budgetPaused })

        const halted = HALTED_STATES.includes(lifecycle) || budgetPaused === true
        expect(runnable).toBe(!halted)

        // Cross-check: a halted agent is NEVER runnable, so it can never be eligible
        // for a scheduled / reactive Run regardless of its lifecycle stage.
        if (budgetPaused === true) expect(runnable).toBe(false)
        if (lifecycle === 'pause' || lifecycle === 'retire') expect(runnable).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it('is total for isRunnable over garbage lifecycle values (only the runnable, non-budget-paused case is TRUE)', () => {
    fc.assert(
      fc.property(stateArb, fc.boolean(), (lifecycle, budgetPaused) => {
        let runnable: boolean
        expect(() => {
          runnable = isRunnable({ lifecycle, budgetPaused })
        }).not.toThrow()

        // An off-union lifecycle is neither 'pause' nor 'retire', so the only thing
        // that can make it non-runnable is budgetPaused.
        const halted = lifecycle === 'pause' || lifecycle === 'retire' || budgetPaused === true
        expect(runnable!).toBe(!halted)
      }),
      { numRuns: 100 },
    )
  })

  // 4. REACTIVATE (Req 1.11, 1.5): from 'retire' → monitor IFF hadSuccessfulDryRun,
  // else describe; from any non-retire state it is a no-op (unchanged).
  it('reactivates only from retire — to monitor if proven else describe, no-op elsewhere (Req 1.11, 1.5)', () => {
    fc.assert(
      fc.property(validStateArb, ctxArb, (state, ctx) => {
        const result = transition(state, 'reactivate', ctx)

        if (state === 'retire') {
          const expected = ctx.hadSuccessfulDryRun === true ? 'monitor' : 'describe'
          expect(result).toBe(expected)
          // Reactivate never bypasses the deploy gate (it lands runnable, not deployed).
          expect(result).not.toBe('deploy')
        } else {
          expect(result).toBe(state)
        }
      }),
      { numRuns: 100 },
    )
  })
})
