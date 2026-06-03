#!/usr/bin/env node
// ── Support-worker cron caller ────────────────────────────────────────────────
// POSTs to /api/admin/support/worker so the server processes open support tickets
// (retry auto-remediable agent failures, escalate the rest). Run it on a short
// cadence (e.g. every few minutes) via a Coolify Scheduled Task.
//
// Zero dependencies (Node 18+ global fetch). Reuses SCHEDULER_CRON_SECRET.
//
// Usage:
//   node scripts/run-support-worker.mjs [baseUrl] [secret]
// Defaults:
//   baseUrl = $SUPPORT_WORKER_URL or http://127.0.0.1:3000
//   secret  = $SCHEDULER_CRON_SECRET

const baseUrl =
  process.argv[2] || process.env.SUPPORT_WORKER_URL || 'http://127.0.0.1:3000'
const secret = process.argv[3] || process.env.SCHEDULER_CRON_SECRET

if (!secret) {
  console.error('[support-worker] SCHEDULER_CRON_SECRET is not set (and no secret arg given).')
  process.exit(2)
}

const url = `${baseUrl.replace(/\/+$/, '')}/api/admin/support/worker`

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  })
  const text = await res.text()
  console.log(`[support-worker] ${res.status} ${text}`)
  process.exit(res.ok ? 0 : 1)
} catch (err) {
  console.error('[support-worker] request failed:', err instanceof Error ? err.message : err)
  process.exit(1)
}
