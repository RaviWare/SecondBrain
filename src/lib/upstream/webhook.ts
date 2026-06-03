// ── Admin webhook notifier (optional) ─────────────────────────────────────────
// Posts a short alert to an admin webhook (Slack/Discord/Teams incoming-webhook
// style) when one is configured via `ADMIN_ALERT_WEBHOOK_URL`. Entirely optional:
// when unset this is a no-op and the alert still lands in the in-app Admin feed.
//
// Safety: posts ONLY the human-facing alert text (title/body/url) to the URL the
// admin themselves configured — never project code, secrets, or user data. The
// URL is treated as a secret-ish config value and never logged.

export type AdminAlert = { title: string; body: string; url: string | null }

/** True when an admin webhook is configured. */
export function adminWebhookConfigured(): boolean {
  const u = process.env.ADMIN_ALERT_WEBHOOK_URL
  return !!u && /^https:\/\//i.test(u.trim())
}

/**
 * Fire-and-forget POST to the configured admin webhook. No-op when unset.
 * Returns true when a request was sent and accepted, false otherwise. Never
 * throws — the caller wraps it but this is defensive too.
 */
export async function notifyAdminWebhook(
  alert: AdminAlert,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const raw = process.env.ADMIN_ALERT_WEBHOOK_URL
  if (!raw || !/^https:\/\//i.test(raw.trim())) return false
  const url = raw.trim()

  // A generic payload that Slack and Discord both accept a `text`/`content` field
  // from; we send both common keys so the same URL works for either service.
  const text = [alert.title, alert.body, alert.url].filter(Boolean).join('\n')
  const payload = JSON.stringify({ text, content: text })

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      cache: 'no-store',
    })
    return res.ok
  } catch {
    // Never surface the URL or error detail (may embed a token in the path).
    return false
  }
}
