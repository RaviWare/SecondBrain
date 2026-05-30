import Anthropic from '@anthropic-ai/sdk'
import FirecrawlApp from '@mendable/firecrawl-js'

// Lazy-init the SDK client. Evaluating `process.env.ANTHROPIC_API_KEY` at
// module-load time can capture `undefined` if the module is resolved before
// Next finishes populating env (observed under Turbopack). Deferring to first
// use guarantees the env is ready and produces a clearer error if absent.
let _anthropic: Anthropic | null = null
function anthropicClient(): Anthropic {
  if (_anthropic) return _anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _anthropic = new Anthropic({ apiKey })
  return _anthropic
}
const MODEL = 'claude-haiku-4-5'

// ── GBrain: Compiled Truth + Timeline pattern ─────────────────────────────────
// Each wiki page has two zones separated by ---TIMELINE---
//   Zone 1: Compiled Truth — current synthesized understanding (always up to date)
//   Zone 2: Evidence Trail — append-only log of what each source contributed
// When the same concept appears in a new source, the truth is refined and a new
// timeline entry is appended. Nothing is ever deleted from the evidence trail.
// ─────────────────────────────────────────────────────────────────────────────

export const WIKI_SCHEMA = `You are a disciplined wiki maintainer for a personal second brain knowledge base.
You use the GBrain "Compiled Truth + Timeline" pattern pioneered by Garry Tan (Y Combinator).

WRITING STANDARDS:
- Wikipedia-style encyclopedic tone. Factual, neutral, precise.
- No first-person ("I", "we"). No em dashes. No filler phrases.
- Max 2 direct quotes per article.
- Structure content thematically, not chronologically in the Compiled Truth section.
- Every claim must be traceable to a source in the Evidence Trail.

FRONTMATTER FORMAT (always include at top):
---
title: Page Title
type: source-summary | concept | entity | synthesis | pattern | query-answer
confidence: high | medium | low
tags: [tag1, tag2]
related: [slug-one, slug-two]
---

GBRAIN PAGE STRUCTURE (always follow this two-zone format):

## Current Understanding
[Synthesized truth — what we know right now. Updated every time new evidence arrives.
Written in encyclopedic style. Cross-references other pages using [[slug]] wikilinks.]

---TIMELINE---

### [ISO-8601 timestamp] | Source: [source title]
[What this specific source contributed to our understanding of this topic.
Bullet points preferred. Quote sparingly. Always attribute claims.]

WIKILINK FORMAT: [[page-slug]] for all cross-references.

PAGE TYPES:
- source-summary: Summary of one ingested source
- concept: An idea, framework, theory, or method
- entity: A person, organization, tool, or product
- synthesis: Cross-source analysis connecting multiple sources
- pattern: A recurring theme identified across sources
- query-answer: A valuable answer worth preserving
`

export interface WikiPage {
  slug: string
  title: string
  type: string
  content: string
  summary: string
  relatedSlugs: string[]
  tags: string[]
  confidence: string
}

export interface DetectedEntity {
  name: string
  slug: string
  type: 'person' | 'organization' | 'product' | 'place'
  summary: string
  evidence: string
}

