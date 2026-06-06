// Feature: mission-orchestrator, Property 9: A mission Sub_Agent's scope never exceeds its assigner's scope
//
// **Validates: Requirements 10.5**
//
// A Mission_Task's assigned (assigner) Agent may spawn a bounded Sub_Agent. The
// mission layer invents NO new scope logic — `spawnMissionSubAgent`
// (mission/sub-agent.ts) DELEGATES verbatim to the spine: `spawnSubAgent` →
// `resolveSubAgentScope` → `resolveSubScope`. So the mission Sub_Agent's resolved
// Trust_Scope is, on every axis, a SUBSET of its assigner's:
//
//   • readableSourceIds   accessible set ⊆ assigner's (empty = whole vault),
//   • readableCollections accessible set ⊆ assigner's (empty = all collections),
//   • webAccess           ⇒ assigner.webAccess,
//   • perRunTokenBudget   ≤ assigner's.
//
// This is the EXACT Property 8 invariant from the hermes-agents spec, re-asserted
// on the MISSION path. We prove it three ways, strongest first:
//   (1) on the audited core `resolveSubScope` directly (the verbatim-reused resolver),
//   (2) through the mission delegation chain `resolveSubAgentScope(...).trustScope`
//       (what the mission wrapper actually persists as the Sub_Agent config), and
//   (3) end-to-end through the async `spawnMissionSubAgent` wrapper itself, which
//       additionally adds — and is the ONLY thing it adds — the nesting depth bound.
//
// All three target the REAL functions with no mocks of the scope logic and no I/O
// (the spawn path uses spy persistence + a no-op runner so 100+ runs stay cheap).
//
// ── Why "subset" is asserted via an ACCESSIBILITY model, not array ⊆ ────────────
// The design's policy is "EMPTY list = the whole vault / unrestricted". A naive
// array-subset check is therefore WRONG: a restricted assigner (`['a','b']`) with
// an empty resolved list (`[]`) would "pass" `[] ⊆ ['a','b']` while actually
// meaning the child got the WHOLE vault — a privilege escalation. So we model the
// ACCESSIBLE SET — `grants(list, id)` where an empty list grants every id
// (universe) and a non-empty list grants only its members — and assert the real
// invariant: anything the resolved scope can access, the assigner could already
// access (`resolved-accessible ⊆ assigner-accessible`). This mirrors the
// hermes-agents Property 8 harness (`scope.property.test.ts`) verbatim.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { resolveSubScope, type TrustScope } from '@/lib/agents/scope'
import { resolveSubAgentScope, type ParentAgentLike, type SpawnDeps } from '@/lib/agents/sub-agent'
import { spawnMissionSubAgent } from './sub-agent'
import { canSpawnSubAgent } from './limits'
import type { RunOutput, VaultTools } from '@/lib/agents/runner/types'

// ── Accessibility model (empty list = universe) — same as hermes Property 8 ─────
const keyOf = (id: unknown): string => String(id)

/**
 * Does `list` (a Trust_Scope list field) grant access to `candidateKey`?
 * Empty/absent = unrestricted ⇒ grants everything (the whole vault). Otherwise
 * access is granted only to members (compared by string form, ObjectId-safe).
 */
function grants(list: readonly unknown[] | undefined | null, candidateKey: string): boolean {
  if (!Array.isArray(list) || list.length === 0) return true
  return list.some((item) => keyOf(item) === candidateKey)
}

/**
 * Assert resolved-accessible ⊆ assigner-accessible over a candidate universe that
 * spans every id either side mentions PLUS sentinel "outside" ids (to exercise
 * the empty-assigner = universe case). For every candidate the resolved scope
 * grants, the assigner must already grant it. This also encodes the "empty
 * resolved list ⇒ assigner list was empty" convention: if the resolved list is
 * empty it grants the sentinels, which forces the assigner list to grant them too
 * (i.e. the assigner was also empty/unrestricted).
 */
function assertAccessibleSubset(
  assignerList: readonly unknown[],
  requestedList: readonly unknown[],
  resolvedList: readonly unknown[],
  outsideSentinels: readonly string[],
): void {
  const candidates = new Set<string>([
    ...assignerList.map(keyOf),
    ...requestedList.map(keyOf),
    ...resolvedList.map(keyOf),
    ...outsideSentinels,
  ])
  for (const candidate of candidates) {
    if (grants(resolvedList, candidate)) {
      // Resolved grants `candidate` ⇒ the assigner must also grant it (subset).
      expect(grants(assignerList, candidate)).toBe(true)
    }
  }
}

/** The full subset oracle for a resolved scope vs its assigner (all four axes). */
function assertScopeSubsetOfAssigner(
  assigner: TrustScope,
  requested: TrustScope,
  resolved: {
    readableSourceIds: readonly unknown[]
    readableCollections: readonly unknown[]
    webAccess: boolean
    perRunTokenBudget: number
  },
): void {
  // (1) accessible source set ⊆ assigner's (empty assigner = whole vault).
  assertAccessibleSubset(
    assigner.readableSourceIds,
    requested.readableSourceIds,
    resolved.readableSourceIds,
    ['__outside_src_a__', '__outside_src_b__'],
  )
  // (2) accessible collection set ⊆ assigner's (empty assigner = all collections).
  assertAccessibleSubset(
    assigner.readableCollections,
    requested.readableCollections,
    resolved.readableCollections,
    ['__outside_coll_a__', '__outside_coll_b__'],
  )
  // (3) webAccess ⇒ assigner.webAccess (never true when the assigner is false,
  //     even if the request asks for it).
  if (resolved.webAccess) {
    expect(assigner.webAccess).toBe(true)
  }
  // (4) budget never exceeds the assigner's, and is a finite, non-negative number.
  expect(resolved.perRunTokenBudget).toBeLessThanOrEqual(assigner.perRunTokenBudget)
  expect(Number.isFinite(resolved.perRunTokenBudget)).toBe(true)
  expect(resolved.perRunTokenBudget).toBeGreaterThanOrEqual(0)
}

