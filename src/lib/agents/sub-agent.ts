// ── Bounded Sub_Agent spawn (through the same Aegis gate as the parent) ───────
// A Sub_Agent is a bounded, nested worker an Agent spawns for a focused sub-task
// (glossary "Sub_Agent"; Req 8.9–8.11). This module makes the two design
// invariants STRUCTURAL rather than conventional:
//
//   • Property 8 — scope ⊆ parent. The Sub_Agent's Trust_Scope is computed by
//     `resolveSubScope(parent.trustScope, requested)` (scope.ts, Phase 2). It is
//     NEVER widened anywhere here: readable sources/collections ⊆ parent's,
//     `webAccess ⇒ parent.webAccess`, and `perRunTokenBudget ≤ parent's`. We do
//     not re-implement clamping — we DELEGATE to the audited resolver (which
//     carries the disjoint-clamp security fix).
//
//   • Property 1 — propose-never-write, extended to sub-agents. A spawned
//     Sub_Agent run uses the SAME read-only `VaultTools` (no `applyIngestPlan`)
//     and the SAME runner contract (`getRunner().run`) as the parent, so it is
//     structurally write-free. Its emitted proposals are persisted `pending` and
//     resolved through the SAME `applyProposal` choke point as the parent — there
//     is NO alternate write path. Linkage (`parentAgentId` / `parentRunId` /
//     `parentProposalId`) is carried so the Work Board (task 5.4) renders the
//     Sub_Agent's work as a NESTED Work_Item.
//
// Design references: design.md → "Least privilege" (sub-agent scope ⊆ parent),
// the propose-never-write data flow, Property 1, Property 8; Requirements
// 8.9, 8.10, 8.11.
//
// The pure scope-resolution (`resolveSubAgentScope`) and the dependency-injected
// `spawnSubAgent` are exported so the property test (task 5.7) can target them
// directly with a spy `applyProposal` / in-memory persistence — no live DB.

import { resolveSubScope, type TrustScope, type ResolvedScope } from '@/lib/agents/scope'
import { renderTrustScopeStatement } from '@/lib/agents/role-defaults'
import { classifyStakes } from '@/lib/agents/aegis/classify'
import { getRunner } from '@/lib/agents/runner'
import { buildReadOnlyVaultTools } from '@/lib/agents/runner/vault-tools'
import type {
  AgentRunner,
  RunContext,
  RunOutput,
  VaultTools,
  DraftProposal,
} from '@/lib/agents/runner/types'

// ── Parent shape (structural; no Mongoose import) ─────────────────────────────
// We type only the slice of a parent Agent this module reads, mirroring how
// `classify.ts` / `role-defaults.ts` stay DB-free. At runtime callers pass the
// hydrated `Agent` doc (or a lean object); the fields below interoperate with the
// `IAgent` model (ObjectId ids stringify cleanly through `resolveSubScope`).
export interface ParentAgentLike {
  /** The parent Agent's id — becomes the Sub_Agent's `parentAgentId` (Req 8.9). */
  _id: unknown
  /** Owning user — the Sub_Agent inherits the SAME owner (never cross-user). */
  userId: string
  name?: string
  role?: string
  customRoleDescription?: string | null
  /** The parent's least-privilege scope — the upper bound for the Sub_Agent. */
  trustScope: TrustScope
  /** The parent's sign-off policy — inherited so the gate behaves identically. */
  signOffPolicy?: ClassifiableSignOffPolicy
  /** The parent's earned trust — inherited as the Sub_Agent's starting ceiling. */
  trustScore?: number
}

type SignOffAction = 'auto' | 'ask' | 'notify'
interface ClassifiableSignOffPolicy {
  ingestSource: SignOffAction
  createSynthesis: SignOffAction
  createConnection: SignOffAction
  flagContradiction: SignOffAction
}

/**
 * Total, never-throwing numeric coercion. `Number(x)` invokes ToPrimitive on a
 * non-primitive, which THROWS `TypeError: Cannot convert object to primitive
 * value` when the object's `toString`/`valueOf` are not callable (e.g.
 * `{ toString: 0 }`). To keep `resolveSubAgentScope` total we only attempt
 * conversion on primitives that are safe to coerce; everything else → NaN, which
 * the caller's `Number.isFinite` guard maps to the conservative default.
 */
function safeNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  if (typeof value === 'bigint') return Number(value)
  // objects, symbols, null, undefined, booleans → not a usable trust score
  return NaN
}

/** The conservative default policy used when the parent does not specify one. */
function conservativeSignOffPolicy(): ClassifiableSignOffPolicy {
  return {
    ingestSource: 'ask',
    createSynthesis: 'ask',
    createConnection: 'ask',
    flagContradiction: 'notify',
  }
}

