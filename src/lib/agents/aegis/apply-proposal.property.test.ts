// Feature: hermes-agents, Property 6: Apply-then-undo restores the prior vault state (round-trip)
//
// **Validates: Requirements 3.7, 3.8**
//
// For any REVERSIBLE Proposal, applying it via `applyProposal` and then calling
// `undoProposal` within the undo window restores the vault to a state equivalent
// to its pre-apply state — whether the action was manually `approved` or
// `auto-applied`.
//
// ── What "reversible" and "vault state" mean here (faithful to the code) ───────
// `undoProposal` reverses an apply by deleting exactly the pages this apply
// CREATED (`undo.undonePages` = `createdSlugsFromPlan(plan)`) and reconciling the
// Vault `pageCount`. Its own docstring is explicit that the Source doc / source
// ledger is intentionally NOT reversed ("page removal is the reversal that
// restores the knowledge surface. A fuller source-level reversal is a later
// refinement."). So:
//   • A genuinely reversible Proposal is a CREATE-ONLY plan (an Agent ingesting a
//     NEW source). Update/merge ops are not reversed by the undo mechanism, so
//     they are out of scope for this round-trip property by construction.
//   • "Prior vault state" = the KNOWLEDGE SURFACE the undo is contracted to
//     restore: the set of Pages (slug/title/type/content) plus the Vault
//     `pageCount`. That is exactly what `undoProposal` touches.
//
// ── Test strategy ──────────────────────────────────────────────────────────────
// The REAL `applyProposal` / `undoProposal` (and the REAL `applyIngestPlan` write
// path they call) run against an in-memory "spy vault": `@/lib/mongodb`,
// `@/lib/claude`, `@/lib/auto-link`, and `@/lib/models` are mocked so the model
// methods read/write a recorded in-memory store instead of MongoDB. This exercises
// the genuine apply→undo interaction end to end, not a re-implementation of it.

import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'
import fc from 'fast-check'

const USER = 'user_roundtrip'

// ── In-memory spy-vault context (hoisted so the vi.mock factories can close over it) ──
// `ctx.store` is reassigned to a fresh store at the start of every property run.
const ctx = vi.hoisted(() => ({ store: undefined as unknown as ReturnType<typeof makeStore> }))

// `makeStore`'s type is only referenced for `ctx` typing; the real builder lives
// below (after imports) so it can stay close to the generators.
function makeStore() {
  return {
    pages: [] as Array<Record<string, unknown>>,
    vault: { _id: 'v1', userId: USER, pageCount: 0, sourceCount: 0 } as Record<string, number | string>,
    sources: [] as Array<Record<string, unknown>>,
    proposal: undefined as unknown as ReturnType<typeof makeProposalDoc>,
    idCounter: 0,
  }
}

// ── Mocks ────────────────────────────────────────────────────────────────────
// connectDB is a no-op; we never touch a real DB.
vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))

// The LLM module is mocked so importing vault-ops never initializes the SDK and
// no network/LLM calls occur (the apply path does not invoke these anyway).
vi.mock('@/lib/claude', () => ({
  ingestSource: vi.fn(),
  extractEntities: vi.fn(),
  updatePageWithNewEvidence: vi.fn(),
  fetchAndCleanUrl: vi.fn(),
  expandQuery: vi.fn(),
  queryWiki: vi.fn(),
}))

// Graph wiring is a write-path side effect we don't snapshot; stub it.
vi.mock('@/lib/auto-link', () => ({
  wireGraphBatch: vi.fn().mockResolvedValue({ resolved: 0, dangling: 0, backlinks: 0 }),
}))

