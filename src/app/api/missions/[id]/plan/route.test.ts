// Handler-level tests for /api/missions/[id]/plan — the mandatory Plan_Approval
// checkpoint (Req 3). The pure cores it delegates to (the lifecycle FSM `transition`,
// the planner `buildTaskGraph`/`assignByRole`/`validateTaskGraph`) have their own
// property/unit coverage and are deliberately LET RUN FOR REAL here — only the I/O
// edges (Clerk auth, the Mongoose models, connectDB) are mocked. This file pins the
// route's thin-glue contract that those tests don't touch:
//   • the Clerk auth gate (401 before any DB access)
//   • user-scoped loads: Mission.findOne is always called with { _id, userId }, and a
//     non-owned / absent mission is reported as 404 (never leaks existence)
//   • approve: drives the FSM awaiting-plan-approval → running and records approvedAt
//     (and startedAt); an invalid origin no-ops the FSM → 409 (Req 3.4, 3.7, 9.4)
//   • a CYCLIC edit is rejected (422), persists nothing, and the Mission stays in
//     awaiting-plan-approval (Req 3.5)
//   • reject: drives the FSM → aborted and starts NO Run (Req 3.6)
//
// connectDB + the Mission/MissionTask/Agent models + Clerk auth are mocked: no DB. The
// mission id in the route URL must be a real ObjectId string because the route runs the
// (unmocked) `isValidObjectId` guard before any load.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mocks (hoisted above the SUT import) ──────────────────────────────────────
const mockAuth = vi.hoisted(() => vi.fn())
vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }))
vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }))

const models = vi.hoisted(() => ({
  missionFindOne: vi.fn(),
  agentFind: vi.fn(),
  taskFind: vi.fn(),
  taskDeleteMany: vi.fn(async () => ({ deletedCount: 0 })),
  taskInsertMany: vi.fn(async () => []),
}))
vi.mock('@/lib/models', () => ({
  Mission: { findOne: models.missionFindOne },
  MissionTask: {
    find: models.taskFind,
    deleteMany: models.taskDeleteMany,
    insertMany: models.taskInsertMany,
  },
  Agent: { find: models.agentFind },
}))

import { NextRequest } from 'next/server'
import { POST } from './route'

// A real ObjectId-shaped string so the route's `isValidObjectId` guard passes.
const MISSION_ID = '507f1f77bcf86cd799439011'

/** The Next.js dynamic-route ctx the handler reads `params` from (a Promise). */
function ctx(id: string = MISSION_ID) {
  return { params: Promise.resolve({ id }) }
}

/** A POST request with an optional JSON body. `raw` bypasses JSON.stringify. */
function postReq(body?: unknown, raw?: string): NextRequest {
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method: 'POST' }
  if (raw !== undefined) init.body = raw
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'content-type': 'application/json' }
  }
  return new NextRequest(`https://app.test/api/missions/${MISSION_ID}/plan`, init)
}

/**
 * A hydrated-Mission-doc-like object: a mutable `lifecycle` plus a `.save()` spy, so a
 * test can assert both the in-place FSM transition and that it was persisted. `save`
 * resolves to the same doc (mirrors a Mongoose document's `save`).
 */
function makeMission(overrides: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = {
    _id: MISSION_ID,
    userId: 'user_1',
    objective: 'Ship the launch',
    context: '',
    leadAgentId: 'lead_1',
    lifecycle: 'awaiting-plan-approval',
    limits: { maxGraphDepth: 0, maxTaskCount: 0 },
    approvedAt: null,
    startedAt: null,
    finishedAt: null,
    failureReason: null,
    ...overrides,
  }
  doc.save = vi.fn(async () => doc)
  return doc
}

/** Point Agent.find({ userId }).select(...).lean() at a fixed roster (edit path). */
function stubAgentRoster(agents: Array<{ _id: string; role?: string }>) {
  models.agentFind.mockReturnValue({
    select: vi.fn(() => ({ lean: vi.fn(async () => agents) })),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ userId: 'user_1' })
  models.taskDeleteMany.mockResolvedValue({ deletedCount: 0 })
  models.taskInsertMany.mockResolvedValue([])
})

describe('POST /api/missions/[id]/plan — auth + ownership gates', () => {
  it('401 when unauthenticated — and never touches the mission', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await POST(postReq({ action: 'approve' }), ctx())
    expect(res.status).toBe(401)
    expect(models.missionFindOne).not.toHaveBeenCalled()
  })

  it('404 for a mission the caller does not own / that is absent — user-scoped query', async () => {
    models.missionFindOne.mockResolvedValue(null)
    const res = await POST(postReq({ action: 'approve' }), ctx())
    expect(res.status).toBe(404)
    // The load is always scoped to the session user (owner-only visibility).
    expect(models.missionFindOne).toHaveBeenCalledWith({ _id: MISSION_ID, userId: 'user_1' })
  })

  it('400 on an unknown action — before any mission load', async () => {
    const res = await POST(postReq({ action: 'launch-everything' }), ctx())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown action/i)
    expect(models.missionFindOne).not.toHaveBeenCalled()
  })
})

