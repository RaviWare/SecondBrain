// ── Dashboard derivations (PURE, total, deterministic) ────────────────────────
// The knowledge-vault dashboard's read-only view-models, extracted from the inline
// logic that used to live in `src/app/api/dashboard/route.ts`. Pulling them into a
// pure module does two things:
//   1. PERFORMANCE — the graph builder now CAPS the node/edge payload to the most-
//      connected nodes. The dashboard's KnowledgeGraph renders only the top ~7 by
//      connectionCount, and the "full graph" page has its own endpoint, so shipping
//      the entire vault graph on every dashboard load was pure waste. Capping by
//      connectionCount preserves the exact nodes the dashboard shows while bounding a
//      large vault's response size.
//   2. CORRECTNESS — these derivations had ZERO test coverage as inline route code.
//      As pure functions over already-fetched rows they are unit-testable with plain
//      objects (no DB), so `dashboard-derive.test.ts` pins the edge-dedup, connection
//      counting, ranking, and the cap.
//
// Every function is PURE / TOTAL: no I/O, no clock (callers pass `nowMs`), no mutation
// of inputs, and tolerant of malformed rows. NO DUMMY DATA — every number is a real
// count/derivation of the supplied pages; empty inputs yield empty results, never a
// fabricated value.

// ── Input row shape (duck-typed; a lean Page doc or a fixture) ──────────────────

/** The minimal Page projection the dashboard derivations read. */
export interface DashboardPageRow {
  slug: string
  title: string
  type: string
  summary?: string
  relatedSlugs?: string[]
  tags?: string[]
  createdAt: Date | string | number
  updatedAt: Date | string | number
}

// ── Graph ───────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  title: string
  type: string
  summary: string
  tags: string[]
  connectionCount: number
  updatedAt: Date | string | number
  createdAt: Date | string | number
}

export interface GraphEdge {
  source: string
  target: string
}

export interface DashboardGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * Default cap on the number of graph nodes returned. The dashboard renders only the
 * top ~7 most-connected nodes; this generous bound keeps normal vaults intact while
 * preventing a multi-thousand-page vault from shipping its whole graph each load.
 */
export const DEFAULT_GRAPH_NODE_CAP = 160

/**
 * Build the dashboard knowledge graph from the user's pages. PURE / TOTAL.
 *
 * - `connectionCount` for a node = the number of its `relatedSlugs` that resolve to a
 *   real page in the set (dangling relations are ignored, exactly as before).
 * - Edges are UNDIRECTED + DEDUPED: one edge per unordered `{a,b}` pair, only when
 *   both endpoints exist. A self-relation (a page related to itself) is dropped.
 * - The node list is CAPPED to `nodeCap` by connectionCount descending (ties broken by
 *   slug for determinism); edges are then restricted to the surviving node set. This is
 *   the performance win — the cap never drops a node the dashboard would have shown,
 *   since the dashboard only uses the most-connected nodes.
 *
 * Malformed rows (missing/blank slug) are skipped so the function is total.
 */
export function buildDashboardGraph(
  pages: ReadonlyArray<DashboardPageRow>,
  nodeCap: number = DEFAULT_GRAPH_NODE_CAP,
): DashboardGraph {
  const rows = Array.isArray(pages) ? pages : []

  // Index by slug (first occurrence wins) so relation resolution + edge building only
  // ever reference real nodes.
  const bySlug = new Map<string, DashboardPageRow>()
  for (const p of rows) {
    if (p && typeof p.slug === 'string' && p.slug.length > 0 && !bySlug.has(p.slug)) {
      bySlug.set(p.slug, p)
    }
  }

  // Full node list with a resolved connection count (relations that point at a real page).
  const allNodes: GraphNode[] = []
  for (const slug of bySlug.keys()) {
    const p = bySlug.get(slug)!
    const related = Array.isArray(p.relatedSlugs) ? p.relatedSlugs : []
    const connectionCount = related.filter((r) => r !== slug && bySlug.has(r)).length
    allNodes.push({
      id: p.slug,
      title: typeof p.title === 'string' ? p.title : '',
      type: typeof p.type === 'string' ? p.type : '',
      summary: typeof p.summary === 'string' ? p.summary : '',
      tags: Array.isArray(p.tags) ? p.tags : [],
      connectionCount,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
    })
  }

  // Cap to the most-connected nodes (deterministic tie-break by slug). A non-finite or
  // non-positive cap means "no cap" (return every node).
  const cap = Number.isFinite(nodeCap) && nodeCap > 0 ? Math.floor(nodeCap) : allNodes.length
  const nodes =
    allNodes.length <= cap
      ? allNodes
      : [...allNodes]
          .sort((a, b) => b.connectionCount - a.connectionCount || a.id.localeCompare(b.id))
          .slice(0, cap)

  // Edges only between surviving nodes, undirected + deduped.
  const survivor = new Set(nodes.map((n) => n.id))
  const edgeKeys = new Set<string>()
  const edges: GraphEdge[] = []
  for (const node of nodes) {
    const p = bySlug.get(node.id)
    const related = Array.isArray(p?.relatedSlugs) ? p!.relatedSlugs : []
    for (const rel of related) {
      if (rel === node.id || !survivor.has(rel)) continue
      const key = [node.id, rel].sort().join('\u2192')
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      edges.push({ source: node.id, target: rel })
    }
  }

  return { nodes, edges }
}

