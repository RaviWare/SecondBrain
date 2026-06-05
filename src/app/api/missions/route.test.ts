// Handler-level tests for /api/missions — list (GET) + create (POST).
//
// The pure planner cores (selectLeadAgent / assignByRole / validateTaskGraph) and the
// Mission model have their own coverage; THIS file pins the creation route's thin-glue
// contract (Req 1.1–1.7, 12.5):
//   • the Clerk auth gate (401 on both verbs, BEFORE any DB access)
//   • create persists a `planning` Mission storing objective / context / lead (Req 1.1–1.4)
//   • the Lead_Agent is auto-selected when none is supplied (leadAutoSelected = true)
//     and a supplied valid lead is used as-is (leadAutoSelected = false) (Req 1.4)
//   • no eligible Lead_Agent → reject with NO record (Req 1.5)
//   • an empty / whitespace objective → 400 with NO record (Req 1.6)
//   • GET list is user-scoped — Mission.find({ userId }) (Req 1.7, 12.5)
//
// connectDB + the Agent/Mission models + Clerk auth are mocked: no DB. The REAL pure
// planner core (selectLeadAgent) is left UNMOCKED so the auto-select path is exercised
// end to end.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mocks (hoisted above the SUT import) ──────────────────────────────────────
const mockAuth = vi.hoisted(() => vi.fn())
vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }))
vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }))

// Mutable fixture state the model mock reads, plus a capture of what the route
// hands to Mission.create.
const state = vi.hoisted(() => ({
  agents: [] as Array<Record<string, unknown>>, // what Agent.find(...).lean() returns
  missions: [] as Array<Record<string, unknown>>, // what Mission.find(...).sort().lean() returns
  created: undefined as Record<string, unknown> | undefined,
}))

vi.mock('@/lib/models', () => ({
  Agent: {
    find: vi.fn(() => ({ lean: vi.fn(async () => state.agents) })),
  },
  Mission: {
    find: vi.fn(() => ({ sort: vi.fn(() => ({ lean: vi.fn(async () => state.missions) })) })),
    create: vi.fn(async (doc: Record<string, unknown>) => {
      state.created = doc
      return { _id: 'mission_new', ...doc }
    }),
  },
}))

import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import { connectDB } from '@/lib/mongodb'
import { Mission } from '@/lib/models'

const mockConnect = vi.mocked(connectDB)
const mockCreate = vi.mocked(Mission.create)

/** A POST request with an optional JSON body. `raw` bypasses JSON.stringify. */
function postReq(body?: unknown, raw?: string): NextRequest {
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method: 'POST' }
  if (raw !== undefined) init.body = raw
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'content-type': 'application/json' }
  }
  return new NextRequest('https://app.test/api/missions', init)
}

beforeEach(() => {
  vi.clearAllMocks()
  state.agents = []
  state.missions = []
  state.created = undefined
  // Default: authenticated.
  mockAuth.mockResolvedValue({ userId: 'user_1' })
})

describe('GET /api/missions — auth + user scoping (Req 1.7, 12.5)', () => {
  it('401 when unauthenticated — and never touches the DB', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockConnect).not.toHaveBeenCalled()
    expect(Mission.find).not.toHaveBeenCalled()
  })

  it('lists ONLY the signed-in user\'s missions — scoped to { userId }', async () => {
    state.missions = [{ _id: 'm1', objective: 'ship it', userId: 'user_1' }]
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.missions)).toBe(true)
    expect(body.missions).toHaveLength(1)
    // Owner-only visibility: the query is scoped to the session user (Req 1.7, 12.5).
    expect(Mission.find).toHaveBeenCalledWith({ userId: 'user_1' })
  })
})

