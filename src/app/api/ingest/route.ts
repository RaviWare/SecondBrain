import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault, Source, Page, Log, UserPlan } from '@/lib/models'
import { ingestSource, fetchAndCleanUrl } from '@/lib/claude'
import { slugify, wordCount } from '@/lib/utils'

const FREE_INGEST_LIMIT = 25

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()

  // Check usage limits
  const plan = await UserPlan.findOne({ userId })
  if (plan?.plan === 'free' && (plan?.ingestsThisMonth ?? 0) >= FREE_INGEST_LIMIT) {
    return NextResponse.json({ error: 'Free plan limit reached. Upgrade to Pro.' }, { status: 403 })
  }

  const vault = await Vault.findOne({ userId })
  if (!vault) return NextResponse.json({ error: 'Vault not found' }, { status: 404 })

  const { type, url, text, title: providedTitle } = await req.json()

  let rawContent = ''
  let sourceTitle = providedTitle || 'Untitled'
  let sourceUrl: string | null = null

  if (type === 'url') {
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })
    try {
      const fetched = await fetchAndCleanUrl(url)
      rawContent = fetched.content
      sourceTitle = providedTitle || fetched.title
      sourceUrl = url
    } catch {
      return NextResponse.json({ error: 'Failed to fetch URL' }, { status: 400 })
    }
  } else if (type === 'text') {
    if (!text) return NextResponse.json({ error: 'Text required' }, { status: 400 })
    rawContent = text
  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  // Build index of existing pages for context
  const existingPages = await Page.find({ userId, vaultId: vault._id }, 'slug title summary type').lean()
  const existingIndex = existingPages
    .map(p => `- [[${p.slug}]] (${p.type}): ${p.summary}`)
    .join('\n')

  // Call Claude to generate wiki pages
  const { pages: generatedPages, tokensUsed } = await ingestSource(sourceTitle, rawContent, existingIndex)

  // Save source
  const source = await Source.create({
    userId,
    vaultId: vault._id,
    type,
    title: sourceTitle,
    url: sourceUrl,
    rawContent: rawContent.slice(0, 50000),
    wordCount: wordCount(rawContent),
  })

  // Upsert wiki pages
  const savedSlugs: string[] = []
  for (const p of generatedPages) {
    const slug = slugify(p.slug || p.title)
    await Page.findOneAndUpdate(
      { userId, vaultId: vault._id, slug },
      {
        userId,
        vaultId: vault._id,
        slug,
        title: p.title,
        type: p.type as any,
        content: p.content,
        summary: p.summary,
        relatedSlugs: p.relatedSlugs || [],
        tags: p.tags || [],
        confidence: (p.confidence as any) || 'medium',
        $addToSet: { sources: source._id },
      },
      { upsert: true, new: true }
    )
    savedSlugs.push(slug)
  }

  // Update vault stats
  await Vault.updateOne({ _id: vault._id }, { $inc: { pageCount: generatedPages.length, sourceCount: 1 } })

  // Log operation
  await Log.create({
    userId,
    vaultId: vault._id,
    operation: 'ingest',
    summary: `Ingested "${sourceTitle}" → created/updated ${generatedPages.length} pages`,
    pagesAffected: savedSlugs,
    tokensUsed,
  })

  // Increment usage
  await UserPlan.updateOne({ userId }, { $inc: { ingestsThisMonth: 1 } }, { upsert: true })

  return NextResponse.json({ success: true, pages: generatedPages.map(p => ({ slug: slugify(p.slug || p.title), title: p.title, type: p.type })), tokensUsed })
}
