#!/usr/bin/env node
// ── Upstream-monitor cron caller ──────────────────────────────────────────────
// POSTs to the protected /api/admin/upstream/check endpoint so the server polls
// the upstream repo and raises an admin alert when it advances. DETECTION ONLY —
// nothing is ever updated automatically.
//
// Zero dependencies: uses Node's global fetch (Node 18+). Reads config from args
// or env so it works both inside the container (localhost) and from anywhere.
//
// Usage:
//   node scripts/check-upstream.mjs [baseUrl] [secret]
// Defaults:
//   baseUrl = $UPSTREAM_CHECK_URL or http://127.0.0.1:3000
//   secret  = $SCHEDULER_CRON_SECRET
//
// Examples:
//   # inside the Coolify container (env already present):
//   node scripts/check-upstream.mjs
//   # from your laptop against production:
//   node scripts/check-upstream.mjs https://secondbraincloud.com "$SECRET"

const baseUrl =
  process.argv[2] || process.env.UPSTREAM_CHECK_URL || 'http://127.0.0.1:3000'
const secret = process.argv[3] || process.env.SCHEDULER_CRON_SECRET

if (!secret) {
  console.error('[check-upstream] SCHEDULER_CRON_SECRET is not set (and no secret arg given).')
  process.exit(2)
}

const url = `${baseUrl.replace(/\/+$/, '')}/api/admin/upstream/check`

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  })
  const text = await res.text()
  // Never print the secret; only the endpoint's JSON summary.
  console.log(`[check-upstream] ${res.status} ${text}`)
  // Treat 2xx as success; anything else is a non-zero exit so cron logs flag it.
  process.exit(res.ok ? 0 : 1)
} catch (err) {
  console.error('[check-upstream] request failed:', err instanceof Error ? err.message : err)
  process.exit(1)
}
