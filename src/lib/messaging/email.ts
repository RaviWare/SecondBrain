// ── Email client (Resend HTTP API, thin) ──────────────────────────────────────
// Sends transactional email via Resend (https://resend.com) over its REST API —
// no SMTP socket, no extra deps. Config:
//   RESEND_API_KEY        — the provider key (env only, never logged)
//   EMAIL_FROM            — verified sender, e.g. "SecondBrain <alerts@secondbraincloud.com>"
// Linking uses a one-time code emailed to the address the user enters; they paste
// it back in the app to confirm ownership (no inbound webhook needed).
//
// Total/never-throws at the call site.

import { agentLog } from '@/lib/agents/redact'

const RESEND_API = 'https://api.resend.com/emails'

export function emailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  return !!key && key.trim().length > 0 && !!from && from.trim().length > 0
}

type SendResult = { ok: true } | { ok: false; error: string }

/**
 * Send an email. `html` is the body (a small, safe subset is fine). Returns a
 * typed result; never throws. Never logs the API key.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim()
  const from = process.env.EMAIL_FROM?.trim()
  if (!key || !from) return { ok: false, error: 'Email not configured' }
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, error: 'Invalid recipient' }

  try {
    const res = await fetchImpl(RESEND_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, error: `Email API ${res.status}` }
    return { ok: true }
  } catch (err) {
    agentLog.error('[messaging/email] send failed', err)
    return { ok: false, error: 'network error' }
  }
}
