// ── Channel-agnostic delivery ─────────────────────────────────────────────────
// The one helper the rest of the app calls to push an alert to a user's linked
// chat channels (Telegram today; WhatsApp/etc. slot in here later). Best-effort
// and total: a delivery failure NEVER affects the action that triggered it.
//
// Respects per-link notification preferences (proposals / runs / support) so a
// user only gets the classes they opted into. Never stores message content.

import { connectDB } from '@/lib/mongodb'
import { MessagingLink } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { sendTelegramMessage } from './telegram'
import { sendDiscordDM } from './discord'
import { sendWhatsAppMessage } from './whatsapp'
import { sendEmail } from './email'

export type AlertKind = 'proposals' | 'runs' | 'support'

/**
 * Deliver an alert to all of a user's LINKED channels that opted into `kind`.
 * Returns the number of channels successfully delivered to (0 when none linked
 * or the feature is unconfigured). Never throws.
 *
 * `text` may contain a tiny subset of HTML (<b>, <a href>) — the Telegram sender
 * uses parse_mode=HTML. Keep it short; this is a nudge, not the full content.
 */
export async function deliverToUser(userId: string, kind: AlertKind, text: string): Promise<number> {
  try {
    await connectDB()
    const links = await MessagingLink.find({ userId, status: 'linked' }).lean()
    if (links.length === 0) return 0

    let delivered = 0
    for (const link of links) {
      // Honor the per-channel preference for this alert class.
      const notify = link.notify ?? { proposals: true, runs: false, support: true }
      if (notify[kind] !== true) continue
      if (!link.chatId) continue

      if (link.channel === 'telegram') {
        const res = await sendTelegramMessage(link.chatId, text)
        if (res.ok) delivered += 1
      } else if (link.channel === 'discord') {
        const res = await sendDiscordDM(link.chatId, text)
        if (res.ok) delivered += 1
      } else if (link.channel === 'whatsapp') {
        const res = await sendWhatsAppMessage(link.chatId, stripHtml(text))
        if (res.ok) delivered += 1
      } else if (link.channel === 'email') {
        const res = await sendEmail(link.chatId, emailSubject(kind), htmlBody(text))
        if (res.ok) delivered += 1
      }
      // Future channels branch here behind their own client.
    }
    return delivered
  } catch (err) {
    agentLog.error('[messaging/deliver] delivery failed', err)
    return 0
  }
}

/** Strip the tiny HTML subset from an alert for plain-text channels (WhatsApp). */
function stripHtml(text: string): string {
  return text
    .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<\/?[^>]+>/g, '')
    .trim()
}

/** Subject line per alert class for the email channel. */
function emailSubject(kind: AlertKind): string {
  switch (kind) {
    case 'proposals': return 'Your SecondBrain squad needs a decision'
    case 'support': return 'A SecondBrain agent needs your attention'
    case 'runs': return 'SecondBrain agent run update'
  }
}

/** Wrap an alert body in a minimal, safe HTML email shell. */
function htmlBody(text: string): string {
  // The alert text already uses <b>/<a>; wrap it in a simple branded shell.
  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1c1f">',
    '<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#ff6600;margin:0 0 12px">SecondBrain</p>',
    `<div style="font-size:15px;line-height:1.6">${text}</div>`,
    '<hr style="border:none;border-top:1px solid #eee;margin:20px 0" />',
    '<p style="font-size:12px;color:#888;margin:0">Manage alerts in your SecondBrain dashboard → Integrations.</p>',
    '</div>',
  ].join('')
}
