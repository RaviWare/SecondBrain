// ── /api/messaging/whatsapp — Clerk-authed WhatsApp link management ───────────
// GET status · POST mint code · PATCH notify prefs · DELETE revoke.
// Binding happens in the WhatsApp webhook when the user messages the business
// number with their code.
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { agentLog } from '@/lib/agents/redact'
import { getLink, startLink, updateNotify, revokeLink } from '@/lib/messaging/link-service'
import { whatsappConfigured } from '@/lib/messaging/whatsapp'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!whatsappConfigured()) return NextResponse.json({ configured: false, status: 'unconfigured' })
  try {
    const link = await getLink(userId, 'whatsapp')
    return NextResponse.json({ configured: true, ...link, businessNumber: process.env.WHATSAPP_BUSINESS_NUMBER ?? null })
  } catch (err) {
    agentLog.error('[messaging/whatsapp] status failed', err)
    return NextResponse.json({ error: 'Could not load status' }, { status: 500 })
  }
}

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!whatsappConfigured()) return NextResponse.json({ error: 'WhatsApp is not configured.' }, { status: 503 })
  try {
    const link = await startLink(userId, 'whatsapp')
    return NextResponse.json({ ...link, businessNumber: process.env.WHATSAPP_BUSINESS_NUMBER ?? null })
  } catch (err) {
    agentLog.error('[messaging/whatsapp] mint failed', err)
    return NextResponse.json({ error: 'Could not start linking' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const n = (body.notify ?? {}) as Record<string, unknown>
  try {
    const notify = await updateNotify(userId, 'whatsapp', { proposals: n.proposals === true, runs: n.runs === true, support: n.support === true })
    if (!notify) return NextResponse.json({ error: 'No linked WhatsApp' }, { status: 404 })
    return NextResponse.json({ ok: true, notify })
  } catch (err) {
    agentLog.error('[messaging/whatsapp] prefs failed', err)
    return NextResponse.json({ error: 'Could not update preferences' }, { status: 500 })
  }
}

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await revokeLink(userId, 'whatsapp')
    return NextResponse.json({ ok: true })
  } catch (err) {
    agentLog.error('[messaging/whatsapp] revoke failed', err)
    return NextResponse.json({ error: 'Could not revoke link' }, { status: 500 })
  }
}
