// Handler-level tests for POST /api/missions/[id]/control — the Kill_Switch.
//
// The Mission lifecycle FSM (`transition`) has its own property/unit coverage; THIS
// file pins the route's thin-glue contract, letting the PURE `transition` run for
// real (it is pure) and mocking ONLY the I/O edges — Clerk auth, connectDB, and the
// Mission model. It asserts the Kill_Switch behaviour from Req 5.10–5.12:
//   • the Clerk auth gate (401 before any DB access)
//   • the action allowlist + invalid-JSON guard (400)
//   • pause:  a `running` mission → `paused`            (persisted via .save())
//   • resume: a `paused`  mission → `running`           (persisted via .save())
//   • abort:  a `running`/`paused` mission → `aborted`  (finishedAt stamped)
//   • a non-running state authorizes no new Run start — an invalid action from the
//     current state (e.g. pause when not running) is a no-op → 409, NOTHING persisted
//   • the route is user-scoped — Mission.findOne is called with { _id, userId };
//     a Mission the caller does not own / that is absent reads as 404
//
// connectDB + the Mission model + Clerk auth are mocked: no DB.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mocks (hoisted above the SUT import) ──────────────────────────────────────
const mockAuth = vi.hoisted(() => vi.fn())
vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }))
vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }))

// The Mission model: only `findOne` is used by this route.
vi.mock('@/lib/models', () => ({
  Mission: { findOne: vi.fn() },
}))

import { NextRequest } from 'next/server'
import { POST } from './route'
import { Mission } from '@/lib/models'
import type { MissionState } from '@/lib/agents/mission/lifecycle'

const mockFindOne = vi.mocked(Mission.findOne)

const MISSION_ID = 'mission_1'
const PARAMS = { params: Promise.resolve({ id: MISSION_ID }) }

/**
 * A hydrated-Mission-doc-like stub: a mutable `lifecycle`, an optional `finishedAt`,
 * a `.save()` spy, and `.toObject()` returning a plain snapshot. This mirrors what a
 * Mongoose document exposes to the route (read+mutate fields, then `.save()`).
 */
function missionDoc(lifecycle: MissionState) {
  const doc = {
    _id: MISSION_ID,
    userId: 'user_1',
    lifecycle,
    finishedAt: null as Date | null,
    save: vi.fn(async () => undefined),
    toObject() {
      return { _id: this._id, userId: this.userId, lifecycle: this.lifecycle, finishedAt: this.finishedAt }
    },
  }
  return doc
}

/** A POST request with an optional JSON body. `raw` bypasses JSON.stringify. */
function req(body?: unknown, raw?: string): NextRequest {
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method: 'POST' }
  if (raw !== undefined) {
    init.body = raw
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'content-type': 'application/json' }
  }
  return new NextRequest(`https://app.test/api/missions/${MISSION_ID}/control`, init)
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: authenticated.
  mockAuth.mockResolvedValue({ userId: 'user_1' })
})

describe('POST /api/missions/[id]/control — auth + input gates', () => {
  it('401 when unauthenticated — and never touches the DB', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await POST(req({ action: 'pause' }), PARAMS)
    expect(res.status).toBe(401)
    expect(mockFindOne).not.toHaveBeenCalled()
  })

  it('400 on invalid JSON body', async () => {
    const res = await POST(req(undefined, 'not-json{'), PARAMS)
    expect(res.status).toBe(400)
    expect(mockFindOne).not.toHaveBeenCalled()
  })

  it('400 on an unknown action — rejected before any lookup', async () => {
    const res = await POST(req({ action: 'self-destruct' }), PARAMS)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown control action/i)
    expect(mockFindOne).not.toHaveBeenCalled()
  })

  it('400 on a missing action', async () => {
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(400)
    expect(mockFindOne).not.toHaveBeenCalled()
  })
})

describe('POST /api/missions/[id]/control — user scoping (owner-only, Req 1.7/12.5)', () => {
  it('looks up the Mission scoped to the session user { _id, userId }', async () => {
    mockFindOne.mockResolvedValueOnce(missionDoc('running'))
    await POST(req({ action: 'pause' }), PARAMS)
    expect(mockFindOne).toHaveBeenCalledWith({ _id: MISSION_ID, userId: 'user_1' })
  })

  it('404 when the Mission is not owned by / not visible to the caller (findOne → null)', async () => {
    mockFindOne.mockResolvedValueOnce(null)
    const res = await POST(req({ action: 'pause' }), PARAMS)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
  })
})