// ── resolveSubAgentScope ──────────────────────────────────────────────────────

/**
 * The bounded Sub_Agent run configuration produced from a parent + a request.
 * It is structurally write-free (no token write capability) and carries the
 * parent linkage + the bounded scope to persist on the spawned Sub_Agent.
 */
export interface SubAgentConfig {
  /** Owner (Clerk user id) — same as the parent (Req 8.10: never cross-user). */
  userId: string
  /** Parent linkage so the Work Board can nest the Sub_Agent's work (Req 8.9). */
  parentAgentId: unknown
  name: string
  role: string
  customRoleDescription: string | null
  /** The resolved scope — guaranteed ⊆ parent by `resolveSubScope` (Property 8). */
  trustScope: ResolvedScope
  /** Plain-language statement regenerated from the BOUNDED scope (Req 1.8). */
  trustScopeStatement: string
  /** Inherited sign-off policy (the gate behaves identically to the parent's). */
  signOffPolicy: ClassifiableSignOffPolicy
  /** Starting trust — never above the parent's earned trust. */
  trustScore: number
  /** Bounded per-run token budget — equals the resolved scope's budget (≤ parent). */
  perRunTokenBudget: number
}

/**
 * Compute a Sub_Agent's bounded run configuration from its parent Agent and a
 * requested scope. PURE / TOTAL / DETERMINISTIC — no I/O, never throws.
 *
 * The scope is bounded by DELEGATING to `resolveSubScope` (⊆ parent on every
 * axis — Property 8); nothing here widens it. `perRunTokenBudget` is taken from
 * the RESOLVED scope (`min(parent, requested)`), so the Sub_Agent's budget can
 * never exceed the parent's. The plain-language statement is regenerated from the
 * bounded scope so it "denies by name" what the Sub_Agent cannot do (Req 1.8).
 */
export function resolveSubAgentScope(
  parent: ParentAgentLike,
  requested: TrustScope,
): SubAgentConfig {
  // Bound the scope to a subset of the parent (the audited, property-tested
  // resolver — includes the disjoint-clamp escalation fix). We NEVER widen.
  const trustScope = resolveSubScope(parent.trustScope, requested)

  const role = typeof parent.role === 'string' ? parent.role : 'researcher'
  const baseName = typeof parent.name === 'string' && parent.name.trim() ? parent.name.trim() : 'Agent'
  // A Sub_Agent's starting trust never exceeds the parent's earned trust; default
  // conservatively when the parent's score is missing/non-finite.
  const parentTrust = safeNumber(parent.trustScore)
  const trustScore = Number.isFinite(parentTrust) ? Math.max(0, Math.min(100, parentTrust)) : 0

  return {
    userId: parent.userId,
    parentAgentId: parent._id,
    name: `${baseName} · sub-agent`,
    role,
    customRoleDescription:
      typeof parent.customRoleDescription === 'string' ? parent.customRoleDescription : null,
    trustScope,
    // Regenerate the statement from the BOUNDED scope — never copy the parent's.
    trustScopeStatement: renderTrustScopeStatement(trustScope as unknown as TrustScope),
    signOffPolicy: parent.signOffPolicy ?? conservativeSignOffPolicy(),
    trustScore,
    perRunTokenBudget: trustScope.perRunTokenBudget,
  }
}

// ── Injectable dependencies (testable spawn) ──────────────────────────────────
// `spawnSubAgent` takes its side-effecting collaborators as injected deps so the
// property test (task 5.7) can drive it with an in-memory persistence layer and a
// spy `applyIngestPlan`/`applyProposal` — asserting zero runner writes and that
// writes go ONLY through the gate. Production callers use `defaultSpawnDeps()`.

/** What `spawnSubAgent` must persist; modelled on the `AgentRun`/`Proposal` writes. */
export interface SpawnPersistence {
  /** Create the Sub_Agent run record (status 'running'), returning its id. */
  createRun(input: {
    userId: string
    agentId: unknown
    parentRunId: unknown
    perRunBudget: number
  }): Promise<{ runId: unknown }>
  /** Persist ONE emitted proposal as `pending`, returning its id. Linkage carried. */
  createProposal(input: PersistProposalInput): Promise<{ proposalId: unknown }>
  /** Finalize the run record with its outcome/tokens/trace + proposal ids. */
  finalizeRun(input: {
    runId: unknown
    output: RunOutput
    proposalIds: unknown[]
  }): Promise<void>
}

