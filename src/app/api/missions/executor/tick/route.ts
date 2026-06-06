// ── /api/missions/executor/tick — protected external-cron entry point ─────────
// The async orchestration that advances RUNNING Missions: drive each running
// Mission forward by one `runMissionTick(missionId)` — the executor's I/O driver
// that loads the Mission + its MissionTasks, evaluates the safety gate, and runs the
// next ready Mission_Tasks through the SINGLE audited Run path (`runAgentOnce`). See
// design.md → Architecture "Execution driving model (honest infra note)" and
// Requirements 4.1, 4.2, 4.7.
//
// ── WHY A ROUTE (no in-process timer) ────────────────────────────────────────
// Mirroring the scheduler's documented approach, there is intentionally NO
// `setInterval`/`setTimeout` loop anywhere in the mission layer — Next.js route
// handlers are request-scoped and cannot reliably fire timers. A running Mission is
// advanced ONLY by (a) an external cron service hitting THIS route on a cadence
// (e.g. every minute) and (b) OPPORTUNISTIC post-run chaining: after a Mission_Task
// Run reaches a terminal state, the executor/run path re-runs a tick for that
// mission to start newly-unblocked tasks immediately (the reactive Handoff path,
// gated by the scheduler's terminal gate). That opportunistic call is wired by the
// executor/run path itself — NOT by this route; this route is the external-cron
// entry point (Req 4.7). A dedicated long-lived worker is later infrastructure, not
// a change to this logic.
//
// ── SECURITY (read me) ───────────────────────────────────────────────────────
// This endpoint EXECUTES Mission_Task Runs across ALL users (it is a system cron,
// NOT a Clerk user session), so it is deliberately NOT Clerk-authed. It is protected
// ONLY by the shared `SCHEDULER_CRON_SECRET` — the SAME secret + constant-time
// compare + rate-limit pattern as `/api/agents/scheduler/tick`:
//   • secret UNSET/empty  → the endpoint is DISABLED (503) — fail safe, never runs
//                            unprotected.
//   • caller MUST present the secret via `Authorization: Bearer <secret>`. A
//     `?key=` query fallback exists for DEV ONLY (cron services that cannot set
//     headers) and is REJECTED in production — query strings are commonly logged by
//     proxies/CDNs, so the run-executing secret must never travel in a URL.
//   • a mismatch → 401. The secret is compared with a length-safe constant-time
//     equality and is NEVER logged (nor is any presented token / brain token).
//   • a lightweight per-instance rate limit throttles brute-force attempts and caps
//     authorized invocations (a backstop layered on the per-Run/Agent/Squad budget
//     guard + the Mission_Budget ceiling, which are the real cost ceilings).
// Treat the secret like any other credential: anyone holding it can trigger Runs.
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Mission } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { runMissionTick, type MissionTickResult } from '@/lib/agents/mission/executor'

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
 * access logs, so a production caller must use the header.
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

// ── Lightweight per-instance rate limit ───────────────────────────────────────
// An in-memory fixed-window limiter keyed by client IP. This is a brute-force +
// invocation-amplification backstop, NOT the cost ceiling (the three-level Budget
// guard in `runAgentOnce` + the Mission_Budget ceiling are). It is per-instance
// (resets on redeploy and is not shared across serverless instances) — deliberately
// simple; a distributed limiter is later infra. A legitimate once-a-minute cron
// stays far under the limit.
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
 * Resolve an optional targeted `missionId` from the request. Supports a JSON body
 * `{ "missionId": "..." }` (preferred) and a `?missionId=` query fallback for cron
 * services that cannot send a body. Returns `null` when none is supplied (the
 * default batch behavior). Best-effort/never-throws — a malformed body degrades to
 * the query fallback, then to `null`.
 */
