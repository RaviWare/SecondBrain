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
  deriveDailyTrend,
  dailyTrendFromTimestamps,
  startOfDayMs,
  TREND_DAYS,
  type DashboardPageRow,
} from '@/lib/dashboard-derive'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()

  const weekAgo = Date.now() - WEEK_MS
  const dayStart = startOfDayMs(Date.now())
  // Window for the daily sparkline trends (real history, oldest → newest).
  const trendWindowStart = new Date(dayStart - (TREND_DAYS - 1) * 24 * 60 * 60 * 1000)

  const [vault, plan, recentLogs, allPages, queryCount, queriesThisWeek, queryTrendLogs] = await Promise.all([
    Vault.findOne({ userId }),
    UserPlan.findOne({ userId }),
    Log.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    Page.find({ userId }, 'slug title type summary relatedSlugs tags createdAt updatedAt').lean(),
    // Cheap server-side counts (no row loading) for the AI-answers stat.
    Log.countDocuments({ userId, operation: 'query' }),
    Log.countDocuments({ userId, operation: 'query', createdAt: { $gte: new Date(weekAgo) } }),
    // Just the timestamps of recent query logs, for the AI-answers daily trend.
    Log.find({ userId, operation: 'query', createdAt: { $gte: trendWindowStart } }, 'createdAt').lean(),
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

  // ── REAL daily trends (one point per day, oldest → newest) for the stat
  //    sparklines — actual creation/query history, never a synthesized curve. ──
  const trends = {
    sources: deriveDailyTrend(pages, (p) => p.type === 'source-summary', dayStart),
    notes: deriveDailyTrend(pages, () => true, dayStart),
    topics: deriveDailyTrend(pages, (p) => p.type === 'concept', dayStart),
    decisions: deriveDailyTrend(pages, (p) => p.type === 'synthesis', dayStart),
    aiAnswers: dailyTrendFromTimestamps(
      (queryTrendLogs as Array<{ createdAt: Date }>).map((l) => l.createdAt),
      dayStart,
    ),
  }

  return NextResponse.json(
    {
      vault,
      plan,
      recentLogs,
      recentPages,
      stats,
      trends,
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
