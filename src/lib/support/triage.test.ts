import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  diagnoseFailure,
  nextTicketAction,
  ticketTitle,
  dedupeKey,
  DEFAULT_MAX_RETRIES,
  type TicketCategory,
  type TicketStatus,
} from './triage'

describe('diagnoseFailure — classification', () => {
  it('flags injection as high severity, never auto-remediable', () => {
    const d = diagnoseFailure({ runStatus: 'failed', failureReason: 'prompt injection detected in source' })
    expect(d.category).toBe('injection')
    expect(d.severity).toBe('high')
    expect(d.autoRemediable).toBe(false)
  })

  it('classifies scope violations as needing a human', () => {
    const d = diagnoseFailure({ runStatus: 'failed', failureReason: 'action outside trust scope' })
    expect(d.category).toBe('scope')
    expect(d.autoRemediable).toBe(false)
  })

  it('classifies budget-stopped as budget, not auto-remediable', () => {
    const d = diagnoseFailure({ runStatus: 'budget-stopped', failureReason: null })
    expect(d.category).toBe('budget')
    expect(d.autoRemediable).toBe(false)
  })

  it('classifies timeout as auto-remediable', () => {
    const d = diagnoseFailure({ runStatus: 'timeout', failureReason: null })
    expect(d.category).toBe('timeout')
    expect(d.autoRemediable).toBe(true)
  })

  it('classifies a generic failure as transient (auto-remediable)', () => {
    const d = diagnoseFailure({ runStatus: 'failed', failureReason: 'connection reset' })
    expect(d.category).toBe('transient')
    expect(d.autoRemediable).toBe(true)
  })

  it('classifies an unclassifiable empty failure as unknown', () => {
    const d = diagnoseFailure({ runStatus: 'weird', failureReason: null })
    expect(d.category).toBe('unknown')
    expect(d.autoRemediable).toBe(false)
  })

  it('injection takes precedence over a timeout status', () => {
    const d = diagnoseFailure({ runStatus: 'timeout', failureReason: 'possible injection attempt' })
    expect(d.category).toBe('injection')
  })
})

describe('nextTicketAction — worker decision', () => {
  it('retries auto-remediable categories while retries remain', () => {
    expect(nextTicketAction({ category: 'transient', status: 'open', retryCount: 0 })).toBe('retry')
    expect(nextTicketAction({ category: 'timeout', status: 'investigating', retryCount: 1 })).toBe('retry')
  })

  it('escalates auto-remediable categories once retries are exhausted', () => {
    expect(nextTicketAction({ category: 'transient', status: 'investigating', retryCount: DEFAULT_MAX_RETRIES })).toBe('escalate')
  })

  it('escalates non-auto-remediable categories immediately', () => {
    for (const c of ['budget', 'scope', 'injection', 'unknown'] as TicketCategory[]) {
      expect(nextTicketAction({ category: c, status: 'open', retryCount: 0 })).toBe('escalate')
    }
  })

  it('waits on terminal / already-escalated tickets', () => {
    for (const s of ['resolved', 'wont-fix', 'awaiting-admin'] as TicketStatus[]) {
      expect(nextTicketAction({ category: 'transient', status: s, retryCount: 0 })).toBe('wait')
    }
  })
})

describe('triage helpers', () => {
  it('builds a stable dedupe key per agent+category', () => {
    expect(dedupeKey('agent1', 'timeout')).toBe('ticket:agent1:timeout')
    expect(dedupeKey('agent1', 'timeout')).toBe(dedupeKey('agent1', 'timeout'))
    expect(dedupeKey('agent1', 'budget')).not.toBe(dedupeKey('agent1', 'timeout'))
  })

  it('titles include the agent name', () => {
    const d = diagnoseFailure({ runStatus: 'timeout', failureReason: null })
    expect(ticketTitle('Research Analyst', d)).toContain('Research Analyst')
  })
})

describe('triage — properties', () => {
  const statusArb = fc.constantFrom('failed', 'timeout', 'budget-stopped', 'error', 'running', 'completed', 'weird', '')
  const reasonArb = fc.option(fc.string({ maxLength: 80 }), { nil: null })

  it('diagnoseFailure is total and well-formed for any input', () => {
    fc.assert(
      fc.property(statusArb, reasonArb, (runStatus, failureReason) => {
        const d = diagnoseFailure({ runStatus, failureReason })
        expect(['budget', 'timeout', 'transient', 'scope', 'injection', 'unknown']).toContain(d.category)
        expect(['low', 'medium', 'high']).toContain(d.severity)
        expect(typeof d.autoRemediable).toBe('boolean')
        expect(d.diagnosis.length).toBeGreaterThan(0)
        expect(d.recommendedAction.length).toBeGreaterThan(0)
      }),
    )
  })

  it('only timeout/transient are ever auto-remediable', () => {
    fc.assert(
      fc.property(statusArb, reasonArb, (runStatus, failureReason) => {
        const d = diagnoseFailure({ runStatus, failureReason })
        if (d.autoRemediable) expect(['timeout', 'transient']).toContain(d.category)
      }),
    )
  })

  it('a non-auto-remediable ticket never returns retry', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('budget', 'scope', 'injection', 'unknown') as fc.Arbitrary<TicketCategory>,
        fc.constantFrom('open', 'investigating', 'in-progress') as fc.Arbitrary<TicketStatus>,
        fc.nat({ max: 10 }),
        (category, status, retryCount) => {
          expect(nextTicketAction({ category, status, retryCount })).toBe('escalate')
        },
      ),
    )
  })

  it('retry count beyond max always escalates for auto-remediable', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('timeout', 'transient') as fc.Arbitrary<TicketCategory>,
        fc.integer({ min: DEFAULT_MAX_RETRIES, max: 20 }),
        (category, retryCount) => {
          expect(nextTicketAction({ category, status: 'open', retryCount })).toBe('escalate')
        },
      ),
    )
  })
})
