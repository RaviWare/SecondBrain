// Unit tests for the Agent lifecycle FSM + `isRunnable` predicate (task 4.1).
// These pin the concrete transition rules, the deploy gate (Req 7.10), retire /
// reactivate (Req 1.10–1.12), and the runnable predicate (Req 1.13) behind
// Property 14. The universal fast-check property is task 4.7 (separate/optional).
//
// `transition` and `isRunnable` are PURE / TOTAL / DETERMINISTIC, so they are
// tested directly with no I/O and no mocks.

import { describe, it, expect } from 'vitest'

import {
  transition,
  isRunnable,
  LIFECYCLE_STATES,
  LIFECYCLE_EVENTS,
  INITIAL_LIFECYCLE_STATE,
  type LifecycleState,
  type LifecycleEvent,
} from './lifecycle'

describe('transition — happy-path pipeline', () => {
  it('walks describe → preview → dry-run', () => {
    expect(transition('describe', 'preview')).toBe('preview')
    expect(transition('preview', 'run-dry-run')).toBe('dry-run')
  })

  it('deploys after a successful dry-run, then monitors', () => {
    const deployed = transition('dry-run', 'deploy', { hadSuccessfulDryRun: true })
    expect(deployed).toBe('deploy')
    expect(transition('deploy', 'monitor')).toBe('monitor')
  })

  it('pauses and resumes a monitoring agent', () => {
    expect(transition('monitor', 'pause')).toBe('pause')
    expect(transition('pause', 'resume')).toBe('monitor')
  })

  it('allows going back from preview / dry-run to describe', () => {
    expect(transition('preview', 'describe')).toBe('describe')
    expect(transition('dry-run', 'describe')).toBe('describe')
  })

  it('re-running the dry-run stays in dry-run', () => {
    expect(transition('dry-run', 'run-dry-run')).toBe('dry-run')
  })
})

describe('transition — deploy gate (Req 7.10)', () => {
  it('blocks deploy when no successful dry-run (stays in dry-run)', () => {
    expect(transition('dry-run', 'deploy', { hadSuccessfulDryRun: false })).toBe('dry-run')
    expect(transition('dry-run', 'deploy')).toBe('dry-run') // missing flag defaults to false
  })

  it('permits deploy only from dry-run, even with the flag set', () => {
    expect(transition('dry-run', 'deploy', { hadSuccessfulDryRun: true })).toBe('deploy')
    // From any non-dry-run state, deploy is invalid → unchanged, regardless of the flag.
    for (const state of LIFECYCLE_STATES) {
      if (state === 'dry-run') continue
      expect(transition(state, 'deploy', { hadSuccessfulDryRun: true })).toBe(state)
    }
  })
})

describe('transition — retire & reactivate (Req 1.10, 1.11)', () => {
  it('retires from every state', () => {
    for (const state of LIFECYCLE_STATES) {
      expect(transition(state, 'retire')).toBe('retire')
    }
  })

  it('reactivates a proven agent into monitor, an unproven one into describe', () => {
    expect(transition('retire', 'reactivate', { hadSuccessfulDryRun: true })).toBe('monitor')
    expect(transition('retire', 'reactivate', { hadSuccessfulDryRun: false })).toBe('describe')
    expect(transition('retire', 'reactivate')).toBe('describe')
  })

  it('ignores reactivate from non-retire states (unchanged)', () => {
    for (const state of LIFECYCLE_STATES) {
      if (state === 'retire') continue
      expect(transition(state, 'reactivate', { hadSuccessfulDryRun: true })).toBe(state)
    }
  })
})

describe('transition — totality (Property 14)', () => {
  it('returns a valid lifecycle state for EVERY (state, event) pair and never throws', () => {
    for (const state of LIFECYCLE_STATES) {
      for (const event of LIFECYCLE_EVENTS) {
        for (const hadSuccessfulDryRun of [true, false]) {
          const next = transition(state, event, { hadSuccessfulDryRun })
          expect(LIFECYCLE_STATES).toContain(next)
        }
      }
    }
  })

  it('leaves the state unchanged for an invalid move', () => {
    // `monitor` has no `preview` move defined → unchanged.
    expect(transition('monitor', 'preview')).toBe('monitor')
    // `describe` cannot deploy → unchanged.
    expect(transition('describe', 'deploy', { hadSuccessfulDryRun: true })).toBe('describe')
  })

  it('starts new agents in the first defined stage', () => {
    expect(INITIAL_LIFECYCLE_STATE).toBe<LifecycleState>('describe')
    expect(LIFECYCLE_STATES[0]).toBe('describe')
  })
})

describe('isRunnable (Req 1.13, 10.6)', () => {
  it('is FALSE for paused, retired, or budget-paused agents', () => {
    expect(isRunnable({ lifecycle: 'pause', budgetPaused: false })).toBe(false)
    expect(isRunnable({ lifecycle: 'retire', budgetPaused: false })).toBe(false)
    expect(isRunnable({ lifecycle: 'monitor', budgetPaused: true })).toBe(false)
    expect(isRunnable({ lifecycle: 'pause', budgetPaused: true })).toBe(false)
  })

  it('is TRUE for runnable, non-budget-paused states', () => {
    const runnableStates: LifecycleState[] = ['describe', 'preview', 'dry-run', 'deploy', 'monitor']
    for (const lifecycle of runnableStates) {
      expect(isRunnable({ lifecycle, budgetPaused: false })).toBe(true)
    }
  })

  it('never schedules a halted agent across every lifecycle state', () => {
    for (const lifecycle of LIFECYCLE_STATES) {
      const halted = lifecycle === 'pause' || lifecycle === 'retire'
      expect(isRunnable({ lifecycle, budgetPaused: false })).toBe(!halted)
      // budgetPaused halts regardless of lifecycle.
      expect(isRunnable({ lifecycle, budgetPaused: true })).toBe(false)
    }
  })
})

// Reference the event union once so unused-import lint stays quiet if events grow.
const _allEvents: readonly LifecycleEvent[] = LIFECYCLE_EVENTS
void _allEvents
