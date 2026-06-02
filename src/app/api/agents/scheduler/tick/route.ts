// ── /api/agents/scheduler/tick — protected external-cron entry point ──────────
// The async orchestration the PURE Scheduler core (`@/lib/agents/scheduler`)
// deliberately omits: fetch the runnable Agent rows, call `tick()` to decide which
// scheduled Agents are due RIGHT NOW, and enqueue a Run for each. See design.md
// → §2.4 "Triggers and scheduling" and Requirements 1.4, 1.6, 7.11.
//
// ── WHY A ROUTE (no in-process timer) ────────────────────────────────────────
// Always-on scheduling needs a real worker/cron — Next.js route handlers are
// request-scoped and cannot reliably fire timers. There is intentionally NO
// `setInterval`/`setTimeout` loop anywhere in the agent stack: scheduling is driven
// ONLY by (a) an external cron service hitting THIS route on a cadence (e.g. every
// minute) and (b) opportunistic post-run reactive chaining in `/api/agents/[id]/run`.
//
// ── SECURITY (read me) ───────────────────────────────────────────────────────
// This endpoint EXECUTES Agent Runs across ALL users (it is a system cron, not a
// user session), so it is NOT Clerk-authed. It is protected ONLY by a shared
// secret (`SCHEDULER_CRON_SECRET`):
//   • secret UNSET/empty  → the endpoint is DISABLED (503) — fail safe, never runs
//                            unprotected.
//   • caller MUST present the secret via `Authorization: Bearer <secret>`. A
//     `?key=` query fallback exists for DEV ONLY (cron services that cannot set
//     headers) and is REJECTED in production — query strings are commonly logged
//     by proxies/CDNs, so the run-executing secret must never travel in a URL.
//   • a mismatch → 401. The secret is compared with a length-safe constant-time
//     equality and is NEVER logged.
//   • a lightweight per-instance rate limit throttles brute-force attempts and
//     caps authorized invocations (a backstop layered on the per-Run/Agent/Squad
//     budget guard, which is the real cost ceiling).
// Treat the secret like any other credential: anyone holding it can trigger Runs.
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Agent, AgentRun } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { runAgentOnce } from '@/lib/agents/run-agent'
import { tick, type SchedulableAgent } from '@/lib/agents/scheduler'

// This route must never be statically prerendered — it has side effects and is
// gated on a runtime env var + request headers.
export const dynamic = 'force-dynamic'
// Mongoose + crypto need the Node runtime (never edge).
export const runtime = 'nodejs'

/**
 * Length-safe constant-time-ish string compare. Avoids the early-exit timing leak
 * of `===` for the secret check. Returns false immediately on a length mismatch
 * (length is not itself secret here) and otherwise XORs every char code so the
 * loop runs to completion regardless of where the first difference is.
 */