describe('POST /api/missions/[id]/plan — approve (Req 3.4, 3.7, 9.4)', () => {
  it('drives the FSM awaiting-plan-approval → running and records approvedAt + startedAt', async () => {
    const mission = makeMission({ lifecycle: 'awaiting-plan-approval' })
    models.missionFindOne.mockResolvedValue(mission)

    const res = await POST(postReq({ action: 'approve' }), ctx())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.lifecycle).toBe('running')
    expect(body.approvedAt).toBeTruthy()
    expect(body.startedAt).toBeTruthy()

    // The transition happened on the doc AND was persisted.
    expect(mission.lifecycle).toBe('running')
    expect(mission.approvedAt).toBeInstanceOf(Date)
    expect(mission.startedAt).toBeInstanceOf(Date) // anchors Wall_Clock + Timeline T+0
    expect(mission.save).toHaveBeenCalledTimes(1)
    // user-scoped load.
    expect(models.missionFindOne).toHaveBeenCalledWith({ _id: MISSION_ID, userId: 'user_1' })
  })

  it('409 when approving from an invalid origin — the FSM no-ops, nothing persists', async () => {
    const mission = makeMission({ lifecycle: 'planning' })
    models.missionFindOne.mockResolvedValue(mission)

    const res = await POST(postReq({ action: 'approve' }), ctx())
    expect(res.status).toBe(409)

    // No lifecycle change, no persistence — approval is only valid from awaiting-plan-approval.
    expect(mission.lifecycle).toBe('planning')
    expect(mission.approvedAt).toBeNull()
    expect(mission.startedAt).toBeNull()
    expect(mission.save).not.toHaveBeenCalled()
  })
})

describe('POST /api/missions/[id]/plan — edit (Req 3.5)', () => {
  it('rejects a CYCLIC edit (422), persists nothing, and stays awaiting-plan-approval', async () => {
    const mission = makeMission({ lifecycle: 'awaiting-plan-approval' })
    models.missionFindOne.mockResolvedValue(mission)
    stubAgentRoster([{ _id: 'lead_1', role: 'lead' }])

    // t1 ↔ t2 form a cycle — validateTaskGraph must report reason 'cycle'.
    const res = await POST(
      postReq({
        action: 'edit',
        tasks: [
          { key: 't1', description: 'first', dependsOn: ['t2'] },
          { key: 't2', description: 'second', dependsOn: ['t1'] },
        ],
      }),
      ctx(),
    )

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.reason).toBe('cycle')
    // The mission stays awaiting-plan-approval (no transition to running) (Req 3.5).
    expect(body.lifecycle).toBe('awaiting-plan-approval')
    expect(mission.lifecycle).toBe('awaiting-plan-approval')

    // No lifecycle change persisted and NO MissionTask write — the cyclic plan is dropped.
    expect(mission.save).not.toHaveBeenCalled()
    expect(models.taskDeleteMany).not.toHaveBeenCalled()
    expect(models.taskInsertMany).not.toHaveBeenCalled()
    // Roster lookup is user-scoped.
    expect(models.agentFind).toHaveBeenCalledWith({ userId: 'user_1' })
  })
})

describe('POST /api/missions/[id]/plan — reject (Req 3.6)', () => {
  it('drives the FSM awaiting-plan-approval → aborted and starts NO Run', async () => {
    const mission = makeMission({ lifecycle: 'awaiting-plan-approval' })
    models.missionFindOne.mockResolvedValue(mission)

    const res = await POST(postReq({ action: 'reject' }), ctx())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.lifecycle).toBe('aborted')

    expect(mission.lifecycle).toBe('aborted')
    expect(mission.finishedAt).toBeInstanceOf(Date)
    expect(mission.save).toHaveBeenCalledTimes(1)
    // Reject never starts execution: no run anchor, no task persistence.
    expect(mission.startedAt).toBeNull()
    expect(models.taskInsertMany).not.toHaveBeenCalled()
    expect(models.missionFindOne).toHaveBeenCalledWith({ _id: MISSION_ID, userId: 'user_1' })
  })

  it('409 when rejecting from an invalid origin — the FSM no-ops, nothing persists', async () => {
    const mission = makeMission({ lifecycle: 'running' })
    models.missionFindOne.mockResolvedValue(mission)

    const res = await POST(postReq({ action: 'reject' }), ctx())
    expect(res.status).toBe(409)
    expect(mission.lifecycle).toBe('running')
    expect(mission.save).not.toHaveBeenCalled()
  })
})
