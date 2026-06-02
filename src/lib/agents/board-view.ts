// ── Work_Board view-model (PURE, UI/DB-agnostic) ──────────────────────────────
// Groups a user's real Agent work into the five Work_Board columns
//   Queued → Reading → Connecting → Review → Woven in
// in their canonical pipeline order (Req 8.1). The Review column is the
// Aegis_Gate: it holds every Work_Item awaiting sign-off and is the ONLY column
// that carries the reserved warm accent (Req 8.2, 8.3) — the accent decision is
// imported from `accent.ts`, never re-derived here (design.md → Property 17).
//
// PURE functions only — NO I/O, no DB/model imports, no Mongoose. The async fetch
// + shaping lives in the API route (`/api/agents/board`); this module is trivially
// unit/property testable with plain objects.
//
// NO FABRICATED DATA (hard project rule; Req 6.2 spirit, mirrors Property 19):
// every Work_Item is derived from a real `Proposal` or in-flight `AgentRun` row.
// A column with no real backing rows is returned EMPTY — never padded with
// placeholder cards.
//
// Column derivation (all from real persisted state):
//   • Review     ← Proposal.status === 'pending'  (the Aegis_Queue; reuses the
//                  shared `toQueueItem` anatomy so what·why·citations·three-actions
//                  match the dashboard rail, Inbox, and side sheet — Req 8.7)
//   • Woven in   ← Proposal.status ∈ {approved, auto-applied}  (landed in the vault)
//   • Reading    ← an active AgentRun whose latest trace step is fetch-source/scan
//   • Connecting ← an active AgentRun whose latest trace step is plan-ingest
//   • Queued     ← an active AgentRun that has not yet read a source
//   Terminal-but-not-woven proposals (dismissed/refined/failed) never appear.
//
// Requirements: 8.1, 8.2, 8.3 (+ reuse of 3.2/3.3/8.7 via `toQueueItem`).

import {
  WORK_BOARD_COLUMNS,
  accentForColumn,
  type WorkBoardColumn,
} from './accent'
import {
  toQueueItem,
  type ProposalView,
  type QueueDecision,
} from './aegis/queue-view'

// ── Input shapes (duck-typed; accept lean rows, hydrated docs, or fixtures) ────

/**
 * Minimal view of an in-flight `AgentRun` (status === 'running') the board reads.
 * `latestStep` is the `step` of the most recent `trace` entry, or `null` when the
 * run has not recorded a step yet. The API route extracts this from the real
 * `AgentRun.trace`; this module stays DB-agnostic.
 */
export interface ActiveRunRow {
  _id: unknown
  agentId: unknown
  latestStep: string | null
}

// ── Output shapes ──────────────────────────────────────────────────────────────

/**
 * One unit of Agent work placed in a column. For Review items the anatomy mirrors
 * an Aegis_Queue item (what · why · ≥1 citation for factual · the three decision
 * actions). For every other column `actions` is empty (no decision is offered off
 * the gate) and `citations` carries whatever evidence the source row had.
 */
export interface WorkItemView {
  id: string
  column: WorkBoardColumn
  agentId: string
  /** Proposal kind ('ingest'|'synthesis'|'connection'|'flagged-content') or 'run'. */
  kind: string
  /** "what is happening / proposed" (title or step summary). */
  what: string
  /** "why" — rationale (proposals) or current activity (runs); may be empty. */
  why: string
  citations: Array<{ slug?: string; url?: string; quote: string }>
  /** True for fact-asserting proposals (ingest/synthesis/connection). */
  isFactual: boolean
  /** Exactly the three decisions for Review items; empty for every other column. */
  actions: QueueDecision[]
  /**
   * Nested Work_Items rendered under this one (Req 8.9). Populated when another
   * board-eligible Proposal carries a `parentProposalId` matching this item's id —
   * e.g. a spawned Sub_Agent's Proposal nests under its parent's Work_Item. Always
   * an array (possibly empty) for a stable shape; nesting is derived only from a
   * genuine `parentProposalId` linkage by `groupWorkBoard` — never fabricated.
   */
  children: WorkItemView[]
}

/** A column plus its accent decision and the Work_Items it currently holds. */
export interface BoardColumnView {
  column: WorkBoardColumn
  /** Warm-accent decision from `accent.ts` — true IFF this is the Review column. */
  accent: boolean
  items: WorkItemView[]
}

// ── Column classifiers (pure, total) ────────────────────────────────────────────

/** Proposal statuses that have LANDED in the vault → the "Woven in" column. */
const WOVEN_STATUSES: ReadonlySet<ProposalView['status']> = new Set([
  'approved',
  'auto-applied',
])

