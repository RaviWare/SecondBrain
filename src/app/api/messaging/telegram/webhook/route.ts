// ── /api/messaging/telegram/webhook — Telegram → us (inbound) ─────────────────
// Telegram POSTs every inbound message here. This route is NOT Clerk-authed (the
// caller is Telegram's servers, not a browser session) — it is protected by a
// shared secret Telegram echoes in the `X-Telegram-Bot-Api-Secret-Token` header
// (set when we registered the webhook). A mismatch is rejected.
//
// Behavior:
//   • A message containing a valid, unexpired link code → bind that chat id to
//     the pending MessagingLink (the user is now linked) and reply confirming.
//   • Any other message → a friendly help reply (we do not run agent commands
//     over chat yet; that is a later phase). We never store message content.
//
// Total/never-throws: always returns 200 to Telegram (so it doesn't retry), even
// when we ignore the update — except a bad secret, which is 401.
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { MessagingLink } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { extractLinkCode, isCodeValid } from '@/lib/messaging/link-code'
import { sendTelegramMessage, telegramConfigured } from '@/lib/messaging/telegram'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function secretOk(req: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected || expected.length === 0) return false
  const got = req.headers.get('x-telegram-bot-api-secret-token') ?? ''
  // Length-safe-ish compare (secrets are short config values, not user secrets).
  if (got.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export async function POST(req: NextRequest) {
  if (!telegramConfigured()) {
    return NextResponse.json({ ok: true }) // silently ignore when disabled
  }
  if (!secretOk(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let update: Record<string, unknown>
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: true }) // malformed → ignore
  }

  const message = (update?.message ?? {}) as Record<string, unknown>
  const chat = (message?.chat ?? {}) as Record<string, unknown>
  const from = (message?.from ?? {}) as Record<string, unknown>
  const chatId = chat?.id != null ? String(chat.id) : null
  const text = typeof message?.text === 'string' ? message.text : ''
  const handle =
    typeof from?.username === 'string'
      ? `@${from.username}`
      : typeof from?.first_name === 'string'
        ? from.first_name
        : null

  if (!chatId) return NextResponse.json({ ok: true })

  const code = extractLinkCode(text)

  try {
    await connectDB()

    if (code) {
      // Find a pending link whose code matches + is unexpired.
      const link = await MessagingLink.findOne({ channel: 'telegram', status: 'pending', linkCode: code })
      if (link && isCodeValid(code, link.linkCode, link.linkCodeExpiresAt)) {
        link.status = 'linked'
        link.chatId = chatId
        link.handle = handle
        link.linkCode = null
        link.linkCodeExpiresAt = null
        link.linkedAt = new Date()
        link.lastMessageAt = new Date()
        await link.save()
        await sendTelegramMessage(
          chatId,
          '✅ <b>Linked.</b> Your SecondBrain squad will message you here when something needs you. Manage alerts in Settings → Integrations.',
        )
        return NextResponse.json({ ok: true })
      }
      // Code present but invalid/expired.
      await sendTelegramMessage(
        chatId,
        '⚠️ That link code is invalid or expired. Open SecondBrain → Integrations → Telegram and tap Connect for a fresh one.',
      )
      return NextResponse.json({ ok: true })
    }

    // Not a code — record activity if this chat is already linked, then help.
    const linked = await MessagingLink.findOne({ channel: 'telegram', status: 'linked', chatId })
    if (linked) {
      linked.lastMessageAt = new Date()
      await linked.save()
      await sendTelegramMessage(
        chatId,
        "👋 You're linked. I'll DM you when your squad needs a decision. Two-way commands are coming soon — for now, manage everything in your dashboard.",
      )
    } else {
      await sendTelegramMessage(
        chatId,
        'Welcome to SecondBrain. To connect this chat, open the app → Integrations → Telegram, tap Connect, and send me the code it gives you.',
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    agentLog.error('[messaging/telegram/webhook] handler failed', err)
    return NextResponse.json({ ok: true }) // never make Telegram retry on our errors
  }
}
