// Worker-logic tests: retry → resolve on a clean run, and retry-exhausted →
// escalate. Models + runAgentOnce + escalate are mocked; we assert the worker
// drives the right actions and documents the timeline.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── In-memory ticket doubles ──────────────────────────────────────────────────
type Ticket = {
  _id: string
  agentId: string
  agentName: string
  category: string
  status: string
  retryCount: number
  autoRemediable: boolean
  recommendedAction: string
  resolvedAt: Date | null
  resolutionNote: string | null
  timeline: Array<{ at: Date; type: string; message: string; meta?: unknown }>
  save: () => Promise<void>
}

const store: { tickets: Ticket[] } = { tickets: [] }

function mkTicket(p: Partial<Ticket>): Ticket {
  const t: Ticket = {
    _id: p._id ?? 't1',
    agentId: p.agentId ?? 'a1',
    agentName: p.agentName ?? 'Agent',
    category: p.category ?? 'transient',
    status: p.status ?? 'open',
    retryCount: p.retryCount ?? 0,
    autoRemediable: p.autoRemediable ?? true,
    recommendedAction: p.recommendedAction ?? 'retry',
    resolvedAt: null,
    resolutionNote: null,
    timeline: [],
    save: async () => undefined,
  }
  return t
}

const runAgentOnceMock = vi.fn()
const escalateMock = vi.fn(async () => undefined)

vi.mock('@/lib/agents/redact', () => ({ agentLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/agents/run-agent', () => ({ runAgentOnce: (...a: unknown[]) => runAgentOnceMock(...a) }))
vi.mock('./tickets', () => ({ escalateTicket: (...a: unknown[]) => escalateMock(...a) }))
vi.mock('@/lib/models', () => ({
  SupportTicket: {
    find: vi.fn(() => ({ sort: () => ({ limit: async () => store.tickets.filter(t => ['open', 'investigating', 'in-progress'].includes(t.status)) }) })),
    findById: vi.fn(async (id: string) => store.tickets.find(t => t._id === id) ?? null),
  },
  Agent: { findOne: vi.fn(async () => ({ _id: 'a1', name: 'Agent' })) },
}))

import { processOpenTickets } from './worker'

beforeEach(() => {
  store.tickets = []
  runAgentOnceMock.mockReset()
  escalateMock.mockReset()
})

describe('processOpenTickets', () => {
  it('retries a transient ticket and resolves it when the rerun completes cleanly', async () => {
    store.tickets = [mkTicket({ _id: 't1', category: 'transient', status: 'open', retryCount: 0 })]
    runAgentOnceMock.mockResolvedValue({ status: 'ok', runStatus: 'completed', run: { _id: 'run2' } })

    const summary = await processOpenTickets(2)

    expect(summary.resolved).toContain('t1')
    const t = store.tickets[0]
    expect(t.status).toBe('resolved')
    expect(t.retryCount).toBe(1)
    expect(t.timeline.some(e => e.type === 'retry-scheduled')).toBe(true)
    expect(t.timeline.some(e => e.type === 'retry-result')).toBe(true)
  })

  it('escalates an auto-remediable ticket once retries are exhausted', async () => {
    store.tickets = [mkTicket({ _id: 't2', category: 'transient', status: 'investigating', retryCount: 2 })]

    const summary = await processOpenTickets(2)

    expect(summary.escalated).toContain('t2')
    expect(runAgentOnceMock).not.toHaveBeenCalled() // already exhausted → no rerun
    expect(escalateMock).toHaveBeenCalled()
  })

  it('escalates a non-auto-remediable ticket immediately without retrying', async () => {
    store.tickets = [mkTicket({ _id: 't3', category: 'budget', status: 'open', retryCount: 0, autoRemediable: false })]

    const summary = await processOpenTickets(2)

    expect(summary.escalated).toContain('t3')
    expect(runAgentOnceMock).not.toHaveBeenCalled()
  })

  it('keeps a transient ticket investigating when a retry does not resolve it (retries remain)', async () => {
    store.tickets = [mkTicket({ _id: 't4', category: 'timeout', status: 'open', retryCount: 0 })]
    runAgentOnceMock.mockResolvedValue({ status: 'error', message: 'still failing', run: { _id: 'run3' } })

    const summary = await processOpenTickets(3)

    expect(summary.retried).toContain('t4')
    expect(store.tickets[0].status).toBe('investigating')
    expect(store.tickets[0].retryCount).toBe(1)
  })
})
