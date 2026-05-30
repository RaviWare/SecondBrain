// ── Agent API · query ─────────────────────────────────────────────────────────
// Bearer-token authed endpoint for Hermes / OpenClaw / any MCP client.
// POST { question } → synthesized answer + citations + gap analysis.
import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent, hasScope } from '@/lib/agent-auth'
import { runQuery, VaultOpError } from '@/lib/vault-ops'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: NextRequest) {
  const ctx = await authenticateAgent(req)
  if (!ctx) return NextResponse.json({ error: 'Invalid or missing agent token' }, { status: 401, headers: CORS })
  if (!hasScope(ctx, 'read')) return NextResponse.json({ error: 'Token lacks read scope' }, { status: 403, headers: CORS })

  let body: { question?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS })
  }

  try {
    const result = await runQuery(ctx.userId, body.question ?? '')
    return NextResponse.json(result, { headers: CORS })
  } catch (err) {
    if (err instanceof VaultOpError) {
      return NextResponse.json({ error: err.message }, { status: err.status, headers: CORS })
    }
    console.error('[agent/query] uncaught', err)
    return NextResponse.json({ error: 'Query failed' }, { status: 500, headers: CORS })
  }
}
