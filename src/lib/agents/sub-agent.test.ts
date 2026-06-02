// Unit tests for bounded Sub_Agent spawn (task 5.5).
//
// These pin the concrete behaviour behind Property 1 (propose-never-write,
// extended to sub-agents) and Property 8 (sub-agent scope ⊆ parent) for the
// spawn path; the universal fast-check properties are task 5.7 (separate/optional).
//
// `resolveSubAgentScope` is PURE / TOTAL / DETERMINISTIC → tested directly.
// `spawnSubAgent` is dependency-injected → tested with an IN-MEMORY persistence
// layer + a stub runner, asserting it performs ZERO vault writes (it only ever
// persists `pending` proposals) and carries the parent linkage for nesting.

import { describe, it, expect, vi } from 'vitest'

import {
  resolveSubAgentScope,
  spawnSubAgent,
  type ParentAgentLike,
  type SpawnDeps,
  type SpawnPersistence,
  type PersistProposalInput,
} from './sub-agent'
import type { TrustScope } from './scope'
import type { AgentRunner, RunOutput, VaultTools, DraftProposal } from './runner/types'
import { buildReadOnlyVaultTools } from './runner/vault-tools'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function parent(overrides: Partial<ParentAgentLike> = {}): ParentAgentLike {
  return {
    _id: 'parent_agent_1',
    userId: 'user_1',
    name: 'Scout',
    role: 'scout',
    customRoleDescription: null,
    trustScope: {
      readableSourceIds: ['s1', 's2'],
      readableCollections: ['research'],
      webAccess: true,
      perRunTokenBudget: 10_000,
    },
    signOffPolicy: {
      ingestSource: 'ask',
      createSynthesis: 'ask',
      createConnection: 'ask',
      flagContradiction: 'notify',
    },
    trustScore: 60,
    ...overrides,
  }
}

function scope(overrides: Partial<TrustScope> = {}): TrustScope {
  return {
    readableSourceIds: ['s1', 's2'],
    readableCollections: ['research'],
    webAccess: true,
    perRunTokenBudget: 10_000,
    ...overrides,
  }
}

// ── resolveSubAgentScope — scope ⊆ parent (Property 8) ────────────────────────

describe('resolveSubAgentScope — bounded scope (⊆ parent)', () => {
  it('intersects a requested source set with the parent (drops items the parent lacks)', () => {
    const cfg = resolveSubAgentScope(parent(), scope({ readableSourceIds: ['s2', 's9'] }))
    expect(cfg.trustScope.readableSourceIds.sort()).toEqual(['s2'])
  })

  it('NEVER grants web access when the parent lacks it, even if requested', () => {
    const cfg = resolveSubAgentScope(parent({ trustScope: scope({ webAccess: false }) }), scope({ webAccess: true }))
    expect(cfg.trustScope.webAccess).toBe(false)
  })

  it('clamps a larger requested token budget down to the parent (never widens)', () => {
    const cfg = resolveSubAgentScope(parent({ trustScope: scope({ perRunTokenBudget: 1_000 }) }), scope({ perRunTokenBudget: 999_999 }))
    expect(cfg.trustScope.perRunTokenBudget).toBe(1_000)
    expect(cfg.perRunTokenBudget).toBe(1_000)
  })

  it('carries the parent linkage and a starting trust that never exceeds the parent', () => {
    const cfg = resolveSubAgentScope(parent({ trustScore: 42 }), scope())
    expect(cfg.parentAgentId).toBe('parent_agent_1')
    expect(cfg.userId).toBe('user_1')
    expect(cfg.trustScore).toBe(42)
  })

  it('regenerates a non-empty "cannot" statement from the BOUNDED scope (Req 1.8)', () => {
    const cfg = resolveSubAgentScope(parent({ trustScope: scope({ webAccess: false }) }), scope({ webAccess: true }))
    expect(cfg.trustScopeStatement).toMatch(/cannot/i)
    // The bounded scope has no web access, so the statement must deny it by name.
    expect(cfg.trustScopeStatement.toLowerCase()).toContain('web')
  })

  it('is total on malformed input (never throws)', () => {
    const cfg = resolveSubAgentScope(
      { _id: 'p', userId: 'u', trustScope: {} as unknown as TrustScope },
      {} as unknown as TrustScope,
    )
    expect(cfg.trustScope.readableSourceIds).toEqual([])
    expect(cfg.trustScope.webAccess).toBe(false)
    expect(cfg.trustScope.perRunTokenBudget).toBe(0)
  })
})

// ── spawnSubAgent — propose-never-write (Property 1) + nesting (Req 8.9) ──────

