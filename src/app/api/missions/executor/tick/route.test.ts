// Security-gate tests for the protected mission executor-tick route.
//
// Mirrors `src/app/api/agents/scheduler/tick/route.test.ts` — the executor tick
// reuses the SAME `SCHEDULER_CRON_SECRET` + constant-time compare + per-IP rate
// limit posture (see the route header), so the gate is tested the same way:
//   • Finding #1 — the `?key=` query fallback is DEV-ONLY; in production the
//     secret must arrive via `Authorization: Bearer` (query strings leak to logs).
//   • Finding #2 — a per-IP fixed-window rate limit throttles brute-force +
//     invocation amplification (a backstop on the Mission_Budget / Run guards).
// Plus the pre-existing gates: 503 when unconfigured, 401 on mismatch, and the
// length-safe constant-time secret compare. And: a VALID secret actually invokes
// `runMissionTick` — targeted (a supplied `missionId`) ticks that one, batch ticks
// each running mission.
//
// The heavy collaborators (DB, models, the executor driver) are mocked — these
// tests are about the GATE, not the run mechanics. Each test uses a distinct client
// IP so the shared in-memory rate-limit map doesn't cross-talk.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── Mocks (hoisted above the SUT import) ──────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }))
vi.mock('@/lib/models', () => ({
  Mission: { find: vi.fn(() => ({ lean: vi.fn(async () => []) })) },
}))
vi.mock('@/lib/agents/redact', () => ({
  agentLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
// `runMissionTick` never throws — it resolves a structured MissionTickResult.
vi.mock('@/lib/agents/mission/executor', () => ({
  runMissionTick: vi.fn(async (missionId: string) => ({
    missionId,
    ok: true,
    started: [],
    completed: [],
    failed: [],
    lifecycle: 'running',
  })),
}))

import { NextRequest } from 'next/server'
import { Mission } from '@/lib/models'
import { runMissionTick } from '@/lib/agents/mission/executor'
import { POST } from './route'

const SECRET = 'super-secret-cron-value-123456'

let ipCounter = 0
/** Build a POST NextRequest with a UNIQUE client IP (avoids rate-limit crosstalk). */
function makeReq(opts: { auth?: string; key?: string; ip?: string; missionId?: string } = {}): NextRequest {
  ipCounter += 1
  const ip = opts.ip ?? `10.0.0.${ipCounter}`
  const params = new URLSearchParams()
  if (opts.key) params.set('key', opts.key)
  if (opts.missionId) params.set('missionId', opts.missionId)
  const qs = params.toString()
  const url = qs
    ? `https://app.test/api/missions/executor/tick?${qs}`
    : 'https://app.test/api/missions/executor/tick'
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

describe('missions/executor/tick — shared-secret gate', () => {
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

describe('missions/executor/tick — a valid secret invokes runMissionTick', () => {
  it('ticks the targeted mission when a missionId is supplied (ticked: 1)', async () => {
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}`, missionId: 'mission-123' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ticked).toBe(1)
    expect(vi.mocked(runMissionTick)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runMissionTick)).toHaveBeenCalledWith('mission-123')
  })

  it('ticks each RUNNING mission in the batch (default cron behavior)', async () => {
    vi.mocked(Mission.find).mockReturnValueOnce({
      lean: vi.fn(async () => [{ _id: 'm1' }, { _id: 'm2' }]),
    } as unknown as ReturnType<typeof Mission.find>)
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ticked).toBe(2)
    expect(vi.mocked(runMissionTick)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(runMissionTick)).toHaveBeenCalledWith('m1')
    expect(vi.mocked(runMissionTick)).toHaveBeenCalledWith('m2')
  })

  it('does not invoke runMissionTick when the secret is rejected (401)', async () => {
    const res = await POST(makeReq({ auth: 'Bearer nope-wrong-secret-000000000000' }))
    expect(res.status).toBe(401)
    expect(vi.mocked(runMissionTick)).not.toHaveBeenCalled()
  })
})

describe('missions/executor/tick — Finding #1: ?key= is dev-only', () => {
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

describe('missions/executor/tick — Finding #2: per-IP rate limit', () => {
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