/**
 * Which column a Proposal belongs in, or `null` when it does not belong on the
 * board at all (dismissed / refined / failed are terminal-but-not-woven and are
 * intentionally omitted). Total — never throws.
 */
export function columnForProposal(status: ProposalView['status']): WorkBoardColumn | null {
  if (status === 'pending') return 'review'
  if (WOVEN_STATUSES.has(status)) return 'woven-in'
  return null
}

/**
 * Which pre-Review column an in-flight run is in, derived from its latest trace
 * `step` (the real runner emits `build-system-context` → `fetch-source:*` →
 * `scan:*` → `plan-ingest:*`). Total — an unknown/empty step is treated as freshly
 * Queued, never thrown on.
 *   • no step / build-system-context → Queued     (started, not yet reading)
 *   • fetch-source* / scan*          → Reading     (reading source material)
 *   • plan-ingest*                   → Connecting  (resolving what to write/connect)
 */
export function columnForRunStep(step: string | null | undefined): WorkBoardColumn {
  if (!step) return 'queued'
  if (step.startsWith('plan-ingest')) return 'connecting'
  if (step.startsWith('fetch-source') || step.startsWith('scan')) return 'reading'
  if (step.startsWith('build-system-context')) return 'queued'
  // Unknown step: it is doing *something* with sources → Reading (never Review).
  return 'reading'
}

// ── Mappers (pure) ───────────────────────────────────────────────────────────────

/** Map a pending/woven Proposal to a Work_Item for the given column. */
function workItemFromProposal(p: ProposalView, column: WorkBoardColumn): WorkItemView {
  // Review items reuse the shared Aegis anatomy verbatim (what·why·citations·three
  // actions) so the gate looks identical to the dashboard rail / Inbox (Req 8.7).
  const q = toQueueItem(p)
  const isReview = column === 'review'
  return {
    id: q.id,
    column,
    agentId: q.agentId,
    kind: q.kind,
    what: q.what,
    why: q.why,
    citations: q.citations,
    isFactual: q.isFactual,
    // Decisions are offered ONLY at the gate; woven-in work is done.
    actions: isReview ? q.actions : [],
    children: [],
  }
}

/** Map an in-flight run to a Work_Item in its pre-Review column. */
function workItemFromRun(run: ActiveRunRow, column: WorkBoardColumn): WorkItemView {
  const step = run.latestStep ?? ''
  return {
    id: String(run._id),
    column,
    agentId: String(run.agentId),
    kind: 'run',
    what: stepSummary(step, column),
    why: '',
    citations: [],
    isFactual: false,
    actions: [],
    children: [],
  }
}

/** A short human label for an active run's current step (no fabricated detail). */
function stepSummary(step: string, column: WorkBoardColumn): string {
  // `fetch-source:Some Title` / `plan-ingest:Some Title` carry a real title suffix.
  const colonIdx = step.indexOf(':')
  const detail = colonIdx >= 0 ? step.slice(colonIdx + 1).trim() : ''
  if (detail) {
    if (column === 'connecting') return `Connecting ${detail}`
    if (column === 'reading') return `Reading ${detail}`
  }
  if (column === 'connecting') return 'Drawing connections'
  if (column === 'reading') return 'Reading sources'
  return 'Queued to run'
}

// ── The grouping function (Req 8.1 ordering + 8.2/8.3 Review gate/accent) ────────

/** Normalize a possibly-`ObjectId`/string/null lineage id to a string, or null. */
function normalizeId(id: unknown): string | null {
  if (id == null) return null
  const s = String(id)
  return s.length > 0 ? s : null
}

/**
 * Group real Proposals + in-flight runs into the five Work_Board columns, returned
 * in canonical pipeline order (Queued → Reading → Connecting → Review → Woven in).
 * PURE, total, deterministic: input order is preserved within each column and no
 * card is fabricated — a column with no backing rows comes back with `items: []`.
 * The per-column `accent` flag comes straight from `accentForColumn` so the Review
 * column (and only it) is accented.
 *
 * NESTED SUB_AGENT WORK (Req 8.9): a Proposal that carries a `parentProposalId`
 * matching another on-board Work_Item is attached to that parent's `children`
 * (rendered nested under the parent's card) INSTEAD of appearing as a separate
 * top-level card. A spawned Sub_Agent persists its proposals with
 * `parentProposalId` set to the parent's Proposal (see `sub-agent.ts`), so its
 * work surfaces nested under the parent. Nesting is REAL — it is derived solely
 * from a genuine `parentProposalId` linkage, never fabricated.
 *
 * NO DATA LOSS (fallback): if a child's `parentProposalId` does NOT resolve to a
 * Work_Item currently on the board (e.g. the parent already landed and was woven
 * in earlier, or is otherwise absent), the child stays a TOP-LEVEL card in its own
 * column rather than being dropped. Every input row that belongs on the board
 * appears exactly once — either nested under its parent or at top level.
 */
