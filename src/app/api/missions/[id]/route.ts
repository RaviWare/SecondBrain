// ── /api/missions/[id] — single Mission get ───────────────────────────────────
// Clerk-authed, scoped to the signed-in user. Same auth + owner-scoping pattern as
// `/api/agents/[id]`:
//   const { userId } = await auth(); if (!userId) → 401; then connectDB();
//   Mission.findOne({ _id: id, userId }) → 404 when absent or not owned.
//
// Owner-only visibility (Req 12.5): the `{ _id, userId }` filter guarantees a Mission
// is returned ONLY to its creator — a Mission owned by another user reads as 404, never
// leaking its existence.
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Mission } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'

// NOTE (non-standard Next.js): `context.params` is a Promise here and MUST be awaited
// before its fields are read (the repo-wide convention for dynamic route handlers).
/** GET /api/missions/[id] — fetch one Mission owned by the user; 404 if absent. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await connectDB()
    const { id } = await params
    // Owner-scoped fetch: a Mission not owned by the signed-in user is a 404 (Req 12.5).
    const mission = await Mission.findOne({ _id: id, userId }).lean()
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 })

    return NextResponse.json({ mission })
  } catch (err) {
    agentLog.error('[missions/[id]] get failed', err)
    return NextResponse.json({ error: 'Could not load the mission' }, { status: 500 })
  }
}
