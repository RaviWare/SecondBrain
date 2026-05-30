import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault, Page, Log, UserPlan } from '@/lib/models'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()

  const [vault, plan, recentLogs, allPages] = await Promise.all([
    Vault.findOne({ userId }),
    UserPlan.findOne({ userId }),
    Log.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    Page.find({ userId }, 'slug title type summary relatedSlugs tags createdAt updatedAt').lean(),
  ])

  // Build graph data
  const nodeMap = new Map(allPages.map(p => [p.slug, p]))
  const edgeSet = new Set<string>()
  const edges: { source: string; target: string }[] = []

  for (const page of allPages) {
    for (const rel of (page.relatedSlugs || [])) {
      if (!nodeMap.has(rel)) continue
      const key = [page.slug, rel].sort().join('→')
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push({ source: page.slug, target: rel })
      }
    }
  }

  const nodes = allPages.map(p => ({
    id: p.slug,
    title: p.title,
    type: p.type,
    summary: p.summary,
    tags: p.tags || [],
    connectionCount: (p.relatedSlugs || []).filter((r: string) => nodeMap.has(r)).length,
    updatedAt: p.updatedAt,
    createdAt: p.createdAt,
  }))

  const recentPages = allPages
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8)

  // ── Aggregate stats (real counts) ──────────────────────────
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000
  const createdThisWeek = (filter: (p: typeof allPages[number]) => boolean) =>
    allPages.filter(p => filter(p) && new Date(p.createdAt).getTime() >= weekAgo).length

  const byType = (t: string) => allPages.filter(p => p.type === t)
  const sourcePages = byType('source-summary')
  const conceptPages = byType('concept')
  const synthesisPages = byType('synthesis')
  const answerLogs = recentLogs.filter(l => l.operation === 'query')

  const queryCount = await Log.countDocuments({ userId, operation: 'query' })
  const queriesThisWeek = await Log.countDocuments({
    userId,
    operation: 'query',
    createdAt: { $gte: new Date(weekAgo) },
  })

  // Top topics by connection count (concepts), with relative weight.
  const topTopics = [...conceptPages]
    .sort((a, b) => (b.relatedSlugs?.length || 0) - (a.relatedSlugs?.length || 0))
    .slice(0, 5)
    .map(p => ({ slug: p.slug, title: p.title, weight: (p.relatedSlugs?.length || 0) + 1 }))

  // Most-referenced sources (by how many pages link to them).
  const refCount = new Map<string, number>()
  for (const page of allPages) {
    for (const rel of page.relatedSlugs || []) {
      refCount.set(rel, (refCount.get(rel) || 0) + 1)
    }
  }
  const mostUsedSources = [...sourcePages]
    .map(p => ({ slug: p.slug, title: p.title, refs: refCount.get(p.slug) || 0 }))
    .sort((a, b) => b.refs - a.refs)
    .slice(0, 5)

  const stats = {
    sources: { total: sourcePages.length, week: createdThisWeek(p => p.type === 'source-summary') },
    notes: { total: allPages.length, week: createdThisWeek(() => true) },
    topics: { total: conceptPages.length, week: createdThisWeek(p => p.type === 'concept') },
    decisions: { total: synthesisPages.length, week: createdThisWeek(p => p.type === 'synthesis') },
    aiAnswers: { total: queryCount, week: queriesThisWeek },
  }

  return NextResponse.json({
    vault,
    plan,
    recentLogs,
    recentPages,
    stats,
    topTopics,
    mostUsedSources,
    recentDecisions: synthesisPages
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5)
      .map(p => ({ slug: p.slug, title: p.title, updatedAt: p.updatedAt })),
    aiAnswers: answerLogs.slice(0, 5).map(l => ({ summary: l.summary, createdAt: l.createdAt })),
    graph: { nodes, edges, rebuiltAt: new Date().toISOString() },
  })
}
