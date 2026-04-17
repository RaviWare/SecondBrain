import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-haiku-4-5'

export const WIKI_SCHEMA = `You are a disciplined wiki maintainer for a personal second brain knowledge base.

WRITING STANDARDS:
- Wikipedia-style encyclopedic tone. Factual, neutral, precise.
- No first-person ("I", "we"). No em dashes. No filler phrases.
- Max 2 direct quotes per article.
- Structure content thematically, not chronologically.
- Every claim must be traceable to a source.

FRONTMATTER FORMAT (always include at top):
---
title: Page Title
type: source-summary | concept | entity | synthesis | pattern | query-answer
confidence: high | medium | low
tags: [tag1, tag2]
related: [slug-one, slug-two]
---

WIKILINK FORMAT: [[page-slug]] for cross-references.

PAGE TYPES:
- source-summary: Summary of one ingested source
- concept: An idea, framework, theory, or method
- entity: A person, organization, tool, or product
- synthesis: Cross-source analysis
- pattern: A recurring theme across sources
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

export async function ingestSource(
  sourceTitle: string,
  sourceContent: string,
  existingIndex: string
): Promise<{ pages: WikiPage[]; tokensUsed: number }> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: WIKI_SCHEMA,
    messages: [{
      role: 'user',
      content: `You are ingesting a new source into this second brain wiki.

EXISTING WIKI INDEX:
${existingIndex || '(empty wiki — this is the first source)'}

NEW SOURCE TITLE: ${sourceTitle}

NEW SOURCE CONTENT:
${sourceContent.slice(0, 15000)}

TASK:
1. Write a source-summary page for this source.
2. Identify 2-4 key concepts, entities, or patterns and create pages for them.

Return a JSON array of page objects:
{
  "slug": "kebab-case-slug",
  "title": "Page Title",
  "type": "source-summary|concept|entity|pattern",
  "content": "full markdown content with frontmatter",
  "summary": "one sentence summary",
  "relatedSlugs": ["other-slug"],
  "tags": ["tag1"],
  "confidence": "high|medium|low"
}

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

export async function queryWiki(
  question: string,
  relevantPages: Array<{ title: string; slug: string; content: string }>
): Promise<{ answer: string; citedSlugs: string[]; tokensUsed: number }> {
  const pagesContext = relevantPages
    .map(p => `## ${p.title} (slug: ${p.slug})\n${p.content.slice(0, 3000)}`)
    .join('\n\n---\n\n')

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: WIKI_SCHEMA,
    messages: [{
      role: 'user',
      content: `Answer this question using ONLY the wiki pages below. Cite with [[slug]] format.

QUESTION: ${question}

WIKI PAGES:
${pagesContext}

Return JSON only:
{
  "answer": "markdown answer with [[slug]] citations",
  "citedSlugs": ["slug1", "slug2"]
}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude did not return valid JSON')

  return { ...JSON.parse(jsonMatch[0]), tokensUsed }
}

export async function fetchAndCleanUrl(url: string): Promise<{ title: string; content: string }> {
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