describe('POST /api/missions — auth gate (Req 1.7)', () => {
  it('401 when unauthenticated — and never creates or touches the DB', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await POST(postReq({ objective: 'do a thing' }))
    expect(res.status).toBe(401)
    expect(mockConnect).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('400 on invalid JSON — and never creates', async () => {
    const res = await POST(postReq(undefined, '{bad'))
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('POST /api/missions — creation persists a planning Mission (Req 1.1–1.4)', () => {
  it('persists a planning Mission storing objective / context / lead and returns 201', async () => {
    // A squad with a lead-eligible member (role contains "manager").
    state.agents = [
      { _id: 'scout1', role: 'scout' },
      { _id: 'mgr1', role: 'manager' },
    ]
    const res = await POST(
      postReq({ objective: '  get to $1M ARR  ', context: '  q4 push  ', leadAgentId: 'mgr1' }),
    )
    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledTimes(1)

    const doc = state.created!
    // Owner-scoped + planning lifecycle (Req 1.1, 1.7, 9.2).
    expect(doc.userId).toBe('user_1')
    expect(doc.lifecycle).toBe('planning')
    // Objective + context are stored, trimmed (Req 1.1, 1.2).
    expect(doc.objective).toBe('get to $1M ARR')
    expect(doc.context).toBe('q4 push')
    // The selected lead is recorded (Req 1.3).
    expect(doc.leadAgentId).toBe('mgr1')
    // A freshly-created Mission carries an initialized limits block.
    expect(doc.limits).toBeDefined()

    const body = await res.json()
    expect(body.mission).toBeDefined()
  })

  it('uses the supplied valid lead as-is — leadAutoSelected = false (Req 1.4)', async () => {
    state.agents = [
      { _id: 'scout1', role: 'scout' },
      { _id: 'mgr1', role: 'manager' },
    ]
    // Supply a valid, owned, non-retired agent id as the lead.
    await POST(postReq({ objective: 'do the work', leadAgentId: 'scout1' }))
    expect(state.created?.leadAgentId).toBe('scout1')
    expect(state.created?.leadAutoSelected).toBe(false)
  })

  it('auto-selects a lead when none is supplied — leadAutoSelected = true (Req 1.4)', async () => {
    state.agents = [
      { _id: 'scout1', role: 'scout' },
      { _id: 'mgr1', role: 'manager' },
    ]
    // No leadAgentId supplied → the route auto-selects via the real planner core.
    await POST(postReq({ objective: 'mobilize the squad' }))
    // selectLeadAgent picks the first lead-eligible member by role fit ("manager").
    expect(state.created?.leadAgentId).toBe('mgr1')
    expect(state.created?.leadAutoSelected).toBe(true)
  })

  it('auto-selects a custom-role lead via its customRoleDescription (Req 1.4)', async () => {
    // A custom Agent's meaningful role lives in customRoleDescription ("Team Lead").
    state.agents = [
      { _id: 'a1', role: 'scout' },
      { _id: 'custom1', role: 'custom', customRoleDescription: 'Team Lead' },
    ]
    await POST(postReq({ objective: 'lead the charge' }))
    expect(state.created?.leadAgentId).toBe('custom1')
    expect(state.created?.leadAutoSelected).toBe(true)
  })
})

describe('POST /api/missions — rejections create NO record', () => {
  it('rejects with NO record when no eligible Lead_Agent exists (Req 1.5)', async () => {
    // A squad with no lead-eligible role and no supplied lead.
    state.agents = [
      { _id: 'a1', role: 'scout' },
      { _id: 'a2', role: 'researcher' },
    ]
    const res = await POST(postReq({ objective: 'a perfectly valid objective' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/eligible lead/i)
    // No Mission record is created on rejection (Req 1.5).
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects an empty / whitespace objective with 400 + no record (Req 1.6)', async () => {
    // Even with a lead-eligible squad, a blank objective is rejected.
    state.agents = [{ _id: 'mgr1', role: 'manager' }]
    const res = await POST(postReq({ objective: '   ' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/objective is required/i)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects a missing objective with 400 + no record (Req 1.6)', async () => {
    state.agents = [{ _id: 'mgr1', role: 'manager' }]
    const res = await POST(postReq({ context: 'no objective here' }))
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
