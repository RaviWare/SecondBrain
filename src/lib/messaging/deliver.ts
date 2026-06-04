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
      }
      // Future channels (whatsapp, …) branch here behind their own client.
    }
    return delivered
  } catch (err) {
    agentLog.error('[messaging/deliver] delivery failed', err)
    return 0
  }
}
