// Worker-logic tests (auto-fix aware). Models + runAgentOnce + escalate are
// mocked; we assert the worker honors the agent's opt-in autoFix config:
//   • enabled + retryTransient → retry → resolve / escalate-on-exhaust
//   • disabled → escalate immediately (no retry)
//   • budget + autoRaiseBudget → raise cap (≤ ceiling) then retry
//   • scope + proposeScopeChanges → open proposal + escalate (never auto-widen)

import { describe, it, expect, beforeEach, vi } from 'vitest'

type Ticket = {
  _id: string
  userId: string
  agentId: string
  agentName: string
  category: string
  status: string
  retryCount: number
  autoRemediable: boolean
  recommendedAction: string
  firstRunId: string | null
  lastRunId: string | null
  resolvedAt: Date | null
  resolutionNote: string | null
  timeline: Array<{ at: Date; type: string; message: string; meta?: unknown }>
  save: () => Promise<void>
}

type Agent = {
  _id: string
  name: string
  budget: { tokenCap: number; tokensThisPeriod: number }
  budgetPaused: boolean
  trustScore: number
  signOffPolicy: Record<string, string>
  autoFix: Record<string, unknown>
  save: () => Promise<void>
}

const store: { tickets: Ticket[]; agent: Agent | null } = { tickets: [], agent: null }
const runAgentOnceMock = vi.fn()
const escalateMock = vi.fn(async () => undefined)
const proposalCreate = vi.fn(async () => ({ _id: 'p1' }))

vi.mock('@/lib/agents/redact', () => ({ agentLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/agents/run-agent', () => ({ runAgentOnce: (...a: unknown[]) => runAgentOnceMock(...a) }))
vi.mock('./tickets', () => ({ escalateTicket: (...a: unknown[]) => escalateMock(...a) }))
vi.mock('@/lib/models', () => ({
  SupportTicket: {
    find: vi.fn(() => ({ sort: () => ({ limit: async () => store.tickets.filter(t => ['open', 'investigating', 'in-progress'].includes(t.status)) }) })),
    findById: vi.fn(async (id: string) => store.tickets.find(t => t._id === id) ?? null),
  },
  Agent: { findOne: vi.fn(async () => store.agent) },
  Proposal: { create: (...a: unknown[]) => proposalCreate(...a) },
}))

import { processOpenTickets } from './worker'

function mkTicket(p: Partial<Ticket>): Ticket {
  return {
    _id: p._id ?? 't1',
    userId: 'u1',
    agentId: 'a1',
    agentName: 'Agent',
    category: p.category ?? 'transient',
    status: p.status ?? 'open',
    retryCount: p.retryCount ?? 0,
    autoRemediable: p.autoRemediable ?? true,
    recommendedAction: 'do something',
    firstRunId: 'run0',
    lastRunId: 'run0',
    resolvedAt: null,
    resolutionNote: null,
    timeline: [],
    save: async () => undefined,
  }
}

function mkAgent(autoFix: Record<string, unknown>, budget = { tokenCap: 0, tokensThisPeriod: 0 }): Agent {
  return {
    _id: 'a1', name: 'Agent', budget, budgetPaused: false,
    trustScore: 60, signOffPolicy: {}, autoFix, save: async () => undefined,
  }
}

beforeEach(() => {
  store.tickets = []
  store.agent = null
  runAgentOnceMock.mockReset()
  escalateMock.mockReset()
  proposalCreate.mockClear()
})

describe('processOpenTickets — auto-fix gating', () => {
  it('escalates immediately when auto-fix is DISABLED (no retry)', async () => {
    store.tickets = [mkTicket({ _id: 't1', category: 'transient' })]
    store.agent = mkAgent({ enabled: false })
    const s = await processOpenTickets(2)
    expect(s.escalated).toContain('t1')
    expect(runAgentOnceMock).not.toHaveBeenCalled()
  })

  it('retries + resolves a transient ticket when auto-fix enabled and rerun is clean', async () => {
    store.tickets = [mkTicket({ _id: 't1', category: 'transient' })]
    store.agent = mkAgent({ enabled: true, retryTransient: true })
    runAgentOnceMock.mockResolvedValue({ status: 'ok', runStatus: 'completed', run: { _id: 'run2' } })
    const s = await processOpenTickets(2)
    expect(s.resolved).toContain('t1')
    expect(store.tickets[0].status).toBe('resolved')
  })

  it('escalates injection even with everything enabled (never auto-fixed)', async () => {
    store.tickets = [mkTicket({ _id: 't1', category: 'injection', autoRemediable: false })]
    store.agent = mkAgent({ enabled: true, retryTransient: true, autoRaiseBudget: true, budgetCeiling: 999999, proposeScopeChanges: true })
    const s = await processOpenTickets(2)
    expect(s.escalated).toContain('t1')
    expect(runAgentOnceMock).not.toHaveBeenCalled()
  })

  it('raises budget (≤ ceiling) then retries when enabled', async () => {
    store.tickets = [mkTicket({ _id: 't1', category: 'budget', autoRemediable: false })]
    store.agent = mkAgent(
      { enabled: true, autoRaiseBudget: true, budgetCeiling: 200_000 },
      { tokenCap: 100_000, tokensThisPeriod: 100_000 },
    )
    runAgentOnceMock.mockResolvedValue({ status: 'ok', runStatus: 'completed', run: { _id: 'run2' } })
    const s = await processOpenTickets(2)
    expect(s.budgetRaised).toContain('t1')
    expect(store.agent.budget.tokenCap).toBeLessThanOrEqual(200_000)
    expect(store.agent.budget.tokenCap).toBeGreaterThan(100_000)
    expect(store.agent.budgetPaused).toBe(false)
  })

  it('escalates a budget ticket when no headroom under the ceiling', async () => {
    store.tickets = [mkTicket({ _id: 't1', category: 'budget', autoRemediable: false })]
    store.agent = mkAgent(
      { enabled: true, autoRaiseBudget: true, budgetCeiling: 100_000 },
      { tokenCap: 100_000, tokensThisPeriod: 50_000 },
    )
    const s = await processOpenTickets(2)
    expect(s.escalated).toContain('t1')
    expect(runAgentOnceMock).not.toHaveBeenCalled()
  })

  it('opens a scope-change proposal (never auto-widens) and escalates', async () => {
    store.tickets = [mkTicket({ _id: 't1', category: 'scope', autoRemediable: false })]
    store.agent = mkAgent({ enabled: true, proposeScopeChanges: true })
    const s = await processOpenTickets(2)
    expect(s.scopeProposed).toContain('t1')
    expect(proposalCreate).toHaveBeenCalledOnce()
    expect(escalateMock).toHaveBeenCalled()
  })
})
