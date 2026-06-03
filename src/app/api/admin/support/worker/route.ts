// ── /api/admin/support/worker — protected external-cron entry point ───────────
// Drives the support "workforce": picks up open tickets, retries auto-remediable
// ones through the audited run spine, escalates the rest, documenting every step.
//
// SECURITY: system endpoint (not Clerk-authed). Protected by the SAME shared
// secret as the scheduler tick (`SCHEDULER_CRON_SECRET`): Bearer auth, dev-only
// ?key=, per-IP rate limit, 503 when unset. Point an external cron at it (e.g.
// every few minutes). Mirrors /api/agents/scheduler/tick exactly.
import { NextRequest, NextResponse } from 'next/server'
import { agentLog } from '@/lib/agents/redact'
import { connectDB } from '@/lib/mongodb'
import { processOpenTickets } from '@/lib/support/worker'

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

/** POST /api/admin/support/worker — process one batch of open tickets. */
export async function POST(req: NextRequest) {
  if (!withinRateLimit(clientKey(req), Date.now())) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const secret = process.env.SCHEDULER_CRON_SECRET
  if (!secret || secret.length === 0) {
    return NextResponse.json({ error: 'Worker not configured' }, { status: 503 })
  }

  const presented = presentedSecret(req)
  if (!presented || !safeEqual(presented, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await connectDB()
    const summary = await processOpenTickets()
    return NextResponse.json(summary, { status: summary.ok ? 200 : 500 })
  } catch (err) {
    agentLog.error('[admin/support/worker] worker failed', err)
    return NextResponse.json({ error: 'Support worker failed' }, { status: 500 })
  }
}
