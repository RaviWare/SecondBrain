// ── Agent API · ingest ────────────────────────────────────────────────────────
// Bearer-token authed. Requires the 'write' scope. Lets an agent push a source
// (URL or text) into the user's vault. Returns generated pages + graph stats.
import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent, hasScope } from '@/lib/agent-auth'
import { runIngest, VaultOpError, type IngestInput } from '@/lib/vault-ops'

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
  if (!hasScope(ctx, 'write')) {
    return NextResponse.json({ error: 'Token lacks write scope' }, { status: 403, headers: CORS })
  }

  let body: IngestInput
  try {
    body = (await req.json()) as IngestInput
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS })
  }

  try {
    const result = await runIngest(ctx.userId, body)
    return NextResponse.json(result, { headers: CORS })
  } catch (err) {
    if (err instanceof VaultOpError) {
      return NextResponse.json({ error: err.message }, { status: err.status, headers: CORS })
    }
    console.error('[agent/ingest] uncaught', err)
    return NextResponse.json({ error: 'Ingest failed' }, { status: 500, headers: CORS })
  }
}
