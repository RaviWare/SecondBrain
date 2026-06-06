// Handler-level tests for GET /api/missions/[id] — single Mission fetch.
//
// Pins the route's thin-glue contract (Req 12.5):
//   • the Clerk auth gate (401 BEFORE any DB access)
//   • owner-scoped fetch — Mission.findOne({ _id, id, userId }) so a Mission is
//     returned ONLY to its creator
//   • a Mission that is absent or owned by another user reads as 404 (never leaks)
//
// connectDB + the Mission model + Clerk auth are mocked: no DB.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mocks (hoisted above the SUT import) ──────────────────────────────────────
const mockAuth = vi.hoisted(() => vi.fn())
vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }))
vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }))

// Mutable fixture: what Mission.findOne(...).lean() returns (null = not found).
const state = vi.hoisted(() => ({ mission: null as Record<string, unknown> | null }))
vi.mock('@/lib/models', () => ({
  Mission: {
    findOne: vi.fn(() => ({ lean: vi.fn(async () => state.mission) })),
  },
}))

import { NextRequest } from 'next/server'
import { GET } from './route'
import { connectDB } from '@/lib/mongodb'
import { Mission } from '@/lib/models'

const mockConnect = vi.mocked(connectDB)

const PARAMS = { params: Promise.resolve({ id: 'mission_1' }) }

function getReq(): NextRequest {
  return new NextRequest('https://app.test/api/missions/mission_1', { method: 'GET' })
}

beforeEach(() => {
  vi.clearAllMocks()
  state.mission = null
  mockAuth.mockResolvedValue({ userId: 'user_1' })
})

describe('GET /api/missions/[id] — auth + owner scoping (Req 12.5)', () => {
  it('401 when unauthenticated — and never touches the DB', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await GET(getReq(), PARAMS)
    expect(res.status).toBe(401)
    expect(mockConnect).not.toHaveBeenCalled()
    expect(Mission.findOne).not.toHaveBeenCalled()
  })

  it('returns the Mission scoped to { _id, userId } when found', async () => {
    state.mission = { _id: 'mission_1', objective: 'ship it', userId: 'user_1' }
    const res = await GET(getReq(), PARAMS)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mission).toMatchObject({ _id: 'mission_1' })
    // Owner-scoped fetch: both the id AND the session user constrain the query (Req 12.5).
    expect(Mission.findOne).toHaveBeenCalledWith({ _id: 'mission_1', userId: 'user_1' })
  })

  it('404 when the Mission is absent or owned by another user (Req 12.5)', async () => {
    // findOne scoped to { _id, userId } returns null for a non-owned/absent Mission.
    state.mission = null
    const res = await GET(getReq(), PARAMS)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
    // Still scoped to the session user — never a leak of another user's Mission.
    expect(Mission.findOne).toHaveBeenCalledWith({ _id: 'mission_1', userId: 'user_1' })
  })
})
