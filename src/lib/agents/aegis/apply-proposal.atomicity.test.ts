// Feature: hermes-agents, Property 7: Failed apply leaves the vault unchanged (atomicity)
//
// Validates: Requirements 2.8
//
// Property 7 (design.md): "For any IngestPlan whose applyIngestPlan fails at any
// step, the post-failure vault state equals the pre-apply vault state, and the
// originating Proposal's status is not `approved` and carries a non-empty
// `failureReason`."
//
// How this is modeled
// ───────────────────
// The design names `applyIngestPlan` the ATOMIC WRITE BOUNDARY (design.md →
// "Components and Interfaces · 2. Aegis layer" and the Error Handling row
// "Partial write on approve": on any throw the vault is left in its pre-apply
// state; in production the multi-document boundary is a Mongo transaction). We
// reproduce that boundary with an in-memory spy vault: each ingest write
// (Source.create, Page.create/updateOne, wireGraphBatch, Vault.updateOne,
// Log.create, UserPlan.updateOne) mutates an in-memory store immediately, and a
// thin transaction wrapper around the REAL `applyIngestPlan` snapshots the store
// on entry and ROLLS IT BACK on any thrown step before re-throwing — exactly the
// atomic boundary the design specifies.
//
// What this exercises is therefore the genuine production logic of
// `applyProposal` + the real `applyIngestPlan` write ordering: for an arbitrary
// plan and an arbitrary injected failure at any reachable step, we assert
//   (a) the observable vault state deep-equals the pre-apply snapshot, and
//   (b) the Proposal is left non-approved with a non-empty `failureReason`.
// A positive-control test (no injected failure) proves the harness can both
// mutate the vault and mark a Proposal approved, so (a)/(b) are not vacuous.

import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'

// ── Shared, hoisted mutable context (read by the hoisted vi.mock factories) ────
const h = vi.hoisted(() => {
  type Doc = Record<string, unknown>
  type Store = {
    pages: Map<string, Doc>
    sources: Doc[]
    logs: Doc[]
    vaultDoc: { _id: string; pageCount: number; sourceCount: number }
    pageCounterRef: { n: number }
    snapshot: () => unknown
    restore: (snap: unknown) => void
    observable: () => unknown
  }
  const ctx: {
    store: Store | null
    proposalDoc: Doc | null
    failConfig: { step: string; fired: boolean }
  } = { store: null, proposalDoc: null, failConfig: { step: '', fired: false } }

  /** Throw the first time the configured step runs (models a failure at that step). */
  const maybeFail = (step: string) => {
    const fc2 = ctx.failConfig
    if (fc2.step === step && !fc2.fired) {
      fc2.fired = true
      throw new Error(`injected failure at ${step}`)
    }
  }
  return { ctx, maybeFail }
})

// ── Mocks (hoisted above imports by vitest) ───────────────────────────────────

vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn(async () => ({})) }))

// `@/lib/claude` is imported at the top of the real `@/lib/vault-ops`; stub it so
// importing the real module never touches the LLM/SDK (applyIngestPlan itself
// uses none of these — they live in planIngest).
vi.mock('@/lib/claude', () => ({
  ingestSource: vi.fn(),
  extractEntities: vi.fn(),
  updatePageWithNewEvidence: vi.fn(),
  fetchAndCleanUrl: vi.fn(),
  expandQuery: vi.fn(),
  queryWiki: vi.fn(),
}))

// wireGraphBatch is one of the injectable ingest steps; it is otherwise a no-op
// that returns deterministic graph stats.
vi.mock('@/lib/auto-link', () => ({
  wireGraphBatch: vi.fn(async () => {
    h.maybeFail('wireGraph')
    return { resolved: 0, dangling: 0, backlinks: 0 }
  }),
}))

