// ── Agent API · search ────────────────────────────────────────────────────────
// Bearer-token authed raw retrieval (no LLM cost). Returns top matching pages
// for an agent to use as context. The cheap counterpart to /agent/query.
import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent, hasScope, getAgentVault } from '@/lib/agent-auth'
import { Page } from '@/lib/models'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  const ctx = await authenticateAgent(req)
  if (!ctx) return NextResponse.json({ error: 'Invalid or missing agent token' }, { status: 401, headers: CORS })
  if (!hasScope(ctx, 'read')) return NextResponse.json({ error: 'Token lacks read scope' }, { status: 403, headers: CORS })

  const vault = await getAgentVault(ctx)
  if (!vault) return NextResponse.json({ pages: [] }, { headers: CORS })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const limit = Math.min(20, Math.max(1, Number(searchParams.get('limit')) || 8))

  const filter: Record<string, unknown> = { userId: ctx.userId, vaultId: vault._id }
  type SearchHit = {
    slug: string
    title?: string
    type?: string
    summary?: string
    tags?: string[]
    updatedAt?: Date
  }
  let pages: SearchHit[] = []
  if (q) {
    try {
      pages = (await Page.find(
        { ...filter, $text: { $search: q } },
        { score: { $meta: 'textScore' }, slug: 1, title: 1, type: 1, summary: 1, tags: 1, updatedAt: 1 }
      ).sort({ score: { $meta: 'textScore' } }).limit(limit).lean()) as SearchHit[]
    } catch {
      pages = []
    }
  } else {
    pages = (await Page.find(filter, 'slug title type summary tags updatedAt')
      .sort({ updatedAt: -1 }).limit(limit).lean()) as SearchHit[]
  }

  return NextResponse.json({
    query: q || null,
    count: pages.length,
    pages: pages.map(p => ({
      slug: p.slug,
      title: p.title,
      type: p.type,
      summary: p.summary,
      tags: p.tags ?? [],
      updatedAt: p.updatedAt,
    })),
  }, { headers: CORS })
}
