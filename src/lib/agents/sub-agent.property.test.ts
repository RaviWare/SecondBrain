// Feature: hermes-agents, Property 1 + Property 8 extended to sub-agents
//
// **Validates: Requirements 8.10, 8.11**
//
// Task 5.7 extends the two core safety invariants from the parent run path to the
// bounded Sub_Agent spawn path (`src/lib/agents/sub-agent.ts`):
//
//   • Property 8 — Sub-agent scope never exceeds the parent (Req 8.10). Over
//     ARBITRARY parent Trust_Scopes and ARBITRARY requested scopes — INCLUDING
//     requests for MORE than the parent (extra sources/collections, web access the
//     parent lacks, a larger budget) — `resolveSubAgentScope(parent, requested)`
//     yields a `trustScope` that is a SUBSET of the parent on every axis, a
//     `perRunTokenBudget` ≤ the parent's, and a starting `trustScore` that never
//     exceeds the parent's. It is TOTAL — never throws on malformed input.
//
//   • Property 1 — Propose-never-write, extended to sub-agents (Req 8.11). Driving
//     `spawnSubAgent` with a SPY persistence layer and a stub runner that emits
//     ARBITRARY DraftProposals (ingest / synthesis / connection / flagged-content),
//     the spawn performs ZERO vault knowledge writes itself: every persisted
//     proposal is `status:'pending'`, the proposal count equals the emitted count,
//     the parent linkage (`parentProposalId` / `agentId`=subAgentId) is carried,
//     and the read-only `VaultTools` handed to the runner expose NO
//     `applyIngestPlan` binding (the STRUCTURAL guarantee). The spawn's only
//     persistence surface is createRun / createProposal(pending) / finalizeRun —
//     there is no alternate write path; approval flows through `applyProposal`.
//
// Both `resolveSubAgentScope` and `spawnSubAgent` (dependency-injected) are run
// for REAL here — no mocks of the units under test, no live DB. This sits beside
// the EXISTING example unit tests in `sub-agent.test.ts` (task 5.5) and the base
// resolver's Property 8 in `scope.property.test.ts` (Phase 2); it does not clobber
// either.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  resolveSubAgentScope,
  spawnSubAgent,
  type ParentAgentLike,
  type SpawnDeps,
  type SpawnPersistence,
  type PersistProposalInput,
} from './sub-agent'
import type { TrustScope } from './scope'
import { buildReadOnlyVaultTools } from './runner/vault-tools'
import type { AgentRunner, RunContext, RunOutput, VaultTools, DraftProposal } from './runner/types'

// ── Accessibility model (empty list = universe) ────────────────────────────────
// Mirrors scope.property.test.ts: the design policy is "EMPTY list = the whole
// vault / unrestricted", so a naive array ⊆ check is WRONG. We instead model the
// ACCESSIBLE SET and assert resolved-accessible ⊆ parent-accessible.
const keyOf = (id: unknown): string => String(id)

function grants(list: readonly unknown[] | undefined | null, candidateKey: string): boolean {
  if (!Array.isArray(list) || list.length === 0) return true // empty = universe
  return list.some((item) => keyOf(item) === candidateKey)
}

function assertAccessibleSubset(
  parentList: readonly unknown[],
  requestedList: readonly unknown[],
  resolvedList: readonly unknown[],
  outsideSentinels: readonly string[],
): void {
  const candidates = new Set<string>([
    ...parentList.map(keyOf),
    ...requestedList.map(keyOf),
    ...resolvedList.map(keyOf),
    ...outsideSentinels,
  ])
  for (const candidate of candidates) {
    if (grants(resolvedList, candidate)) {
      // Resolved grants `candidate` ⇒ the parent must also grant it (subset).
      expect(grants(parentList, candidate)).toBe(true)
    }
  }
}

// ── Generators ──────────────────────────────────────────────────────────────────
// Small, overlapping label pools so independently-generated parent/requested
// arrays naturally produce overlaps, disjoint extras (request > parent), and
// empty (whole-vault) cases. Source ids are emitted as a plain string OR an
// ObjectId-like `{ toString }` of the SAME label, exercising id normalization.
const SOURCE_LABELS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const
const COLLECTION_LABELS = ['research', 'personal', 'work', 'secret', 'archive'] as const

const sourceIdArb = fc
  .constantFrom(...SOURCE_LABELS)
  .chain((label) => fc.boolean().map((wrap) => (wrap ? { toString: () => label } : label)))

const sourceListArb = fc.array(sourceIdArb, { maxLength: 8 })
const collectionListArb = fc.array(fc.constantFrom(...COLLECTION_LABELS), { maxLength: 6 })
const budgetArb = fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true })

