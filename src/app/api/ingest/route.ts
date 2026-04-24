import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault, Source, Page, Log, UserPlan } from '@/lib/models'
import { ingestSource, extractEntities, updatePageWithNewEvidence, fetchAndCleanUrl } from '@/lib/claude'
import { slugify, wordCount } from '@/lib/utils'

const FREE_INGEST_LIMIT = 25

// Valid Mongoose enums — coerce any drift from Claude back to the closest
// schema value so one hallucinated type (e.g. "framework", "method") doesn't
// blow up the whole ingest with a validation error. Map common synonyms to
// the existing page types; everything else falls back to "concept".
const PAGE_TYPES = ['source-summary', 'concept', 'entity', 'synthesis', 'pattern', 'query-answer'] as const
type PageType = (typeof PAGE_TYPES)[number]
const PAGE_TYPE_ALIAS: Record<string, PageType> = {
  framework: 'concept', method: 'concept', theory: 'concept', idea: 'concept',
  technique: 'concept', principle: 'concept',
  person: 'entity', people: 'entity', organization: 'entity', org: 'entity',
  company: 'entity', product: 'entity', tool: 'entity', place: 'entity',
  summary: 'source-summary', source: 'source-summary',
  trend: 'pattern', theme: 'pattern',
  analysis: 'synthesis', comparison: 'synthesis',
  answer: 'query-answer', qa: 'query-answer', question: 'query-answer',
}
function normalizePageType(raw: string | undefined): PageType {
  if (!raw) return 'concept'
  const t = raw.toLowerCase().trim()
  if ((PAGE_TYPES as readonly string[]).includes(t)) return t as PageType
  return PAGE_TYPE_ALIAS[t] ?? 'concept'
}

const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const
function normalizeConfidence(raw: string | undefined): 'high' | 'medium' | 'low' {
  const t = (raw || '').toLowerCase().trim()
  return (CONFIDENCE_VALUES as readonly string[]).includes(t)
    ? (t as 'high' | 'medium' | 'low')
    : 'medium'
}

const ENTITY_TYPES = ['person', 'organization', 'product', 'place'] as const
type EntityType = (typeof ENTITY_TYPES)[number]
const ENTITY_TYPE_ALIAS: Record<string, EntityType> = {
  people: 'person', human: 'person', author: 'person', individual: 'person',
  org: 'organization', company: 'organization', team: 'organization', group: 'organization',
  tool: 'product', software: 'product', app: 'product', service: 'product',
  location: 'place', city: 'place', country: 'place', region: 'place',
}
function normalizeEntityType(raw: string | undefined): EntityType {
  if (!raw) return 'product'
  const t = raw.toLowerCase().trim()
  if ((ENTITY_TYPES as readonly string[]).includes(t)) return t as EntityType
  return ENTITY_TYPE_ALIAS[t] ?? 'product'
}