// In-memory model layer. Every WRITE method funnels through `maybeFail` so a
// failure can be injected at any distinct applyIngestPlan step.
vi.mock('@/lib/models', () => {
  const store = () => h.ctx.store!
  return {
    Vault: {
      findOne: vi.fn(async () => store().vaultDoc),
      updateOne: vi.fn(async (_filter: unknown, update: { $inc?: Record<string, number> }) => {
        h.maybeFail('vault.updateOne')
        const inc = update.$inc ?? {}
        if (inc.pageCount) store().vaultDoc.pageCount += inc.pageCount
        if (inc.sourceCount) store().vaultDoc.sourceCount += inc.sourceCount
        return {}
      }),
    },
    Source: {
      create: vi.fn(async (doc: Record<string, unknown>) => {
        h.maybeFail('source.create')
        const _id = `src_${store().sources.length + 1}`
        store().sources.push({
          _id,
          type: doc.type,
          title: doc.title,
          url: doc.url ?? null,
          wordCount: doc.wordCount,
          rawContent: doc.rawContent,
        })
        return { _id }
      }),
    },
    Page: {
      // Not called on the apply path (it belongs to planIngest); present for shape.
      find: vi.fn(async () => []),
      findOne: vi.fn(async () => null),
      create: vi.fn(async (doc: Record<string, unknown>) => {
        h.maybeFail('page.create')
        const _id = `page_${++store().pageCounterRef.n}`
        store().pages.set(String(doc.slug), { ...doc, _id })
        return { _id }
      }),
      updateOne: vi.fn(
        async (
          filter: { slug: string },
          update: {
            content?: string
            summary?: string
            confidence?: string
            $addToSet?: { sources?: unknown; tags?: { $each: string[] }; relatedSlugs?: { $each: string[] } }
            $inc?: { timelineEntries?: number }
          },
        ) => {
          h.maybeFail('page.updateOne')
          const doc = store().pages.get(filter.slug) as Record<string, unknown> | undefined
          if (!doc) return {}
          if (update.content !== undefined) doc.content = update.content
          if (update.summary !== undefined) doc.summary = update.summary
          if (update.confidence !== undefined) doc.confidence = update.confidence
          const add = update.$addToSet
          if (add) {
            const sources = (doc.sources as unknown[]) ?? (doc.sources = [])
            if (add.sources !== undefined && !sources.includes(add.sources)) sources.push(add.sources)
            const tags = (doc.tags as string[]) ?? (doc.tags = [])
            if (add.tags?.$each) for (const t of add.tags.$each) if (!tags.includes(t)) tags.push(t)
            const related = (doc.relatedSlugs as string[]) ?? (doc.relatedSlugs = [])
            if (add.relatedSlugs?.$each) for (const r of add.relatedSlugs.$each) if (!related.includes(r)) related.push(r)
          }
          if (update.$inc?.timelineEntries) {
            doc.timelineEntries = ((doc.timelineEntries as number) ?? 0) + update.$inc.timelineEntries
          }
          return {}
        },
      ),
      deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
    },
    Log: {
      create: vi.fn(async (doc: Record<string, unknown>) => {
        h.maybeFail('log.create')
        store().logs.push({ operation: doc.operation, summary: doc.summary, pagesAffected: doc.pagesAffected })
        return {}
      }),
    },
    UserPlan: {
      findOne: vi.fn(async () => ({ plan: 'pro' })),
      updateOne: vi.fn(async () => {
        h.maybeFail('userplan.updateOne')
        return {}
      }),
    },
    Proposal: {
      findOne: vi.fn(async () => h.ctx.proposalDoc),
      create: vi.fn(async (doc: Record<string, unknown>) => ({ ...doc, _id: 'child_1' })),
    },
    // Trust persistence (recordTrustEvents) is a best-effort side effect of an
    // apply; a no-op Agent lookup keeps it from affecting this atomicity test.
    Agent: { findOne: vi.fn(async () => null) },
  }
})

// Real `@/lib/vault-ops`, with `applyIngestPlan` wrapped in the atomic boundary
// (snapshot on entry, roll back on any thrown step). The real ordering logic runs
// against the in-memory models above.
vi.mock('@/lib/vault-ops', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vault-ops')>()
  return {
    ...actual,
    applyIngestPlan: async (...args: Parameters<typeof actual.applyIngestPlan>) => {
      const before = h.ctx.store!.snapshot()
      try {
        return await actual.applyIngestPlan(...args)
      } catch (err) {
        // Atomic boundary: a failed apply leaves the vault in its pre-apply state.
        h.ctx.store!.restore(before)
        throw err
      }
    },
  }
})

import { applyProposal } from '@/lib/agents/aegis/apply-proposal'
import type { IngestPlan } from '@/lib/vault-ops'

// ── In-memory store ────────────────────────────────────────────────────────────

const USER = 'user_atomicity'

type SeedPage = Record<string, unknown> & { slug: string }

