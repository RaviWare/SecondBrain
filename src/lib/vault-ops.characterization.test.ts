// Feature: hermes-agents, Task 1.2 — CHARACTERIZATION test for the runIngest refactor.
//
// Proves the `runIngest` → `planIngest` + `applyIngestPlan` split is NON-BREAKING
// (Requirements 11.1, 11.2): the Clerk UI and `/api/agent/ingest` keep calling
// `runIngest` and observe an identical IngestResult and identical write side
// effects, while `planIngest` is provably write-free (safe for agents/dry-runs).
//
// This is a fast unit test: the LLM (`@/lib/claude`), graph wiring
// (`@/lib/auto-link`), and Mongoose models (`@/lib/models`) are stubbed with
// vi.mock so there is no live DB or live Claude. `@/lib/utils` (slugify/wordCount)
// runs for real so slug resolution matches production.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mocks (hoisted above imports by vitest) ───────────────────────────────────

vi.mock('@/lib/claude', () => ({
  ingestSource: vi.fn(),
  extractEntities: vi.fn(),
  updatePageWithNewEvidence: vi.fn(),
  fetchAndCleanUrl: vi.fn(),
  expandQuery: vi.fn(),
  queryWiki: vi.fn(),
}))

vi.mock('@/lib/auto-link', () => ({
  wireGraphBatch: vi.fn(),
}))

vi.mock('@/lib/models', () => ({
  Vault: { findOne: vi.fn(), updateOne: vi.fn() },
  Source: { create: vi.fn() },
  Page: { find: vi.fn(), findOne: vi.fn(), create: vi.fn(), updateOne: vi.fn() },
  Log: { create: vi.fn() },
  UserPlan: { findOne: vi.fn(), updateOne: vi.fn() },
}))

import {
  ingestSource,
  extractEntities,
  updatePageWithNewEvidence,
  fetchAndCleanUrl,
} from '@/lib/claude'
import { wireGraphBatch } from '@/lib/auto-link'
import { Vault, Source, Page, Log, UserPlan } from '@/lib/models'
import {
  planIngest,
  applyIngestPlan,
  runIngest,
  VaultOpError,
  type IngestInput,
} from '@/lib/vault-ops'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER = 'user_1'
const TEXT_INPUT: IngestInput = { type: 'text', text: 'some text', title: 'My Doc' }

// Deterministic LLM stub outputs.
const INGEST_PAGES = [
  { slug: 'p1', title: 'P1', type: 'concept', content: 'c', summary: 's', tags: ['t'], relatedSlugs: [] },
]
const ENTITIES = [
  { name: 'E1', slug: 'e1', type: 'person', summary: 'es', evidence: 'ev' },
]
const GRAPH_STATS = { resolved: 1, dangling: 0, backlinks: 0 }

// The full set of model WRITE methods — none of these may fire from planIngest.
const writeSpies = () => [
  Source.create,
  Page.create,
  Page.updateOne,
  Vault.updateOne,
  Log.create,
  UserPlan.updateOne,
]

// A lean()-chainable + thenable Query stub (Page.find shape in vault-ops).
function leanChain<T>(result: T) {
  const chain: Record<string, unknown> = {}
  chain.sort = () => chain
  chain.limit = () => chain
  chain.lean = () => Promise.resolve(result)
  chain.then = (onFulfilled: (v: T) => unknown) => Promise.resolve(result).then(onFulfilled)
  return chain
}

/** Re-establish the default (happy-path, pro-plan, empty-vault) mock behaviors. */
function setupDefaults() {
  vi.mocked(ingestSource).mockResolvedValue({ pages: structuredClone(INGEST_PAGES), tokensUsed: 10 } as never)
  vi.mocked(extractEntities).mockResolvedValue({ entities: structuredClone(ENTITIES), tokensUsed: 5 } as never)
  vi.mocked(updatePageWithNewEvidence).mockResolvedValue({ updatedContent: 'merged', tokensUsed: 3 } as never)
  vi.mocked(fetchAndCleanUrl).mockResolvedValue({ title: 'Fetched', content: 'web text' } as never)

  vi.mocked(wireGraphBatch).mockResolvedValue({ ...GRAPH_STATS } as never)

  vi.mocked(Vault.findOne).mockResolvedValue({ _id: 'v1' } as never)
  vi.mocked(Vault.updateOne).mockResolvedValue({} as never)
  vi.mocked(Source.create).mockResolvedValue({ _id: 'src1' } as never)
  vi.mocked(Page.find).mockReturnValue(leanChain([]) as never)
  vi.mocked(Page.findOne).mockResolvedValue(null as never)
  vi.mocked(Page.create).mockResolvedValue({ _id: 'page1' } as never)
  vi.mocked(Page.updateOne).mockResolvedValue({} as never)
  vi.mocked(Log.create).mockResolvedValue({} as never)
  // Pro plan by default so the free-plan limit check passes.
  vi.mocked(UserPlan.findOne).mockResolvedValue({ plan: 'pro' } as never)
  vi.mocked(UserPlan.updateOne).mockResolvedValue({} as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  setupDefaults()
})