/** The shape persisted for a single Sub_Agent proposal (mirrors `IProposal`). */
export interface PersistProposalInput {
  userId: string
  /** The SUB-agent's id — the proposal's originating agent. */
  agentId: unknown
  /** The Sub_Agent run that produced it. */
  runId: unknown
  /** Parent Proposal linkage for nested Work_Item rendering (Req 8.9), if any. */
  parentProposalId: unknown
  kind: DraftProposal['kind']
  title: string
  rationale: string
  citations: DraftProposal['citations']
  plan: unknown
  scanResult: unknown
  stakes: 'low-reversible' | 'sign-off-required'
  /** ALWAYS 'pending' — a Sub_Agent never auto-writes; the user resolves via the gate. */
  status: 'pending'
}

/** The collaborators `spawnSubAgent` depends on (all injectable for tests). */
export interface SpawnDeps {
  /** The runner driver (default: `getRunner()`). Structurally write-free. */
  runner: AgentRunner
  /** Read-only vault tools (default: `buildReadOnlyVaultTools(userId)`). No write binding. */
  buildTools: (userId: string) => VaultTools
  /** Persistence for the run + its proposals. */
  persistence: SpawnPersistence
}

// ── spawnSubAgent ─────────────────────────────────────────────────────────────

/** Parameters to spawn one bounded Sub_Agent run. */
export interface SpawnSubAgentParams {
  /** The parent Agent spawning the Sub_Agent. */
  parent: ParentAgentLike
  /** The requested Sub_Agent scope (clamped to ⊆ parent before use). */
  requestedScope: TrustScope
  /** The persisted Sub_Agent id (its `Agent._id`). The Sub_Agent doc is created by the caller/route. */
  subAgentId: unknown
  /** The parent's run id this sub-task descends from (→ `AgentRun.parentRunId`). */
  parentRunId?: unknown
  /** The parent Proposal this sub-task refines/expands, if any (→ `parentProposalId`). */
  parentProposalId?: unknown
  /** Ingest-class inputs / objective the Sub_Agent should act on. */
  ingestInputs?: unknown[]
  objective?: string
  /** Assigned skill ids (already authority-granted ⊆ the parent's). */
  skillIds?: string[]
}

/** The result of a bounded Sub_Agent spawn. */
export interface SpawnSubAgentResult {
  /** The bounded config actually used (scope ⊆ parent). */
  config: SubAgentConfig
  /** The created Sub_Agent run id. */
  runId: unknown
  /** The ids of the `pending` proposals emitted by the Sub_Agent run. */
  proposalIds: unknown[]
  /** The raw runner output (proposals/scan/trace/outcome). */
  output: RunOutput
}

/**
 * Spawn ONE bounded Sub_Agent run and persist its emitted proposals as `pending`.
 *
 * Guarantees (the whole point of task 5.5):
 *  1. SCOPE ⊆ PARENT (Property 8 / Req 8.10): the run executes with
 *     `resolveSubAgentScope(parent, requested).trustScope`, never wider. The
 *     per-run token budget passed to the runner equals the bounded budget.
 *  2. PROPOSE-NEVER-WRITE (Property 1 / Req 8.11): the runner is handed ONLY the
 *     read-only `VaultTools` (no `applyIngestPlan`) and emits `DraftProposal[]`.
 *     This function performs NO vault knowledge write — it only persists
 *     proposals as `pending`. The single write path is `applyProposal`, reached
 *     exactly as for a parent proposal (e.g. POST /api/proposals/[id] → approve).
 *  3. NESTING (Req 8.9): `parentAgentId` / `parentRunId` / `parentProposalId` are
 *     carried so the Work Board renders the Sub_Agent's work nested under its parent.
 *
 * DEPENDENCY-INJECTED for testability (task 5.7): pass a spy persistence layer
 * and a no-op runner to assert "zero runner writes; writes only via applyProposal".
 */
