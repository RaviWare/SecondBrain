// ── /api/admin/support/tickets — admin support board (Clerk + allow-list) ─────
// GET   → list tickets (newest first) with counts by status.
// PATCH → admin action on a ticket: { id, action: 'comment'|'resolve'|'wont-fix'|'reopen', note? }.
//
// Auth: Clerk-authed AND ADMIN_USER_IDS allow-list (isAdminUser). The system cron
// (worker route) writes most timeline entries; this is the human surface to read
// them and close/comment.
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { SupportTicket } from '@/lib/models'
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

const ACTIVE = ['open', 'investigating', 'in-progress', 'awaiting-admin']

export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    await connectDB()
    const items = await SupportTicket.find({}).sort({ updatedAt: -1 }).limit(100).lean()
    const tickets = items.map((t) => ({
      id: String(t._id),
      agentId: t.agentId,
      agentName: t.agentName,
      category: t.category,
      severity: t.severity,
      status: t.status,
      title: t.title,
      diagnosis: t.diagnosis,
      recommendedAction: t.recommendedAction,
      retryCount: t.retryCount,
      autoRemediable: t.autoRemediable,
      firstRunId: t.firstRunId,
      lastRunId: t.lastRunId,
      resolutionNote: t.resolutionNote,
      createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
      updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : null,
      resolvedAt: t.resolvedAt ? new Date(t.resolvedAt).toISOString() : null,
      timeline: (t.timeline ?? []).map((e) => ({
        at: e.at ? new Date(e.at).toISOString() : null,
        type: e.type,
        message: e.message,
        meta: e.meta ?? null,
      })),
    }))
    const open = tickets.filter((t) => ACTIVE.includes(t.status)).length
    const awaitingAdmin = tickets.filter((t) => t.status === 'awaiting-admin').length
    return NextResponse.json({ tickets, open, awaitingAdmin })
  } catch (err) {
    agentLog.error('[admin/support/tickets] list failed', err)
    return NextResponse.json({ error: 'Could not load tickets' }, { status: 500 })
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

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const action = typeof body.action === 'string' ? body.action : ''
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!id || !action) return NextResponse.json({ error: 'id and action are required' }, { status: 400 })

  try {
    await connectDB()
    const t = await SupportTicket.findById(id)
    if (!t) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    const now = new Date()

    switch (action) {
      case 'comment':
        if (!note) return NextResponse.json({ error: 'note is required for a comment' }, { status: 400 })
        t.timeline.push({ at: now, type: 'comment', message: `Admin: ${note}` })
        break
      case 'resolve':
        t.status = 'resolved'
        t.resolvedAt = now
        t.resolutionNote = note || 'Closed by admin.'
        t.timeline.push({ at: now, type: 'resolved', message: `Admin resolved: ${t.resolutionNote}` })
        break
      case 'wont-fix':
        t.status = 'wont-fix'
        t.resolvedAt = now
        t.resolutionNote = note || 'Admin marked as won\'t fix.'
        t.timeline.push({ at: now, type: 'status-change', message: `Admin marked won't-fix: ${t.resolutionNote}` })
        break
      case 'reopen':
        t.status = 'investigating'
        t.resolvedAt = null
        t.resolutionNote = null
        t.timeline.push({ at: now, type: 'status-change', message: `Admin reopened the ticket${note ? `: ${note}` : ''}.` })
        break
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    await t.save()
    return NextResponse.json({ ok: true, status: t.status })
  } catch (err) {
    agentLog.error('[admin/support/tickets] action failed', err)
    return NextResponse.json({ error: 'Could not update ticket' }, { status: 500 })
  }
}
