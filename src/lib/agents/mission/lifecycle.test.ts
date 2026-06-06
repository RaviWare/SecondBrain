// Property test for the Mission lifecycle FSM (task 1.2).
//
// Feature: mission-orchestrator, Property 3: Mission lifecycle transitions are total, gated, and terminal-absorbing
// Validates: Requirements 2.8, 3.4, 3.5, 3.7, 4.7, 9.1, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11
//
// Over ARBITRARY (MissionState, MissionEvent) pairs this proves the universal laws of
// the Mission lifecycle FSM hold for EVERY input:
//   • TOTALITY — `transition` always returns a valid MissionState (∈ MISSION_STATES),
//     never an illegal/undefined value, and never throws (Req 9.1).
//   • TABLE CONFORMANCE — a permitted (state, event) lands on its target; every other
//     pair leaves the state UNCHANGED (Req 9.10). The expected table here is an
//     independent oracle mirroring the design's transition table, so the test would
//     catch the implementation drifting from the spec.
//   • APPROVAL GATE — `approve` is the ONLY edge producing `running` from
//     `awaiting-plan-approval`; the mission can never reach `running` for the first time
//     without an explicit Plan_Approval (Req 3.4, 3.7, 9.4).
//   • COMPLETION GATE — `complete` yields `completed` only from `running` (Req 9.7).
//   • TERMINAL-ABSORBING — `completed`, `failed`, `aborted` are absorbing: no event
//     ever leaves them (Req 9.11).
//
// `transition` is PURE / TOTAL / DETERMINISTIC, so it is tested directly with no I/O
// and no mocks. The concrete worked examples live in the FSM module's doc table; this
// file proves the laws for ALL inputs.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  transition,
  MISSION_STATES,
  MISSION_EVENTS,
  type MissionState,
  type MissionEvent,
} from './lifecycle'

// ── Oracle: the permitted transition table from the design (non-absorbing rows) ──
// Independently re-encoded here so the property compares `transition` against the
// SPEC, not against itself. Any (state, event) absent from a row is a non-permitted
// move whose expected result is "state unchanged". The three terminal rows are empty
// (absorbing). This must match design.md → "Mission lifecycle FSM" exactly.
const PERMITTED: Record<MissionState, Partial<Record<MissionEvent, MissionState>>> = {
  planning: {
    'decomposed-ok': 'awaiting-plan-approval',
    'decomposition-failed': 'failed',
  },
  'awaiting-plan-approval': {
    approve: 'running',
    reject: 'aborted',
  },
  running: {
    pause: 'paused',
    complete: 'completed',
    abort: 'aborted',
  },
  paused: {
    resume: 'running',
    abort: 'aborted',
  },
  completed: {}, // absorbing terminal (Req 9.11)
  failed: {}, // absorbing terminal (Req 9.11)
  aborted: {}, // absorbing terminal (Req 9.11)
}

const TERMINAL_STATES: readonly MissionState[] = ['completed', 'failed', 'aborted']

// ── Generators ───────────────────────────────────────────────────────────────────
// Draw states/events from the REAL unions (per task 1.2) so every valid move is
// well represented across runs.
const stateArb = fc.constantFrom(...MISSION_STATES)
const eventArb = fc.constantFrom(...MISSION_EVENTS)

// An off-union generator (garbage smuggled through `as`) used ONLY to prove totality
// for inputs TypeScript can't catch — e.g. a value read back from the DB/API. The
// design promises `transition` returns a valid state and never throws for these.
const GARBAGE = [
  '',
  ' ',
  'Running',
  'RUNNING',
  'planning ',
  'unknown',
  'constructor',
  'prototype',
  '__proto__',
  'toString',
  'valueOf',
  'hasOwnProperty',
] as const

const garbageStateArb = fc.oneof(
  stateArb,
  fc.constantFrom(...(GARBAGE as readonly string[])),
  fc.string(),
) as fc.Arbitrary<MissionState>

const garbageEventArb = fc.oneof(
  eventArb,
  fc.constantFrom(...(GARBAGE as readonly string[])),
  fc.string(),
) as fc.Arbitrary<MissionEvent>

