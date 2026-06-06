// Unit tests for the dashboard derivations (`@/lib/dashboard-derive`).
//
// These pin the view-model logic that used to live untested inline in
// `src/app/api/dashboard/route.ts`: graph build (resolved connection counts,
// undirected edge dedup, dangling/self-relation handling, the new node CAP), the
// memory rankings (top topics / most-used sources / recent decisions / recent pages),
// and the per-type page stats (totals + this-week deltas).
//
// All targets are PURE / TOTAL, so they run directly with plain fixtures — no DB.

import { describe, it, expect } from 'vitest'
import {
  buildDashboardGraph,
  deriveTopTopics,
  deriveMostUsedSources,
  deriveRecentDecisions,
  deriveRecentPages,
  derivePageStats,
  DEFAULT_GRAPH_NODE_CAP,
  type DashboardPageRow,
} from './dashboard-derive'

// ── Fixtures ────────────────────────────────────────────────────────────────────

const NOW = Date.parse('2026-06-01T12:00:00Z')
const WEEK_AGO = NOW - 7 * 24 * 60 * 60 * 1000

function page(over: Partial<DashboardPageRow> & { slug: string }): DashboardPageRow {
  return {
    title: `Title ${over.slug}`,
    type: 'concept',
    summary: '',
    relatedSlugs: [],
    tags: [],
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...over,
  }
}

// ── buildDashboardGraph ─────────────────────────────────────────────────────────

describe('buildDashboardGraph', () => {
  it('counts only relations that resolve to a real node (dangling refs ignored)', () => {
    const pages = [
      page({ slug: 'a', relatedSlugs: ['b', 'ghost'] }), // ghost doesn't exist
      page({ slug: 'b', relatedSlugs: ['a'] }),
    ]
    const g = buildDashboardGraph(pages)
    const a = g.nodes.find((n) => n.id === 'a')!
    expect(a.connectionCount).toBe(1) // only 'b' resolves, not 'ghost'
  })

  it('produces one undirected, deduped edge per related pair', () => {
    const pages = [
      page({ slug: 'a', relatedSlugs: ['b'] }),
      page({ slug: 'b', relatedSlugs: ['a'] }), // reciprocal — must NOT double the edge
    ]
    const g = buildDashboardGraph(pages)
    expect(g.edges).toHaveLength(1)
    // endpoints are exactly {a,b} regardless of direction
    expect([g.edges[0].source, g.edges[0].target].sort()).toEqual(['a', 'b'])
  })

  it('drops a self-relation (a page related to itself is not an edge or a connection)', () => {
    const g = buildDashboardGraph([page({ slug: 'a', relatedSlugs: ['a'] })])
    expect(g.edges).toHaveLength(0)
    expect(g.nodes[0].connectionCount).toBe(0)
  })

  it('is total over malformed input (no slug / empty array / non-array)', () => {
    expect(() => buildDashboardGraph([])).not.toThrow()
    // a row with a blank slug is skipped
    const g = buildDashboardGraph([page({ slug: '' }), page({ slug: 'a' })])
    expect(g.nodes.map((n) => n.id)).toEqual(['a'])
  })

  it('caps the node set to the most-connected nodes and never exceeds the cap', () => {
    // 10 nodes; node "hub" relates to all others (high connectionCount), the rest relate
    // only to the hub. With a cap of 5 we must keep the hub + the next most-connected.
    const others = Array.from({ length: 9 }, (_, i) => `n${i}`)
    const pages: DashboardPageRow[] = [
      page({ slug: 'hub', relatedSlugs: others }),
      ...others.map((s) => page({ slug: s, relatedSlugs: ['hub'] })),
    ]
    const g = buildDashboardGraph(pages, 5)
    expect(g.nodes).toHaveLength(5)
    // The hub (highest connectionCount) must survive the cap.
    expect(g.nodes.some((n) => n.id === 'hub')).toBe(true)
    // Every edge endpoint is within the surviving node set (no dangling edges).
    const survivors = new Set(g.nodes.map((n) => n.id))
    for (const e of g.edges) {
      expect(survivors.has(e.source)).toBe(true)
      expect(survivors.has(e.target)).toBe(true)
    }
  })

  it('returns every node when under the cap (no data loss for normal vaults)', () => {
    const pages = [page({ slug: 'a' }), page({ slug: 'b' })]
    const g = buildDashboardGraph(pages, DEFAULT_GRAPH_NODE_CAP)
    expect(g.nodes).toHaveLength(2)
  })

  it('a non-positive/non-finite cap means no cap', () => {
    const pages = Array.from({ length: 12 }, (_, i) => page({ slug: `s${i}` }))
    expect(buildDashboardGraph(pages, 0).nodes).toHaveLength(12)
    expect(buildDashboardGraph(pages, Number.NaN).nodes).toHaveLength(12)
  })
})

