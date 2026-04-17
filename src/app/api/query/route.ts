import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault, Page, Log, UserPlan } from '@/lib/models'
import { queryWiki } from '@/lib/claude'

const FREE_QUERY_LIMIT = 50

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

  // Full-text search across pages
  const pages = await Page.find(
    { userId, vaultId: vault._id, $text: { $search: question } },
    { score: { $meta: 'textScore' }, title: 1, slug: 1, content: 1 }
  ).sort({ score: { $meta: 'textScore' } }).limit(6).lean()

  // Fallback: if no text search hits, get most recent pages
  const relevantPages = pages.length > 0 ? pages : await Page.find({ userId, vaultId: vault._id }).sort({ updatedAt: -1 }).limit(6).lean()

  if (relevantPages.length === 0) {
    return NextResponse.json({ answer: 'Your wiki is empty. Ingest some sources first.', citedSlugs: [], tokensUsed: 0 })
  }

  const { answer, citedSlugs, tokensUsed } = await queryWiki(
    question,
    relevantPages.map(p => ({ title: p.title, slug: p.slug, content: p.content }))
  )

  await Log.create({
    userId,
    vaultId: vault._id,
    operation: 'query',
    summary: `Query: "${question.slice(0, 100)}"`,
    pagesAffected: citedSlugs,
    tokensUsed,
  })

  await UserPlan.updateOne({ userId }, { $inc: { queriesThisMonth: 1 } }, { upsert: true })

  return NextResponse.json({ answer, citedSlugs, pages: relevantPages.map(p => ({ slug: p.slug, title: p.title })), tokensUsed })
}
