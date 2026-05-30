// ── Shared vault operations ───────────────────────────────────────────────────
// Single source of truth for query + ingest so the Clerk-authed UI routes AND
// the Hermes/MCP agent routes run identical logic. Extracted from the original
// /api/query and /api/ingest handlers.
import type mongoose from 'mongoose'
import { Vault, Source, Page, Log, UserPlan } from '@/lib/models'
import {
  ingestSource,
  extractEntities,
  updatePageWithNewEvidence,
  fetchAndCleanUrl,
  expandQuery,
  queryWiki,
  type GapAnalysis,
} from '@/lib/claude'
import { wireGraphBatch } from '@/lib/auto-link'
import { slugify, wordCount } from '@/lib/utils'

const FREE_QUERY_LIMIT = 50
const FREE_INGEST_LIMIT = 25

// ── Reciprocal Rank Fusion (GBrain pattern) ───────────────────────────────────
function reciprocalRankFusion(
  resultSets: Array<Array<{ slug: string; [key: string]: unknown }>>,
  k = 60
): Map<string, number> {
  const scores = new Map<string, number>()
  for (const results of resultSets) {
    results.forEach((doc, rank) => {
      scores.set(doc.slug, (scores.get(doc.slug) || 0) + 1 / (k + rank + 1))
    })
  }
  return scores
}

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
function normalizeConfidence(raw: string | undefined): 'high' | 'medium' | 'low' {
  const t = (raw || '').toLowerCase().trim()
  return (['high', 'medium', 'low'] as string[]).includes(t) ? (t as 'high' | 'medium' | 'low') : 'medium'
}

export class VaultOpError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export type QueryResult = {
  answer: string
  citedSlugs: string[]
  gap: GapAnalysis
  pages: Array<{ slug: string; title: string }>
  queriesExpanded: string[]
  tokensUsed: number
}

