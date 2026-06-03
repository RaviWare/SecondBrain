// Orchestration tests for runUpstreamCheck with mocked DB + injected fetcher.
// Verifies: first run adopts baseline silently (no notification), a later advance
// writes a deduped notification + advances the marker, and a fetch failure records
// lastError without throwing.

import { describe, it, expect, beforeEach, vi } from 'vitest'

const watchStore: { current: Record<string, unknown> | null } = { current: null }
const notifUpserts: Array<Record<string, unknown>> = []

vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn(async () => undefined) }))
vi.mock('@/lib/agents/redact', () => ({ agentLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/upstream/webhook', () => ({ notifyAdminWebhook: vi.fn(async () => true) }))
vi.mock('@/lib/models', () => ({
  UpstreamWatch: {
    findOne: vi.fn(() => ({ lean: vi.fn(async () => watchStore.current) })),
    updateOne: vi.fn(async (_q: unknown, update: Record<string, { [k: string]: unknown }>) => {
      const set = (update.$set ?? {}) as Record<string, unknown>
      const onInsert = (update.$setOnInsert ?? {}) as Record<string, unknown>
      watchStore.current = { ...(watchStore.current ?? {}), ...onInsert, ...set }
      return { acknowledged: true }
    }),
  },
  AdminNotification: {
    updateOne: vi.fn(async (q: { dedupeKey: string }, update: Record<string, Record<string, unknown>>) => {
      notifUpserts.push({ dedupeKey: q.dedupeKey, ...(update.$setOnInsert ?? {}) })
      return { upsertedCount: 1 }
    }),
  },
}))

import { runUpstreamCheck } from './check'
import type { FetchResult } from './github'

function ok(partial: Partial<import('./monitor').UpstreamState>): () => Promise<FetchResult> {
  return async () => ({
    ok: true,
    state: {
      releaseTag: null, releaseName: null, releasePublishedAt: null, releaseUrl: null,
      commitSha: null, commitDate: null, commitSummary: null, ...partial,
    },
  })
}

beforeEach(() => {
  watchStore.current = null
  notifUpserts.length = 0
  vi.clearAllMocks()
})

describe('runUpstreamCheck', () => {
  it('first run adopts the baseline silently (no notification)', async () => {
    const r = await runUpstreamCheck('owner/repo', ok({ releaseTag: 'v1', commitSha: 'aaaaaaa' }))
    expect(r.ok).toBe(true)
    expect(r.changed).toBe(false)
    expect(r.baseline).toBe(true)
    expect(notifUpserts.length).toBe(0)
    expect(watchStore.current?.releaseTag).toBe('v1')
  })

  it('alerts on a later advance and advances the marker', async () => {
    await runUpstreamCheck('owner/repo', ok({ releaseTag: 'v1', commitSha: 'aaaaaaa' })) // baseline
    const r = await runUpstreamCheck('owner/repo', ok({ releaseTag: 'v2', commitSha: 'aaaaaaa' }))
    expect(r.changed).toBe(true)
    expect(r.kinds).toContain('release')
    expect(notifUpserts.length).toBe(1)
    expect(String(notifUpserts[0].dedupeKey)).toContain('v2')
    expect(watchStore.current?.releaseTag).toBe('v2')
  })

  it('re-running with the same state does not create a second notification', async () => {
    await runUpstreamCheck('owner/repo', ok({ releaseTag: 'v1', commitSha: 'aaaaaaa' })) // baseline
    await runUpstreamCheck('owner/repo', ok({ releaseTag: 'v2', commitSha: 'aaaaaaa' })) // alert
    notifUpserts.length = 0
    const r = await runUpstreamCheck('owner/repo', ok({ releaseTag: 'v2', commitSha: 'aaaaaaa' }))
    expect(r.changed).toBe(false)
    expect(notifUpserts.length).toBe(0)
  })

  it('records lastError and does not throw on fetch failure', async () => {
    const r = await runUpstreamCheck('owner/repo', async () => ({ ok: false, error: 'boom' }))
    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
  })
})