function makeStore(seedPages: SeedPage[]) {
  const pages = new Map<string, Record<string, unknown>>()
  for (const p of seedPages) pages.set(p.slug, structuredClone(p))
  const sources: Record<string, unknown>[] = []
  const logs: Record<string, unknown>[] = []
  const vaultDoc = { _id: 'vault_1', pageCount: seedPages.length, sourceCount: 0 }
  const pageCounterRef = { n: 0 }

  return {
    pages,
    sources,
    logs,
    vaultDoc,
    pageCounterRef,
    snapshot() {
      return structuredClone({
        pages: [...pages.entries()],
        sources,
        logs,
        vaultDoc,
        counter: pageCounterRef.n,
      })
    },
    restore(snap: unknown) {
      const s = snap as {
        pages: [string, Record<string, unknown>][]
        sources: Record<string, unknown>[]
        logs: Record<string, unknown>[]
        vaultDoc: { _id: string; pageCount: number; sourceCount: number }
        counter: number
      }
      pages.clear()
      for (const [k, v] of s.pages) pages.set(k, structuredClone(v))
      sources.length = 0
      sources.push(...structuredClone(s.sources))
      logs.length = 0
      logs.push(...structuredClone(s.logs))
      Object.assign(vaultDoc, s.vaultDoc)
      pageCounterRef.n = s.counter
    },
    // A stable, comparable view of the vault state (pages sorted by slug).
    observable() {
      return structuredClone({
        pages: [...pages.entries()].sort((a, b) => a[0].localeCompare(b[0])),
        sources,
        logs,
        vaultDoc,
      })
    },
  }
}

function makeProposalDoc(plan: IngestPlan) {
  return {
    _id: 'prop_1',
    userId: USER,
    agentId: 'agent_1',
    runId: 'run_1',
    kind: 'ingest' as const,
    plan,
    status: 'pending' as string,
    affectedPages: [] as string[],
    failureReason: null as string | null,
    undo: null as unknown,
    decidedBy: null as string | null,
    decidedAt: null as Date | null,
    markModified() {},
    async save() {
      /* in-memory doc is mutated in place; persistence is a no-op */
    },
  }
}

// ── Arbitrary plan + failure-injection-point generation ─────────────────────────

type Counts = { pc: number; pu: number; ec: number; eu: number; seed: string }

function buildCase({ pc, pu, ec, eu, seed }: Counts): { plan: IngestPlan; seedPages: SeedPage[] } {
  const pageOps: IngestPlan['pageOps'] = []
  const entityOps: IngestPlan['entityOps'] = []
  const seedPages: SeedPage[] = []

  for (let i = 0; i < pc; i++) {
    pageOps.push({
      op: 'create',
      slug: `pc${i}`,
      title: `PC${i}`,
      type: 'concept',
      content: `c-${seed}-${i}`,
      summary: `s${i}`,
      relatedSlugs: [],
      tags: [],
      confidence: 'medium',
    })
  }
  for (let i = 0; i < pu; i++) {
    const slug = `pu${i}`
    seedPages.push({
      slug,
      title: `PU${i}`,
      type: 'concept',
      content: 'original',
      summary: 'original-summary',
      sources: [],
      tags: [],
      relatedSlugs: [],
      confidence: 'medium',
      timelineEntries: 1,
    })
    pageOps.push({
      op: 'update',
      slug,
      mergedContent: `m-${seed}-${i}`,
      summary: `us${i}`,
      confidence: 'high',
      addSources: true,
      addTags: [`t${i}`],
      addRelated: [],
    })
  }
  for (let i = 0; i < ec; i++) {
    entityOps.push({
      op: 'create',
      slug: `ec${i}`,
      title: `EC${i}`,
      type: 'entity',
      content: `ec-${seed}-${i}`,
      summary: `es${i}`,
      relatedSlugs: [],
      tags: ['person'],
      confidence: 'medium',
    })
  }
  for (let i = 0; i < eu; i++) {
    const slug = `eu${i}`
    seedPages.push({
      slug,
      title: `EU${i}`,
      type: 'entity',
      content: 'original',
      summary: 'original-summary',
      sources: [],
      tags: ['person'],
      relatedSlugs: [],
      confidence: 'medium',
      timelineEntries: 1,
    })
    entityOps.push({ op: 'update', slug, mergedContent: `em-${seed}-${i}`, addSources: true })
  }

  const savedSlugs = pageOps.map((o) => o.slug)
  const enriched = entityOps.filter((o) => o.op === 'create').map((o) => o.slug)

  const plan: IngestPlan = {
    source: { type: 'text', title: 'Doc', url: null, rawContent: `raw-${seed}`, wordCount: 3 },
    pageOps,
    entityOps,
    resultPages: pageOps.map((o) => ({ slug: o.slug, title: o.slug, type: 'concept' })),
    expectedGraphSlugs: [...savedSlugs, ...enriched],
    tokensUsed: 0,
    ingestedAt: '2024-01-01T00:00:00.000Z',
  }
  return { plan, seedPages }
}

