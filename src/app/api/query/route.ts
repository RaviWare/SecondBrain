import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault, Page, Log, UserPlan } from '@/lib/models'
import { queryWiki, expandQuery } from '@/lib/claude'

const FREE_QUERY_LIMIT = 50

// ── Reciprocal Rank Fusion ────────────────────────────────────────────────────
// GBrain pattern: combine results from multiple search queries using RRF.
// RRF score = sum of 1/(k + rank) for each query where the doc appears.
// k=60 is the standard constant that smooths rank differences.
// Higher final score = more relevant across multiple query angles.
// ─────────────────────────────────────────────────────────────────────────────
function reciprocalRankFusion(
  resultSets: Array<Array<{ slug: string; [key: string]: unknown }>>,
  k = 60
): Map<string, number> {
  const scores = new Map<string, number>()
  for (const results of resultSets) {
    results.forEach((doc, rank) => {
      const prev = scores.get(doc.slug) || 0
      scores.set(doc.slug, prev + 1 / (k + rank + 1))
    })
  }
  return scores
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()

  const plan = await UserPlan.findOne({ userId })
  if (plan?.plan === 'free' && (plan?.queriesThisMonth ?? 0) >= FREE_QUERY_LIMIT) {
    return NextResponse.json({ error: 'Query limit reached. Upgrade to Pro.' }, { status: 403 })
  }

  const vault = await Vault.findOne({ userId })
  if (!vault) return NextResponse.json({ error: 'Vault not found' }, { status: 404 })

  const { question } = await req.json()
  if (!question) return NextResponse.json({ error: 'Question required' }, { status: 400 })

  let totalTokens = 0

  // ── Step 1: GBrain Multi-Query Expansion ─────────────────────────────────────
  const { queries, tokensUsed: expandTokens } = await expandQuery(question)
  totalTokens += expandTokens

  // ── Step 2: Search with each expanded query (full-text) ───────────────────────
  type PageHit = { slug: string; title?: string; content?: string; summary?: string; type?: string }
  const resultSets: Array<Array<PageHit>> = []

  for (const q of queries) {
    try {
      const hits = await Page.find(
        { userId, vaultId: vault._id, $text: { $search: q } },
        { score: { $meta: 'textScore' }, title: 1, slug: 1, content: 1, summary: 1, type: 1 }
      ).sort({ score: { $meta: 'textScore' } }).limit(8).lean()
      resultSets.push(hits)
    } catch {
      resultSets.push([])
    }
  }

  // ── Step 3: Reciprocal Rank Fusion across all query results ───────────────────
  const rrfScores = reciprocalRankFusion(resultSets)

  // Build deduped, RRF-ranked page list
  const pageMap = new Map<string, PageHit>()
  for (const set of resultSets) {
    for (const p of set) {
      if (!pageMap.has(p.slug)) pageMap.set(p.slug, p)
    }
  }

  let relevantPages = Array.from(pageMap.values())
    .sort((a, b) => (rrfScores.get(b.slug) || 0) - (rrfScores.get(a.slug) || 0))
    .slice(0, 7)

  // Fallback: if no text search hits at all, use most recent pages
  if (relevantPages.length === 0) {
    relevantPages = await Page.find({ userId, vaultId: vault._id })
      .sort({ updatedAt: -1 })
      .limit(6)
      .lean()
  }

  if (relevantPages.length === 0) {
    return NextResponse.json({
      answer: 'Your wiki is empty. Ingest some sources first.',
      citedSlugs: [],
      pages: [],
      tokensUsed: totalTokens,
    })
  }

  // ── Step 4: Answer using Compiled Truth sections (GBrain pattern) ─────────────
  const { answer, citedSlugs, tokensUsed: queryTokens } = await queryWiki(
    question,
    relevantPages.map(p => ({ title: p.title ?? '', slug: p.slug, content: p.content ?? '' }))
  )
  totalTokens += queryTokens

  await Log.create({
    userId,
    vaultId: vault._id,
    operation: 'query',
    summary: `Query: "${question.slice(0, 100)}" (${queries.length} sub-queries, ${relevantPages.length} pages searched)`,
    pagesAffected: citedSlugs,
    tokensUsed: totalTokens,
  })

  await UserPlan.updateOne({ userId }, { $inc: { queriesThisMonth: 1 } }, { upsert: true })

  return NextResponse.json({
    answer,
    citedSlugs,
    pages: relevantPages.map(p => ({ slug: p.slug, title: p.title })),
    queriesExpanded: queries,
    tokensUsed: totalTokens,
  })
}
