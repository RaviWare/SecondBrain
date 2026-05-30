// ── Agent API · tool manifest ─────────────────────────────────────────────────
// Public, unauthenticated description of the agent toolset. A Hermes / MCP host
// fetches this to learn which tools SecondBrain exposes and how to call them.
// Mirrors the agentskills.io / MCP tool-descriptor shape.
import { NextRequest, NextResponse } from 'next/server'

const CORS = { 'Access-Control-Allow-Origin': '*' }

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export function GET(req: NextRequest) {
  const base = new URL(req.url).origin

  return NextResponse.json({
    name: 'secondbrain',
    description:
      'Query, search, and ingest into a SecondBrain knowledge vault. Synthesis answers include citations and a gap analysis of what the brain does not yet know.',
    auth: {
      type: 'bearer',
      header: 'Authorization',
      note: 'Create a token in SecondBrain → Settings → Agent Access. Format: "Bearer sb_...".',
    },
    tools: [
      {
        name: 'secondbrain_query',
        description:
          'Ask a question. Returns a synthesized, cited answer plus a gap analysis (gaps, contradictions, stale pages, confidence). Use for real answers.',
        scope: 'read',
        method: 'POST',
        url: `${base}/api/agent/query`,
        input_schema: {
          type: 'object',
          required: ['question'],
          properties: { question: { type: 'string', description: 'The question to answer from the vault.' } },
        },
      },
      {
        name: 'secondbrain_search',
        description:
          'Raw retrieval of top matching pages (no LLM cost). Use to gather context cheaply before answering yourself.',
        scope: 'read',
        method: 'GET',
        url: `${base}/api/agent/search`,
        query_params: {
          q: 'Search text (omit for most-recent pages).',
          limit: 'Max results, 1-20 (default 8).',
        },
      },
      {
        name: 'secondbrain_ingest',
        description:
          'Add a source (URL or text) to the vault. Generates wiki pages, extracts entities, and auto-wires the knowledge graph. Requires write scope.',
        scope: 'write',
        method: 'POST',
        url: `${base}/api/agent/ingest`,
        input_schema: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', enum: ['url', 'text'] },
            url: { type: 'string', description: 'Required when type=url.' },
            text: { type: 'string', description: 'Required when type=text.' },
            title: { type: 'string', description: 'Optional source title.' },
          },
        },
      },
    ],
  }, { headers: CORS })
}