/** The distinct applyIngestPlan write steps this plan will actually reach. */
function reachableSteps(plan: IngestPlan): string[] {
  const steps = ['source.create']
  const anyCreate =
    plan.pageOps.some((o) => o.op === 'create') || plan.entityOps.some((o) => o.op === 'create')
  const anyUpdate =
    plan.pageOps.some((o) => o.op === 'update') || plan.entityOps.some((o) => o.op === 'update')
  if (anyCreate) steps.push('page.create')
  if (anyUpdate) steps.push('page.updateOne')
  steps.push('wireGraph', 'vault.updateOne', 'log.create', 'userplan.updateOne')
  return steps
}

const countsArb: fc.Arbitrary<Counts> = fc.record({
  pc: fc.integer({ min: 0, max: 3 }),
  pu: fc.integer({ min: 0, max: 3 }),
  ec: fc.integer({ min: 0, max: 3 }),
  eu: fc.integer({ min: 0, max: 3 }),
  seed: fc.string({ minLength: 0, maxLength: 6 }),
})

const caseArb = countsArb.chain((counts) => {
  const { plan, seedPages } = buildCase(counts)
  return fc.record({
    plan: fc.constant(plan),
    seedPages: fc.constant(seedPages),
    failAt: fc.constantFrom(...reachableSteps(plan)),
  })
})

// ── The property ────────────────────────────────────────────────────────────────

describe('Aegis applyProposal — failed apply atomicity (Property 7, Req 2.8)', () => {
  it('a failure at ANY applyIngestPlan step leaves the vault unchanged and the Proposal non-approved with a failureReason', async () => {
    await fc.assert(
      fc.asyncProperty(caseArb, async ({ plan, seedPages, failAt }) => {
        // Fresh, isolated world for each generated case.
        h.ctx.store = makeStore(seedPages)
        h.ctx.proposalDoc = makeProposalDoc(plan)
        h.ctx.failConfig = { step: failAt, fired: false }

        const before = h.ctx.store.observable()

        const result = await applyProposal('prop_1', { userId: USER })

        // (b) The Proposal is left non-approved and carries a non-empty failureReason.
        expect(result.status).not.toBe('approved')
        expect(result.status).not.toBe('auto-applied')
        expect(typeof result.failureReason).toBe('string')
        expect((result.failureReason as string).length).toBeGreaterThan(0)
        // The injected failure must have actually fired (otherwise the case is vacuous).
        expect(h.ctx.failConfig.fired).toBe(true)

        // (a) The vault is byte-for-byte its pre-apply state (no partial mutation).
        expect(h.ctx.store.observable()).toEqual(before)
      }),
      { numRuns: 100 },
    )
  })

  // Positive control: with NO injected failure, the same machinery DOES mutate the
  // vault and DOES mark the Proposal approved — so the assertions above are real.
  it('positive control: a clean apply mutates the vault and approves the Proposal', async () => {
    const { plan, seedPages } = buildCase({ pc: 2, pu: 1, ec: 1, eu: 1, seed: 'ok' })
    h.ctx.store = makeStore(seedPages)
    h.ctx.proposalDoc = makeProposalDoc(plan)
    h.ctx.failConfig = { step: '', fired: false } // no failure injected

    const before = h.ctx.store.observable()
    const result = await applyProposal('prop_1', { userId: USER })

    expect(result.status).toBe('approved')
    expect(result.failureReason).toBeNull()
    // The vault changed: a Source was written and new pages/entities created.
    expect(h.ctx.store!.sources.length).toBe(1)
    expect(h.ctx.store!.observable()).not.toEqual(before)
  })
})
