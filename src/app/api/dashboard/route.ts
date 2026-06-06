// ── /api/dashboard — Clerk-authed knowledge-vault dashboard feed ──────────────
// Returns the vault dashboard's read-only view-models for the signed-in user.
//
// PERFORMANCE (Phase 1): all derivations now run through the PURE, unit-tested
// `@/lib/dashboard-derive` module, and the knowledge graph is CAPPED to the most-
// connected nodes (the dashboard renders ~7; the full-graph page has its own route),
// so a large vault no longer ships its entire graph on every dashboard load. A short
// private `Cache-Control` lets a back-navigation reuse the response instead of
// re-hitting Mongo. The query/queries-this-week counts use cheap `countDocuments`
// (server-side) rather than loading rows. Response shape is UNCHANGED.
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault, Page, Log, UserPlan } from '@/lib/models'
import {
  buildDashboardGraph,
  deriveTopTopics,
  deriveMostUsedSources,
  deriveRecentDecisions,
  deriveRecentPages,
  derivePageStats,
  type DashboardPageRow,
} from '@/lib/dashboard-derive'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()

  const weekAgo = Date.now() - WEEK_MS

  const [vault, plan, recentLogs, allPages, queryCount, queriesThisWeek] = await Promise.all([
    Vault.findOne({ userId }),
    UserPlan.findOne({ userId }),
    Log.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    Page.find({ userId }, 'slug title type summary relatedSlugs tags createdAt updatedAt').lean(),
    // Cheap server-side counts (no row loading) for the AI-answers stat.
    Log.countDocuments({ userId, operation: 'query' }),
    Log.countDocuments({ userId, operation: 'query', createdAt: { $gte: new Date(weekAgo) } }),
  ])

  const pages = allPages as unknown as DashboardPageRow[]

  // ── Graph (capped) — the big payload win. Identical nodes to before for any
  //    vault at/under the cap; a larger vault keeps its most-connected nodes. ──
  const graph = buildDashboardGraph(pages)

  // ── Memory views + stats — all pure, all real counts. ──
  const recentPages = deriveRecentPages(pages, 8)
  const pageStats = derivePageStats(pages, weekAgo)
  const answerLogs = recentLogs.filter((l) => l.operation === 'query')

  const stats = {
    sources: pageStats.sources,
    notes: pageStats.notes,
    topics: pageStats.topics,
    decisions: pageStats.decisions,
    aiAnswers: { total: queryCount, week: queriesThisWeek },
  }

  return NextResponse.json(
    {
      vault,
      plan,
      recentLogs,
      recentPages,
      stats,
      topTopics: deriveTopTopics(pages, 5),
      mostUsedSources: deriveMostUsedSources(pages, 5),
      recentDecisions: deriveRecentDecisions(pages, 5),
      aiAnswers: answerLogs.slice(0, 5).map((l) => ({ summary: l.summary, createdAt: l.createdAt })),
      graph: { nodes: graph.nodes, edges: graph.edges, rebuiltAt: new Date().toISOString() },
    },
    {
      // Private, short-lived: a back-nav to the dashboard reuses the response instead
      // of re-querying Mongo. `private` keeps it per-user (never a shared CDN cache).
      headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' },
    },
  )
}
