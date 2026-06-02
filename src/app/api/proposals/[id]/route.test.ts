// Handler-level tests for POST /api/proposals/[id] — the Aegis decision endpoint.
//
// This is the route that dispatches approve → applyProposal (the ONE agent-side
// vault write path) / refine / dismiss / undo. The Aegis FUNCTIONS themselves are
// covered by their own property/unit tests; THIS file pins the route's thin-glue
// contract that those tests don't touch:
//   • the Clerk auth gate (401 with no session — nothing else runs)
//   • the invalid-JSON guard (400)
//   • the action allowlist (unknown action → 400 BEFORE any Aegis call — important,
//     since dispatch reaches the vault write path)
//   • correct dispatch per action (approve/refine/dismiss/undo) with the right args
//   • the error mapping (/not found/ → 404, everything else → 400) and that no raw
//     internals leak in the message
//
// connectDB + the Aegis layer + Clerk auth are mocked: no DB, no real writes.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mocks (hoisted above the SUT import) ──────────────────────────────────────
const mockAuth = vi.hoisted(() => vi.fn())
vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }))
vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }))
vi.mock('@/lib/agents/aegis/apply-proposal', () => ({
  applyProposal: vi.fn(async () => ({ _id: 'p1', status: 'approved' })),
  refineProposal: vi.fn(async () => ({ _id: 'child1', status: 'refined' })),
  dismissProposal: vi.fn(async () => ({ _id: 'p1', status: 'dismissed' })),
  undoProposal: vi.fn(async () => ({ _id: 'p1', status: 'dismissed' })),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'
import {
  applyProposal,
  refineProposal,
  dismissProposal,
  undoProposal,
} from '@/lib/agents/aegis/apply-proposal'

const mockApply = vi.mocked(applyProposal)
const mockRefine = vi.mocked(refineProposal)
const mockDismiss = vi.mocked(dismissProposal)
const mockUndo = vi.mocked(undoProposal)

const PARAMS = { params: Promise.resolve({ id: 'prop_1' }) }

/** A POST request with an optional JSON body. `raw` bypasses JSON.stringify. */
function req(body?: unknown, raw?: string): NextRequest {
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method: 'POST' }
  if (raw !== undefined) {
    init.body = raw
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'content-type': 'application/json' }
  }
  return new NextRequest('https://app.test/api/proposals/prop_1', init)
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: authenticated.
  mockAuth.mockResolvedValue({ userId: 'user_1' })
})

describe('POST /api/proposals/[id] — auth + input gates', () => {
  it('401 when unauthenticated — and never touches the Aegis layer', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await POST(req({ action: 'approve' }), PARAMS)
    expect(res.status).toBe(401)
    expect(mockApply).not.toHaveBeenCalled()
  })

  it('400 on invalid JSON body', async () => {
    const res = await POST(req(undefined, 'not-json{'), PARAMS)
    expect(res.status).toBe(400)
    expect(mockApply).not.toHaveBeenCalled()
  })

  it('400 on an unknown action — rejected BEFORE any Aegis call (vault write path)', async () => {
    const res = await POST(req({ action: 'delete-everything' }), PARAMS)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown action/i)
    expect(mockApply).not.toHaveBeenCalled()
    expect(mockDismiss).not.toHaveBeenCalled()
  })

  it('400 on a missing action', async () => {
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(400)
    expect(mockApply).not.toHaveBeenCalled()
  })
})

describe('POST /api/proposals/[id] — dispatch per action', () => {
  it('approve → applyProposal(id, { userId })', async () => {
    const res = await POST(req({ action: 'approve' }), PARAMS)
    expect(res.status).toBe(200)
    expect(mockApply).toHaveBeenCalledWith('prop_1', { userId: 'user_1' })
    const body = await res.json()
    expect(body.proposal.status).toBe('approved')
  })

  it('refine → refineProposal(id, reply, { userId }) — forwards the reply', async () => {
    const res = await POST(req({ action: 'refine', reply: 'only if it cites the source' }), PARAMS)
    expect(res.status).toBe(200)
    expect(mockRefine).toHaveBeenCalledWith('prop_1', 'only if it cites the source', { userId: 'user_1' })
  })

  it('refine with no reply → forwards an empty string (never undefined)', async () => {
    await POST(req({ action: 'refine' }), PARAMS)
    expect(mockRefine).toHaveBeenCalledWith('prop_1', '', { userId: 'user_1' })
  })

  it('dismiss → dismissProposal(id, { userId })', async () => {
    const res = await POST(req({ action: 'dismiss' }), PARAMS)
    expect(res.status).toBe(200)
    expect(mockDismiss).toHaveBeenCalledWith('prop_1', { userId: 'user_1' })
  })

  it('undo → undoProposal(id, { userId })', async () => {
    const res = await POST(req({ action: 'undo' }), PARAMS)
    expect(res.status).toBe(200)
    expect(mockUndo).toHaveBeenCalledWith('prop_1', { userId: 'user_1' })
  })

  it('dispatches EXACTLY one Aegis function per request', async () => {
    await POST(req({ action: 'approve' }), PARAMS)
    expect(mockApply).toHaveBeenCalledTimes(1)
    expect(mockRefine).not.toHaveBeenCalled()
    expect(mockDismiss).not.toHaveBeenCalled()
    expect(mockUndo).not.toHaveBeenCalled()
  })
})

describe('POST /api/proposals/[id] — error mapping (no internals leaked)', () => {
  it('maps a "not found" Aegis error to 404', async () => {
    mockApply.mockRejectedValueOnce(new Error('Proposal not found'))
    const res = await POST(req({ action: 'approve' }), PARAMS)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
  })

  it('maps any other Aegis error (invalid state, undo window) to 400', async () => {
    mockUndo.mockRejectedValueOnce(new Error('Undo window has expired'))
    const res = await POST(req({ action: 'undo' }), PARAMS)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Undo window has expired')
  })

  it('falls back to a safe message when a non-Error is thrown', async () => {
    mockDismiss.mockRejectedValueOnce('weird string throw')
    const res = await POST(req({ action: 'dismiss' }), PARAMS)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Failed to process proposal')
  })
})