export function groupWorkBoard(input: {
  proposals: ProposalView[]
  activeRuns: ActiveRunRow[]
}): BoardColumnView[] {
  const byColumn: Record<WorkBoardColumn, WorkItemView[]> = {
    queued: [],
    reading: [],
    connecting: [],
    review: [],
    'woven-in': [],
  }

  // In-flight runs fill the pre-Review columns. Tracked separately so proposals
  // can find a parent among them too (runs are rarely parents, but the lookup is
  // uniform and harmless).
  const runItems: Array<{ column: WorkBoardColumn; item: WorkItemView }> = []
  for (const run of input.activeRuns) {
    const column = columnForRunStep(run.latestStep)
    runItems.push({ column, item: workItemFromRun(run, column) })
  }

  // Place each board-eligible Proposal (Review = pending, Woven in = applied) and
  // remember its direct parent linkage. Terminal-but-not-woven proposals are
  // omitted exactly as before.
  const placed: Array<{
    column: WorkBoardColumn
    item: WorkItemView
    parentId: string | null
  }> = []
  for (const p of input.proposals) {
    const column = columnForProposal(p.status)
    if (!column) continue
    placed.push({ column, item: workItemFromProposal(p, column), parentId: normalizeId(p.parentProposalId) })
  }

  // Index every on-board Work_Item by id so a child can find its parent wherever
  // it sits (run or proposal, any column), plus each placed proposal's own parent
  // linkage so we can reason about lineage depth.
  const byId = new Map<string, WorkItemView>()
  const parentOf = new Map<string, string | null>()
  for (const { item } of runItems) byId.set(item.id, item)
  for (const { item, parentId } of placed) {
    byId.set(item.id, item)
    parentOf.set(item.id, parentId)
  }

  // The id of an item's parent IFF that parent is itself on the board, else null.
  // Runs have no `parentOf` entry → null (treated as top-level). A self-reference
  // resolves to null. Used both to find nest targets and to bound nesting depth.
  const onBoardParentId = (id: string): string | null => {
    const pid = parentOf.get(id)
    if (!pid || pid === id) return null
    return byId.has(pid) ? pid : null
  }

  // Nest a proposal under its parent's `children` ONLY when that parent is itself
  // a TOP-LEVEL Work_Item (has no on-board parent). Limiting nesting to a single
  // level matches what the card renders (one level of sub-cards) so no descendant
  // is ever hidden, and it cleanly dissolves any lineage cycle (in an A↔B pair
  // each has an on-board parent, so neither is a valid nest target — both stay
  // top-level). Remember which ids got nested so they are not ALSO shown top-level.
  const nested = new Set<string>()
  for (const { item } of placed) {
    const parentId = onBoardParentId(item.id)
    if (!parentId) continue // no on-board parent → fallback: stays top-level (below)
    if (onBoardParentId(parentId)) continue // parent is itself nested → keep child top-level (depth ≤ 1)
    const parent = byId.get(parentId)!
    parent.children.push(item)
    nested.add(item.id)
  }

  // Fill the columns: in-flight runs first, then top-level proposals (a nested
  // child is intentionally skipped here — it lives under its parent's card). Every
  // input row that belongs on the board appears exactly once (nested OR top-level).
  for (const { column, item } of runItems) byColumn[column].push(item)
  for (const { column, item } of placed) {
    if (nested.has(item.id)) continue
    byColumn[column].push(item)
  }

  return WORK_BOARD_COLUMNS.map((column) => ({
    column,
    accent: accentForColumn(column),
    items: byColumn[column],
  }))
}

// ── Column display metadata (shared by the page + components) ────────────────────

/** Human label per column (canonical casing from Req 8.1). */
export const COLUMN_LABEL: Record<WorkBoardColumn, string> = {
  queued: 'Queued',
  reading: 'Reading',
  connecting: 'Connecting',
  review: 'Review',
  'woven-in': 'Woven in',
}

/** Short calm hint describing what a column represents. */
export const COLUMN_HINT: Record<WorkBoardColumn, string> = {
  queued: 'Waiting to start',
  reading: 'Reading sources',
  connecting: 'Drawing connections',
  review: 'Awaiting your sign-off',
  'woven-in': 'Written to your brain',
}
