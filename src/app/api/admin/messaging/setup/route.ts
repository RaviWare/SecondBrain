// ── /api/admin/messaging/setup — register the Telegram webhook (admin) ────────
// One-time (idempotent) setup: tells Telegram to deliver inbound messages to our
// webhook, using TELEGRAM_WEBHOOK_SECRET as the verification token. Clerk-authed
// AND admin-allow-list gated. Safe to re-run after a domain change.
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/admin'
import { agentLog } from '@/lib/agents/redact'
import { setTelegramWebhook, getTelegramWebhookInfo, telegramConfigured, telegramBotUsername } from '@/lib/messaging/telegram'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET → readiness checklist + current webhook registration (admin only). */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminUser(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const hasToken = telegramConfigured()
  const hasUsername = !!telegramBotUsername()
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const hasSecret = !!secret && secret.length >= 8

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') || 'https://secondbraincloud.com'
  const expectedUrl = `${base}/api/messaging/telegram/webhook`

  let webhook: { registered: boolean; url: string; pending: number; matches: boolean } | null = null
  if (hasToken) {
    const info = await getTelegramWebhookInfo()
    if (info.ok) {
      webhook = { registered: info.url.length > 0, url: info.url, pending: info.pending, matches: info.url === expectedUrl }
    }
  }

  return NextResponse.json({
    checklist: { hasToken, hasUsername, hasSecret },
    botUsername: telegramBotUsername(),
    expectedUrl,
    webhook,
    ready: hasToken && hasSecret,
  })
}

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminUser(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!telegramConfigured()) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN is not set.' }, { status: 503 })
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret || secret.length < 8) {
    return NextResponse.json({ error: 'TELEGRAM_WEBHOOK_SECRET is missing or too short (min 8 chars).' }, { status: 400 })
  }

  // Resolve our public base URL from env (set in production) or fall back to the
  // canonical app URL.
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
    'https://secondbraincloud.com'
  const webhookUrl = `${base}/api/messaging/telegram/webhook`

  try {
    const res = await setTelegramWebhook(webhookUrl, secret)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 })
    return NextResponse.json({ ok: true, webhookUrl })
  } catch (err) {
    agentLog.error('[admin/messaging/setup] failed', err)
    return NextResponse.json({ error: 'Webhook setup failed' }, { status: 500 })
  }
}
