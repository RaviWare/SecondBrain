// ── GBrain: Self-wiring knowledge graph ───────────────────────────────────────
// Every page write extracts entity refs from the markdown and creates typed,
// bidirectional edges with ZERO LLM calls — pure pattern matching. This is the
// mechanism that lets the graph grow on its own: when page A mentions [[b]],
// we link A→B AND backlink B→A so traversal works from either side.
// ─────────────────────────────────────────────────────────────────────────────

import { Page } from '@/lib/models'
import type mongoose from 'mongoose'
import { slugify } from '@/lib/utils'

/** Extract all [[wikilink]] slugs from markdown content (deduped, normalized). */
export function extractWikiLinks(content: string): string[] {
  const links = new Set<string>()
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const raw = m[1].trim()
    if (raw) links.add(slugify(raw))
  }
  return [...links]
}

type EdgeStats = {
  /** edges where the target page actually exists in the vault */
  resolved: number
  /** edges pointing at slugs that don't exist yet (dangling) */
  dangling: number
  /** how many backlinks were newly written */
  backlinks: number
}

/**
 * Wire the graph for a freshly written/updated page.
 *
 * 1. Parse [[slug]] refs out of `content`.
 * 2. Add every resolvable ref to THIS page's relatedSlugs (forward edges).
 * 3. Add THIS page's slug to each target's relatedSlugs (backlinks).
 *
 * Idempotent: uses $addToSet so re-running never duplicates edges.
 * Does not create stub pages — dangling refs are reported, not materialized,
 * so a typo'd link never spawns a junk page.
 */
export async function wirePageGraph(
  userId: string,
  vaultId: mongoose.Types.ObjectId,
  slug: string,
  content: string
): Promise<EdgeStats> {
  const refs = extractWikiLinks(content).filter(s => s && s !== slug)
  if (refs.length === 0) return { resolved: 0, dangling: 0, backlinks: 0 }

  // Which referenced slugs actually exist in this vault?
  const existing = await Page.find(
    { userId, vaultId, slug: { $in: refs } },
    'slug'
  ).lean()
  const existingSlugs = existing.map(p => p.slug)
  const existingSet = new Set(existingSlugs)

  // 1. Forward edges: this page → all resolvable refs.
  if (existingSlugs.length > 0) {
    await Page.updateOne(
      { userId, vaultId, slug },
      { $addToSet: { relatedSlugs: { $each: existingSlugs } } }
    )
  }

  // 2. Backlinks: each target → this page.
  let backlinks = 0
  if (existingSlugs.length > 0) {
    const res = await Page.updateMany(
      { userId, vaultId, slug: { $in: existingSlugs } },
      { $addToSet: { relatedSlugs: slug } }
    )
    backlinks = res.modifiedCount ?? 0
  }

  return {
    resolved: existingSlugs.length,
    dangling: refs.length - existingSet.size,
    backlinks,
  }
}

/**
 * Wire the graph for a batch of slugs that were written in the same ingest.
 * Runs after ALL pages are persisted so cross-references between the new pages
 * resolve (page A and page B written together can link to each other).
 */
export async function wireGraphBatch(
  userId: string,
  vaultId: mongoose.Types.ObjectId,
  slugs: string[]
): Promise<EdgeStats> {
  const pages = await Page.find(
    { userId, vaultId, slug: { $in: slugs } },
    'slug content'
  ).lean()

  const totals: EdgeStats = { resolved: 0, dangling: 0, backlinks: 0 }
  for (const page of pages) {
    const stats = await wirePageGraph(userId, vaultId, page.slug, page.content)
    totals.resolved += stats.resolved
    totals.dangling += stats.dangling
    totals.backlinks += stats.backlinks
  }
  return totals
}
