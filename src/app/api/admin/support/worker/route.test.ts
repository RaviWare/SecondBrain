// Security-gate tests for the protected support-worker cron route.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }))
vi.mock('@/lib/agents/redact', () => ({ agentLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/support/worker', () => ({
  processOpenTickets: vi.fn(async () => ({ ok: true, processed: 0, retried: [], escalated: [], resolved: [] })),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'

const SECRET = 'super-secret-cron-value-123456'

let ipCounter = 0
function makeReq(opts: { auth?: string; key?: string; ip?: string } = {}): NextRequest {
  ipCounter += 1
  const ip = opts.ip ?? `10.2.0.${ipCounter}`
  const url = opts.key
    ? `https://app.test/api/admin/support/worker?key=${encodeURIComponent(opts.key)}`
    : 'https://app.test/api/admin/support/worker'
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

describe('support/worker — shared-secret gate', () => {
  it('503 when secret unset', async () => {
    delete process.env.SCHEDULER_CRON_SECRET
    expect((await POST(makeReq({ auth: `Bearer ${SECRET}` }))).status).toBe(503)
  })
  it('401 on mismatch', async () => {
    expect((await POST(makeReq({ auth: 'Bearer nope-but-long-enough-to-compare00' }))).status).toBe(401)
  })
  it('401 when nothing presented', async () => {
    expect((await POST(makeReq())).status).toBe(401)
  })
  it('200 with valid Bearer', async () => {
    const res = await POST(makeReq({ auth: `Bearer ${SECRET}` }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })
  it('rejects ?key= in production', async () => {
    process.env.NODE_ENV = 'production'
    expect((await POST(makeReq({ key: SECRET }))).status).toBe(401)
  })
  it('rate-limits per IP', async () => {
    process.env.SCHEDULER_TICK_RATE_LIMIT = '2'
    const ip = '172.30.0.9'
    expect((await POST(makeReq({ auth: `Bearer ${SECRET}`, ip }))).status).toBe(200)
    expect((await POST(makeReq({ auth: `Bearer ${SECRET}`, ip }))).status).toBe(200)
    expect((await POST(makeReq({ auth: `Bearer ${SECRET}`, ip }))).status).toBe(429)
  })
})