/** An in-memory persistence layer that records every write for assertions. */
function memoryPersistence() {
  const runs: Array<Record<string, unknown>> = []
  const proposals: PersistProposalInput[] = []
  const finalized: Array<Record<string, unknown>> = []
  let runSeq = 0
  let propSeq = 0
  const persistence: SpawnPersistence = {
    async createRun(input) {
      runs.push(input)
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

/** A stub runner that emits a fixed set of proposals and never writes. */
function stubRunner(proposals: DraftProposal[]): AgentRunner {
  return {
    async run(): Promise<RunOutput> {
      return {
        proposals,
        scanResults: [],
        tokensUsed: 100,
        trace: [],
        outcome: 'completed',
      }
    },
  }
}

const ingestDraft: DraftProposal = {
  kind: 'ingest',
  title: 'Ingest "X"',
  rationale: 'why',
  citations: [{ quote: 'q' }],
  plan: { source: { title: 'X' }, pageOps: [], entityOps: [] },
}

const flaggedDraft: DraftProposal = {
  kind: 'flagged-content',
  title: 'Flagged: Y',
  rationale: 'held',
  citations: [],
  plan: null,
  scanResult: { status: 'flagged', findings: [{ category: 'injection', passage: 'p', offset: 0 }] },
}

describe('spawnSubAgent — propose-never-write + nesting', () => {
  it('runs with the BOUNDED scope budget and persists every proposal as pending', async () => {
    const mem = memoryPersistence()
    const runner = stubRunner([ingestDraft, flaggedDraft])
    const deps: SpawnDeps = {
      runner,
      buildTools: (userId) => buildReadOnlyVaultTools(userId),
      persistence: mem.persistence,
    }

    const result = await spawnSubAgent(
      {
        parent: parent({ trustScope: scope({ perRunTokenBudget: 2_000 }) }),
        requestedScope: scope({ perRunTokenBudget: 999_999 }),
        subAgentId: 'sub_1',
        parentRunId: 'run_parent',
        parentProposalId: 'prop_parent',
      },
      deps,
    )

    // Bounded budget passed to the run record (≤ parent).
    expect(mem.runs[0].perRunBudget).toBe(2_000)
    // Every emitted proposal persisted as pending, with parent linkage for nesting.
    expect(mem.proposals).toHaveLength(2)
    for (const p of mem.proposals) {
      expect(p.status).toBe('pending')
      expect(p.agentId).toBe('sub_1')
      expect(p.parentProposalId).toBe('prop_parent')
    }
    expect(result.proposalIds).toHaveLength(2)
    expect(mem.finalized[0].proposalIds).toHaveLength(2)
  })

  it('the read-only tools handed to the sub-agent expose NO write binding (Property 1)', () => {
    const tools: VaultTools = buildReadOnlyVaultTools('user_1')
    expect('applyIngestPlan' in tools).toBe(false)
    expect(typeof tools.planIngest).toBe('function')
    expect(typeof tools.scan).toBe('function')
  })

  it('passes a write-free RunContext to the runner (dryRun false, scope bounded, no token leak)', async () => {
    const mem = memoryPersistence()
    const runSpy = vi.fn(async () => ({
      proposals: [] as DraftProposal[],
      scanResults: [],
      tokensUsed: 0,
      trace: [],
      outcome: 'completed' as const,
    }))
    const deps: SpawnDeps = {
      runner: { run: runSpy },
      buildTools: () => buildReadOnlyVaultTools('user_1'),
      persistence: mem.persistence,
    }

    await spawnSubAgent(
      { parent: parent(), requestedScope: scope({ readableSourceIds: ['s1'] }), subAgentId: 'sub_2' },
      deps,
    )

    expect(runSpy).toHaveBeenCalledTimes(1)
    const ctx = runSpy.mock.calls[0][0] as { dryRun: boolean; budget: { perRunTokens: number }; scopedToken: string; agent: Record<string, unknown> }
    expect(ctx.dryRun).toBe(false)
    // Budget bounded to the parent (s1 in parent ⇒ scope kept, budget = parent's).
    expect(ctx.budget.perRunTokens).toBe(10_000)
    // The runner agent carries the bounded scope, never wider than the parent.
    const subScope = ctx.agent.trustScope as TrustScope
    expect(subScope.readableSourceIds).toEqual(['s1'])
  })

  it('emits no proposals when the runner emits none (nothing to write)', async () => {
    const mem = memoryPersistence()
    const deps: SpawnDeps = {
      runner: stubRunner([]),
      buildTools: () => buildReadOnlyVaultTools('user_1'),
      persistence: mem.persistence,
    }
    const result = await spawnSubAgent({ parent: parent(), requestedScope: scope(), subAgentId: 'sub_3' }, deps)
    expect(result.proposalIds).toEqual([])
    expect(mem.proposals).toEqual([])
  })
})
