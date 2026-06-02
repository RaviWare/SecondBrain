// ── /api/agents/dashboard — Clerk-authed Squad Dashboard payload ──────────────
// The single read-only data feed the Squad_Dashboard page (task 3.3) consumes.
// Returns, for the signed-in user, everything the "air-traffic-control" home shows:
//   • tally    — status-strip + "today" proof-of-work counts (Req 6.1, 6.2)
//   • roster   — one AgentCard view-model per Agent (Req 6.3)
//   • queue    — the pending Aegis_Queue items (Req 3.1, 3.2, 3.3)
//   • activity — the recent Activity_Feed slice (Req 6.4)
//
// SCOPE: this is a SEPARATE sub-route from the Agent collection routes. The
// existing `/api/agents` (list/create) and `/api/agents/[id]/*` handlers are left
// untouched, as are the token-authed `/api/agent/*` and `/api/agent-instance/*`.
//
// Sign-off surfacing rule (Req 3.10): pending sign-offs are surfaced ONLY here
// (the dashboard rail) and in the Inbox — there are NO push notifications. This
// route just RETURNS the pending queue; it never pushes/notifies.
//
// NO DUMMY DATA (Req 6.1, 6.2; Property 19): every field is derived from real
// Agent / Proposal / AgentRun / Log rows scoped to `userId`. Empty arrays / zero
// counts when there is nothing. The "now" line is empty when nothing is in flight.
//
// Same Clerk auth pattern as the other in-app `/api/*` routes: auth() → 401 →
// connectDB(). Never logs tokens or secrets.
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Agent, AgentRun, Proposal, Log } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { getDashboardTally, deriveAgentStatus } from '@/lib/agents/dashboard-tally'
import { pendingQueue, type ProposalView } from '@/lib/agents/aegis/queue-view'
import {
  buildActivityFeed,
  deriveNowLine,
  type LogFeedRow,
  type ProposalFeedRow,
  type RunFeedRow,
} from '@/lib/agents/dashboard-feed'
import { band, type TrustBand } from '@/lib/agents/trust'
import type { AgentStatus } from '@/lib/agents/accent'

// How many entries to surface in each recent list (feed is bounded for the rail).
const FEED_LIMIT = 20
const RECENT_FETCH = 30

// AgentRun terminal states that mean the Agent's most recent run did NOT succeed.
const FAILED_RUN_STATUSES: ReadonlySet<string> = new Set(['failed', 'budget-stopped', 'timeout'])

/** One roster Agent card view-model (shape consumed by `AgentCard`, task 3.4). */
interface RosterCard {
  id: string
  name: string
  role: string
  customRoleDescription: string | null
  status: AgentStatus
  trustScore: number
  trustBand: TrustBand
  skillIds: string[]
  now: string
}

/** Full dashboard payload returned by GET. */
interface DashboardPayload {
  tally: Awaited<ReturnType<typeof getDashboardTally>>
  roster: RosterCard[]
  queue: ReturnType<typeof pendingQueue>
  activity: ReturnType<typeof buildActivityFeed>
}