export async function POST(req: NextRequest) {
  try {
    return await doIngest(req)
  } catch (err: unknown) {
    // Convert any thrown error into a structured JSON response so the client
    // sees the real message instead of "Network error" (which only fires when
    // res.json() fails on a non-JSON 500 body).
    const message = err instanceof Error ? err.message : 'Ingest failed'
    console.error('[ingest] uncaught', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function doIngest(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()

  const plan = await UserPlan.findOne({ userId })
  if (plan?.plan === 'free' && (plan?.ingestsThisMonth ?? 0) >= FREE_INGEST_LIMIT) {
    return NextResponse.json({ error: 'Free plan limit reached. Upgrade to Pro.' }, { status: 403 })
  }

  const vault = await Vault.findOne({ userId })
  if (!vault) return NextResponse.json({ error: 'Vault not found' }, { status: 404 })

  const { type, url, text, title: providedTitle } = await req.json()
  const ingestedAt = new Date().toISOString()

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

  let totalTokens = 0

  // ── Step 1 + 2 run concurrently: wiki generation AND entity extraction both
  // read the same rawContent and have no dependency on each other's output.
  // Running them in parallel halves wall-clock time of the Claude chain.
  const [ingestResult, entityResult, source] = await Promise.all([
    ingestSource(sourceTitle, rawContent, existingIndex, ingestedAt),
    extractEntities(sourceTitle, rawContent, ingestedAt),
    Source.create({
      userId,
      vaultId: vault._id,
      type,
      title: sourceTitle,
      url: sourceUrl,
      rawContent: rawContent.slice(0, 50000),
      wordCount: wordCount(rawContent),
    }),
  ])
  const { pages: generatedPages, tokensUsed: ingestTokens } = ingestResult
  const { entities, tokensUsed: entityTokens } = entityResult
  totalTokens += ingestTokens + entityTokens

  // Upsert wiki pages — all in parallel. Per-page Claude merge calls fan out.
  const savedSlugs = await Promise.all(generatedPages.map(async (p) => {
    const slug = slugify(p.slug || p.title)
    const existing = await Page.findOne({ userId, vaultId: vault._id, slug })

    if (existing) {
      const { updatedContent, tokensUsed: updateTokens } = await updatePageWithNewEvidence(
        existing.content, sourceTitle, p.content, ingestedAt
      )
      totalTokens += updateTokens
      await Page.updateOne(
        { userId, vaultId: vault._id, slug },
        {
          content: updatedContent,
          summary: p.summary || existing.summary,
          confidence: normalizeConfidence(p.confidence) || existing.confidence,
          $addToSet: { sources: source._id, tags: { $each: p.tags || [] }, relatedSlugs: { $each: p.relatedSlugs || [] } },
          $inc: { timelineEntries: 1 },
        }
      )
    } else {
      await Page.create({
        userId,
        vaultId: vault._id,
        slug,
        title: p.title,
        type: normalizePageType(p.type),
        content: p.content,
        summary: p.summary,
        sources: [source._id],
        relatedSlugs: p.relatedSlugs || [],
        tags: p.tags || [],
        confidence: normalizeConfidence(p.confidence),
        timelineEntries: 1,
      })
    }
    return slug
  }))

  // Entity enrichment — also in parallel. Skip any slugs already produced above.
  const savedSet = new Set(savedSlugs)
  const entityResults = await Promise.all(entities.map(async (entity) => {
    const slug = slugify(entity.slug || entity.name)
    if (savedSet.has(slug)) return null

    const normEntityType = normalizeEntityType(entity.type)
    const entityContent = `---
title: ${entity.name}
type: entity
confidence: medium
tags: [${normEntityType}]
related: []
---

## Current Understanding
${entity.summary}

---TIMELINE---

### ${ingestedAt} | Source: ${sourceTitle}
${entity.evidence}`

    const existing = await Page.findOne({ userId, vaultId: vault._id, slug })
    if (existing) {
      const { updatedContent, tokensUsed: updateTokens } = await updatePageWithNewEvidence(
        existing.content, sourceTitle, entity.evidence, ingestedAt
      )
      totalTokens += updateTokens
      await Page.updateOne(
        { userId, vaultId: vault._id, slug },
        {
          content: updatedContent,
          $addToSet: { sources: source._id },
          $inc: { timelineEntries: 1 },
        }
      )
      return null // existed already — don't count as newly enriched
    }
    await Page.create({
      userId,
      vaultId: vault._id,
      slug,
      title: entity.name,
      type: 'entity',
      entityType: normEntityType,
      content: entityContent,
      summary: entity.summary,
      sources: [source._id],
      relatedSlugs: [],
      tags: [normEntityType],
      confidence: 'medium',
      timelineEntries: 1,
    })
    return slug
  }))
  const enrichedSlugs = entityResults.filter((s): s is string => s !== null)

  // Update vault stats
  const newPageCount = generatedPages.length + enrichedSlugs.length
  await Vault.updateOne({ _id: vault._id }, { $inc: { pageCount: newPageCount, sourceCount: 1 } })

  // Log operation
  await Log.create({
    userId,
    vaultId: vault._id,
    operation: 'ingest',
    summary: `Ingested "${sourceTitle}" → ${generatedPages.length} wiki pages + ${enrichedSlugs.length} entity pages enriched`,
    pagesAffected: [...savedSlugs, ...enrichedSlugs],
    tokensUsed: totalTokens,
  })

  await UserPlan.updateOne({ userId }, { $inc: { ingestsThisMonth: 1 } }, { upsert: true })

  return NextResponse.json({
    success: true,
    pages: generatedPages.map(p => ({
      slug: slugify(p.slug || p.title),
      title: p.title,
      type: p.type,
    })),
    entitiesEnriched: enrichedSlugs.length,
    tokensUsed: totalTokens,
  })
}
