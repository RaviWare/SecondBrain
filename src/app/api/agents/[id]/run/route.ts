// ── /api/agents/[id]/run — trigger a manual or dry-run for an Agent ───────────
// Clerk-authed, scoped to the signed-in user. Same auth pattern as `/api/pages`.
//
// This route is a THIN HTTP wrapper over `runAgentOnce` (`@/lib/agents/run-agent`),
// the single shared "execute one Run for an Agent" path that the protected
// scheduler tick route (`/api/agents/scheduler/tick`) and the opportunistic
// post-run reactive chaining below ALSO funnel through — so manual, dry-run,
// scheduled, and reactive Runs all execute through one audited code path.
//
//   1. Clerk auth + load the Agent (scoped to the user).
//   2. `runAgentOnce(agent, { kind: 'manual' | 'dry-run' })` — does the budget
//      gate, AgentRun creation, propose-only execution, proposal persistence,
//      budget/trust bookkeeping, and (for dry-runs) deploy-eligibility.
//   3. Map the structured result to the SAME HTTP responses this route has always
//      returned (402 budget block, 500 on failure, 200 with run/proposalIds, and
//      the dry-run summary shape).
//   4. POST-RUN REACTIVE CHAINING (Req 1.6, 7.11): after a NON-dry Run reaches its
//      terminal state, opportunistically drive the pure Scheduler `tick()` with an
//      `agent.run.completed` event and enqueue a reactive Run for each matched
//      Agent. Best-effort, ONE level deep, and never alters this Run's HTTP result.
//
// Never logs the scoped brain token or any BYO key (AGENTS.md, Req 11.4).
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Agent } from '@/lib/models'
import type { IAgent } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { runAgentOnce } from '@/lib/agents/run-agent'
import { tick, type SchedulableAgent } from '@/lib/agents/scheduler'

/**
 * POST /api/agents/[id]/run — run the Agent once (manual or dry-run).
 * Body: { dryRun?: boolean }.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Body is optional; default to a non-dry manual run.
  let dryRun = false
  try {
    const body = await req.json()
    dryRun = Boolean(body?.dryRun)
  } catch {
    // No/invalid body → manual run with dryRun=false.
  }

  await connectDB()
  const { id } = await params
  const agent = await Agent.findOne({ _id: id, userId })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  // Execute the Run through the shared spine. `runAgentOnce` never throws — it
  // returns a structured result we map to this route's established responses.
  const result = await runAgentOnce(agent, dryRun ? { kind: 'dry-run' } : { kind: 'manual' })

  if (result.status === 'blocked') {
    // Budget pre-flight refused the Run (Req 10.6–10.8): nothing was created.
    return NextResponse.json(
      { error: 'Run blocked by budget', reason: result.reason },
      { status: 402 },
    )
  }

  if (result.status === 'error') {
    return NextResponse.json({ error: result.message }, { status: 500 })
  }

  // ── Post-run reactive chaining (Req 1.6, 7.11) — NON-dry runs only ──────────
  // A dry-run must never chain real work, so chaining is skipped for it. This is
  // strictly opportunistic and BEST-EFFORT: any failure is logged (secrets
  // scrubbed) and swallowed so it can NEVER change this Run's HTTP result.
  if (!dryRun) {
    await chainReactiveRuns(userId, agent, result.runStatus)
  }

  if (result.dryRun) {
    return NextResponse.json({
      run: result.run,
      proposalIds: result.proposalIds,
      deployEligible: result.deployEligible,
      summary: result.summary,
    })
  }

  return NextResponse.json({ run: result.run, proposalIds: result.proposalIds })
}

/**
 * Opportunistic reactive chaining after a Run completes (Req 1.6, 7.11).
 *
 * Builds an `agent.run.completed` domain event for the just-finished Agent, asks
 * the PURE Scheduler `tick()` which of the user's reactive Agents match, and
 * enqueues a reactive Run for each via the SAME `runAgentOnce` path. The
 * Scheduler's `matchReactiveAgents` already (a) excludes halted/budget-paused
 * Agents, (b) only chains once the source Run is TERMINAL, and (c) prevents an
 * Agent self-triggering off its own completion.
 *
 * ONE-LEVEL-DEEP GUARD (no unbounded recursion): we drive chaining HERE, in the
 * route layer, exactly once per request — `runAgentOnce` itself never chains. So
 * a chained reactive Run does NOT recursively chain again inside THIS request. A
 * chained Run still emits its own `agent.run.completed`, so deeper reactive
 * chains happen naturally on that Run's OWN subsequent completion (its own
 * request) or on the next cron tick — never as an in-request recursion.
 *
 * BEST-EFFORT: wrapped in try/catch; a chaining failure is logged and swallowed
 * and never changes the original Run's HTTP result.
 */
async function chainReactiveRuns(
  userId: string,
  sourceAgent: IAgent,
  runStatus: string,
): Promise<void> {
  try {
    // The Run is terminal at this point (runAgentOnce only returns 'ok' on a
    // finished Run): `running` should never appear here, but compute defensively.
    const event = {
      type: 'agent.run.completed' as const,
      sourceAgentId: String(sourceAgent._id),
      runTerminal: runStatus !== 'running',
    }

    // Reactive candidate Agents for THIS user (system-wide ticks live in the cron
    // route). Exclude paused/retired + budget-paused up front; the pure matcher
    // re-checks runnability too.
    const rows = await Agent.find(
      { userId, lifecycle: { $nin: ['pause', 'retire'] }, budgetPaused: { $ne: true } },
      '_id schedule lifecycle budgetPaused',
    ).lean()

    const candidates: SchedulableAgent[] = rows.map((r) => ({
      id: String(r._id),
      lifecycle: r.lifecycle,
      budgetPaused: r.budgetPaused === true,
      schedule: r.schedule,
    }))

    const { reactiveMatched } = tick({ agents: candidates, now: new Date(), event })
    if (reactiveMatched.length === 0) return

    // Enqueue ONE reactive Run per matched Agent. Each goes through the SAME
    // propose-never-write path; a per-agent failure is isolated so one bad Agent
    // never aborts the rest of the chain.
    for (const matched of reactiveMatched) {
      try {
        const reactiveAgent = await Agent.findOne({ _id: matched.id, userId })
        if (!reactiveAgent) continue
        await runAgentOnce(reactiveAgent, {
          kind: 'reactive',
          event: event.type,
          sourceAgentId: event.sourceAgentId,
        })
      } catch (oneErr) {
        agentLog.error('[agents/run] reactive chain: agent run failed', oneErr)
      }
    }
  } catch (chainErr) {
    // Chaining is purely opportunistic — a failure here must never affect the
    // original Run's result. Log (secrets scrubbed) and move on.
    agentLog.error('[agents/run] reactive chaining failed', chainErr)
  }
}
