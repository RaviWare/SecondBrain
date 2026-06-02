// ── /api/proposals/[id] — decide on a Proposal ────────────────────────────────
// Clerk-authed, scoped to the signed-in user. Dispatches a decision to the Aegis
// layer — the single write choke point. Same auth pattern as `/api/pages`.
//
// Body: { action: 'approve'|'refine'|'dismiss'|'undo', reply?: string }
//   approve → applyProposal   (the ONLY agent-side vault write path)
//   refine  → refineProposal  (records reply, spawns a revised child Proposal)
//   dismiss → dismissProposal (no write)
//   undo    → undoProposal    (reverse a reversible write within its window)
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import {
  applyProposal,
  refineProposal,
  dismissProposal,
  undoProposal,
} from '@/lib/agents/aegis/apply-proposal'

const ACTIONS = ['approve', 'refine', 'dismiss', 'undo'] as const
type Action = (typeof ACTIONS)[number]

/** POST /api/proposals/[id] — dispatch a decision to the Aegis layer. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = typeof body.action === 'string' ? body.action : ''
  if (!(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 })
  }

  await connectDB()
  const { id } = await params
  const actor = { userId }

  try {
    let proposal
    switch (action as Action) {
      case 'approve':
        proposal = await applyProposal(id, actor)
        break
      case 'refine': {
        const reply = typeof body.reply === 'string' ? body.reply : ''
        proposal = await refineProposal(id, reply, actor)
        break
      }
      case 'dismiss':
        proposal = await dismissProposal(id, actor)
        break
      case 'undo':
        proposal = await undoProposal(id, actor)
        break
    }
    return NextResponse.json({ proposal })
  } catch (err) {
    // Map "not found" to 404; everything else (invalid state, undo window, etc.)
    // is a 400 with a safe message — never leak secrets or internals.
    const message = err instanceof Error ? err.message : 'Failed to process proposal'
    const status = /not found/i.test(message) ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