// In-memory Mongoose-model fakes backed by `ctx.store`. Only the operations the
// real apply/undo path actually uses for a create-only plan are faithfully
// implemented ($inc on Vault, $in delete on Page, create/findOne).
vi.mock('@/lib/models', () => {
  const Vault = {
    findOne: vi.fn(async () => ctx.store.vault),
    updateOne: vi.fn(async (_filter: unknown, update: { $inc?: Record<string, number> }) => {
      if (update?.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          ctx.store.vault[k] = ((ctx.store.vault[k] as number) ?? 0) + v
        }
      }
      return {}
    }),
  }
  const Source = {
    create: vi.fn(async (doc: Record<string, unknown>) => {
      const _id = `src_${++ctx.store.idCounter}`
      ctx.store.sources.push({ _id, ...doc })
      return { _id }
    }),
  }
  const Page = {
    create: vi.fn(async (doc: Record<string, unknown>) => {
      ctx.store.pages.push({ ...doc })
      return { _id: `page_${++ctx.store.idCounter}` }
    }),
    // Not invoked for create-only plans; present for completeness.
    updateOne: vi.fn(async () => ({})),
    deleteMany: vi.fn(async (filter: { userId?: string; vaultId?: unknown; slug?: { $in?: string[] } }) => {
      const slugs = filter?.slug?.$in ?? []
      const before = ctx.store.pages.length
      ctx.store.pages = ctx.store.pages.filter(
        (p) =>
          !(
            p.userId === filter.userId &&
            String(p.vaultId) === String(filter.vaultId) &&
            slugs.includes(p.slug as string)
          ),
      )
      return { deletedCount: before - ctx.store.pages.length }
    }),
    find: vi.fn(),
    findOne: vi.fn(async () => null),
  }
  const Log = { create: vi.fn(async () => ({})) }
  const UserPlan = {
    findOne: vi.fn(async () => ({ plan: 'pro' })),
    updateOne: vi.fn(async () => ({})),
  }
  const Proposal = { findOne: vi.fn(async () => ctx.store.proposal) }
  // Trust persistence (recordTrustEvents) is a best-effort side effect of an
  // apply/undo; a no-op Agent lookup keeps it from affecting this round-trip test.
  const Agent = { findOne: vi.fn(async () => null) }
  return { Vault, Source, Page, Log, UserPlan, Proposal, Agent }
})

// Real code under test (loads the mocked deps above).
import { applyProposal, undoProposal } from './apply-proposal'

// ── Fixtures / builders ────────────────────────────────────────────────────────

/** A mutable in-memory Proposal doc with the `.save()` / `.markModified()` the code calls. */
function makeProposalDoc(plan: unknown) {
  return {
    _id: 'prop1',
    userId: USER,
    agentId: 'agent1',
    runId: 'run1',
    kind: 'ingest' as const,
    plan,
    status: 'pending' as string,
    affectedPages: [] as string[],
    failureReason: null as string | null,
    undo: null as null | { reversible: boolean; expiresAt: Date | null; undonePages?: string[] },
    decidedBy: null as string | null,
    decidedAt: null as Date | null,
    markModified(_path: string) {},
    async save() {
      return this
    },
  }
}

type Scenario = {
  pre: Array<{ slug: string; title: string; type: string; content: string }>
  plan: unknown
  createdSlugs: string[]
}

/** Build a fresh spy vault seeded with the scenario's pre-existing pages. */
function freshStore(scenario: Scenario) {
  const store = makeStore()
  store.pages = scenario.pre.map((p) => ({
    userId: USER,
    vaultId: 'v1',
    slug: p.slug,
    title: p.title,
    type: p.type,
    content: p.content,
  }))
  store.vault.pageCount = scenario.pre.length
  store.proposal = makeProposalDoc(scenario.plan)
  return store
}

/** The knowledge surface `undoProposal` is contracted to restore: pages + pageCount. */
function snapshot(store: ReturnType<typeof makeStore>) {
  return {
    pages: store.pages
      .map((p) => ({ slug: p.slug, title: p.title, type: p.type, content: p.content }))
      .sort((a, b) => (a.slug! < b.slug! ? -1 : a.slug! > b.slug! ? 1 : 0)),
    pageCount: store.vault.pageCount,
  }
}

// ── Generators ───────────────────────────────────────────────────────────────
const PAGE_TYPES = ['concept', 'synthesis', 'pattern', 'source-summary'] as const
const arrayOfLen = <T>(arb: fc.Arbitrary<T>, n: number) => fc.array(arb, { minLength: n, maxLength: n })

