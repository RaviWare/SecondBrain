// Unit tests for the Squad Dashboard feed helpers (task 3.2).
//
// Validates: Requirements 6.3, 6.4
//
// Example-based pins for the PURE `buildActivityFeed` (merge/sort/slice of the
// three agent event streams) and `deriveNowLine` (real-signal "now" phrasing).
// The "no fabricated data" rule is pinned by the empty-input cases.

import { describe, it, expect } from 'vitest'

import {
  buildActivityFeed,
  deriveNowLine,
  type LogFeedRow,
  type ProposalFeedRow,
  type RunFeedRow,
} from './dashboard-feed'

const T = (iso: string) => new Date(iso).getTime()

function logRow(over: Partial<LogFeedRow> = {}): LogFeedRow {
  return { _id: 'l1', agentId: 'a1', operation: 'agent', summary: 'ingested a source', createdAt: T('2024-05-16T10:00:00Z'), ...over }
}
function proposalRow(over: Partial<ProposalFeedRow> = {}): ProposalFeedRow {
  return { _id: 'p1', agentId: 'a1', kind: 'synthesis', title: 'New synthesis', status: 'pending', createdAt: T('2024-05-16T11:00:00Z'), ...over }
}
function runRow(over: Partial<RunFeedRow> = {}): RunFeedRow {
  return { _id: 'r1', agentId: 'a1', trigger: 'scheduled', status: 'completed', outcome: '2 proposals emitted', createdAt: T('2024-05-16T09:00:00Z'), finishedAt: T('2024-05-16T09:05:00Z'), ...over }
}

describe('buildActivityFeed — empty inputs fabricate nothing (Req 6.4)', () => {
  it('returns [] when there are no events', () => {
    expect(buildActivityFeed({ logs: [], proposals: [], runs: [], limit: 20 })).toEqual([])
  })
})

describe('buildActivityFeed — merge, sort, slice (Req 6.4)', () => {
  it('merges all three streams newest-first by event instant', () => {
    const feed = buildActivityFeed({
      logs: [logRow()], // 10:00
      proposals: [proposalRow({ status: 'approved', decidedAt: T('2024-05-16T12:00:00Z') })], // decidedAt 12:00
      runs: [runRow()], // finishedAt 09:05
      limit: 20,
    })
    expect(feed.map((e) => e.source)).toEqual(['proposal', 'log', 'run'])
    expect(feed[0].at).toBe(new Date('2024-05-16T12:00:00Z').toISOString())
  })

  it('uses decidedAt for resolved proposals, createdAt when still pending', () => {
    const [pending] = buildActivityFeed({ logs: [], proposals: [proposalRow()], runs: [], limit: 20 })
    expect(pending.at).toBe(new Date('2024-05-16T11:00:00Z').toISOString())
    expect(pending.status).toBe('pending')
  })

  it('falls back to a status-based summary when a run has no outcome', () => {
    const [entry] = buildActivityFeed({ logs: [], proposals: [], runs: [runRow({ outcome: null, status: 'failed' })], limit: 20 })
    expect(entry.summary).toBe('scheduled run failed')
  })

  it('respects the limit (returns the newest N)', () => {
    const logs = Array.from({ length: 5 }, (_, i) =>
      logRow({ _id: `l${i}`, createdAt: T(`2024-05-16T1${i}:00:00Z`) }),
    )
    const feed = buildActivityFeed({ logs, proposals: [], runs: [], limit: 2 })
    expect(feed).toHaveLength(2)
    expect(feed[0].id).toBe('l4') // newest
    expect(feed[1].id).toBe('l3')
  })

  it('normalizes agentId to a string and null when absent', () => {
    const [withId] = buildActivityFeed({ logs: [logRow({ agentId: 123 })], proposals: [], runs: [], limit: 20 })
    expect(withId.agentId).toBe('123')
    const [noId] = buildActivityFeed({ logs: [logRow({ agentId: undefined })], proposals: [], runs: [], limit: 20 })
    expect(noId.agentId).toBeNull()
  })
})

describe('deriveNowLine — real signals only, never fabricated (Req 6.3)', () => {
  it('live → the active run latest trace step', () => {
    expect(deriveNowLine({ status: 'live', latestTraceStep: 'Reading source: example.com' })).toBe('Reading source: example.com')
  })

  it('live with no trace step → generic "Running…"', () => {
    expect(deriveNowLine({ status: 'live', latestTraceStep: null })).toBe('Running…')
  })

  it('review → real pending count, singular/plural', () => {
    expect(deriveNowLine({ status: 'review', pendingCount: 1 })).toBe('1 proposal awaiting your sign-off')
    expect(deriveNowLine({ status: 'review', pendingCount: 3 })).toBe('3 proposals awaiting your sign-off')
  })

  it('paused / error → fixed honest lines', () => {
    expect(deriveNowLine({ status: 'paused' })).toBe('Paused')
    expect(deriveNowLine({ status: 'error' })).toBe('Last run failed')
  })

  it('idle → empty string (nothing in flight, no fabrication)', () => {
    expect(deriveNowLine({ status: 'idle' })).toBe('')
  })
})