// ── Ingest Source ─────────────────────────────────────────────────────────────
// GBrain pattern: generate wiki pages in Compiled Truth + Timeline format
// ─────────────────────────────────────────────────────────────────────────────
export async function ingestSource(
  sourceTitle: string,
  sourceContent: string,
  existingIndex: string,
  ingestedAt: string = new Date().toISOString()
): Promise<{ pages: WikiPage[]; tokensUsed: number }> {
  const response = await anthropicClient().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: WIKI_SCHEMA,
    messages: [{
      role: 'user',
      content: `You are ingesting a new source into a GBrain-style second brain wiki.

EXISTING WIKI INDEX:
${existingIndex || '(empty wiki — this is the first source)'}

NEW SOURCE TITLE: ${sourceTitle}
INGESTED AT: ${ingestedAt}

NEW SOURCE CONTENT:
${sourceContent.slice(0, 14000)}

TASK:
1. Write a source-summary page for this source using the Compiled Truth + Timeline format.
2. Identify 2-4 key concepts, entities (people/orgs/products), or patterns and create pages for them.

IMPORTANT: Every page MUST use the two-zone GBrain format:
## Current Understanding
[synthesized truth]

---TIMELINE---

### ${ingestedAt} | Source: ${sourceTitle}
[what this source contributed]

Return a JSON array:
[{
  "slug": "kebab-case-slug",
  "title": "Page Title",
  "type": "source-summary|concept|entity|pattern|synthesis",
  "content": "full markdown with frontmatter + Compiled Truth + Timeline zones",
  "summary": "one sentence summary",
  "relatedSlugs": ["other-slug"],
  "tags": ["tag1"],
  "confidence": "high|medium|low"
}]

Return ONLY the JSON array. No text outside the JSON.`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens

  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('Claude did not return valid JSON array')

  const pages: WikiPage[] = JSON.parse(jsonMatch[0])
  return { pages, tokensUsed }
}

// ── Update Existing Page (Compiled Truth + Timeline append) ───────────────────
// GBrain pattern: when a concept already exists in the wiki and new evidence
// arrives, update the Compiled Truth section and APPEND to the Evidence Trail.
// The old evidence is never deleted — only the synthesized truth is refined.
// ─────────────────────────────────────────────────────────────────────────────
export async function updatePageWithNewEvidence(
  existingContent: string,
  newSourceTitle: string,
  newEvidence: string,
  ingestedAt: string = new Date().toISOString()
): Promise<{ updatedContent: string; tokensUsed: number }> {
  const response = await anthropicClient().messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: WIKI_SCHEMA,
    messages: [{
      role: 'user',
      content: `Update this wiki page using the GBrain Compiled Truth + Timeline pattern.

EXISTING PAGE CONTENT:
${existingContent}

NEW EVIDENCE FROM: "${newSourceTitle}" (ingested at ${ingestedAt})
${newEvidence}

TASK:
1. Refine the "## Current Understanding" section to incorporate the new evidence.
   Keep what's still true. Update or add claims based on new evidence.
2. APPEND a new timeline entry at the bottom of the Evidence Trail (do NOT modify existing entries):

### ${ingestedAt} | Source: ${newSourceTitle}
[what the new source contributed — bullet points]

Return ONLY the full updated page content (frontmatter + both zones). No JSON wrapper.`,
    }],
  })

  const updatedContent = response.content[0].type === 'text' ? response.content[0].text : existingContent
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens
  return { updatedContent, tokensUsed }
}