function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Extract the caller-presented secret. The `Authorization: Bearer <secret>`
 * header is ALWAYS accepted. The `?key=` query fallback is accepted ONLY outside
 * production (`NODE_ENV !== 'production'`) — query strings leak into proxy/CDN
 * access logs, so a production caller must use the header (Finding #1).
 */
function presentedSecret(req: NextRequest): string | null {
  const authz = req.headers.get('authorization')
  if (authz) {
    const m = /^Bearer\s+(.+)$/i.exec(authz.trim())
    if (m) return m[1].trim()
  }
  // Dev-only convenience: never trust a URL-borne secret in production.
  if (process.env.NODE_ENV !== 'production') {
    const key = req.nextUrl.searchParams.get('key')
    if (key && key.length > 0) return key
  }
  return null
}

// ── Lightweight per-instance rate limit (Finding #2) ──────────────────────────
// An in-memory fixed-window limiter keyed by client IP. This is a brute-force +
// invocation-amplification backstop, NOT the cost ceiling (the three-level Budget
// guard in `runAgentOnce` is). It is per-instance (resets on redeploy and is not
// shared across serverless instances) — deliberately simple; a distributed limiter
// is later infra. A legitimate once-a-minute cron stays far under the limit.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_DEFAULT_MAX = 12
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

/** The configured per-window cap, read per-call so ops can tune it without a redeploy. */
function rateLimitMax(): number {
  const n = Number(process.env.SCHEDULER_TICK_RATE_LIMIT)
  return Number.isFinite(n) && n > 0 ? n : RATE_LIMIT_DEFAULT_MAX
}

/** The client IP for rate-limit keying (best-effort; falls back to a shared key). */
function clientKey(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

/**
 * Fixed-window check. Returns `true` when the caller is WITHIN budget (allowed),
 * `false` when the window cap is exceeded. Total/never-throws. Prunes its own
 * expired buckets opportunistically so the map cannot grow unbounded.
 */
function withinRateLimit(key: string, now: number): boolean {
  const max = rateLimitMax()
  // Opportunistic prune of expired buckets (keeps the map small).
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
 * POST /api/agents/scheduler/tick — run one scheduler tick for the whole system.
 *
 * Protected by the `SCHEDULER_CRON_SECRET` shared secret (see file header).
 * On success: fetch every runnable scheduling candidate ACROSS USERS, resolve each
 * Agent's most-recent Run time for the cron double-fire guard, call the pure
 * `tick()`, and enqueue a scheduled Run for each due Agent through the SAME
 * `runAgentOnce` spine the manual route uses. One Agent's failure never aborts the
 * batch. Returns a summary `{ scheduled, started, ... }`.
 */
export async function POST(req: NextRequest) {
  // ── Rate limit (Finding #2) ──────────────────────────────────────────────────
  // Throttle BEFORE the secret compare so brute-force attempts are capped too. A
  // backstop layered on the Budget guard; a once-a-minute cron is well under it.
  if (!withinRateLimit(clientKey(req), Date.now())) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // ── Shared-secret gate ──────────────────────────────────────────────────────
  const secret = process.env.SCHEDULER_CRON_SECRET
  if (!secret || secret.length === 0) {
    // Fail safe: unconfigured ⇒ disabled. Never run unprotected.
    return NextResponse.json({ error: 'Scheduler not configured' }, { status: 503 })
  }

  const presented = presentedSecret(req)
  if (!presented || !safeEqual(presented, secret)) {
    // Never log the secret or the presented value.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await connectDB()
    const now = new Date()

    // Fetch ALL runnable scheduling candidates across every user (system cron).
    // Exclude paused/retired + budget-paused up front; the pure matcher re-checks
    // runnability and that the schedule is a due `scheduled` cron.
    const rows = await Agent.find(
      { lifecycle: { $nin: ['pause', 'retire'] }, budgetPaused: { $ne: true } },
      '_id userId schedule lifecycle budgetPaused',
    ).lean()

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, scheduled: 0, started: [] })
    }

    // Resolve each Agent's most-recent Run time (`lastRunAt`) for the cron
    // double-fire guard (so an Agent already run this minute is not re-fired). One
    // lean aggregate over AgentRun keyed by agentId → max(finishedAt/startedAt).
    const lastRunByAgent = await resolveLastRunAt(rows.map((r) => r._id))

    const candidates: SchedulableAgent[] = rows.map((r) => ({
      id: String(r._id),
      lifecycle: r.lifecycle,
      budgetPaused: r.budgetPaused === true,
      schedule: r.schedule,
      lastRunAt: lastRunByAgent.get(String(r._id)) ?? null,
    }))

    // No event → only `scheduledDue` is computed (reactive chaining is the run
    // route's job). The pure core decides; this route performs the I/O.
    const { scheduledDue } = tick({ agents: candidates, now })

    const started: string[] = []
    const blocked: Array<{ agentId: string; reason: string }> = []
    const failed: string[] = []

    // Enqueue a scheduled Run per due Agent. Wrap each so one failure never aborts
    // the batch (the whole route must never throw — Req 1.4 reliability).
    for (const due of scheduledDue) {
      const agentId = due.id
      try {
        const cron = due.schedule?.kind === 'scheduled' ? due.schedule.cron : ''
        const agent = await Agent.findOne({ _id: agentId })
        if (!agent) continue
        const result = await runAgentOnce(agent, { kind: 'scheduled', cron })
        if (result.status === 'ok') started.push(agentId)
        else if (result.status === 'blocked') blocked.push({ agentId, reason: result.reason })
        else failed.push(agentId)
      } catch (oneErr) {
        failed.push(agentId)
        agentLog.error('[agents/scheduler/tick] agent run failed', oneErr)
      }
    }

    return NextResponse.json({
      ok: true,
      scheduled: scheduledDue.length,
      started,
      blocked,
      failed,
    })
  } catch (err) {
    // Never leak internals/secrets; diagnostics go through the redaction logger.
    agentLog.error('[agents/scheduler/tick] tick failed', err)
    return NextResponse.json({ error: 'Scheduler tick failed' }, { status: 500 })
  }
}

/**
 * Resolve the most-recent Run time per Agent for the cron double-fire guard.
 * Returns a map of `String(agentId) → Date`. Prefers `finishedAt`; falls back to
 * `startedAt` for a still-running Run so an in-flight Run still suppresses a
 * same-minute re-fire. Best-effort: any aggregation error degrades to an empty map
 * (the matcher then relies on the minute-match alone — never throws).
 */
async function resolveLastRunAt(
  agentIds: unknown[],
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>()
  if (agentIds.length === 0) return out
  try {
    const grouped = await AgentRun.aggregate<{ _id: unknown; lastRunAt: Date }>([
      { $match: { agentId: { $in: agentIds } } },
      {
        $group: {
          _id: '$agentId',
          lastFinished: { $max: '$finishedAt' },
          lastStarted: { $max: '$startedAt' },
        },
      },
      { $project: { lastRunAt: { $ifNull: ['$lastFinished', '$lastStarted'] } } },
    ])
    for (const g of grouped) {
      if (g?._id != null && g.lastRunAt) out.set(String(g._id), new Date(g.lastRunAt))
    }
  } catch (aggErr) {
    // Non-fatal: fall back to no lastRunAt (minute-match guard still applies).
    agentLog.error('[agents/scheduler/tick] lastRunAt aggregation failed', aggErr)
  }
  return out
}
