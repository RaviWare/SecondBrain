// ── Read-only VaultTools builder ──────────────────────────────────────────────
// The single place that constructs the read-only `VaultTools` binding handed to
// a runner (parent OR sub-agent). It is the structural guarantee behind
// propose-never-write (Property 1): there is intentionally NO `applyIngestPlan`
// binding here — a runner can PLAN a write (`planIngest`) but can never PERFORM
// one. Every vault knowledge write flows through the Aegis `applyProposal` choke
// point, never through these tools.
//
// This mirrors the inline `buildTools` in `src/app/api/agents/[id]/run/route.ts`
// (the parent run path) so a Sub_Agent run uses the IDENTICAL read tools as its
// parent — same search/query/plan/fetch/scan contract, same write-free shape.
// See design.md → "1. The runner engine" and Property 1.
import { Vault, Page } from '@/lib/models'
import { runQuery, planIngest, type IngestInput } from '@/lib/vault-ops'
import { fetchAndCleanUrl } from '@/lib/claude'
import { scanContent } from '@/lib/agents/scanner'
import type { VaultTools, SearchHit, RawSource, ScanResult } from './types'

/** Narrow an arbitrary value into a well-formed IngestInput (url|text), else null. */
export function asIngestInput(value: unknown): IngestInput | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (v.type === 'url' && typeof v.url === 'string') {
    return { type: 'url', url: v.url, ...(typeof v.title === 'string' ? { title: v.title } : {}) }
  }
  if (v.type === 'text' && typeof v.text === 'string') {
    return { type: 'text', text: v.text, ...(typeof v.title === 'string' ? { title: v.title } : {}) }
  }
  return null
}

/**
 * Build the read-only `VaultTools` bound to a user's vault. Used by both the
 * parent run path and the Sub_Agent spawn path so they are handed the SAME
 * write-free tool surface.
 *
 * NOTE (propose-never-write): there is deliberately no `applyIngestPlan` here —
 * the runner can only PLAN; the single write path is `applyProposal`.
 */
export function buildReadOnlyVaultTools(userId: string): VaultTools {
  return {
    // Thin wrapper over Page full-text search, scoped to the user's vault.
    async search(query: string): Promise<SearchHit[]> {
      const vault = await Vault.findOne({ userId })
      if (!vault) return []
      const q = (query || '').trim()
      try {
        const filter: Record<string, unknown> = { userId, vaultId: vault._id }
        if (q) filter.$text = { $search: q }
        const pages = await Page.find(filter, 'slug title summary')
          .sort(q ? { score: { $meta: 'textScore' } } : { updatedAt: -1 })
          .limit(8)
          .lean()
        return pages.map((p) => ({ slug: p.slug, title: p.title, snippet: p.summary }))
      } catch {
        // Text-index/search failure should never crash a run — degrade to empty.
        return []
      }
    },

    // runQuery is read-only knowledge-wise (writes only a Log row + usage counter).
    async query(question: string): Promise<unknown> {
      return runQuery(userId, question)
    },

    // PURE plan — computes what an ingest WOULD write, performs no write.
    async planIngest(input: unknown): Promise<unknown> {
      const ingestInput = asIngestInput(input)
      if (!ingestInput) throw new Error('Invalid ingest input')
      return planIngest(userId, ingestInput)
    },

    // Fetch + clean only. URL inputs go through the cleaner; text passes through.
    async fetchSource(input: unknown): Promise<RawSource> {
      const ingestInput = asIngestInput(input)
      if (!ingestInput) throw new Error('Invalid ingest input')
      if (ingestInput.type === 'url') {
        const fetched = await fetchAndCleanUrl(ingestInput.url)
        return {
          type: 'url',
          title: ingestInput.title || fetched.title,
          url: ingestInput.url,
          rawContent: fetched.content,
        }
      }
      return {
        type: 'text',
        title: ingestInput.title || 'Untitled',
        url: null,
        rawContent: ingestInput.text,
      }
    },

    // Content_Scanner — screen every fetched source BEFORE it can be planned or
    // proposed (Req 5.1, 5.9). PURE/synchronous/deterministic, no I/O.
    scan(source: RawSource): ScanResult {
      return scanContent(source.rawContent)
    },
  }
}
