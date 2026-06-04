// ── Discord Bot client (thin, zero-dep) ───────────────────────────────────────
// One platform bot (create at discord.com/developers) serves all users. A user
// links by DMing the bot their code; the gateway/interaction webhook resolves it.
// To DM a user we open a DM channel (createDM) then post to it. Bot token lives
// only in DISCORD_BOT_TOKEN — never in the DB, never logged.
//
// Total/never-throws at the call site: a failed send returns { ok: false }.

import { agentLog } from '@/lib/agents/redact'

const API_BASE = 'https://discord.com/api/v10'

export function discordConfigured(): boolean {
  const t = process.env.DISCORD_BOT_TOKEN
  return !!t && t.trim().length > 0
}

/** The bot's invite/app id for building an "add the bot" link (optional). */
export function discordAppId(): string | null {
  const id = process.env.DISCORD_APP_ID
  return id && id.trim().length > 0 ? id.trim() : null
}

function token(): string | null {
  const t = process.env.DISCORD_BOT_TOKEN
  return t && t.trim().length > 0 ? t.trim() : null
}

type SendResult = { ok: true } | { ok: false; error: string }

function authHeaders(t: string): Record<string, string> {
  return { Authorization: `Bot ${t}`, 'Content-Type': 'application/json' }
}

/**
 * Send a DM to a Discord user id: open (or reuse) a DM channel, then post the
 * message. `chatId` here is the user's Discord id. Never throws.
 */
export async function sendDiscordDM(
  userId: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const t = token()
  if (!t) return { ok: false, error: 'Discord not configured' }
  if (!userId) return { ok: false, error: 'Missing user id' }
  try {
    const dmRes = await fetchImpl(`${API_BASE}/users/@me/channels`, {
      method: 'POST',
      headers: authHeaders(t),
      body: JSON.stringify({ recipient_id: userId }),
      cache: 'no-store',
    })
    if (!dmRes.ok) return { ok: false, error: `Discord DM open ${dmRes.status}` }
    const channel = (await dmRes.json()) as { id?: string }
    if (!channel.id) return { ok: false, error: 'No DM channel id' }

    const msgRes = await fetchImpl(`${API_BASE}/channels/${channel.id}/messages`, {
      method: 'POST',
      headers: authHeaders(t),
      // Discord uses markdown; **bold** and links render natively.
      body: JSON.stringify({ content: text }),
      cache: 'no-store',
    })
    if (!msgRes.ok) return { ok: false, error: `Discord send ${msgRes.status}` }
    return { ok: true }
  } catch (err) {
    agentLog.error('[messaging/discord] send failed', err)
    return { ok: false, error: 'network error' }
  }
}
