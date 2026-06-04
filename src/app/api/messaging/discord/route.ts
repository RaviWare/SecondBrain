// ── /api/messaging/discord — Clerk-authed Discord link management ─────────────
// GET status · POST mint code · PATCH notify prefs · DELETE revoke.
// Binding happens in the Discord webhook when the user DMs the bot their code.
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { agentLog } from '@/lib/agents/redact'
import { getLink, startLink, updateNotify, revokeLink } from '@/lib/messaging/link-service'
import { discordConfigured, discordAppId } from '@/lib/messaging/discord'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!discordConfigured()) return NextResponse.json({ configured: false, status: 'unconfigured' })
  try {
    const link = await getLink(userId, 'discord')
    return NextResponse.json({ configured: true, ...link, appId: discordAppId() })
  } catch (err) {
    agentLog.error('[messaging/discord] status failed', err)
    return NextResponse.json({ error: 'Could not load status' }, { status: 500 })
  }
}

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!discordConfigured()) return NextResponse.json({ error: 'Discord is not configured.' }, { status: 503 })
  try {
    const link = await startLink(userId, 'discord')
    return NextResponse.json({ ...link, appId: discordAppId() })
  } catch (err) {
    agentLog.error('[messaging/discord] mint failed', err)
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
    const notify = await updateNotify(userId, 'discord', { proposals: n.proposals === true, runs: n.runs === true, support: n.support === true })
    if (!notify) return NextResponse.json({ error: 'No linked Discord' }, { status: 404 })
    return NextResponse.json({ ok: true, notify })
  } catch (err) {
    agentLog.error('[messaging/discord] prefs failed', err)
    return NextResponse.json({ error: 'Could not update preferences' }, { status: 500 })
  }
}

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await revokeLink(userId, 'discord')
    return NextResponse.json({ ok: true })
  } catch (err) {
    agentLog.error('[messaging/discord] revoke failed', err)
    return NextResponse.json({ error: 'Could not revoke link' }, { status: 500 })
  }
}
