// ── /api/messaging/telegram — Clerk-authed link management ────────────────────
// GET    → current link status (+ a deep link / code to connect when pending).
// POST   → mint a fresh link code and (re)enter the pending state.
// PATCH  → update notification preferences { notify: { proposals, runs, support } }.
// DELETE → revoke the link.
//
// The actual binding of a chat id happens in the webhook route when the user
// sends their code to the bot. This route never sees Telegram chat content.
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { MessagingLink } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { mintLinkCode, telegramDeepLink } from '@/lib/messaging/link-code'
import { telegramConfigured, telegramBotUsername } from '@/lib/messaging/telegram'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CHANNEL = 'telegram' as const

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!telegramConfigured()) {
    return NextResponse.json({ configured: false, status: 'unconfigured' })
  }

  try {
    await connectDB()
    const link = await MessagingLink.findOne({ userId, channel: CHANNEL, status: { $in: ['pending', 'linked'] } }).lean()
    if (!link) return NextResponse.json({ configured: true, status: 'none' })

    const deepLink =
      link.status === 'pending' && link.linkCode ? telegramDeepLink(telegramBotUsername(), link.linkCode) : null

    return NextResponse.json({
      configured: true,
      status: link.status,
      handle: link.handle ?? null,
      code: link.status === 'pending' ? link.linkCode : null,
      deepLink,
      botUsername: telegramBotUsername(),
      notify: link.notify ?? { proposals: true, runs: false, support: true },
      linkedAt: link.linkedAt ? new Date(link.linkedAt).toISOString() : null,
    })
  } catch (err) {
    agentLog.error('[messaging/telegram] status failed', err)
    return NextResponse.json({ error: 'Could not load link status' }, { status: 500 })
  }
}

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!telegramConfigured()) {
    return NextResponse.json({ error: 'Telegram is not configured on this server.' }, { status: 503 })
  }

  try {
    await connectDB()
    // If already linked, don't clobber it — just report linked.
    const existing = await MessagingLink.findOne({ userId, channel: CHANNEL, status: { $in: ['pending', 'linked'] } })
    if (existing && existing.status === 'linked') {
      return NextResponse.json({ status: 'linked' })
    }

    const { code, expiresAt } = mintLinkCode()
    if (existing) {
      existing.linkCode = code
      existing.linkCodeExpiresAt = new Date(expiresAt)
      existing.status = 'pending'
      await existing.save()
    } else {
      await MessagingLink.create({
        userId,
        channel: CHANNEL,
        status: 'pending',
        linkCode: code,
        linkCodeExpiresAt: new Date(expiresAt),
      })
    }

    const deepLink = telegramDeepLink(telegramBotUsername(), code)
    return NextResponse.json({ status: 'pending', code, deepLink, botUsername: telegramBotUsername() })
  } catch (err) {
    agentLog.error('[messaging/telegram] mint failed', err)
    return NextResponse.json({ error: 'Could not start linking' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const notify = (body.notify ?? {}) as Record<string, unknown>

  try {
    await connectDB()
    const link = await MessagingLink.findOne({ userId, channel: CHANNEL, status: 'linked' })
    if (!link) return NextResponse.json({ error: 'No linked Telegram chat' }, { status: 404 })
    link.notify = {
      proposals: notify.proposals === true,
      runs: notify.runs === true,
      support: notify.support === true,
    }
    await link.save()
    return NextResponse.json({ ok: true, notify: link.notify })
  } catch (err) {
    agentLog.error('[messaging/telegram] prefs failed', err)
    return NextResponse.json({ error: 'Could not update preferences' }, { status: 500 })
  }
}

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await connectDB()
    await MessagingLink.updateMany(
      { userId, channel: CHANNEL, status: { $in: ['pending', 'linked'] } },
      { $set: { status: 'revoked', chatId: null, linkCode: null, linkCodeExpiresAt: null } },
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    agentLog.error('[messaging/telegram] revoke failed', err)
    return NextResponse.json({ error: 'Could not revoke link' }, { status: 500 })
  }
}
