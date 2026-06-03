// ── /api/admin/notifications — admin alert feed (Clerk + allow-list gated) ────
// GET  → list admin notifications (newest first), with an unacknowledged count.
// PATCH→ acknowledge one ({ id }) or all ({ all: true }).
//
// Auth: Clerk-authed AND the user id must be in the ADMIN_USER_IDS allow-list
// (`isAdminUser`). A signed-in non-admin gets 403; a signed-out caller 401. This
// is the in-app counterpart to the system cron that WRITES these alerts.
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { AdminNotification } from '@/lib/models'
import { isAdminUser } from '@/lib/admin'
import { agentLog } from '@/lib/agents/redact'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminUser(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return { userId }
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    await connectDB()
    const [items, unacknowledged] = await Promise.all([
      AdminNotification.find({}).sort({ createdAt: -1 }).limit(100).lean(),
      AdminNotification.countDocuments({ acknowledged: false }),
    ])
    const notifications = items.map((n) => ({
      id: String(n._id),
      kind: n.kind,
      source: n.source,
      title: n.title,
      body: n.body,
      url: n.url ?? null,
      severity: n.severity,
      acknowledged: n.acknowledged,
      acknowledgedAt: n.acknowledgedAt ? new Date(n.acknowledgedAt).toISOString() : null,
      createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : null,
    }))
    return NextResponse.json({ notifications, unacknowledged })
  } catch (err) {
    agentLog.error('[admin/notifications] list failed', err)
    return NextResponse.json({ error: 'Could not load notifications' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    await connectDB()
    const now = new Date()
    if (body.all === true) {
      const r = await AdminNotification.updateMany(
        { acknowledged: false },
        { $set: { acknowledged: true, acknowledgedAt: now } },
      )
      return NextResponse.json({ ok: true, acknowledged: r.modifiedCount ?? 0 })
    }
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) return NextResponse.json({ error: 'id or all is required' }, { status: 400 })
    await AdminNotification.updateOne(
      { _id: id },
      { $set: { acknowledged: true, acknowledgedAt: now } },
    )
    return NextResponse.json({ ok: true, acknowledged: 1 })
  } catch (err) {
    agentLog.error('[admin/notifications] ack failed', err)
    return NextResponse.json({ error: 'Could not update notifications' }, { status: 500 })
  }
}
