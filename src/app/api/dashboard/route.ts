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

  return NextResponse.json({
    vault,
    plan,
    recentLogs,
    recentPages,
    graph: { nodes, edges, rebuiltAt: new Date().toISOString() },
  })
}