// ── Memory rankings ───────────────────────────────────────────────────────────

describe('deriveTopTopics', () => {
  it('ranks concept pages by relation count with weight = relations + 1', () => {
    const pages = [
      page({ slug: 'big', type: 'concept', relatedSlugs: ['a', 'b', 'c'] }),
      page({ slug: 'small', type: 'concept', relatedSlugs: ['a'] }),
      page({ slug: 'src', type: 'source-summary', relatedSlugs: ['a', 'b'] }), // not a concept
    ]
    const topics = deriveTopTopics(pages)
    expect(topics.map((t) => t.slug)).toEqual(['big', 'small'])
    expect(topics[0].weight).toBe(4) // 3 relations + 1
    expect(topics[1].weight).toBe(2) // 1 relation + 1
  })
})

describe('deriveMostUsedSources', () => {
  it('ranks source pages by INBOUND references from other pages', () => {
    const pages = [
      page({ slug: 'popular', type: 'source-summary' }),
      page({ slug: 'quiet', type: 'source-summary' }),
      page({ slug: 'p1', relatedSlugs: ['popular'] }),
      page({ slug: 'p2', relatedSlugs: ['popular'] }),
    ]
    const sources = deriveMostUsedSources(pages)
    expect(sources[0]).toMatchObject({ slug: 'popular', refs: 2 })
    expect(sources.find((s) => s.slug === 'quiet')?.refs).toBe(0)
  })
})

describe('deriveRecentDecisions / deriveRecentPages', () => {
  it('orders synthesis pages newest-updated first', () => {
    const pages = [
      page({ slug: 'old', type: 'synthesis', updatedAt: new Date(NOW - 1000) }),
      page({ slug: 'new', type: 'synthesis', updatedAt: new Date(NOW) }),
      page({ slug: 'concept', type: 'concept', updatedAt: new Date(NOW) }), // excluded
    ]
    expect(deriveRecentDecisions(pages).map((d) => d.slug)).toEqual(['new', 'old'])
  })

  it('recent pages includes all types, newest-updated first, capped at the limit', () => {
    const pages = Array.from({ length: 12 }, (_, i) =>
      page({ slug: `s${i}`, updatedAt: new Date(NOW - i * 1000) }),
    )
    const recent = deriveRecentPages(pages, 8)
    expect(recent).toHaveLength(8)
    expect(recent[0].slug).toBe('s0') // newest
  })
})

// ── Stats ─────────────────────────────────────────────────────────────────────

describe('derivePageStats', () => {
  it('counts totals per type and this-week deltas', () => {
    const pages = [
      page({ slug: 'src1', type: 'source-summary', createdAt: new Date(NOW) }), // this week
      page({ slug: 'src2', type: 'source-summary', createdAt: new Date(WEEK_AGO - 1000) }), // older
      page({ slug: 'c1', type: 'concept', createdAt: new Date(NOW) }),
      page({ slug: 'd1', type: 'synthesis', createdAt: new Date(NOW) }),
    ]
    const s = derivePageStats(pages, WEEK_AGO)
    expect(s.sources).toEqual({ total: 2, week: 1 })
    expect(s.topics).toEqual({ total: 1, week: 1 })
    expect(s.decisions).toEqual({ total: 1, week: 1 })
    // notes = ALL pages
    expect(s.notes.total).toBe(4)
    expect(s.notes.week).toBe(3)
  })

  it('is honest about zero — empty input yields all-zero pairs', () => {
    const s = derivePageStats([], WEEK_AGO)
    expect(s.sources).toEqual({ total: 0, week: 0 })
    expect(s.notes).toEqual({ total: 0, week: 0 })
  })
})
