// ── /api/agents/board — Clerk-authed Work_Board payload ───────────────────────
// The read-only data feed the Work_Board page (`/app/agents/board`, task 5.1)
// consumes. Returns, for the signed-in user, the five Work_Board columns
//   Queued → Reading → Connecting → Review → Woven in
// each carrying its real Work_Items grouped from actual Agent work (Req 8.1).
//
// SCOPE: a SEPARATE sub-route from the Agent collection routes and the dashboard
// feed. The existing `/api/agents` (list/create), `/api/agents/[id]/*`,
// `/api/agents/dashboard`, and the token-authed `/api/agent/*` /
// `/api/agent-instance/*` handlers are all left untouched.
//
// NO FABRICATED DATA (hard project rule; Property 19 spirit): every Work_Item is
// derived from a real `Proposal` or in-flight `AgentRun` row scoped to `userId`.
//   • Review     ← pending Proposals (the Aegis_Queue gate)
//   • Woven in   ← approved / auto-applied Proposals (landed in the vault)
//   • Queued/Reading/Connecting ← in-flight AgentRuns, placed by their latest
//                                  trace step
// A column with nothing real behind it returns `items: []`. The pure grouping +
// the Review-only accent decision both live in `board-view.ts` / `accent.ts`.
//
// NESTED SUB_AGENT WORK (Req 8.9): a spawned Sub_Agent persists its proposals with
// `parentProposalId` set to the parent's Proposal (see `sub-agent.ts`). Those
// sub-agent proposals are themselves `pending`, so the pending query below already
// fetches them; `.lean()` returns the `parentProposalId` field verbatim, and
// `groupWorkBoard` nests each child under its parent's Work_Item. No extra query is
// needed — the linkage rides along on the rows we already read.
//
// Same Clerk auth pattern as `/api/agents/dashboard`: auth() → 401 → connectDB().
// Never logs tokens or secrets.
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { AgentRun, Proposal } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import {
  groupWorkBoard,
  type ActiveRunRow,
  type BoardColumnView,
} from '@/lib/agents/board-view'
import type { ProposalView } from '@/lib/agents/aegis/queue-view'

// Bound how many landed ("Woven in") items we surface — the gate (Review) and the
// in-flight columns are naturally small; only the historical applied set can grow.
const WOVEN_LIMIT = 40

/** Full board payload returned by GET — the five columns in pipeline order. */
interface BoardPayload {
  columns: BoardColumnView[]
}

/**
 * GET /api/agents/board — the Work_Board data feed.
 *
 * Fetches (scoped by `userId`):
 *   • pending proposals          → Review column (Aegis gate)
 *   • applied proposals (recent) → Woven in column
 *   • running AgentRuns          → Queued / Reading / Connecting by trace step
 * then delegates ALL grouping + ordering + accent to the pure `groupWorkBoard`.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await connectDB()

    const [pendingProposals, appliedProposals, activeRuns] = await Promise.all([
      // Review (the Aegis gate) — every pending proposal, newest first.
      Proposal.find({ userId, status: 'pending' }).sort({ createdAt: -1 }).lean(),
      // Woven in — proposals whose write actually landed in the vault.
      Proposal.find({ userId, status: { $in: ['approved', 'auto-applied'] } })
        .sort({ updatedAt: -1 })
        .limit(WOVEN_LIMIT)
        .lean(),
      // Pre-Review columns — currently-executing runs + their trace (for the step).
      AgentRun.find({ userId, status: 'running' }, 'agentId trace').lean(),
    ])

    // Shape in-flight runs for the pure grouper: extract the latest real trace step.
    const runRows: ActiveRunRow[] = activeRuns.map((run) => {
      const trace = (run.trace ?? []) as Array<{ step?: string }>
      const latestStep = trace.length > 0 ? trace[trace.length - 1]?.step ?? null : null
      return { _id: run._id, agentId: run.agentId, latestStep }
    })

    const proposals = [
      ...(pendingProposals as unknown as ProposalView[]),
      ...(appliedProposals as unknown as ProposalView[]),
    ]

    const columns = groupWorkBoard({ proposals, activeRuns: runRows })

    const payload: BoardPayload = { columns }
    return NextResponse.json(payload)
  } catch (err) {
    agentLog.error('[agents/board] failed to build board payload', err)
    return NextResponse.json({ error: 'Could not load the work board' }, { status: 500 })
  }
}
