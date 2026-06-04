// ── WhatsApp client (Meta Cloud API, thin) ────────────────────────────────────
// Sends via the WhatsApp Business Cloud API. Requires a Meta Business account,
// a verified phone number id, and (for proactive sends outside the 24h customer-
// service window) PRE-APPROVED message templates — a Meta-side process. Config:
//   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_TEMPLATE_NAME (opt),
//   WHATSAPP_VERIFY_TOKEN (webhook), WHATSAPP_TEMPLATE_LANG (default en_US).
// Token lives only in env, never in the DB, never logged.
//
// Sends a plain text body when inside the 24h window; otherwise (or always, if a
// template is configured) sends the approved template with the body as a param.

import { agentLog } from '@/lib/agents/redact'

const GRAPH = 'https://graph.facebook.com/v21.0'

export function whatsappConfigured(): boolean {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID
  const tok = process.env.WHATSAPP_ACCESS_TOKEN
  return !!id && id.trim().length > 0 && !!tok && tok.trim().length > 0
}

type SendResult = { ok: true } | { ok: false; error: string }

/**
 * Send a WhatsApp message to a phone number (E.164, e.g. +14155551234 → digits).
 * Uses an approved template when WHATSAPP_TEMPLATE_NAME is set (required for
 * proactive notifications); otherwise a plain text body (only valid inside the
 * 24h service window). Never throws.
 */
export async function sendWhatsAppMessage(
  toPhone: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  if (!phoneId || !accessToken) return { ok: false, error: 'WhatsApp not configured' }
  const to = toPhone.replace(/[^\d]/g, '')
  if (!to) return { ok: false, error: 'Missing phone number' }

  const templateName = process.env.WHATSAPP_TEMPLATE_NAME?.trim()
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG?.trim() || 'en_US'

  const body = templateName
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
          components: [{ type: 'body', parameters: [{ type: 'text', text }] }],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }

  try {
    const res = await fetchImpl(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, error: `WhatsApp API ${res.status}` }
    return { ok: true }
  } catch (err) {
    agentLog.error('[messaging/whatsapp] send failed', err)
    return { ok: false, error: 'network error' }
  }
}