// ── Signal Detection + Entity Extraction ─────────────────────────────────────
// GBrain pattern: on every ingest, detect signals — key people, organizations,
// products, and places mentioned. These become or enrich entity pages.
// ─────────────────────────────────────────────────────────────────────────────
export async function extractEntities(
  sourceTitle: string,
  sourceContent: string,
  _ingestedAt: string = new Date().toISOString()
): Promise<{ entities: DetectedEntity[]; tokensUsed: number }> {
  const response = await anthropicClient().messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `You are a signal detector for a GBrain knowledge system. Extract key named entities from content.`,
    messages: [{
      role: 'user',
      content: `Extract the most important named entities from this source that deserve their own wiki pages.
Focus on: key people (authors, experts, founders), organizations (companies, institutions), products/tools, and important places.
Ignore generic/common nouns. Only extract entities with specific proper names worth tracking.

SOURCE TITLE: ${sourceTitle}
CONTENT: ${sourceContent.slice(0, 8000)}

Return a JSON array (max 5 entities, empty array if none worth tracking):
[{
  "name": "Full Name or Organization Name",
  "slug": "kebab-case-slug",
  "type": "person|organization|product|place",
  "summary": "One sentence: who/what this is and why they matter",
  "evidence": "What this source says about them (2-3 bullet points)"
}]

Return ONLY the JSON array.`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const entities: DetectedEntity[] = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    return { entities, tokensUsed }
  } catch {
    return { entities: [], tokensUsed }
  }
}

// ── Multi-Query Expansion ─────────────────────────────────────────────────────
// GBrain pattern: expand a single user question into multiple sub-queries
// covering different angles. Search with all of them, then RRF the results
// for significantly better recall than single-query search.
// ─────────────────────────────────────────────────────────────────────────────
export async function expandQuery(question: string): Promise<{ queries: string[]; tokensUsed: number }> {
  const response = await anthropicClient().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: `You generate search query expansions for a personal knowledge base. Be concise.`,
    messages: [{
      role: 'user',
      content: `Expand this question into 3 search queries that cover different angles.
Each query should help find relevant wiki pages the original might miss.

QUESTION: ${question}

Return JSON only:
{
  "queries": ["original question", "more specific variant", "broader contextual variant"]
}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const { queries } = jsonMatch ? JSON.parse(jsonMatch[0]) : { queries: [question] }
    return { queries: queries.slice(0, 3), tokensUsed }
  } catch {
    return { queries: [question], tokensUsed }
  }
}

// ── Query Wiki (synthesis + gap analysis — GBrain "think" mode) ───────────────
// GBrain's differentiator over plain search: don't just answer, also tell the
// user what the brain DOESN'T know yet. Returns the synthesized answer plus an
// explicit gap analysis — stale pages, uncited claims, contradictions, and
// holes worth filling. This is what makes it a brain instead of a search box.
// ─────────────────────────────────────────────────────────────────────────────
export interface GapAnalysis {
  /** Short, honest notes about what the brain is missing or unsure about. */
  gaps: string[]
  /** Slugs that look stale / haven't been updated recently relative to the topic. */
  staleSlugs: string[]
  /** Plain-language note about contradictions found across pages, if any. */
  contradictions: string[]
  /** A 0-1 confidence the answer is well-supported by the cited pages. */
  confidence: number
}

export async function queryWiki(
  question: string,
  relevantPages: Array<{ title: string; slug: string; content: string; updatedAt?: string | Date }>
): Promise<{ answer: string; citedSlugs: string[]; gap: GapAnalysis; tokensUsed: number }> {
  // For query answers, show only the Compiled Truth section (above ---TIMELINE---)
  // so Claude answers from synthesized knowledge, not raw evidence logs
  const pagesContext = relevantPages
    .map(p => {
      const compiledTruth = p.content.split('---TIMELINE---')[0] || p.content
      const age = p.updatedAt ? ` (last updated ${new Date(p.updatedAt).toISOString().slice(0, 10)})` : ''
      return `## ${p.title} (slug: ${p.slug})${age}\n${compiledTruth.slice(0, 2500)}`
    })
    .join('\n\n---\n\n')

  const response = await anthropicClient().messages.create({
    model: MODEL,
    max_tokens: 2400,
    system: WIKI_SCHEMA,
    messages: [{
      role: 'user',
      content: `Answer this question using ONLY the wiki pages below, then perform a GBrain-style gap analysis.
Draw the answer from the Compiled Truth in each page. Cite with [[slug]] format.

The gap analysis is critical — be honest about what the brain does NOT know:
- gaps: things the question asks about that the pages don't cover, or open questions worth filling
- staleSlugs: slugs whose content looks outdated for this topic (use the "last updated" dates as a hint)
- contradictions: any places where two pages disagree (empty array if none)
- confidence: 0.0-1.0, how well the cited pages actually support the answer

QUESTION: ${question}

WIKI PAGES:
${pagesContext}

Return JSON only:
{
  "answer": "markdown answer with [[slug]] citations",
  "citedSlugs": ["slug1", "slug2"],
  "gap": {
    "gaps": ["what the brain doesn't know yet"],
    "staleSlugs": ["slug-that-looks-old"],
    "contradictions": ["page X says A but page Y says B"],
    "confidence": 0.0
  }
}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude did not return valid JSON')

  const parsed = JSON.parse(jsonMatch[0]) as {
    answer: string
    citedSlugs?: string[]
    gap?: Partial<GapAnalysis>
  }

  const gap: GapAnalysis = {
    gaps: parsed.gap?.gaps ?? [],
    staleSlugs: parsed.gap?.staleSlugs ?? [],
    contradictions: parsed.gap?.contradictions ?? [],
    confidence: typeof parsed.gap?.confidence === 'number' ? parsed.gap.confidence : 0.5,
  }

  return { answer: parsed.answer, citedSlugs: parsed.citedSlugs ?? [], gap, tokensUsed }
}

// ── URL Fetcher (Firecrawl-powered) ──────────────────────────────────────────
// Uses Firecrawl for clean Markdown extraction — handles JS-rendered pages,
// paywalls, and complex layouts that naive HTML scraping misses.
// Falls back to manual HTML stripping if Firecrawl fails.
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchAndCleanUrl(url: string): Promise<{ title: string; content: string }> {
  const apiKey = process.env.FIRECRAWL_API_KEY

  if (apiKey) {
    try {
      const firecrawl = new FirecrawlApp({ apiKey })
      const result = await firecrawl.scrape(url, { formats: ['markdown'] }) as {
        success?: boolean
        markdown?: string
        metadata?: { title?: string; ogTitle?: string }
      }

      if (result.success && result.markdown) {
        const title = result.metadata?.title || result.metadata?.ogTitle || url
        return { title: title.trim(), content: result.markdown.slice(0, 20000) }
      }
    } catch {
      // fall through to manual scrape
    }
  }

  // Fallback: manual HTML scrape
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SecondBrainBot/1.0)' },
  })
  const html = await response.text()

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : url

  const content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000)

  return { title, content }
}
