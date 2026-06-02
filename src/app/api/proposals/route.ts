// ── /api/proposals — Clerk-authed pending Aegis Queue ─────────────────────────
// Lists the signed-in user's pending Proposals, projected through the shared
// queue view-model (`pendingQueue` → `toQueueItem`) so the dashboard rail, Inbox,
// and Work Board all render the same what/why/decision anatomy.
// Same Clerk auth pattern as `/api/pages`.
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Proposal } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { pendingQueue, type ProposalView } from '@/lib/agents/aegis/queue-view'

/** GET /api/proposals — list the user's pending proposals as queue items. */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await connectDB()
    const proposals = await Proposal.find({ userId, status: 'pending' })
      .sort({ createdAt: -1 })
      .lean()

    // `pendingQueue` re-filters to pending and maps each to its queue item.
    const items = pendingQueue(proposals as unknown as ProposalView[])
    return NextResponse.json({ items })
  } catch (err) {
    agentLog.error('[proposals] failed to list pending queue', err)
    return NextResponse.json({ error: 'Could not load your queue' }, { status: 500 })
  }
}
