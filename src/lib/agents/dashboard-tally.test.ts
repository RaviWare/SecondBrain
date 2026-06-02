// Unit tests for the Squad Dashboard tally module (task 3.1).
//
// Validates: Requirements 6.1, 6.2
//
// Example-based pins for the exact counting rules of the PURE `tallyDashboard`
// (and its helper predicates). The universal "counts equal the true tallies"
// property over arbitrary inputs is covered separately by Property 19 (task 3.5).
// The "no fabricated data" rule is pinned here by the empty-input case → all 0.

import { describe, it, expect } from 'vitest'

import {
  tallyDashboard,
  isScheduledRunnable,
  isWithinToday,
  startOfDay,
  deriveAgentStatus,
  type AgentTallyRow,
  type ProposalTallyRow,
  type LogTallyRow,
} from './dashboard-tally'

// A fixed "today" anchor and a few timestamps relative to it.
const DAY_START = startOfDay(new Date('2024-05-16T09:30:00Z').getTime())
const TODAY = DAY_START + 5 * 60 * 60 * 1000 // 5h into the day
const YESTERDAY = DAY_START - 60 * 60 * 1000 // 1h before the day starts
const TOMORROW = DAY_START + 24 * 60 * 60 * 1000 + 1 // just past the window

function agent(over: Partial<AgentTallyRow> = {}): AgentTallyRow {
  return { hasActiveRun: false, schedule: { kind: 'manual' }, lifecycle: 'monitor', budgetPaused: false, ...over }
}
function proposal(over: Partial<ProposalTallyRow> = {}): ProposalTallyRow {
  return { kind: 'ingest', status: 'pending', createdAt: TODAY, ...over }
}
function log(over: Partial<LogTallyRow> = {}): LogTallyRow {
  return { operation: 'agent', createdAt: TODAY, ...over }
}

describe('tallyDashboard — empty inputs fabricate nothing (Property 19, Req 6.1/6.2)', () => {
  it('returns all-zero counts when there are no records', () => {
    const t = tallyDashboard({ agents: [], proposals: [], agentLogs: [], dayStartMs: DAY_START })
    expect(t).toEqual({
      statusStrip: { running: 0, scheduled: 0, awaitingSignOff: 0 },
      today: { sourcesIngested: 0, connectionsMade: 0, synthesesProposed: 0 },
    })
  })
})

describe('status strip counts (Req 6.1)', () => {
  it('running = Agents with an active Run', () => {
    const agents = [agent({ hasActiveRun: true }), agent({ hasActiveRun: true }), agent({ hasActiveRun: false })]
    const t = tallyDashboard({ agents, proposals: [], agentLogs: [], dayStartMs: DAY_START })
    expect(t.statusStrip.running).toBe(2)
  })

  it('scheduled = runnable cron-scheduled Agents only', () => {
    const agents = [
      agent({ schedule: { kind: 'scheduled' }, lifecycle: 'monitor' }), // counts
      agent({ schedule: { kind: 'scheduled' }, lifecycle: 'deploy' }), // counts
      agent({ schedule: { kind: 'scheduled' }, lifecycle: 'pause' }), // halted → excluded
      agent({ schedule: { kind: 'scheduled' }, lifecycle: 'retire' }), // retired → excluded
      agent({ schedule: { kind: 'scheduled' }, budgetPaused: true }), // budget-paused → excluded
      agent({ schedule: { kind: 'reactive' } }), // not time-based → excluded
      agent({ schedule: { kind: 'manual' } }), // not time-based → excluded
    ]
    const t = tallyDashboard({ agents, proposals: [], agentLogs: [], dayStartMs: DAY_START })
    expect(t.statusStrip.scheduled).toBe(2)
  })

  it('awaitingSignOff = PENDING proposals (Aegis Queue depth), regardless of kind/age', () => {
    const proposals = [
      proposal({ status: 'pending', createdAt: YESTERDAY }),
      proposal({ status: 'pending', kind: 'flagged-content' }),
      proposal({ status: 'approved' }), // terminal → excluded
      proposal({ status: 'dismissed' }), // terminal → excluded
      proposal({ status: 'auto-applied' }), // terminal → excluded
    ]
    const t = tallyDashboard({ agents: [], proposals, agentLogs: [], dayStartMs: DAY_START })
    expect(t.statusStrip.awaitingSignOff).toBe(2)
  })
})

