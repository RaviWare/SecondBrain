// ── Agent runner engine — driver interface + tool/context types ───────────────
// Types & interfaces ONLY. No runtime logic and NO DB/model imports live here
// (the ClaudeVaultRunner implementation is task 1.5). This is the contract
// shared by every runner driver: both ClaudeVaultRunner (now) and
// HermesContainerRunner (later) satisfy `AgentRunner`, are handed the SAME
// read-only `VaultTools`, and always emit `DraftProposal[]` — they are
// structurally incapable of writing to the vault.
// See design.md → "Components and Interfaces · 1. The runner engine".

// ── Triggers ──────────────────────────────────────────────────────────────────
/** What caused a Run to start. */
export type RunTrigger =
  | { kind: 'manual' }
  | { kind: 'dry-run' }
  | { kind: 'scheduled'; cron: string }
  | { kind: 'reactive'; event: string; sourceAgentId?: string }

// ── Trace ───────────────────────────────────────────────────────────────────────
/** One step in a Run's trace: which skill ran, what step, tokens spent. */
export type RunTraceEntry = {
  at: Date
  skillId: string | null
  step: string
  tokens: number
}

// ── Retrieval / source shapes ─────────────────────────────────────────────────────
/** A raw retrieval hit (read tool result). */
export type SearchHit = {
  slug: string
  title: string
  snippet?: string
}

/**
 * A fetched + cleaned source, pre-scan, pre-plan.
 * Lightweight local shape. The authoritative `RawSource`/scanner contract lands
 * in `src/lib/agents/scanner.ts` in Phase 2 (task 2.2); these will be reconciled
 * (re-exported) then.
 */
export type RawSource = {
  type: 'url' | 'text'
  title: string
  url: string | null
  rawContent: string
}

// ── Content scanner result (shared, lightweight) ──────────────────────────────────
/**
 * Result of a Content_Scanner pass over a source.
 * Lightweight local shape (`category` is a plain string here). The authoritative
 * `ScanResult` — with the typed `ScanCategory` union — lands in
 * `src/lib/agents/scanner.ts` in Phase 2 (task 2.2); these will be reconciled
 * (re-exported) then.
 */
export type ScanResult =
  | { status: 'clean'; findings: [] }
  | { status: 'flagged'; findings: Array<{ category: string; passage: string; offset: number }> }

// ── Budget ─────────────────────────────────────────────────────────────────────
/** Effective per-run cap after Agent/Squad clamps, plus remaining headroom. */
export type ResolvedBudget = {
  perRunTokens: number
  agentRemaining: number
  squadRemaining: number
}

// ── Run context ─────────────────────────────────────────────────────────────────
/**
 * Everything a runner needs to execute exactly one Run.
 *
 * `agent` is typed `unknown` on purpose: this is a pure types module, and we do
 * NOT import the Mongoose `Agent` model here (that would pull a DB module into a
 * types-only file). At runtime the runner receives the configured worker
 * document (role, skills, scope, signOffPolicy, trust); callers narrow it.
 */
export type RunContext = {
  agent: unknown // configured Agent doc at runtime — kept `unknown` to avoid a model import
  trigger: RunTrigger
  runId: string // AgentRun._id, created before the run starts
  parentRunId?: string // set for sub-agent runs
  scopedToken: string // brain token scoped to agent.trustScope (never logged)
  budget: ResolvedBudget // effective per-run cap after Agent/Squad clamps
  dryRun: boolean
}

// ── Proposals ──────────────────────────────────────────────────────────────────────
/**
 * The in-memory proposal a runner emits BEFORE persistence (becomes a `Proposal`
 * doc only on approval/auto-apply via the Aegis layer).
 *
 * `plan` is `unknown` on purpose to avoid a hard import cycle with `vault-ops`:
 * at runtime it is an `IngestPlan | ConnectionPlan` (see design.md → Data Models
 * → `Proposal`). It is `null` for `flagged-content` holds, which carry a
 * `scanResult` instead of a write plan.
 */
export type DraftProposal = {
  kind: 'ingest' | 'synthesis' | 'connection' | 'flagged-content'
  title: string
  rationale: string
  citations: Array<{ slug?: string; url?: string; quote: string }>
  plan: unknown | null // runtime: IngestPlan | ConnectionPlan — `unknown` avoids a vault-ops import cycle
  scanResult?: unknown | null // present (+ flagged) for kind === 'flagged-content'
}

// ── Tool bindings ────────────────────────────────────────────────────────────────────
/**
 * Read-only tool bindings handed to a runner.
 *
 * CRITICAL: there is intentionally NO `applyIngestPlan` binding here — the runner
 * can PLAN a write (`planIngest`) but can never PERFORM one. The runner is
 * structurally incapable of writing to the vault. Only the Aegis layer
 * (`applyProposal`) may apply a plan, and only on an approved/auto-applied
 * Proposal. `query`/`planIngest`/`fetchSource` inputs/outputs are typed `unknown`
 * to keep this a DB-import-free, cycle-free types module (the concrete
 * `QueryResult`/`IngestInput`/`IngestPlan` shapes live in `vault-ops`).
 */
export type VaultTools = {
  search(query: string): Promise<SearchHit[]> // raw retrieval (read)
  query(question: string): Promise<unknown> // runQuery (read) — runtime: QueryResult
  planIngest(input: unknown): Promise<unknown> // PURE plan, no write — runtime: (IngestInput) => IngestPlan
  fetchSource(input: unknown): Promise<RawSource> // fetch + clean only — runtime input: IngestInput
  scan(source: RawSource): ScanResult // Content_Scanner
}

// ── Run output ─────────────────────────────────────────────────────────────────────
/** What a single Run produces. Proposals are emitted, NOT yet persisted as approved. */
export type RunOutput = {
  proposals: DraftProposal[]
  scanResults: ScanResult[]
  tokensUsed: number
  trace: RunTraceEntry[]
  outcome: 'completed' | 'failed' | 'budget-stopped' | 'timeout'
  failureReason?: string
}

// ── Runner driver interface ───────────────────────────────────────────────────────────
export interface AgentRunner {
  /**
   * Execute one Run. MUST NOT write knowledge to the vault. Emits Proposals only.
   */
  run(ctx: RunContext, tools: VaultTools): Promise<RunOutput>
}