// ── Generators (mirror the hermes Property 8 harness) ───────────────────────────
// Small, overlapping label pools so independently-generated assigner/requested
// arrays naturally produce overlaps, disjoint extras (request > assigner), and
// empty (whole-vault) cases. Source ids are randomly emitted as a plain string OR
// an ObjectId-like `{ toString }` of the SAME label, exercising id normalization.
const SOURCE_LABELS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const
const COLLECTION_LABELS = ['research', 'personal', 'work', 'secret', 'archive'] as const

const sourceIdArb = fc
  .constantFrom(...SOURCE_LABELS)
  .chain((label) => fc.boolean().map((wrap) => (wrap ? { toString: () => label } : label)))

const sourceListArb = fc.array(sourceIdArb, { maxLength: 8 })
const collectionListArb = fc.array(fc.constantFrom(...COLLECTION_LABELS), { maxLength: 6 })
// Non-negative, finite token budgets up to a large ceiling (the realistic domain).
const budgetArb = fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true })

const trustScopeArb: fc.Arbitrary<TrustScope> = fc.record({
  readableSourceIds: sourceListArb,
  readableCollections: collectionListArb,
  webAccess: fc.boolean(),
  perRunTokenBudget: budgetArb,
})

/** Build a structural assigner (parent) Agent carrying an arbitrary Trust_Scope. */
function assignerAgent(trustScope: TrustScope): ParentAgentLike {
  return { _id: 'assigner_agent_1', userId: 'user_1', role: 'researcher', trustScope }
}

// ── Spy spawn deps: no-op runner + in-memory persistence (no DB, no real run) ───
function spySpawnDeps(): SpawnDeps {
  const output: RunOutput = {
    proposals: [],
    scanResults: [],
    tokensUsed: 0,
    trace: [],
    outcome: 'completed',
  }
  return {
    runner: { run: async () => output },
    buildTools: () => ({}) as unknown as VaultTools,
    persistence: {
      createRun: async () => ({ runId: 'run_1' }),
      createProposal: async () => ({ proposalId: 'prop_1' }),
      finalizeRun: async () => {},
    },
  }
}

describe('Property 9: A mission Sub_Agent scope never exceeds its assigner scope', () => {
  it('resolveSubScope (the verbatim-reused core) yields a scope ⊆ the assigner for any assigner + any request (incl. requests for MORE)', () => {
    fc.assert(
      fc.property(trustScopeArb, trustScopeArb, (assigner, requested) => {
        const resolved = resolveSubScope(assigner, requested)
        assertScopeSubsetOfAssigner(assigner, requested, resolved)
      }),
      { numRuns: 100 },
    )
  })

  it('the mission delegation chain resolveSubAgentScope(...).trustScope is ⊆ the assigner (what the mission wrapper persists)', () => {
    fc.assert(
      fc.property(trustScopeArb, trustScopeArb, (assigner, requested) => {
        // spawnMissionSubAgent → spawnSubAgent → resolveSubAgentScope → resolveSubScope.
        // Asserting on resolveSubAgentScope proves the config the mission path
        // actually persists for the Sub_Agent is bounded by the assigner.
        const config = resolveSubAgentScope(assignerAgent(assigner), requested)
        assertScopeSubsetOfAssigner(assigner, requested, config.trustScope)
        // The Sub_Agent's per-run budget equals its bounded scope budget (≤ assigner).
        expect(config.perRunTokenBudget).toBe(config.trustScope.perRunTokenBudget)
        expect(config.perRunTokenBudget).toBeLessThanOrEqual(assigner.perRunTokenBudget)
      }),
      { numRuns: 100 },
    )
  })

  it('end-to-end spawnMissionSubAgent: when permitted, the spawned Sub_Agent config is ⊆ the assigner; it refuses iff the depth bound is exceeded', async () => {
    await fc.assert(
      fc.asyncProperty(
        trustScopeArb,
        trustScopeArb,
        fc.nat({ max: 8 }),
        fc.nat({ max: 8 }),
        async (assigner, requested, currentDepth, graphLimitDepth) => {
          const result = await spawnMissionSubAgent(
            {
              parent: assignerAgent(assigner),
              requestedScope: requested,
              subAgentId: 'sub_agent_1',
              currentDepth,
              graphLimitDepth,
            },
            spySpawnDeps(),
          )

          // The ONLY thing the mission wrapper adds: the nesting depth bound. It
          // refuses EXACTLY when the depth gate would (independent oracle: a spawn
          // is permitted iff currentDepth < graphLimitDepth for finite depths).
          const permittedByOracle = currentDepth < graphLimitDepth
          expect(canSpawnSubAgent(currentDepth, graphLimitDepth)).toBe(permittedByOracle)

          if (!permittedByOracle) {
            // Refused on depth → no spawn, no scope resolved, no run opened.
            expect(result.status).toBe('refused-depth')
            return
          }

          // Permitted → the spine resolved the scope; assert it is ⊆ the assigner.
          expect(result.status).toBe('spawned')
          if (result.status !== 'spawned') return
          assertScopeSubsetOfAssigner(assigner, requested, result.result.config.trustScope)
        },
      ),
      { numRuns: 100 },
    )
  })
})
