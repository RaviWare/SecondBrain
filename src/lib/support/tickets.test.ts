// Orchestration tests for openOrUpdateTicketForRun + resolveTicketsOnSuccess.
// Models are mocked with in-memory doubles; we assert dedup (append vs create)
// and auto-resolution + timeline documentation.

import { describe, it, expect, beforeEach, vi } from 'vitest'

type Ticket = {
  _id: string
  agentId: string
  status: string
  dedupeKey: string
  lastRunId: string | null
  resolvedAt: Date | null
  resolutionNote: string | null
  timeline: Array<{ type: string; message: string; meta?: unknown; at?: Date }>
  save: () => Promise<void>
}

const store: { tickets: Ticket[] } = { tickets: [] }
let createdCount = 0

vi.mock('@/lib/agents/redact', () => ({ agentLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/models', () => ({
  SupportTicket: {
    findOne: vi.fn(async (q: { dedupeKey?: string; status?: { $in: string[] } }) => {
      return store.tickets.find(t =>
        (!q.dedupeKey || t.dedupeKey === q.dedupeKey) &&
        (!q.status || q.status.$in.includes(t.status)),
      ) ?? null
    }),
    find: vi.fn(async (q: { agentId?: string; status?: { $in: string[] } }) =>
      store.tickets.filter(t =>
        (!q.agentId || t.agentId === q.agentId) &&
        (!q.status || q.status.$in.includes(t.status)),
      ),
    ),
    create: vi.fn(async (doc: Partial<Ticket>) => {
      createdCount += 1
      const t: Ticket = {
        _id: `t${createdCount}`,
        agentId: doc.agentId ?? 'a1',
        status: doc.status ?? 'open',
        dedupeKey: doc.dedupeKey ?? 'k',
        lastRunId: doc.lastRunId ?? null,
        resolvedAt: null,
        resolutionNote: null,
        timeline: (doc.timeline as Ticket['timeline']) ?? [],
        save: async () => undefined,
      }
      store.tickets.push(t)
      return t
    }),
  },
  AdminNotification: { updateOne: vi.fn(async () => ({ upsertedCount: 1 })) },
}))

import { openOrUpdateTicketForRun, resolveTicketsOnSuccess } from './tickets'

beforeEach(() => {
  store.tickets = []
  createdCount = 0
  vi.clearAllMocks()
})

describe('openOrUpdateTicketForRun', () => {
  it('creates a ticket on first failure with an opened + diagnosed timeline', async () => {
    await openOrUpdateTicketForRun({
      userId: 'u1', agentId: 'a1', agentName: 'Agent', runId: 'run1',
      runStatus: 'failed', failureReason: 'connection reset',
    })
    expect(store.tickets.length).toBe(1)
    const t = store.tickets[0]
    expect(t.timeline.some(e => e.type === 'opened')).toBe(true)
    expect(t.timeline.some(e => e.type === 'diagnosed')).toBe(true)
  })

  it('appends to the existing open ticket for the same agent+category (dedupe)', async () => {
    await openOrUpdateTicketForRun({ userId: 'u1', agentId: 'a1', agentName: 'Agent', runId: 'run1', runStatus: 'failed', failureReason: 'reset' })
    await openOrUpdateTicketForRun({ userId: 'u1', agentId: 'a1', agentName: 'Agent', runId: 'run2', runStatus: 'failed', failureReason: 'reset again' })
    expect(store.tickets.length).toBe(1) // not two
    const t = store.tickets[0]
    expect(t.lastRunId).toBe('run2')
    expect(t.timeline.some(e => e.type === 'recurrence')).toBe(true)
  })

  it('separates different categories into distinct tickets', async () => {
    await openOrUpdateTicketForRun({ userId: 'u1', agentId: 'a1', agentName: 'Agent', runId: 'r1', runStatus: 'timeout', failureReason: null })
    await openOrUpdateTicketForRun({ userId: 'u1', agentId: 'a1', agentName: 'Agent', runId: 'r2', runStatus: 'budget-stopped', failureReason: null })
    expect(store.tickets.length).toBe(2)
  })
})

describe('resolveTicketsOnSuccess', () => {
  it('resolves open tickets for the agent and documents the recovery', async () => {
    await openOrUpdateTicketForRun({ userId: 'u1', agentId: 'a1', agentName: 'Agent', runId: 'run1', runStatus: 'failed', failureReason: 'reset' })
    const n = await resolveTicketsOnSuccess({ agentId: 'a1', agentName: 'Agent', runId: 'run9' })
    expect(n).toBe(1)
    const t = store.tickets[0]
    expect(t.status).toBe('resolved')
    expect(t.resolvedAt).not.toBeNull()
    expect(t.timeline.some(e => e.type === 'resolved')).toBe(true)
  })

  it('is a no-op when the agent has no open tickets', async () => {
    const n = await resolveTicketsOnSuccess({ agentId: 'nobody', agentName: 'X', runId: 'run9' })
    expect(n).toBe(0)
  })
})
