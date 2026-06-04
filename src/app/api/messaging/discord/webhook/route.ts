// ── /api/messaging/discord/webhook — Discord Interactions endpoint ────────────
// Discord delivers slash-command interactions here (HTTP, serverless-friendly —
// no gateway socket). Users link by running `/link sb-xxxx` in a DM with the bot.
//
// SECURITY: Discord signs every request with Ed25519. We MUST verify the
// `X-Signature-Ed25519` over (`X-Signature-Timestamp` + raw body) against the
// app's public key (DISCORD_PUBLIC_KEY) — Discord rejects an endpoint that
// doesn't. An unsigned/forged request is 401.
import { NextRequest, NextResponse } from 'next/server'
import { verify as edVerify } from 'crypto'
import { agentLog } from '@/lib/agents/redact'
import { extractLinkCode } from '@/lib/messaging/link-code'
import { confirmCode } from '@/lib/messaging/link-service'
import { discordConfigured } from '@/lib/messaging/discord'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Interaction + response type constants (Discord API v10).
const TYPE_PING = 1
const TYPE_APP_COMMAND = 2
const RESP_PONG = 1
const RESP_CHANNEL_MESSAGE = 4
const FLAG_EPHEMERAL = 1 << 6

/** Verify the Ed25519 signature over timestamp+body using the app public key. */
function verifySignature(publicKeyHex: string, signatureHex: string, timestamp: string, rawBody: string): boolean {
  try {
    const key = Buffer.from(publicKeyHex, 'hex')
    const sig = Buffer.from(signatureHex, 'hex')
    const msg = Buffer.from(timestamp + rawBody, 'utf8')
    // Node accepts a raw 32-byte ed25519 public key wrapped as a KeyObject via DER.
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key])
    const keyObject = {
      key: der,
      format: 'der' as const,
      type: 'spki' as const,
    }
    return edVerify(null, msg, keyObject, sig)
  } catch {
    return false
  }
}

function reply(content: string) {
  return NextResponse.json({
    type: RESP_CHANNEL_MESSAGE,
    data: { content, flags: FLAG_EPHEMERAL },
  })
}

export async function POST(req: NextRequest) {
  if (!discordConfigured()) return NextResponse.json({ ok: true })

  const publicKey = process.env.DISCORD_PUBLIC_KEY
  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')
  const rawBody = await req.text()

  if (!publicKey || !signature || !timestamp || !verifySignature(publicKey, signature, timestamp, rawBody)) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 })
  }

  let interaction: Record<string, unknown>
  try { interaction = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: true }) }

  // 1. PING handshake.
  if (interaction.type === TYPE_PING) {
    return NextResponse.json({ type: RESP_PONG })
  }

  // 2. Slash command — expect `/link <code>`.
  if (interaction.type === TYPE_APP_COMMAND) {
    try {
      const data = (interaction.data ?? {}) as Record<string, unknown>
      const options = (data.options ?? []) as Array<{ name?: string; value?: unknown }>
      const codeOpt = options.find((o) => o.name === 'code')
      const rawCode = typeof codeOpt?.value === 'string' ? codeOpt.value : ''
      const code = extractLinkCode(rawCode) ?? extractLinkCode(`sb-${rawCode}`)

      // The Discord user id is on member.user.id (guild) or user.id (DM).
      const member = interaction.member as Record<string, unknown> | undefined
      const userObj = (member?.user ?? interaction.user) as Record<string, unknown> | undefined
      const discordUserId = userObj?.id != null ? String(userObj.id) : null
      const handle = typeof userObj?.username === 'string' ? `@${userObj.username}` : null

      if (!code || !discordUserId) {
        return reply('Send `/link sb-xxxx` with the code from SecondBrain → Integrations → Discord.')
      }
      const ok = await confirmCode('discord', code, discordUserId, handle)
      return reply(
        ok
          ? '✅ Linked! Your SecondBrain squad will DM you here when something needs you.'
          : '⚠️ That code is invalid or expired. Open SecondBrain → Integrations → Discord for a fresh one.',
      )
    } catch (err) {
      agentLog.error('[messaging/discord/webhook] command failed', err)
      return reply('Something went wrong linking your account. Please try again.')
    }
  }

  return NextResponse.json({ ok: true })
}
