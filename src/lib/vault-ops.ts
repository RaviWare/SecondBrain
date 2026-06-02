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
export type PageType = (typeof PAGE_TYPES)[number]
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

// ── Ingest planning types ─────────────────────────────────────────────────────
// `runIngest` is split into a pure planner (`planIngest`) and an applier
// (`applyIngestPlan`). The plan captures everything needed to perform the writes
// later, fully resolved against the current vault at plan time, so agents and
// dry-runs can plan WITHOUT writing. See design "Refactoring runIngest".
// ─────────────────────────────────────────────────────────────────────────────

/** A create/update operation for a wiki page, fully resolved at plan time. */
export type IngestPageOp =
  | {
      op: 'create'
      slug: string
      title: string
      type: PageType
      content: string
      summary: string
      relatedSlugs: string[]
      tags: string[]
      confidence: 'high' | 'medium' | 'low'
    }
  | {
      op: 'update'
      slug: string
      /** result of updatePageWithNewEvidence — captured at plan time (costs LLM tokens). */
      mergedContent: string
      summary: string
      confidence: 'high' | 'medium' | 'low'
      addSources: true
      addTags: string[]
      addRelated: string[]
    }

/** A create/update operation for an entity page, fully resolved at plan time. */
export type IngestEntityOp =
  | {
      op: 'create'
      slug: string
      title: string
      type: PageType
      content: string
      summary: string
      relatedSlugs: string[]
      tags: string[]
      confidence: 'high' | 'medium' | 'low'
    }
  | {
      op: 'update'
      slug: string
      /** result of updatePageWithNewEvidence — captured at plan time (costs LLM tokens). */
      mergedContent: string
      addSources: true
    }

/** Everything needed to perform an ingest's writes later, resolved at plan time. */
export type IngestPlan = {
  source: {
    type: 'url' | 'text'
    title: string
    url: string | null
    /** full cleaned content; sliced to 50k chars when the Source doc is written. */
    rawContent: string
    wordCount: number
  }
  pageOps: IngestPageOp[]
  entityOps: IngestEntityOp[]
  /** raw (un-normalized) page descriptors returned in IngestResult.pages. */
  resultPages: Array<{ slug: string; title: string; type: string }>
  /** slugs fed to wireGraphBatch on apply (created entity slugs + all page slugs). */
  expectedGraphSlugs: string[]
  /** all planning-phase LLM tokens (ingest + entity extraction + update merges). */
  tokensUsed: number
  ingestedAt: string
}

/**
 * PURE-ish: runs the LLM + reads the vault to compute what an ingest WOULD write.
 * Performs NO Page/Source/Vault/Log writes and does NOT increment UserPlan, so it
 * is safe for dry-runs and agents. The free-plan limit check is kept here (it is
 * read-only) so `runIngest` still throws before any work is done.
 */
