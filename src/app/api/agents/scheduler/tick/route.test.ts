// Security-gate tests for the protected scheduler tick route.
//
// Validates the auth/abuse posture hardened after the /cso review:
//   • Finding #1 — the `?key=` query fallback is DEV-ONLY; in production the
//     secret must arrive via `Authorization: Bearer` (query strings leak to logs).
//   • Finding #2 — a per-IP fixed-window rate limit throttles brute-force +
//     invocation amplification (a backstop on the Budget guard).
// Plus the pre-existing gates: 503 when unconfigured, 401 on mismatch, and the
// length-safe constant-time secret compare.
//
// The heavy collaborators (DB, models, the run spine, the pure scheduler) are
// mocked — these tests are about the GATE, not the run mechanics. Each test uses a
// distinct client IP so the shared in-memory rate-limit map doesn't cross-talk.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Mocks (hoisted above the SUT import) ──────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }))
vi.mock('@/lib/models', () => ({
  Agent: { find: vi.fn(() => ({ lean: vi.fn(async () => []) })), findOne: vi.fn(async () => null) },
  AgentRun: { aggregate: vi.fn(async () => []) },
}))
vi.mock('@/lib/agents/redact', () => ({
  agentLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/lib/agents/run-agent', () => ({ runAgentOnce: vi.fn(async () => ({ status: 'ok' })) }))
vi.mock('@/lib/agents/scheduler', () => ({ tick: vi.fn(() => ({ scheduledDue: [], reactiveMatched: [] })) }))

import { NextRequest } from 'next/server'
import { POST } from './route'

const SECRET = 'super-secret-cron-value-123456'

let ipCounter = 0
/** Build a POST NextRequest with a UNIQUE client IP (avoids rate-limit crosstalk). */
function makeReq(opts: { auth?: string; key?: string; ip?: string } = {}): NextRequest {
  ipCounter += 1
  const ip = opts.ip ?? `10.0.0.${ipCounter}`
  const url = opts.key
    ? `https://app.test/api/agents/scheduler/tick?key=${encodeURIComponent(opts.key)}`
    : 'https://app.test/api/agents/scheduler/tick'
  const headers: Record<string, string> = { 'x-forwarded-for': ip }
  if (opts.auth) headers.authorization = opts.auth
  return new NextRequest(url, { method: 'POST', headers })
}

const ENV_KEYS = ['SCHEDULER_CRON_SECRET', 'NODE_ENV', 'SCHEDULER_TICK_RATE_LIMIT'] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  vi.clearAllMocks()
  saved = {}
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  process.env.SCHEDULER_CRON_SECRET = SECRET
  process.env.NODE_ENV = 'test'
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('scheduler/tick — shared-secret gate', () => {
  it('returns 503 when SCHEDULER_CRON_SECRET is unset (fail safe, never runs unprotected)', async () => {
    delete process.env.SCHEDULER_CRON_SECRET
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }))
    expect(res.status).toBe(503)
  })

  it('returns 401 when the presented secret does not match', async () => {
    const res = await POST(makeReq({ auth: 'Bearer wrong-value-of-same-ish-length-000' }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when no secret is presented at all', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('accepts the secret via the Authorization: Bearer header (200)', async () => {
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

describe('scheduler/tick — Finding #1: ?key= is dev-only', () => {
  it('accepts ?key= outside production (NODE_ENV=test)', async () => {
    process.env.NODE_ENV = 'test'
    const res = await POST(makeReq({ key: SECRET }))
    expect(res.status).toBe(200)
  })

  it('REJECTS ?key= in production — the secret must use the header (401)', async () => {
    process.env.NODE_ENV = 'production'
    const res = await POST(makeReq({ key: SECRET }))
    expect(res.status).toBe(401)
  })

  it('still accepts the header in production', async () => {
    process.env.NODE_ENV = 'production'
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }))
    expect(res.status).toBe(200)
  })
})

describe('scheduler/tick — Finding #2: per-IP rate limit', () => {
  it('throttles a single IP after the window cap is exceeded (429)', async () => {
    process.env.SCHEDULER_TICK_RATE_LIMIT = '3'
    const ip = '172.16.0.99'
    // First 3 (valid secret) succeed.
    for (let i = 0; i < 3; i++) {
      const ok = await POST(makeReq({ auth: `Bearer ${SECRET}`, ip }))
      expect(ok.status).toBe(200)
    }
    // 4th from the SAME ip is throttled before the secret check.
    const limited = await POST(makeReq({ auth: `Bearer ${SECRET}`, ip }))
    expect(limited.status).toBe(429)
  })

  it('throttles brute-force attempts (bad secret) too — rate limit precedes auth', async () => {
    process.env.SCHEDULER_TICK_RATE_LIMIT = '2'
    const ip = '172.16.0.100'
    expect((await POST(makeReq({ auth: 'Bearer nope', ip }))).status).toBe(401)
    expect((await POST(makeReq({ auth: 'Bearer nope', ip }))).status).toBe(401)
    // Third attempt is rate-limited, not just 401 — caps the brute-force surface.
    expect((await POST(makeReq({ auth: 'Bearer nope', ip }))).status).toBe(429)
  })

  it('does not let one IP starve another (separate buckets)', async () => {
    process.env.SCHEDULER_TICK_RATE_LIMIT = '1'
    const a = await POST(makeReq({ auth: `Bearer ${SECRET}`, ip: '192.168.1.1' }))
    const b = await POST(makeReq({ auth: `Bearer ${SECRET}`, ip: '192.168.1.2' }))
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
  })
})
