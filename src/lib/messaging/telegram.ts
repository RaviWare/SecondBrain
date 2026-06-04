// ── Telegram Bot API client (thin, zero-dep) ──────────────────────────────────
// Wraps the handful of Bot API calls we need over global fetch. The bot token is
// the PLATFORM's (one bot for all users, created via @BotFather) and lives only
// in TELEGRAM_BOT_TOKEN — never in the DB, never logged. Users link their own
// chat to the bot; we only ever store their chat id.
//
// Total/never-throws at the call site: a failed send returns { ok: false } so a
// notification failure never breaks the action that triggered it.

import { agentLog } from '@/lib/agents/redact'

const API_BASE = 'https://api.telegram.org'

/** True when a platform bot token is configured (the feature is enabled). */
export function telegramConfigured(): boolean {
  const t = process.env.TELEGRAM_BOT_TOKEN
  return !!t && t.trim().length > 0
}

/** The platform bot's @username, used to build deep links (optional). */
export function telegramBotUsername(): string | null {
  const u = process.env.TELEGRAM_BOT_USERNAME
  return u && u.trim().length > 0 ? u.trim().replace(/^@/, '') : null
}

function token(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN
  return t && t.trim().length > 0 ? t.trim() : null
}

export type SendResult = { ok: true } | { ok: false; error: string }

/**
 * Send a message to a Telegram chat. `text` supports a small subset of HTML
 * (parse_mode=HTML) for bold/links. Never throws; returns a typed result. Never
 * logs the bot token or the message body.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const t = token()
  if (!t) return { ok: false, error: 'Telegram not configured' }
  if (!chatId) return { ok: false, error: 'Missing chat id' }
  try {
    const res = await fetchImpl(`${API_BASE}/bot${t}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      // Body may contain a description; do not log the token (it's only in the URL).
      return { ok: false, error: `Telegram API ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    agentLog.error('[messaging/telegram] send failed', err)
    return { ok: false, error: 'network error' }
  }
}

/**
 * Read the current webhook registration from Telegram (getWebhookInfo). Returns
 * the configured url + pending update count, or an error. Never throws.
 */
export async function getTelegramWebhookInfo(
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; url: string; pending: number } | { ok: false; error: string }> {
  const t = token()
  if (!t) return { ok: false, error: 'Telegram not configured' }
  try {
    const res = await fetchImpl(`${API_BASE}/bot${t}/getWebhookInfo`, { cache: 'no-store' })
    if (!res.ok) return { ok: false, error: `Telegram API ${res.status}` }
    const data = (await res.json()) as { result?: { url?: string; pending_update_count?: number } }
    return { ok: true, url: data.result?.url ?? '', pending: data.result?.pending_update_count ?? 0 }
  } catch (err) {
    agentLog.error('[messaging/telegram] getWebhookInfo failed', err)
    return { ok: false, error: 'network error' }
  }
}
export async function setTelegramWebhook(
  url: string,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const t = token()
  if (!t) return { ok: false, error: 'Telegram not configured' }
  try {
    const res = await fetchImpl(`${API_BASE}/bot${t}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: ['message'],
      }),
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, error: `Telegram API ${res.status}` }
    return { ok: true }
  } catch (err) {
    agentLog.error('[messaging/telegram] setWebhook failed', err)
    return { ok: false, error: 'network error' }
  }
}
