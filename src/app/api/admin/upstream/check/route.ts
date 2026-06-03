// ── /api/admin/upstream/check — protected external-cron entry point ───────────
// Polls the watched upstream repo (default: NousResearch/hermes-agent) for a new
// release or commit and, on a genuine advance, records a deduped AdminNotification
// (+ optional admin webhook). Detection only — NEVER pulls or applies upstream code.
//
// ── WHY A ROUTE (no in-process timer) ────────────────────────────────────────
// Same rationale as the scheduler tick: Next.js handlers are request-scoped, so
// cadence comes from an EXTERNAL cron service hitting this route (e.g. hourly).
//
// ── SECURITY ─────────────────────────────────────────────────────────────────
// System endpoint (not Clerk-authed). Protected by the SAME shared secret as the
// scheduler tick (`SCHEDULER_CRON_SECRET`):
//   • secret UNSET ⇒ 503 (fail safe, never runs unprotected).
//   • caller presents it via `Authorization: Bearer <secret>`; `?key=` is DEV-ONLY
//     (query strings leak into proxy/CDN logs) and rejected in production.
//   • mismatch ⇒ 401, compared with a length-safe constant-time equality, never logged.
//   • per-IP fixed-window rate limit caps brute force + invocation amplification.
import { NextRequest, NextResponse } from 'next/server'
import { agentLog } from '@/lib/agents/redact'
import { runUpstreamCheck } from '@/lib/upstream/check'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function presentedSecret(req: NextRequest): string | null {
  const authz = req.headers.get('authorization')
  if (authz) {
    const m = /^Bearer\s+(.+)$/i.exec(authz.trim())
    if (m) return m[1].trim()
  }
  if (process.env.NODE_ENV !== 'production') {
    const key = req.nextUrl.searchParams.get('key')
    if (key && key.length > 0) return key
  }
  return null
}

// Per-instance fixed-window rate limit (brute-force backstop).
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_DEFAULT_MAX = 12
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function rateLimitMax(): number {
  const n = Number(process.env.SCHEDULER_TICK_RATE_LIMIT)
  return Number.isFinite(n) && n > 0 ? n : RATE_LIMIT_DEFAULT_MAX
}

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

function withinRateLimit(key: string, now: number): boolean {
  const max = rateLimitMax()
  if (rateBuckets.size > 1000) {
    for (const [k, b] of rateBuckets) if (b.resetAt <= now) rateBuckets.delete(k)
  }
  const bucket = rateBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  bucket.count += 1
  return bucket.count <= max
}

/**
 * POST /api/admin/upstream/check — run one upstream poll.
 * Protected by `SCHEDULER_CRON_SECRET`. Returns a small summary of whether an
 * update was detected. Never throws; a fetch failure returns ok:false with a
 * short, secret-safe error.
 */
export async function POST(req: NextRequest) {
  if (!withinRateLimit(clientKey(req), Date.now())) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const secret = process.env.SCHEDULER_CRON_SECRET
  if (!secret || secret.length === 0) {
    return NextResponse.json({ error: 'Monitor not configured' }, { status: 503 })
  }

  const presented = presentedSecret(req)
  if (!presented || !safeEqual(presented, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runUpstreamCheck()
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  } catch (err) {
    agentLog.error('[admin/upstream/check] check failed', err)
    return NextResponse.json({ error: 'Upstream check failed' }, { status: 500 })
  }
}