export async function spawnSubAgent(
  params: SpawnSubAgentParams,
  deps: SpawnDeps,
): Promise<SpawnSubAgentResult> {
  const { parent, requestedScope, subAgentId, parentRunId, parentProposalId } = params

  // 1. Bound the scope to a subset of the parent (Property 8). Never widened.
  const config = resolveSubAgentScope(parent, requestedScope)

  // 2. Open the Sub_Agent run record (retained even on failure), linked to the
  //    parent run so the work nests on the board (Req 8.9).
  const { runId } = await deps.persistence.createRun({
    userId: config.userId,
    agentId: subAgentId,
    parentRunId: parentRunId ?? null,
    perRunBudget: config.perRunTokenBudget,
  })

  // 3. Build the SAME read-only tools the parent uses — structurally write-free.
  const tools = deps.buildTools(config.userId)

  // 4. Assemble the run context. The agent payload the runner reads carries the
  //    BOUNDED scope + the sub-task inputs; `dryRun:false` (a spawned sub-task is
  //    a real run, but it still only proposes). The budget is the bounded budget.
  const runnerAgent = {
    name: config.name,
    role: config.role,
    customRoleDescription: config.customRoleDescription,
    objective: params.objective,
    skillIds: params.skillIds ?? [],
    trustScore: config.trustScore,
    signOffPolicy: config.signOffPolicy,
    trustScope: config.trustScope,
    parentAgentId: config.parentAgentId,
    ingestInputs: params.ingestInputs ?? [],
  }
  const ctx: RunContext = {
    agent: runnerAgent,
    trigger: { kind: 'manual' },
    runId: String(runId),
    parentRunId: parentRunId != null ? String(parentRunId) : undefined,
    // Brain token is minted by the route when needed; never logged. The runner
    // does not write via the token regardless (it proposes only).
    scopedToken: '',
    budget: {
      perRunTokens: config.perRunTokenBudget,
      agentRemaining: config.perRunTokenBudget,
      squadRemaining: config.perRunTokenBudget,
    },
    dryRun: false,
  }

  // 5. Execute the run. The runner emits DraftProposals ONLY — no vault writes.
  const output = await deps.runner.run(ctx, tools)

  // 6. Persist each emitted proposal as `pending`, classifying its stakes with
  //    the SAME classifier the parent path uses. Linkage carried for nesting.
  //    NOTHING is written to the vault here — approval flows through applyProposal.
  const proposalIds: unknown[] = []
  for (const draft of output.proposals) {
    const stakes = classifyStakes(draft, {
      trustScore: config.trustScore,
      signOffPolicy: config.signOffPolicy,
    })
    const { proposalId } = await deps.persistence.createProposal({
      userId: config.userId,
      agentId: subAgentId,
      runId,
      parentProposalId: parentProposalId ?? null,
      kind: draft.kind,
      title: draft.title,
      rationale: draft.rationale,
      citations: draft.citations,
      plan: draft.plan ?? null,
      scanResult: draft.scanResult ?? null,
      stakes,
      status: 'pending',
    })
    proposalIds.push(proposalId)
  }

  // 7. Finalize the run record with the outcome/tokens/trace + proposal ids.
  await deps.persistence.finalizeRun({ runId, output, proposalIds })

  return { config, runId, proposalIds, output }
}

// ── Default (production) dependencies ─────────────────────────────────────────

/**
 * The production `SpawnDeps`: the active runner driver, the read-only vault tool
 * builder, and a Mongoose-backed persistence layer writing `AgentRun` /
 * `Proposal` docs (status 'pending'). Kept here (lazy `import`) so the pure
 * `resolveSubAgentScope` + the injectable `spawnSubAgent` stay DB-free for tests.
 */
export function defaultSpawnDeps(): SpawnDeps {
  return {
    runner: getRunner(),
    buildTools: buildReadOnlyVaultTools,
    persistence: mongoSpawnPersistence(),
  }
}

/** Mongoose-backed persistence for a Sub_Agent spawn (lazy model import). */
export function mongoSpawnPersistence(): SpawnPersistence {
  return {
    async createRun(input) {
      const { connectDB } = await import('@/lib/mongodb')
      const { AgentRun } = await import('@/lib/models')
      await connectDB()
      const run = await AgentRun.create({
        userId: input.userId,
        agentId: input.agentId as never,
        parentRunId: (input.parentRunId ?? null) as never,
        trigger: 'manual',
        dryRun: false,
        status: 'running',
        perRunBudget: input.perRunBudget,
        startedAt: new Date(),
      })
      return { runId: run._id }
    },

    async createProposal(input) {
      const { connectDB } = await import('@/lib/mongodb')
      const { Proposal } = await import('@/lib/models')
      await connectDB()
      const proposal = await Proposal.create({
        userId: input.userId,
        agentId: input.agentId as never,
        runId: input.runId as never,
        parentProposalId: (input.parentProposalId ?? null) as never,
        kind: input.kind,
        title: input.title,
        rationale: input.rationale,
        citations: input.citations,
        plan: input.plan ?? null,
        scanResult: input.scanResult ?? null,
        stakes: input.stakes,
        // Sub_Agent proposals are ALWAYS pending — they resolve through the SAME
        // applyProposal gate as the parent. No alternate write path.
        status: 'pending',
      })
      return { proposalId: proposal._id }
    },

    async finalizeRun(input) {
      const { connectDB } = await import('@/lib/mongodb')
      const { AgentRun } = await import('@/lib/models')
      await connectDB()
      const status = input.output.outcome === 'completed' ? 'completed' : input.output.outcome
      await AgentRun.updateOne(
        { _id: input.runId as never },
        {
          $set: {
            status,
            tokensUsed: input.output.tokensUsed,
            trace: input.output.trace,
            proposalIds: input.proposalIds as never,
            outcome: `${input.output.proposals.length} sub-agent proposal(s) emitted`,
            failureReason: input.output.failureReason ?? null,
            finishedAt: new Date(),
          },
        },
      )
    },
  }
}
