// Handler-level tests for /api/agents — list (GET) + create (POST).
//
// The Agent model + the pure helpers (renderTrustScopeStatement, INITIAL_TRUST_SCORE)
// have their own coverage; THIS file pins the route's thin-glue contract:
//   • the Clerk auth gate (401 on both verbs, before any DB access)
//   • create validation (name required, role must be in the allowlist)
//   • the SECURITY-CRITICAL pins: a new Agent's trustScore is server-set to the
//     Watch/Proving initial value and lifecycle is forced to 'describe' — NEVER
//     caller-supplied (Req 4.2: trust is earned, a new Agent can't start Trusted)
//   • the trustScopeStatement is derived server-side, never taken from the client
//   • only known fields pass through to the create payload
//
// connectDB + the Agent model + Clerk auth are mocked: no DB.

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }))
vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }))

// Capture what the route hands to Agent.create / Agent.find.
const created = vi.hoisted(() => ({ doc: undefined as Record<string, unknown> | undefined }))
vi.mock('@/lib/models', () => ({
  Agent: {
    find: vi.fn(() => ({ sort: vi.fn(() => ({ lean: vi.fn(async () => [{ _id: 'a1', name: 'Scout' }]) })) })),
    create: vi.fn(async (doc: Record<string, unknown>) => {
      created.doc = doc
      return { _id: 'new1', ...doc }
    }),
  },
}))
// Pure helpers — stub deterministically so we can assert the route WIRES them.
vi.mock('@/lib/agents/trust', () => ({ INITIAL_TRUST_SCORE: 50 }))
vi.mock('@/lib/agents/role-defaults', () => ({
  renderTrustScopeStatement: vi.fn(() => 'CAN: propose · CANNOT: write unattended'),
}))

import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import { Agent } from '@/lib/models'

const mockCreate = vi.mocked(Agent.create)

function postReq(body?: unknown, raw?: string): NextRequest {
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method: 'POST' }
  if (raw !== undefined) init.body = raw
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'content-type': 'application/json' }
  }
  return new NextRequest('https://app.test/api/agents', init)
}

beforeEach(() => {
  vi.clearAllMocks()
  created.doc = undefined
  mockAuth.mockResolvedValue({ userId: 'user_1' })
})

describe('GET /api/agents', () => {
  it('401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns the user-scoped agent list when authed', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.agents)).toBe(true)
    expect(Agent.find).toHaveBeenCalledWith({ userId: 'user_1' })
  })
})

describe('POST /api/agents — auth + validation', () => {
  it('401 when unauthenticated — and never creates', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await POST(postReq({ name: 'X', role: 'scout' }))
    expect(res.status).toBe(401)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('400 on invalid JSON', async () => {
    const res = await POST(postReq(undefined, '{bad'))
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('400 when name is missing/blank', async () => {
    const res = await POST(postReq({ role: 'scout' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/name is required/i)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('400 when role is not in the allowlist', async () => {
    const res = await POST(postReq({ name: 'Evil', role: 'superadmin' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/valid role/i)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('creates a valid agent and returns 201', async () => {
    const res = await POST(postReq({ name: '  Scout  ', role: 'scout' }))
    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    // name is trimmed; scoped to the session user.
    expect(created.doc?.name).toBe('Scout')
    expect(created.doc?.userId).toBe('user_1')
  })
})

describe('POST /api/agents — security pins (trust is earned, never caller-supplied)', () => {
  it('IGNORES a caller-supplied trustScore — pins it to the initial Watch-band value', async () => {
    await POST(postReq({ name: 'Sneaky', role: 'scout', trustScore: 100 }))
    // 100 (Trusted) must NOT survive — the route pins the initial value (mocked 50).
    expect(created.doc?.trustScore).toBe(50)
  })

  it('IGNORES a caller-supplied lifecycle — pins it to "describe"', async () => {
    await POST(postReq({ name: 'Sneaky', role: 'scout', lifecycle: 'deploy' }))
    expect(created.doc?.lifecycle).toBe('describe')
  })

  it('derives trustScopeStatement server-side, never from the client', async () => {
    await POST(postReq({ name: 'X', role: 'scout', trustScopeStatement: 'I can do ANYTHING' }))
    expect(created.doc?.trustScopeStatement).toBe('CAN: propose · CANNOT: write unattended')
  })

  it('only passes through known fields (drops unknown keys)', async () => {
    await POST(postReq({ name: 'X', role: 'scout', isAdmin: true, hackField: 'x' }))
    expect(created.doc).toBeDefined()
    expect('isAdmin' in (created.doc as object)).toBe(false)
    expect('hackField' in (created.doc as object)).toBe(false)
  })

  it('passes through known optional fields when provided', async () => {
    await POST(postReq({ name: 'X', role: 'researcher', assignedSkillIds: ['s1', 's2'] }))
    expect(created.doc?.assignedSkillIds).toEqual(['s1', 's2'])
    expect(created.doc?.role).toBe('researcher')
  })
})