// A reversible scenario: some pre-existing pages, plus a CREATE-ONLY ingest plan
// whose page + entity slugs are unique and disjoint from the pre-existing slugs
// (prefixes `pre-` / `pg-` / `ent-` guarantee disjointness). This mirrors what
// `planIngest` actually emits for a fresh source (entity ops skip slugs already
// covered by a page op), so the round-trip is genuinely reversible.
const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    preCount: fc.nat({ max: 4 }),
    pageCreateCount: fc.nat({ max: 4 }),
    entityCreateCount: fc.nat({ max: 4 }),
  })
  .chain(({ preCount, pageCreateCount, entityCreateCount }) =>
    fc
      .record({
        preContents: arrayOfLen(fc.string({ maxLength: 30 }), preCount),
        preTypes: arrayOfLen(fc.constantFrom(...PAGE_TYPES), preCount),
        pageContents: arrayOfLen(fc.string({ maxLength: 30 }), pageCreateCount),
        pageTypes: arrayOfLen(fc.constantFrom(...PAGE_TYPES), pageCreateCount),
        entityContents: arrayOfLen(fc.string({ maxLength: 30 }), entityCreateCount),
      })
      .map(({ preContents, preTypes, pageContents, pageTypes, entityContents }) => {
        const pre = preContents.map((content, i) => ({
          slug: `pre-${i}`,
          title: `Pre ${i}`,
          type: preTypes[i],
          content,
        }))
        const pageOps = pageContents.map((content, i) => ({
          op: 'create' as const,
          slug: `pg-${i}`,
          title: `Page ${i}`,
          type: pageTypes[i],
          content,
          summary: `sum-${i}`,
          relatedSlugs: [] as string[],
          tags: [] as string[],
          confidence: 'medium' as const,
        }))
        const entityOps = entityContents.map((content, i) => ({
          op: 'create' as const,
          slug: `ent-${i}`,
          title: `Entity ${i}`,
          type: 'entity' as const,
          content,
          summary: `esum-${i}`,
          relatedSlugs: [] as string[],
          tags: ['person'],
          confidence: 'medium' as const,
        }))
        const createdSlugs = [...pageOps.map((o) => o.slug), ...entityOps.map((o) => o.slug)]
        const plan = {
          source: { type: 'text' as const, title: 'Source', url: null, rawContent: 'raw', wordCount: 1 },
          pageOps,
          entityOps,
          resultPages: pageOps.map((o) => ({ slug: o.slug, title: o.title, type: o.type })),
          expectedGraphSlugs: createdSlugs,
          tokensUsed: 0,
          ingestedAt: '2024-01-01T00:00:00.000Z',
        }
        return { pre, plan, createdSlugs }
      }),
  )

// ── Property 6 ───────────────────────────────────────────────────────────────
describe('Property 6: Apply-then-undo restores the prior vault state (round-trip)', () => {
  it('restores the pre-apply knowledge surface for BOTH approved and auto-applied actions', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        // Cover both decision paths every run: a manually `approved` action and an
        // `auto-applied` action (Req 3.7 — restored "whether ... auto-applied or
        // manually approved"; Req 3.8 — the approval/auto-apply opens the window).
        for (const mode of ['approved', 'auto-applied'] as const) {
          ctx.store = freshStore(scenario)
          const before = snapshot(ctx.store)

          // APPLY — the real write choke point (real applyIngestPlan) runs.
          await applyProposal('prop1', { userId: USER })

          // Non-vacuous: the apply truly wrote every created page into the vault.
          expect(ctx.store.pages.length).toBe(scenario.pre.length + scenario.createdSlugs.length)
          // The undo window was opened with the created-only reversal set (Req 3.8).
          expect(ctx.store.proposal.undo?.reversible).toBe(true)
          expect([...(ctx.store.proposal.undo?.undonePages ?? [])].sort()).toEqual(
            [...scenario.createdSlugs].sort(),
          )

          // Auto-applied path: the same write, surfaced via an Undo_Toast and
          // recorded as `auto-applied` rather than `approved`. `undoProposal`
          // accepts both statuses; relabel to exercise that branch.
          if (mode === 'auto-applied') ctx.store.proposal.status = 'auto-applied'

          // UNDO within the window — the real reversal runs.
          await undoProposal('prop1', { userId: USER })

          // ROUND-TRIP: the knowledge surface equals its pre-apply snapshot.
          const after = snapshot(ctx.store)
          expect(after).toEqual(before)
        }
      }),
      { numRuns: 100 },
    )
  })
})