const trustScopeArb: fc.Arbitrary<TrustScope> = fc.record({
  readableSourceIds: sourceListArb,
  readableCollections: collectionListArb,
  webAccess: fc.boolean(),
  perRunTokenBudget: budgetArb,
})

const signOffActionArb = fc.constantFrom('auto', 'ask', 'notify')
const signOffPolicyArb = fc.record({
  ingestSource: signOffActionArb,
  createSynthesis: signOffActionArb,
  createConnection: signOffActionArb,
  flagContradiction: signOffActionArb,
})

// Parent trust spans the realistic [0,100] band PLUS out-of-range / non-finite
// values, so the test exercises the clamp in `resolveSubAgentScope`.
const parentTrustArb = fc.oneof(
  fc.integer({ min: 0, max: 100 }),
  fc.integer({ min: -50, max: 200 }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
)

const parentArb: fc.Arbitrary<ParentAgentLike> = fc.record({
  _id: fc.constantFrom('parent_a', 'parent_b', 'parent_c'),
  userId: fc.constantFrom('user_1', 'user_2'),
  name: fc.string({ maxLength: 12 }),
  role: fc.constantFrom('scout', 'synthesist', 'connector', 'critic', 'librarian', 'researcher', 'custom'),
  customRoleDescription: fc.option(fc.string({ maxLength: 16 }), { nil: null }),
  trustScope: trustScopeArb,
  signOffPolicy: signOffPolicyArb,
  trustScore: parentTrustArb,
})

/** The parent's effective starting-trust ceiling (clamp [0,100]; non-finite → 0). */
function effectiveParentTrustCeiling(parentTrust: number): number {
  return Number.isFinite(parentTrust) ? Math.max(0, Math.min(100, parentTrust)) : 0
}

// ── Property 8 (extended to sub-agents): scope ⊆ parent ────────────────────────

describe('Property 8 (sub-agents): resolveSubAgentScope never exceeds the parent', () => {
  it('resolves a Sub_Agent scope ⊆ the parent for any parent + any request (incl. requests for MORE)', () => {
    fc.assert(
      fc.property(parentArb, trustScopeArb, (parent, requested) => {
        const cfg = resolveSubAgentScope(parent, requested)
        const resolved = cfg.trustScope

        // (1) accessible source set ⊆ parent's (empty parent = whole vault).
        assertAccessibleSubset(
          parent.trustScope.readableSourceIds,
          requested.readableSourceIds,
          resolved.readableSourceIds,
          ['__outside_src_a__', '__outside_src_b__'],
        )

        // (2) accessible collection set ⊆ parent's (empty parent = all collections).
        assertAccessibleSubset(
          parent.trustScope.readableCollections,
          requested.readableCollections,
          resolved.readableCollections,
          ['__outside_coll_a__', '__outside_coll_b__'],
        )

        // (3) webAccess ⇒ parent.webAccess — never true when the parent is false,
        //     even if the request asks for it.
        if (resolved.webAccess) {
          expect(parent.trustScope.webAccess).toBe(true)
        }

        // (4) budget never exceeds the parent's; finite and non-negative.
        expect(resolved.perRunTokenBudget).toBeLessThanOrEqual(parent.trustScope.perRunTokenBudget)
        expect(Number.isFinite(resolved.perRunTokenBudget)).toBe(true)
        expect(resolved.perRunTokenBudget).toBeGreaterThanOrEqual(0)

        // (5) the config's exposed budget equals the resolved scope's budget (≤ parent).
        expect(cfg.perRunTokenBudget).toBe(resolved.perRunTokenBudget)
        expect(cfg.perRunTokenBudget).toBeLessThanOrEqual(parent.trustScope.perRunTokenBudget)

        // (6) starting trust never exceeds the parent's (clamped to [0,100]).
        const ceiling = effectiveParentTrustCeiling(Number(parent.trustScore))
        expect(cfg.trustScore).toBeGreaterThanOrEqual(0)
        expect(cfg.trustScore).toBeLessThanOrEqual(100)
        expect(cfg.trustScore).toBeLessThanOrEqual(ceiling)

        // (7) the regenerated scope statement always denies by name (non-empty "cannot").
        expect(cfg.trustScopeStatement).toMatch(/cannot/i)
      }),
      { numRuns: 100 },
    )
  })

  it('is TOTAL — never throws and returns a well-formed bounded config on malformed input', () => {
    // "Malformed input" here = a parent Agent OBJECT with arbitrary / junk FIELD
    // values (matching the example unit test's `{ _id, userId, trustScope: {} }`
    // case and the real call contract: `spawnSubAgent` always passes a hydrated
    // parent object). The base `resolveSubScope` is the layer designed to be total
    // over literally `fc.anything()`; `resolveSubAgentScope` is total over malformed
    // FIELDS of a parent object. Every field is independently arbitrary, so
    // `trustScope`/`trustScore`/`name`/etc. exercise nulls, numbers, strings, etc.
    const malformedParentArb = fc.record({
      _id: fc.anything(),
      userId: fc.anything(),
      name: fc.anything(),
      role: fc.anything(),
      customRoleDescription: fc.anything(),
      trustScope: fc.anything(),
      signOffPolicy: fc.anything(),
      trustScore: fc.anything(),
    })
    fc.assert(
      fc.property(malformedParentArb, fc.anything(), (parent, requested) => {
        const cfg = resolveSubAgentScope(
          parent as unknown as ParentAgentLike,
          requested as unknown as TrustScope,
        )
        expect(Array.isArray(cfg.trustScope.readableSourceIds)).toBe(true)
        expect(Array.isArray(cfg.trustScope.readableCollections)).toBe(true)
        expect(typeof cfg.trustScope.webAccess).toBe('boolean')
        expect(Number.isFinite(cfg.trustScope.perRunTokenBudget)).toBe(true)
        expect(cfg.perRunTokenBudget).toBe(cfg.trustScope.perRunTokenBudget)
        // Starting trust is always a clamped integer-ish number in [0,100].
        expect(cfg.trustScore).toBeGreaterThanOrEqual(0)
        expect(cfg.trustScore).toBeLessThanOrEqual(100)
        expect(typeof cfg.trustScopeStatement).toBe('string')
      }),
      { numRuns: 100 },
    )
  })
})

// ── Property 1 (extended to sub-agents): propose-never-write ───────────────────

/** A spy persistence layer recording every call for assertions. No write-to-vault method exists. */
function spyPersistence() {
  const runs: Array<Record<string, unknown>> = []
  const proposals: PersistProposalInput[] = []
  const finalized: Array<{ runId: unknown; proposalIds: unknown[] }> = []
  let runSeq = 0
  let propSeq = 0
  const persistence: SpawnPersistence = {
    async createRun(input) {
      runs.push({ ...input })
      return { runId: `run_${++runSeq}` }
    },
    async createProposal(input) {
      proposals.push(input)
      return { proposalId: `prop_${++propSeq}` }
    },
    async finalizeRun(input) {
      finalized.push({ runId: input.runId, proposalIds: input.proposalIds })
    },
  }
  return { persistence, runs, proposals, finalized }
}

/** A stub runner that emits a fixed set of DraftProposals and never writes. */
function stubRunner(proposals: DraftProposal[], tokensUsed = 100): AgentRunner {
  return {
    async run(_ctx: RunContext, _tools: VaultTools): Promise<RunOutput> {
      return { proposals, scanResults: [], tokensUsed, trace: [], outcome: 'completed' }
    },
  }
}

// Arbitrary DraftProposals across all four kinds. flagged-content carries a null
// plan + a scanResult (it is held, never planned); the others carry a plan object.
const citationArb = fc.record(
  {
    slug: fc.option(fc.string({ maxLength: 8 }), { nil: undefined }),
    url: fc.option(fc.webUrl(), { nil: undefined }),
    quote: fc.string({ maxLength: 24 }),
  },
  { requiredKeys: ['quote'] },
)

const draftArb: fc.Arbitrary<DraftProposal> = fc
  .constantFrom('ingest', 'synthesis', 'connection', 'flagged-content')
  .chain((kind) =>
    fc.record({
      kind: fc.constant(kind),
      title: fc.string({ maxLength: 24 }),
      rationale: fc.string({ maxLength: 32 }),
      citations: fc.array(citationArb, { maxLength: 3 }),
      plan:
        kind === 'flagged-content'
          ? fc.constant(null)
          : fc.constant({ source: { title: 'X' }, pageOps: [], entityOps: [] }),
      scanResult:
        kind === 'flagged-content'
          ? fc.constant({ status: 'flagged', findings: [{ category: 'injection', passage: 'p', offset: 0 }] })
          : fc.constant(null),
    }),
  )

describe('Property 1 (sub-agents): spawnSubAgent proposes, never writes', () => {
  it('persists every emitted proposal as pending with parent linkage, and writes nothing itself', async () => {
    await fc.assert(
      fc.asyncProperty(
        parentArb,
        trustScopeArb,
        fc.array(draftArb, { maxLength: 5 }),
        fc.constantFrom('prop_parent_1', 'prop_parent_2', undefined),
        async (parent, requested, drafts, parentProposalId) => {
          const mem = spyPersistence()
          const subAgentId = 'sub_under_test'
          const deps: SpawnDeps = {
            runner: stubRunner(drafts),
            // The REAL read-only tool builder — its result is the structural
            // propose-never-write surface handed to the runner.
            buildTools: (userId) => buildReadOnlyVaultTools(userId),
            persistence: mem.persistence,
          }

          const result = await spawnSubAgent(
            {
              parent,
              requestedScope: requested,
              subAgentId,
              parentRunId: 'run_parent',
              parentProposalId,
            },
            deps,
          )

          // (1) proposal count === emitted count (none dropped, none fabricated).
          expect(mem.proposals).toHaveLength(drafts.length)
          expect(result.proposalIds).toHaveLength(drafts.length)
          expect(mem.finalized).toHaveLength(1)
          expect(mem.finalized[0].proposalIds).toHaveLength(drafts.length)

          // (2) every persisted proposal is PENDING (no auto-write) and carries the
          //     parent linkage for nested Work_Item rendering (Req 8.9/8.11).
          for (let i = 0; i < mem.proposals.length; i++) {
            const p = mem.proposals[i]
            expect(p.status).toBe('pending')
            expect(p.agentId).toBe(subAgentId)
            expect(p.userId).toBe(parent.userId)
            expect(p.parentProposalId).toBe(parentProposalId ?? null)
            expect(p.kind).toBe(drafts[i].kind)
            // A flagged-content hold is never planned — it carries no write plan.
            if (p.kind === 'flagged-content') {
              expect(p.plan).toBeNull()
            }
          }

          // (3) the run was opened with the BOUNDED budget (≤ parent), never wider.
          expect(mem.runs).toHaveLength(1)
          expect(mem.runs[0].perRunBudget).toBe(result.config.perRunTokenBudget)
          expect(mem.runs[0].perRunBudget).toBeLessThanOrEqual(parent.trustScope.perRunTokenBudget)
          expect(mem.runs[0].agentId).toBe(subAgentId)
          expect(result.config.parentAgentId).toBe(parent._id)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  it('hands the runner read-only VaultTools with NO applyIngestPlan binding (structural guarantee)', () => {
    fc.assert(
      fc.property(fc.constantFrom('user_1', 'user_2', 'user_3'), (userId) => {
        const tools = buildReadOnlyVaultTools(userId) as VaultTools & Record<string, unknown>
        // The single structural fact behind propose-never-write: the runner can
        // PLAN a write (`planIngest`) but is never handed a way to PERFORM one.
        expect('applyIngestPlan' in tools).toBe(false)
        expect('applyProposal' in tools).toBe(false)
        expect(typeof tools.planIngest).toBe('function')
        expect(typeof tools.fetchSource).toBe('function')
        expect(typeof tools.scan).toBe('function')
      }),
      { numRuns: 100 },
    )
  })

  it('passes the runner a write-free, scope-bounded RunContext (dryRun false, no token leak)', async () => {
    await fc.assert(
      fc.asyncProperty(parentArb, trustScopeArb, async (parent, requested) => {
        const mem = spyPersistence()
        let captured: RunContext | null = null
        const deps: SpawnDeps = {
          runner: {
            async run(ctx) {
              captured = ctx
              return { proposals: [], scanResults: [], tokensUsed: 0, trace: [], outcome: 'completed' }
            },
          },
          buildTools: (userId) => buildReadOnlyVaultTools(userId),
          persistence: mem.persistence,
        }

        const result = await spawnSubAgent(
          { parent, requestedScope: requested, subAgentId: 'sub_ctx' },
          deps,
        )

        expect(captured).not.toBeNull()
        const ctx = captured as RunContext
        // A spawned sub-task is a real run, but it still only proposes.
        expect(ctx.dryRun).toBe(false)
        // The per-run budget handed to the runner equals the bounded budget (≤ parent).
        expect(ctx.budget.perRunTokens).toBe(result.config.perRunTokenBudget)
        expect(ctx.budget.perRunTokens).toBeLessThanOrEqual(parent.trustScope.perRunTokenBudget)
        // No brain-token value is injected by the spawn path (minted by the route, never logged).
        expect(ctx.scopedToken).toBe('')
        // The agent payload carries the BOUNDED scope, never wider than the parent.
        const agentPayload = ctx.agent as { trustScope: TrustScope }
        expect(agentPayload.trustScope.perRunTokenBudget).toBeLessThanOrEqual(
          parent.trustScope.perRunTokenBudget,
        )
        return true
      }),
      { numRuns: 100 },
    )
  })
})
