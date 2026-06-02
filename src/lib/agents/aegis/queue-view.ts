// ── Aegis Queue view-model (PURE, UI/DB-agnostic) ─────────────────────────────
// Maps a Proposal to the consistent Aegis-queue anatomy rendered identically by
// the Squad_Dashboard right rail, the Inbox, and the Work_Board side sheet:
//   what (title) · why (rationale + citations) · exactly three decisions.
// Pure functions only — NO I/O, no DB/model imports, no Mongoose. This keeps the
// view-model trivially unit/property testable and shareable across every surface.
//
// Lands design.md → Property 16 ("Aegis Queue items have consistent anatomy and
// resolve cleanly"). Requirements: 3.2, 3.3, 3.11, 8.7.

// ── Input shape ───────────────────────────────────────────────────────────────
/**
 * Minimal structural view of a `Proposal` (see `IProposal` in `@/lib/models`)
 * carrying only the fields the queue view-model reads. Declared locally — rather
 * than importing the Mongoose `IProposal` — so this module stays DB-agnostic and
 * easy to test with plain objects. Any object with these fields (a hydrated
 * Mongoose doc, a `.lean()` row, or a fixture) is accepted.
 *
 * `_id` / `agentId` are typed loosely (`unknown`) because at runtime they may be
 * `ObjectId`s or strings; `toQueueItem` normalizes both via `String(...)`.
 */
export type ProposalView = {
  _id: unknown
  agentId: unknown
  kind: 'ingest' | 'synthesis' | 'connection' | 'flagged-content'
  title: string
  rationale: string
  citations: Array<{ slug?: string; url?: string; quote: string }>
  status: 'pending' | 'approved' | 'refined' | 'dismissed' | 'auto-applied' | 'failed'
  /**
   * Refine/sub-agent lineage (`IProposal.parentProposalId`) — the id of the
   * Proposal this one descends from, or null/absent for a top-level Proposal.
   * Optional here so plain fixtures stay valid; the Work_Board reads it to NEST a
   * spawned Sub_Agent's Proposal under its parent's Work_Item (Req 8.9). Typed
   * loosely (`unknown`) because at runtime it may be an `ObjectId`, a string, or
   * null; the board view-model normalizes it via `String(...)`.
   */
  parentProposalId?: unknown
}

// ── Decisions ─────────────────────────────────────────────────────────────────
/** The three — and only three — decisions offered on every queue item (Req 3.3). */
export type QueueDecision = 'approve' | 'refine' | 'dismiss'

/**
 * The canonical decision triple, in display order. Frozen so callers cannot
 * mutate the shared constant; `toQueueItem` hands out a fresh copy per item.
 */
export const QUEUE_ACTIONS: readonly QueueDecision[] = Object.freeze([
  'approve',
  'refine',
  'dismiss',
])

/**
 * Proposal kinds that assert facts about the vault and therefore MUST carry at
 * least one citation (Req 2.5). Everything except `flagged-content` is factual:
 * a flagged-content hold carries suspicious passages, not a cited claim.
 */
const FACTUAL_KINDS: ReadonlySet<ProposalView['kind']> = new Set([
  'ingest',
  'synthesis',
  'connection',
])

// ── Output shape ──────────────────────────────────────────────────────────────
/**
 * The consistent anatomy every Aegis surface renders: what · why · evidence ·
 * the three decisions. `isFactual` tells the UI this item requires ≥1 citation.
 */
export type QueueItem = {
  id: string
  agentId: string
  kind: string
  what: string
  why: string
  citations: Array<{ slug?: string; url?: string; quote: string }>
  actions: QueueDecision[]
  isFactual: boolean
}

// ── Predicates ────────────────────────────────────────────────────────────────
/**
 * True iff the Proposal is still awaiting a decision. Terminal statuses
 * (`approved` / `dismissed` / `refined` / `auto-applied` / `failed`) are NOT
 * pending — once resolved, an item leaves the pending queue (Req 3.11).
 */
export function isPending(proposal: Pick<ProposalView, 'status'>): boolean {
  return proposal.status === 'pending'
}

// ── Mappers ───────────────────────────────────────────────────────────────────
/**
 * Map a Proposal to its consistent Aegis-queue anatomy. PURE & total:
 * - `what`     = title (what is proposed)            — Req 3.2
 * - `why`      = rationale (the evidence narrative)  — Req 3.2, 8.7
 * - `citations`= the proposal's citations verbatim   — Req 8.7
 * - `actions`  = ALWAYS exactly ['approve','refine','dismiss'] in order — Req 3.3
 * - `isFactual`= kind ∈ {ingest,synthesis,connection} (NOT flagged-content)
 * - `id`/`agentId` normalized to strings (ObjectId-safe)
 */
export function toQueueItem(proposal: ProposalView): QueueItem {
  return {
    id: String(proposal._id),
    agentId: String(proposal.agentId),
    kind: proposal.kind,
    what: proposal.title,
    why: proposal.rationale,
    citations: proposal.citations,
    // Fresh array per item so callers can't mutate the shared QUEUE_ACTIONS.
    actions: [...QUEUE_ACTIONS],
    isFactual: FACTUAL_KINDS.has(proposal.kind),
  }
}

/**
 * The pending Aegis_Queue: keep only `pending` proposals and project each to its
 * queue item. Terminal-status proposals are excluded, so a resolved item is
 * absent from the pending queue (Req 3.11). Input order is preserved.
 */
export function pendingQueue(proposals: ProposalView[]): QueueItem[] {
  return proposals.filter(isPending).map(toQueueItem)
}