describe('vault-ops runIngest refactor — characterization (Req 11.1, 11.2)', () => {
  it('planIngest performs ZERO writes (pure plan, safe for agents/dry-runs)', async () => {
    const plan = await planIngest(USER, TEXT_INPUT)

    // It resolves a usable IngestPlan...
    expect(plan.pageOps).toHaveLength(1)
    expect(plan.entityOps).toHaveLength(1)
    expect(plan.expectedGraphSlugs).toEqual(['p1', 'e1'])
    expect(plan.resultPages).toEqual([{ slug: 'p1', title: 'P1', type: 'concept' }])

    // ...but it touched NONE of the model write methods. This is the core
    // "propose-never-write" guarantee for the planner.
    for (const spy of writeSpies()) {
      expect(spy).not.toHaveBeenCalled()
    }
    // wireGraphBatch (a write-path side effect) must also not fire during planning.
    expect(wireGraphBatch).not.toHaveBeenCalled()
  })

  it('applyIngestPlan is the write path: Source/Page creates + graph + Vault/Log/UserPlan', async () => {
    const plan = await planIngest(USER, TEXT_INPUT)
    vi.clearAllMocks() // isolate the apply-phase write assertions from planning reads
    setupDefaults()

    const result = await applyIngestPlan(USER, plan)

    // Writes happened here, in applyIngestPlan.
    expect(Source.create).toHaveBeenCalledTimes(1)
    // One create for the wiki page + one create for the entity page.
    expect(Page.create).toHaveBeenCalledTimes(2)
    expect(Page.updateOne).not.toHaveBeenCalled()
    expect(wireGraphBatch).toHaveBeenCalledTimes(1)
    expect(wireGraphBatch).toHaveBeenCalledWith(USER, 'v1', ['p1', 'e1'])
    expect(Vault.updateOne).toHaveBeenCalledTimes(1)
    expect(Log.create).toHaveBeenCalledTimes(1)
    expect(UserPlan.updateOne).toHaveBeenCalledTimes(1)

    // ...and the returned IngestResult is exactly the unchanged public shape.
    // tokensUsed = 10 (ingestSource) + 5 (extractEntities); no merge tokens
    // because both ops are creates (Page.findOne → null), so
    // updatePageWithNewEvidence is never invoked.
    expect(result).toEqual({
      success: true,
      pages: [{ slug: 'p1', title: 'P1', type: 'concept' }],
      entitiesEnriched: 1,
      graph: GRAPH_STATS,
      tokensUsed: 15,
    })

    // The Log is attributed to a normal ingest (no agent actor).
    expect(vi.mocked(Log.create).mock.calls[0][0]).toMatchObject({ operation: 'ingest' })
  })

  it('runIngest === planIngest then applyIngestPlan (composition intact, same result)', async () => {
    // Direct path used by the Clerk UI and /api/agent/ingest.
    const direct = await runIngest(USER, TEXT_INPUT)

    vi.clearAllMocks() // reset write spies between the two paths
    setupDefaults()

    // Explicit two-step composition.
    const plan = await planIngest(USER, TEXT_INPUT)
    const composed = await applyIngestPlan(USER, plan)

    // runIngest returns exactly what applyIngestPlan(await planIngest(...)) returns.
    expect(direct).toEqual(composed)
    expect(direct).toEqual({
      success: true,
      pages: [{ slug: 'p1', title: 'P1', type: 'concept' }],
      entitiesEnriched: 1,
      graph: GRAPH_STATS,
      tokensUsed: 15,
    })
  })

  it('free-plan limit (403) throws from planIngest BEFORE any write', async () => {
    vi.mocked(UserPlan.findOne).mockResolvedValue({ plan: 'free', ingestsThisMonth: 25 } as never)

    const err = await planIngest(USER, TEXT_INPUT).catch((e) => e)
    expect(err).toBeInstanceOf(VaultOpError)
    expect((err as VaultOpError).status).toBe(403)

    // The limit is enforced before reading the vault or performing any write.
    expect(Vault.findOne).not.toHaveBeenCalled()
    for (const spy of writeSpies()) {
      expect(spy).not.toHaveBeenCalled()
    }
    expect(wireGraphBatch).not.toHaveBeenCalled()
  })

  it('free-plan limit (403) also propagates through runIngest before any write', async () => {
    vi.mocked(UserPlan.findOne).mockResolvedValue({ plan: 'free', ingestsThisMonth: 25 } as never)

    const err = await runIngest(USER, TEXT_INPUT).catch((e) => e)
    expect(err).toBeInstanceOf(VaultOpError)
    expect((err as VaultOpError).status).toBe(403)

    for (const spy of writeSpies()) {
      expect(spy).not.toHaveBeenCalled()
    }
    expect(wireGraphBatch).not.toHaveBeenCalled()
  })
})