describe('POST /api/missions/[id]/control — pause (Req 5.11, 9.5)', () => {
  it('drives a running mission → paused and persists via .save()', async () => {
    const doc = missionDoc('running')
    mockFindOne.mockResolvedValueOnce(doc)

    const res = await POST(req({ action: 'pause' }), PARAMS)
    expect(res.status).toBe(200)
    expect(doc.lifecycle).toBe('paused')
    expect(doc.save).toHaveBeenCalledTimes(1)
    // pause never finishes the mission.
    expect(doc.finishedAt).toBeNull()
    const body = await res.json()
    expect(body.mission.lifecycle).toBe('paused')
  })
})

describe('POST /api/missions/[id]/control — resume (Req 9.6)', () => {
  it('drives a paused mission → running and persists via .save()', async () => {
    const doc = missionDoc('paused')
    mockFindOne.mockResolvedValueOnce(doc)

    const res = await POST(req({ action: 'resume' }), PARAMS)
    expect(res.status).toBe(200)
    expect(doc.lifecycle).toBe('running')
    expect(doc.save).toHaveBeenCalledTimes(1)
    expect(doc.finishedAt).toBeNull()
    const body = await res.json()
    expect(body.mission.lifecycle).toBe('running')
  })
})

describe('POST /api/missions/[id]/control — abort (Kill_Switch, Req 5.12, 9.9)', () => {
  it('drives a running mission → aborted and stamps finishedAt', async () => {
    const doc = missionDoc('running')
    mockFindOne.mockResolvedValueOnce(doc)

    const res = await POST(req({ action: 'abort' }), PARAMS)
    expect(res.status).toBe(200)
    expect(doc.lifecycle).toBe('aborted')
    expect(doc.save).toHaveBeenCalledTimes(1)
    expect(doc.finishedAt).toBeInstanceOf(Date)
  })

  it('drives a paused mission → aborted and stamps finishedAt', async () => {
    const doc = missionDoc('paused')
    mockFindOne.mockResolvedValueOnce(doc)

    const res = await POST(req({ action: 'abort' }), PARAMS)
    expect(res.status).toBe(200)
    expect(doc.lifecycle).toBe('aborted')
    expect(doc.save).toHaveBeenCalledTimes(1)
    expect(doc.finishedAt).toBeInstanceOf(Date)
  })
})

describe('POST /api/missions/[id]/control — invalid move is a no-op → 409 (no new Run authorized)', () => {
  // A non-running state authorizes no new Run start: an action that the FSM does not
  // permit from the current state changes NOTHING and is reported as 409 — never a
  // silent success, and never a persisted state change.
  it('409 + nothing persisted when pausing a mission that is NOT running', async () => {
    const doc = missionDoc('paused')
    mockFindOne.mockResolvedValueOnce(doc)

    const res = await POST(req({ action: 'pause' }), PARAMS)
    expect(res.status).toBe(409)
    expect(doc.lifecycle).toBe('paused') // unchanged
    expect(doc.save).not.toHaveBeenCalled() // nothing persisted
    const body = await res.json()
    expect(body.lifecycle).toBe('paused')
  })

  it('409 + nothing persisted when resuming a mission that is running', async () => {
    const doc = missionDoc('running')
    mockFindOne.mockResolvedValueOnce(doc)

    const res = await POST(req({ action: 'resume' }), PARAMS)
    expect(res.status).toBe(409)
    expect(doc.lifecycle).toBe('running') // unchanged
    expect(doc.save).not.toHaveBeenCalled()
  })

  it('409 + nothing persisted when aborting an already-terminal mission', async () => {
    const doc = missionDoc('completed')
    mockFindOne.mockResolvedValueOnce(doc)

    const res = await POST(req({ action: 'abort' }), PARAMS)
    expect(res.status).toBe(409)
    expect(doc.lifecycle).toBe('completed') // absorbing terminal — unchanged
    expect(doc.save).not.toHaveBeenCalled()
  })
})