// Feature: mission-orchestrator, Property 3: Mission lifecycle transitions are total, gated, and terminal-absorbing
describe('Property 3: Mission lifecycle transitions are total, gated, and terminal-absorbing', () => {
  // 1. TOTALITY + TABLE CONFORMANCE (Req 9.1, 9.3, 9.5, 9.6, 9.8, 9.9, 9.10): for ANY
  // (state, event) the call never throws, returns a valid MissionState, and equals the
  // spec table's target — or the state UNCHANGED when the pair is not permitted.
  it('is total and table-conformant: permitted pair → target, every other pair unchanged, never throws (Req 9.1, 9.10)', () => {
    fc.assert(
      fc.property(stateArb, eventArb, (state, event) => {
        let next: MissionState
        expect(() => {
          next = transition(state, event)
        }).not.toThrow()

        // Always a canonical state — never illegal/undefined.
        expect(MISSION_STATES).toContain(next!)

        // Matches the independent oracle: permitted → target, else unchanged.
        const expected = PERMITTED[state][event] ?? state
        expect(next!).toBe(expected)
      }),
      { numRuns: 100 },
    )
  })

  // TOTALITY for off-union inputs too — proves "never an illegal or undefined value"
  // for garbage states/events that bypass the type system (Req 9.1, 9.10).
  it('is total for off-union garbage inputs: returns a valid state and never throws (Req 9.1, 9.10)', () => {
    fc.assert(
      fc.property(garbageStateArb, garbageEventArb, (state, event) => {
        let next: MissionState
        expect(() => {
          next = transition(state, event)
        }).not.toThrow()
        expect(MISSION_STATES).toContain(next!)
      }),
      { numRuns: 100 },
    )
  })

  // 2. APPROVAL GATE (Req 3.4, 3.7, 9.4): `approve` is the ONLY edge producing `running`
  // from `awaiting-plan-approval`, AND the FIRST entry into `running` from anywhere is
  // only ever (awaiting-plan-approval, approve) or the re-entry (paused, resume) — the
  // mission can never reach `running` without an explicit Plan_Approval having occurred.
  it('approve is the ONLY edge into running from awaiting-plan-approval (Req 3.4, 3.7, 9.4)', () => {
    fc.assert(
      fc.property(eventArb, (event) => {
        const next = transition('awaiting-plan-approval', event)
        expect(next === 'running').toBe(event === 'approve')
      }),
      { numRuns: 100 },
    )
  })

  it('running is reachable only via (awaiting-plan-approval, approve) or (paused, resume) (Req 3.7, 9.4, 9.6)', () => {
    fc.assert(
      fc.property(stateArb, eventArb, (state, event) => {
        const next = transition(state, event)
        // Only an actual ENTRY into `running` is gated. A no-op from a state that is
        // already `running` (e.g. an unpermitted event) is not a new entry and must be
        // excluded, otherwise the absorbing/self-loop case spuriously fails.
        if (next === 'running' && state !== 'running') {
          const viaApprove = state === 'awaiting-plan-approval' && event === 'approve'
          const viaResume = state === 'paused' && event === 'resume'
          expect(viaApprove || viaResume).toBe(true)
        }
      }),
      { numRuns: 100 },
    )
  })

  // 3. COMPLETION GATE (Req 9.7): `complete` yields `completed` only from `running`, and
  // `completed` is reachable by no other (state, event) pair.
  it('complete yields completed only from running, and completed is reachable only that way (Req 9.7)', () => {
    fc.assert(
      fc.property(stateArb, eventArb, (state, event) => {
        const next = transition(state, event)

        // The ONLY way to ENTER `completed` is complete-from-running. A no-op from a
        // state that is already `completed` (terminal/absorbing) is not a new entry and
        // is excluded so the absorbing self-loop does not spuriously fail.
        if (next === 'completed' && state !== 'completed') {
          expect(state).toBe('running')
          expect(event).toBe('complete')
        }

        // `complete` produces `completed` from `running`, and is a no-op elsewhere.
        if (event === 'complete') {
          expect(next).toBe(state === 'running' ? 'completed' : state)
        }
      }),
      { numRuns: 100 },
    )
  })

  // 4. TERMINAL-ABSORBING (Req 9.11): no event ever moves a mission out of completed,
  // failed, or aborted — a finished mission can never restart a Run.
  it('terminal states (completed/failed/aborted) are absorbing — no event leaves them (Req 9.11)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...TERMINAL_STATES), eventArb, (state, event) => {
        expect(transition(state, event)).toBe(state)
      }),
      { numRuns: 100 },
    )
  })
})