async function targetedMissionId(req: NextRequest): Promise<string | null> {
  // Prefer the JSON body, but a cron POST often has an empty body — tolerate that.
  try {
    const body = (await req.json()) as unknown
    if (body && typeof body === 'object' && 'missionId' in body) {
      const id = (body as { missionId?: unknown }).missionId
      if (typeof id === 'string' && id.trim().length > 0) return id.trim()
    }
  } catch {
    // No / invalid JSON body — fall through to the query fallback.
  }
  const q = req.nextUrl.searchParams.get('missionId')
  if (q && q.trim().length > 0) return q.trim()
  return null
}

/**
 * POST /api/missions/executor/tick — advance running Missions by one executor tick.
 *
 * Protected by the `SCHEDULER_CRON_SECRET` shared secret (see file header). On an
 * authorized POST, two shapes are supported:
 *   (a) TARGETED — when the body/query supplies a `missionId`, advance ONLY that
 *       mission via `runMissionTick(missionId)` (an optional targeted tick).
 *   (b) BATCH (default cron behavior) — load every Mission in lifecycle `running`
 *       ACROSS USERS (this is a system cron, NOT Clerk-authed) and call
 *       `runMissionTick(mission._id)` for each, isolating each in its OWN try/catch
 *       so one mission's failure never aborts the batch (mirrors the scheduler
 *       tick's per-agent loop). `runMissionTick` itself never throws — it returns a
 *       structured `MissionTickResult` — but the per-mission try/catch is a belt-
 *       and-braces guard against any unexpected I/O error.
 * Returns a summary `{ ok, ticked, results }` where `ticked` is the number of
 * missions advanced and `results` is each mission's `MissionTickResult`.
 */
export async function POST(req: NextRequest) {
  // ── Rate limit ───────────────────────────────────────────────────────────────
  // Throttle BEFORE the secret compare so brute-force attempts are capped too. A
  // backstop layered on the Budget guards; a once-a-minute cron is well under it.
  if (!withinRateLimit(clientKey(req), Date.now())) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // ── Shared-secret gate ──────────────────────────────────────────────────────
  const secret = process.env.SCHEDULER_CRON_SECRET
  if (!secret || secret.length === 0) {
    // Fail safe: unconfigured ⇒ disabled. Never run unprotected.
    return NextResponse.json({ error: 'Executor not configured' }, { status: 503 })
  }

  const presented = presentedSecret(req)
  if (!presented || !safeEqual(presented, secret)) {
    // Never log the secret or the presented value.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await connectDB()

    // ── Shape (a): targeted single-mission tick ─────────────────────────────────
    const targeted = await targetedMissionId(req)
    if (targeted) {
      const result = await runMissionTick(targeted)
      return NextResponse.json({ ok: true, ticked: 1, results: [result] })
    }

    // ── Shape (b): batch tick of every RUNNING mission (default cron behavior) ───
    // System cron: load running missions ACROSS ALL USERS (not user-scoped). Project
    // only `_id` — we never read or log any secret/token here. A non-running mission
    // is intentionally skipped: the pure executor would no-op it anyway.
    const running = await Mission.find({ lifecycle: 'running' }, '_id').lean()

    if (running.length === 0) {
      return NextResponse.json({ ok: true, ticked: 0, results: [] })
    }

    const results: MissionTickResult[] = []
    for (const m of running) {
      const missionId = String(m._id)
      try {
        results.push(await runMissionTick(missionId))
      } catch (oneErr) {
        // `runMissionTick` never throws, but isolate any unexpected I/O error so one
        // mission's failure never aborts the batch (Req 4.5 discipline at the cron
        // level; mirrors the scheduler tick's per-agent try/catch). Never log secrets.
        agentLog.error('[missions/executor/tick] mission tick failed', oneErr)
        results.push({
          missionId,
          ok: false,
          started: [],
          completed: [],
          failed: [],
          lifecycle: 'running',
          error: 'Mission tick failed',
        })
      }
    }

    return NextResponse.json({ ok: true, ticked: results.length, results })
  } catch (err) {
    // Never leak internals/secrets; diagnostics go through the redaction logger.
    agentLog.error('[missions/executor/tick] tick failed', err)
    return NextResponse.json({ error: 'Executor tick failed' }, { status: 500 })
  }
}