/** Run a synthesis query (multi-query expansion → RRF → answer + gap analysis). */
export async function runQuery(userId: string, question: string): Promise<QueryResult> {
  const plan = await UserPlan.findOne({ userId })
  if (plan?.plan === 'free' && (plan?.queriesThisMonth ?? 0) >= FREE_QUERY_LIMIT) {
    throw new VaultOpError('Query limit reached. Upgrade to Pro.', 403)
  }

  const vault = await Vault.findOne({ userId })
  if (!vault) throw new VaultOpError('Vault not found', 404)
  if (!question?.trim()) throw new VaultOpError('Question required', 400)

  let totalTokens = 0
  const { queries, tokensUsed: expandTokens } = await expandQuery(question)
  totalTokens += expandTokens

  type PageHit = { slug: string; title?: string; content?: string; updatedAt?: Date }
  const resultSets: Array<Array<PageHit>> = []
  for (const q of queries) {
    try {
      const hits = await Page.find(
        { userId, vaultId: vault._id, $text: { $search: q } },
        { score: { $meta: 'textScore' }, title: 1, slug: 1, content: 1, updatedAt: 1 }
      ).sort({ score: { $meta: 'textScore' } }).limit(8).lean()
      resultSets.push(hits as PageHit[])
    } catch {
      resultSets.push([])
    }
  }

  const rrf = reciprocalRankFusion(resultSets)
  const pageMap = new Map<string, PageHit>()
  for (const set of resultSets) for (const p of set) if (!pageMap.has(p.slug)) pageMap.set(p.slug, p)

  let relevantPages = Array.from(pageMap.values())
    .sort((a, b) => (rrf.get(b.slug) || 0) - (rrf.get(a.slug) || 0))
    .slice(0, 7)

  if (relevantPages.length === 0) {
    relevantPages = (await Page.find({ userId, vaultId: vault._id })
      .sort({ updatedAt: -1 }).limit(6).lean()) as PageHit[]
  }

  if (relevantPages.length === 0) {
    return {
      answer: 'Your wiki is empty. Ingest some sources first.',
      citedSlugs: [],
      gap: { gaps: ['No sources have been ingested yet.'], staleSlugs: [], contradictions: [], confidence: 0 },
      pages: [],
      queriesExpanded: queries,
      tokensUsed: totalTokens,
    }
  }

  const { answer, citedSlugs, gap, tokensUsed: queryTokens } = await queryWiki(
    question,
    relevantPages.map(p => ({ title: p.title ?? '', slug: p.slug, content: p.content ?? '', updatedAt: p.updatedAt }))
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

  return {
    answer,
    citedSlugs,
    gap,
    pages: relevantPages.map(p => ({ slug: p.slug, title: p.title ?? p.slug })),
    queriesExpanded: queries,
    tokensUsed: totalTokens,
  }
}

export type IngestInput =
  | { type: 'url'; url: string; title?: string }
  | { type: 'text'; text: string; title?: string }

export type IngestResult = {
  success: true
  pages: Array<{ slug: string; title: string; type: string }>
  entitiesEnriched: number
  graph: { resolved: number; dangling: number; backlinks: number }
  tokensUsed: number
}

/** Ingest a source: generate wiki pages, enrich entities, wire the graph. */
export async function runIngest(userId: string, input: IngestInput): Promise<IngestResult> {
  const plan = await UserPlan.findOne({ userId })
  if (plan?.plan === 'free' && (plan?.ingestsThisMonth ?? 0) >= FREE_INGEST_LIMIT) {
    throw new VaultOpError('Free plan limit reached. Upgrade to Pro.', 403)
  }

  const vault = await Vault.findOne({ userId })
  if (!vault) throw new VaultOpError('Vault not found', 404)

  const ingestedAt = new Date().toISOString()
  let rawContent = ''
  let sourceTitle = input.title || 'Untitled'
  let sourceUrl: string | null = null

  if (input.type === 'url') {
    if (!input.url) throw new VaultOpError('URL required', 400)
    try {
      const fetched = await fetchAndCleanUrl(input.url)
      rawContent = fetched.content
      sourceTitle = input.title || fetched.title
      sourceUrl = input.url
    } catch {
      throw new VaultOpError('Failed to fetch URL', 400)
    }
  } else if (input.type === 'text') {
    if (!input.text) throw new VaultOpError('Text required', 400)
    rawContent = input.text
  } else {
    throw new VaultOpError('Invalid type', 400)
  }

  const existingPages = await Page.find({ userId, vaultId: vault._id }, 'slug title summary type').lean()
  const existingIndex = existingPages.map(p => `- [[${p.slug}]] (${p.type}): ${p.summary}`).join('\n')

  let totalTokens = 0
  const [ingestResult, entityResult, source] = await Promise.all([
    ingestSource(sourceTitle, rawContent, existingIndex, ingestedAt),
    extractEntities(sourceTitle, rawContent, ingestedAt),
    Source.create({
      userId, vaultId: vault._id, type: input.type, title: sourceTitle, url: sourceUrl,
      rawContent: rawContent.slice(0, 50000), wordCount: wordCount(rawContent),
    }),
  ])
  const { pages: generatedPages, tokensUsed: ingestTokens } = ingestResult
  const { entities, tokensUsed: entityTokens } = entityResult
  totalTokens += ingestTokens + entityTokens

  const savedSlugs = await Promise.all(generatedPages.map(async (p) => {
    const slug = slugify(p.slug || p.title)
    const existing = await Page.findOne({ userId, vaultId: vault._id, slug })
    if (existing) {
      const { updatedContent, tokensUsed } = await updatePageWithNewEvidence(existing.content, sourceTitle, p.content, ingestedAt)
      totalTokens += tokensUsed
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
        userId, vaultId: vault._id, slug, title: p.title, type: normalizePageType(p.type),
        content: p.content, summary: p.summary, sources: [source._id],
        relatedSlugs: p.relatedSlugs || [], tags: p.tags || [],
        confidence: normalizeConfidence(p.confidence), timelineEntries: 1,
      })
    }
    return slug
  }))

  const savedSet = new Set(savedSlugs)
  const entityResults = await Promise.all(entities.map(async (entity) => {
    const slug = slugify(entity.slug || entity.name)
    if (savedSet.has(slug)) return null
    const existing = await Page.findOne({ userId, vaultId: vault._id, slug })
    if (existing) {
      const { updatedContent, tokensUsed } = await updatePageWithNewEvidence(existing.content, sourceTitle, entity.evidence, ingestedAt)
      totalTokens += tokensUsed
      await Page.updateOne(
        { userId, vaultId: vault._id, slug },
        { content: updatedContent, $addToSet: { sources: source._id }, $inc: { timelineEntries: 1 } }
      )
      return null
    }
    const entityContent = `---
title: ${entity.name}
type: entity
confidence: medium
tags: [${entity.type}]
related: []
---

## Current Understanding
${entity.summary}

---TIMELINE---

### ${ingestedAt} | Source: ${sourceTitle}
${entity.evidence}`
    await Page.create({
      userId, vaultId: vault._id, slug, title: entity.name, type: 'entity',
      content: entityContent, summary: entity.summary, sources: [source._id],
      relatedSlugs: [], tags: [entity.type], confidence: 'medium', timelineEntries: 1,
    })
    return slug
  }))
  const enrichedSlugs = entityResults.filter((s): s is string => s !== null)

  const allSlugs = [...savedSlugs, ...enrichedSlugs]
  const graphStats = await wireGraphBatch(userId, vault._id as mongoose.Types.ObjectId, allSlugs)

  await Vault.updateOne({ _id: vault._id }, { $inc: { pageCount: generatedPages.length + enrichedSlugs.length, sourceCount: 1 } })
  await Log.create({
    userId, vaultId: vault._id, operation: 'ingest',
    summary: `Ingested "${sourceTitle}" → ${generatedPages.length} wiki pages + ${enrichedSlugs.length} entity pages enriched (${graphStats.resolved} links wired)`,
    pagesAffected: allSlugs, tokensUsed: totalTokens,
  })
  await UserPlan.updateOne({ userId }, { $inc: { ingestsThisMonth: 1 } }, { upsert: true })

  return {
    success: true,
    pages: generatedPages.map(p => ({ slug: slugify(p.slug || p.title), title: p.title, type: p.type })),
    entitiesEnriched: enrichedSlugs.length,
    graph: graphStats,
    tokensUsed: totalTokens,
  }
}