describe('"today" proof-of-work counts (Req 6.2)', () => {
  it('sourcesIngested = today\'s agent Activity Log rows only', () => {
    const agentLogs = [
      log({ createdAt: TODAY }),
      log({ createdAt: TODAY }),
      log({ operation: 'ingest', createdAt: TODAY }), // non-agent op → excluded
      log({ createdAt: YESTERDAY }), // out of window → excluded
      log({ createdAt: TOMORROW }), // out of window → excluded
    ]
    const t = tallyDashboard({ agents: [], proposals: [], agentLogs, dayStartMs: DAY_START })
    expect(t.today.sourcesIngested).toBe(2)
  })

  it('connectionsMade = today\'s APPLIED connection proposals', () => {
    const proposals = [
      proposal({ kind: 'connection', status: 'approved', createdAt: TODAY }),
      proposal({ kind: 'connection', status: 'auto-applied', createdAt: TODAY }),
      proposal({ kind: 'connection', status: 'pending', createdAt: TODAY }), // not applied → excluded
      proposal({ kind: 'connection', status: 'dismissed', createdAt: TODAY }), // not applied → excluded
      proposal({ kind: 'connection', status: 'approved', createdAt: YESTERDAY }), // not today → excluded
      proposal({ kind: 'synthesis', status: 'approved', createdAt: TODAY }), // wrong kind → excluded
    ]
    const t = tallyDashboard({ agents: [], proposals, agentLogs: [], dayStartMs: DAY_START })
    expect(t.today.connectionsMade).toBe(2)
  })

  it('synthesesProposed = today\'s synthesis proposals in any status', () => {
    const proposals = [
      proposal({ kind: 'synthesis', status: 'pending', createdAt: TODAY }),
      proposal({ kind: 'synthesis', status: 'approved', createdAt: TODAY }),
      proposal({ kind: 'synthesis', status: 'dismissed', createdAt: TODAY }),
      proposal({ kind: 'synthesis', status: 'pending', createdAt: YESTERDAY }), // not today → excluded
      proposal({ kind: 'ingest', status: 'pending', createdAt: TODAY }), // wrong kind → excluded
    ]
    const t = tallyDashboard({ agents: [], proposals, agentLogs: [], dayStartMs: DAY_START })
    expect(t.today.synthesesProposed).toBe(3)
  })
})

describe('isWithinToday — day window is [start, start+24h)', () => {
  it('includes the day start, excludes the next day start', () => {
    expect(isWithinToday(DAY_START, DAY_START)).toBe(true)
    expect(isWithinToday(DAY_START + 24 * 60 * 60 * 1000 - 1, DAY_START)).toBe(true)
    expect(isWithinToday(DAY_START + 24 * 60 * 60 * 1000, DAY_START)).toBe(false)
    expect(isWithinToday(YESTERDAY, DAY_START)).toBe(false)
  })

  it('accepts Date, ISO string, and epoch ms; rejects invalid dates', () => {
    expect(isWithinToday(new Date(TODAY), DAY_START)).toBe(true)
    expect(isWithinToday(new Date(TODAY).toISOString(), DAY_START)).toBe(true)
    expect(isWithinToday(TODAY, DAY_START)).toBe(true)
    expect(isWithinToday('not-a-date', DAY_START)).toBe(false)
  })
})

describe('isScheduledRunnable — runnable cron-scheduled predicate', () => {
  it('true only for a time-based schedule that is not halted', () => {
    expect(isScheduledRunnable(agent({ schedule: { kind: 'scheduled' }, lifecycle: 'monitor' }))).toBe(true)
    expect(isScheduledRunnable(agent({ schedule: { kind: 'reactive' } }))).toBe(false)
    expect(isScheduledRunnable(agent({ schedule: { kind: 'manual' } }))).toBe(false)
    expect(isScheduledRunnable(agent({ schedule: null }))).toBe(false)
    expect(isScheduledRunnable(agent({ schedule: { kind: 'scheduled' }, lifecycle: 'pause' }))).toBe(false)
    expect(isScheduledRunnable(agent({ schedule: { kind: 'scheduled' }, lifecycle: 'retire' }))).toBe(false)
    expect(isScheduledRunnable(agent({ schedule: { kind: 'scheduled' }, budgetPaused: true }))).toBe(false)
  })
})

describe('deriveAgentStatus — display status precedence (accent===review)', () => {
  it('prioritizes halted, then retired, then live, then review, then error, else idle', () => {
    expect(deriveAgentStatus({ hasActiveRun: true, awaitingSignOff: true, budgetPaused: true })).toBe('paused')
    expect(deriveAgentStatus({ hasActiveRun: true, awaitingSignOff: true, lifecycle: 'pause' })).toBe('paused')
    expect(deriveAgentStatus({ hasActiveRun: true, awaitingSignOff: true, lifecycle: 'retire' })).toBe('idle')
    expect(deriveAgentStatus({ hasActiveRun: true, awaitingSignOff: true })).toBe('live')
    expect(deriveAgentStatus({ hasActiveRun: false, awaitingSignOff: true })).toBe('review')
    expect(deriveAgentStatus({ hasActiveRun: false, awaitingSignOff: false, lastRunFailed: true })).toBe('error')
    expect(deriveAgentStatus({ hasActiveRun: false, awaitingSignOff: false })).toBe('idle')
  })
})