// ── Memory views (top topics · most-used sources · recent decisions · recent) ───

export interface TopicView {
  slug: string
  title: string
  weight: number
}
export interface SourceRefView {
  slug: string
  title: string
  refs: number
}
export interface DecisionView {
  slug: string
  title: string
  updatedAt: Date | string | number
}

/** Epoch ms for a possibly-Date/string/number timestamp; unparseable → 0. */
function ms(v: Date | string | number): number {
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? 0 : t
}

/**
 * Top topics = concept pages ranked by their number of relations, with a `weight` of
 * `relations + 1` (so a lone concept still has weight 1). PURE; identical ranking to
 * the prior inline logic. Returns at most `limit`.
 */
export function deriveTopTopics(pages: ReadonlyArray<DashboardPageRow>, limit = 5): TopicView[] {
  return (Array.isArray(pages) ? pages : [])
    .filter((p) => p?.type === 'concept')
    .sort((a, b) => (b.relatedSlugs?.length || 0) - (a.relatedSlugs?.length || 0))
    .slice(0, limit)
    .map((p) => ({ slug: p.slug, title: p.title, weight: (p.relatedSlugs?.length || 0) + 1 }))
}

/**
 * Most-used sources = source-summary pages ranked by how many OTHER pages relate TO
 * them (inbound reference count). Requires scanning every page's relations (the inbound
 * count is global), which is why the route still fetches the full projected page set.
 * PURE; identical to the prior inline logic. Returns at most `limit`.
 */
export function deriveMostUsedSources(pages: ReadonlyArray<DashboardPageRow>, limit = 5): SourceRefView[] {
  const rows = Array.isArray(pages) ? pages : []
  const refCount = new Map<string, number>()
  for (const page of rows) {
    for (const rel of page?.relatedSlugs || []) {
      refCount.set(rel, (refCount.get(rel) || 0) + 1)
    }
  }
  return rows
    .filter((p) => p?.type === 'source-summary')
    .map((p) => ({ slug: p.slug, title: p.title, refs: refCount.get(p.slug) || 0 }))
    .sort((a, b) => b.refs - a.refs)
    .slice(0, limit)
}

/** Recent decisions = synthesis pages, newest-updated first. PURE. */
export function deriveRecentDecisions(pages: ReadonlyArray<DashboardPageRow>, limit = 5): DecisionView[] {
  return (Array.isArray(pages) ? pages : [])
    .filter((p) => p?.type === 'synthesis')
    .sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt))
    .slice(0, limit)
    .map((p) => ({ slug: p.slug, title: p.title, updatedAt: p.updatedAt }))
}

/** Recent pages = any type, newest-updated first. PURE. */
export function deriveRecentPages(pages: ReadonlyArray<DashboardPageRow>, limit = 8): DashboardPageRow[] {
  return (Array.isArray(pages) ? pages : [])
    .slice()
    .sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt))
    .slice(0, limit)
}

// ── Stats from the page set (totals + this-week deltas) ─────────────────────────

export interface StatPair {
  total: number
  week: number
}

/**
 * Per-type page stats (total + created-this-week) derived from the page set. PURE —
 * the caller passes `weekAgoMs` (no clock here). Identical numbers to the prior inline
 * logic; `notes` counts ALL pages, the rest count their type.
 */
export function derivePageStats(
  pages: ReadonlyArray<DashboardPageRow>,
  weekAgoMs: number,
): { sources: StatPair; notes: StatPair; topics: StatPair; decisions: StatPair } {
  const rows = Array.isArray(pages) ? pages : []
  const mk = (pred: (p: DashboardPageRow) => boolean): StatPair => {
    let total = 0
    let week = 0
    for (const p of rows) {
      if (!pred(p)) continue
      total += 1
      if (ms(p.createdAt) >= weekAgoMs) week += 1
    }
    return { total, week }
  }
  return {
    sources: mk((p) => p.type === 'source-summary'),
    notes: mk(() => true),
    topics: mk((p) => p.type === 'concept'),
    decisions: mk((p) => p.type === 'synthesis'),
  }
}