export async function planIngest(userId: string, input: IngestInput): Promise<IngestPlan> {
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
  const [ingestResult, entityResult] = await Promise.all([
    ingestSource(sourceTitle, rawContent, existingIndex, ingestedAt),
    extractEntities(sourceTitle, rawContent, ingestedAt),
  ])
  const { pages: generatedPages, tokensUsed: ingestTokens } = ingestResult
  const { entities, tokensUsed: entityTokens } = entityResult
  totalTokens += ingestTokens + entityTokens

  // Resolve create-vs-update for each generated page against the current vault.
  const pageOps: IngestPageOp[] = await Promise.all(generatedPages.map(async (p): Promise<IngestPageOp> => {
    const slug = slugify(p.slug || p.title)
    const existing = await Page.findOne({ userId, vaultId: vault._id, slug })
    if (existing) {
      const { updatedContent, tokensUsed } = await updatePageWithNewEvidence(existing.content, sourceTitle, p.content, ingestedAt)
      totalTokens += tokensUsed
      return {
        op: 'update',
        slug,
        mergedContent: updatedContent,
        summary: p.summary || existing.summary,
        confidence: normalizeConfidence(p.confidence),
        addSources: true,
        addTags: p.tags || [],
        addRelated: p.relatedSlugs || [],
      }
    }
    return {
      op: 'create',
      slug,
      title: p.title,
      type: normalizePageType(p.type),
      content: p.content,
      summary: p.summary,
      relatedSlugs: p.relatedSlugs || [],
      tags: p.tags || [],
      confidence: normalizeConfidence(p.confidence),
    }
  }))

  const savedSlugs = pageOps.map(op => op.slug)
  const savedSet = new Set(savedSlugs)

  // Resolve create-vs-update for each detected entity, skipping slugs already
  // covered by a page op (matches the original entity-loop semantics exactly).
  const entityOpResults = await Promise.all(entities.map(async (entity): Promise<IngestEntityOp | null> => {
    const slug = slugify(entity.slug || entity.name)
    if (savedSet.has(slug)) return null
    const existing = await Page.findOne({ userId, vaultId: vault._id, slug })
    if (existing) {
      const { updatedContent, tokensUsed } = await updatePageWithNewEvidence(existing.content, sourceTitle, entity.evidence, ingestedAt)
      totalTokens += tokensUsed
      return { op: 'update', slug, mergedContent: updatedContent, addSources: true }
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
    return {
      op: 'create',
      slug,
      title: entity.name,
      type: 'entity',
      content: entityContent,
      summary: entity.summary,
      relatedSlugs: [],
      tags: [entity.type],
      confidence: 'medium',
    }
  }))
  const entityOps = entityOpResults.filter((op): op is IngestEntityOp => op !== null)

  // Only newly-created entity pages count as "enriched" and join the graph batch
  // (entity updates write content but are not added to allSlugs), matching the
  // original behavior precisely.
  const enrichedSlugs = entityOps.filter(op => op.op === 'create').map(op => op.slug)
  const expectedGraphSlugs = [...savedSlugs, ...enrichedSlugs]

  return {
    source: {
      type: input.type,
      title: sourceTitle,
      url: sourceUrl,
      rawContent,
      wordCount: wordCount(rawContent),
    },
    pageOps,
    entityOps,
    resultPages: generatedPages.map(p => ({ slug: slugify(p.slug || p.title), title: p.title, type: p.type })),
    expectedGraphSlugs,
    tokensUsed: totalTokens,
    ingestedAt,
  }
}

/**
 * Persists a previously-computed `IngestPlan`. The ONLY ingest write path: it
 * creates the Source, creates/updates Page + entity docs in the same order as the
 * legacy `runIngest`, runs wireGraphBatch, bumps Vault counts, writes a Log
 * (attributed to an agent when `opts.logActor` is present), and increments
 * UserPlan.ingestsThisMonth. Returns the unchanged `IngestResult` shape.
 */
export async function applyIngestPlan(
  userId: string,
  plan: IngestPlan,
  opts?: { logActor?: { agentId: string; runId: string } }
): Promise<IngestResult> {
  const vault = await Vault.findOne({ userId })
  if (!vault) throw new VaultOpError('Vault not found', 404)

  const source = await Source.create({
    userId, vaultId: vault._id, type: plan.source.type, title: plan.source.title, url: plan.source.url,
    rawContent: plan.source.rawContent.slice(0, 50000), wordCount: plan.source.wordCount,
  })

  // Write the generated wiki pages (creates + evidence merges).
  for (const op of plan.pageOps) {
    if (op.op === 'update') {
      await Page.updateOne(
        { userId, vaultId: vault._id, slug: op.slug },
        {
          content: op.mergedContent,
          summary: op.summary,
          confidence: op.confidence,
          $addToSet: { sources: source._id, tags: { $each: op.addTags }, relatedSlugs: { $each: op.addRelated } },
          $inc: { timelineEntries: 1 },
        }
      )
    } else {
      await Page.create({
        userId, vaultId: vault._id, slug: op.slug, title: op.title, type: op.type,
        content: op.content, summary: op.summary, sources: [source._id],
        relatedSlugs: op.relatedSlugs, tags: op.tags,
        confidence: op.confidence, timelineEntries: 1,
      })
    }
  }

  // Write the entity pages (creates + evidence merges) after the wiki pages.
  for (const op of plan.entityOps) {
    if (op.op === 'update') {
      await Page.updateOne(
        { userId, vaultId: vault._id, slug: op.slug },
        { content: op.mergedContent, $addToSet: { sources: source._id }, $inc: { timelineEntries: 1 } }
      )
    } else {
      await Page.create({
        userId, vaultId: vault._id, slug: op.slug, title: op.title, type: op.type,
        content: op.content, summary: op.summary, sources: [source._id],
        relatedSlugs: op.relatedSlugs, tags: op.tags, confidence: op.confidence, timelineEntries: 1,
      })
    }
  }

  const enrichedSlugs = plan.entityOps.filter(op => op.op === 'create').map(op => op.slug)
  const allSlugs = plan.expectedGraphSlugs
  const graphStats = await wireGraphBatch(userId, vault._id as mongoose.Types.ObjectId, allSlugs)

  const wikiPageCount = plan.pageOps.length
  await Vault.updateOne({ _id: vault._id }, { $inc: { pageCount: wikiPageCount + enrichedSlugs.length, sourceCount: 1 } })

  const logActor = opts?.logActor
  await Log.create({
    userId, vaultId: vault._id, operation: logActor ? 'agent' : 'ingest',
    ...(logActor ? { agentId: logActor.agentId } : {}),
    summary: `Ingested "${plan.source.title}" → ${wikiPageCount} wiki pages + ${enrichedSlugs.length} entity pages enriched (${graphStats.resolved} links wired)`,
    pagesAffected: allSlugs, tokensUsed: plan.tokensUsed,
  })
  await UserPlan.updateOne({ userId }, { $inc: { ingestsThisMonth: 1 } }, { upsert: true })

  return {
    success: true,
    pages: plan.resultPages,
    entitiesEnriched: enrichedSlugs.length,
    graph: graphStats,
    tokensUsed: plan.tokensUsed,
  }
}

/**
 * Ingest a source: generate wiki pages, enrich entities, wire the graph.
 * UNCHANGED PUBLIC CONTRACT — now implemented as plan-then-apply so the Clerk UI
 * and `/api/agent/ingest` keep calling it with identical signature, result shape,
 * error behavior, and observable side effects.
 */
export async function runIngest(userId: string, input: IngestInput): Promise<IngestResult> {
  const plan = await planIngest(userId, input)
  return applyIngestPlan(userId, plan)
}