/**
 * GET /api/agents/dashboard — the Squad_Dashboard data feed.
 *
 * Composes four real, user-scoped views:
 *   1. tally    via `getDashboardTally(userId)`        — the status strip + today line
 *   2. roster   via `deriveAgentStatus` + `deriveNowLine` per Agent
 *   3. queue    via `pendingQueue`/`toQueueItem`        — pending proposals only
 *   4. activity via `buildActivityFeed`                 — agent logs + proposal/run events
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await connectDB()

    // Fetch everything in parallel, each query scoped by `userId`. `getDashboardTally`
    // does its own scoped fetch + counting (reused as-is — no counting logic here).
    const [tally, agentDocs, activeRuns, pendingProposals, recentAgentLogs, recentProposals, recentRuns] =
      await Promise.all([
        getDashboardTally(userId),
        // Roster — full Agent docs (need role/skills/trust/lifecycle for the cards).
        Agent.find({ userId }).sort({ updatedAt: -1 }).lean(),
        // Currently-executing runs — drive each Agent's "running" status + "now" line.
        AgentRun.find({ userId, status: 'running' }, 'agentId trace').lean(),
        // Pending proposals — the Aegis Queue (any age) + per-agent pending counts.
        Proposal.find({ userId, status: 'pending' }).sort({ createdAt: -1 }).lean(),
        // Activity_Feed inputs: recent agent-attributed Activity Log rows…
        Log.find({ userId, operation: 'agent' }).sort({ createdAt: -1 }).limit(RECENT_FETCH).lean(),
        // …recent proposals (their outcomes appear in the feed, Req 3.11)…
        Proposal.find({ userId }).sort({ createdAt: -1 }).limit(RECENT_FETCH).lean(),
        // …and recent runs (completions / check-ins).
        AgentRun.find({ userId }).sort({ createdAt: -1 }).limit(RECENT_FETCH).lean(),
      ])

    // ── Per-agent runtime signals (all from real rows) ──
    // Agents with an active run, and that run's latest trace step (for the "now" line).
    const runningAgentIds = new Set<string>()
    const latestTraceStepByAgent = new Map<string, string>()
    for (const run of activeRuns) {
      const aid = String(run.agentId)
      runningAgentIds.add(aid)
      const trace = (run.trace ?? []) as Array<{ step?: string }>
      const lastStep = trace.length > 0 ? trace[trace.length - 1]?.step : undefined
      if (lastStep && !latestTraceStepByAgent.has(aid)) latestTraceStepByAgent.set(aid, lastStep)
    }

    // Pending sign-off count per Agent (drives the review status + "now" line).
    const pendingByAgent = new Map<string, number>()
    for (const p of pendingProposals) {
      const aid = String(p.agentId)
      pendingByAgent.set(aid, (pendingByAgent.get(aid) ?? 0) + 1)
    }

    // Most-recent terminal run per Agent → did its last run fail? `recentRuns` is
    // newest-first, so the first terminal run seen per Agent is the latest one.
    const lastRunFailedByAgent = new Map<string, boolean>()
    for (const run of recentRuns) {
      const aid = String(run.agentId)
      if (run.status === 'running' || lastRunFailedByAgent.has(aid)) continue
      lastRunFailedByAgent.set(aid, FAILED_RUN_STATUSES.has(run.status))
    }

    // ── Roster cards ──
    const roster: RosterCard[] = agentDocs.map((a) => {
      const aid = String(a._id)
      const awaitingSignOff = (pendingByAgent.get(aid) ?? 0) > 0
      // Status via the shared pure classifier so the dashboard, the strip, and the
      // Agent card all agree (keeps accent==='review' aligned with accent.ts).
      const status = deriveAgentStatus({
        hasActiveRun: runningAgentIds.has(aid),
        awaitingSignOff,
        lifecycle: a.lifecycle,
        budgetPaused: a.budgetPaused,
        lastRunFailed: lastRunFailedByAgent.get(aid) ?? false,
      })
      // "now" line from REAL signals; empty string when nothing is in flight.
      const now = deriveNowLine({
        status,
        latestTraceStep: latestTraceStepByAgent.get(aid) ?? null,
        pendingCount: pendingByAgent.get(aid) ?? 0,
      })
      return {
        id: aid,
        name: a.name,
        role: a.role,
        customRoleDescription: a.customRoleDescription ?? null,
        status,
        trustScore: a.trustScore,
        trustBand: band(a.trustScore),
        skillIds: a.assignedSkillIds ?? [],
        now,
      }
    })

    // ── Aegis Queue (pending only) ──
    // Reuse the shared view-model so the queue anatomy (what · why · ≥1 citation for
    // factual · exactly three actions) matches the Inbox and Work Board (Req 3.2/3.3).
    const queue = pendingQueue(pendingProposals as unknown as ProposalView[])

    // ── Activity_Feed slice ──
    const activity = buildActivityFeed({
      logs: recentAgentLogs as unknown as LogFeedRow[],
      proposals: recentProposals as unknown as ProposalFeedRow[],
      runs: recentRuns as unknown as RunFeedRow[],
      limit: FEED_LIMIT,
    })

    const payload: DashboardPayload = { tally, roster, queue, activity }
    return NextResponse.json(payload)
  } catch (err) {
    agentLog.error('[agents/dashboard] failed to build dashboard payload', err)
    return NextResponse.json({ error: 'Could not load your squad' }, { status: 500 })
  }
}
