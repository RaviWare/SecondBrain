// ── /api/agents/cost — Clerk-authed Cost & Budget payload ─────────────────────
// The single read-only data feed the Cost_&_Budget page (task 7.5) consumes.
// Returns, for the signed-in user, everything the cost surface renders:
//   • total     — the grand total of tokens consumed across every Run (Req 10.2)
//   • allowance — plan/Squad allowance vs consumed this period (Req 10.3)
//   • byAgent   — token consumption attributed per Agent, desc (Req 10.2)
//   • bySkill   — token consumption attributed per Skill, desc (Req 10.2)
//   • runs      — recent live Run_Traces: skills invoked + tokens + per-Run
//                 budget for the per-Run Budget bar (Req 10.1, 10.9, 10.10, 10.11)
//
// SCOPE: a SEPARATE sub-route alongside `/api/agents/dashboard` and
// `/api/agents/board`. The Agent-collection routes (`/api/agents` list/create,
// `/api/agents/[id]/*`) and the token-authed `/api/agent/*` + `/api/agent-instance/*`
// handlers are left untouched.
//
// NO DUMMY DATA (Property 18 / Req 10.2): every number is derived from real
// AgentRun + Agent rows scoped to `userId`. Honest zeros / empty arrays when there
// is nothing. ALL counting is delegated to the pure `getTokenAttribution` (which
// itself delegates to `attributeTokens` / `allowanceVsConsumed`) — this route is
// thin glue + name resolution + response shaping only.
//
// Same Clerk auth pattern as the other in-app `/api/*` routes: auth() → 401 →
// connectDB(). Never logs tokens or secrets.
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Agent, AgentRun } from '@/lib/models'
import { getTokenAttribution, UNKNOWN_AGENT } from '@/lib/agents/token-attribution'
import { agentLog } from '@/lib/agents/redact'

// How many recent runs to surface as live Run_Traces in the cost view.
const RUNS_LIMIT = 20

/** A label for a run/usage row's owning Agent, resolved from the Agent map. */
interface AgentRef {
  name: string
  role: string
}

/** Usage attributed to one Agent (Req 10.2). */
interface AgentUsageRow {
  agentId: string
  name: string
  role: string
  tokens: number
}

/** Usage attributed to one Skill (Req 10.2). */
interface SkillUsageRow {
  skillId: string
  tokens: number
}

/** One trace step within a Run_Trace (Req 10.1). */
interface TraceStepView {
  skillId: string | null
  step: string
  tokens: number
}

/** One recent live Run_Trace (Req 10.1, 10.9, 10.10, 10.11). */
interface RunView {
  runId: string
  agentId: string
  agentName: string
  status: string
  startedAt: string | null
  finishedAt: string | null
  tokensUsed: number
  perRunBudget: number
  trace: TraceStepView[]
}

/** Full cost payload returned by GET. */
interface CostPayload {
  total: number
  allowance: { allowance: number; consumed: number; remaining: number }
  byAgent: AgentUsageRow[]
  bySkill: SkillUsageRow[]
  runs: RunView[]
}

/**
 * GET /api/agents/cost — the Cost_&_Budget data feed.
 *
 * Composes the real, user-scoped views:
 *   1. usage + allowance via `getTokenAttribution(userId)` — the conserved
 *      by-Agent / by-Skill breakdown + the plan allowance vs consumed.
 *   2. live Run_Traces from the most recent `AgentRun` rows.
 * Agent ids are resolved to display names/roles from a single Agent map.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await connectDB()

    // One Agent id→{name,role} map for both the breakdown and the run list.
    const [agentDocs, attribution, runDocs] = await Promise.all([
      Agent.find({ userId }, 'name role').lean(),
      getTokenAttribution(userId),
      AgentRun.find({ userId }, 'agentId trace tokensUsed perRunBudget status startedAt finishedAt')
        .sort({ startedAt: -1 })
        .limit(RUNS_LIMIT)
        .lean(),
    ])

    const agentMap = new Map<string, AgentRef>()
    for (const a of agentDocs) {
      agentMap.set(String(a._id), { name: a.name, role: a.role })
    }

    // Resolve an agentId bucket key to a display name/role. The synthetic
    // UNKNOWN_AGENT bucket (malformed rows) is labelled clearly rather than hidden.
    function resolveAgent(agentId: string): AgentRef {
      if (agentId === UNKNOWN_AGENT) return { name: 'Unknown agent', role: 'unknown' }
      return agentMap.get(agentId) ?? { name: 'Unknown agent', role: 'unknown' }
    }

    // ── Usage by Agent (desc) ── resolve names; keep real (possibly synthetic) keys.
    const byAgent: AgentUsageRow[] = Object.entries(attribution.byAgent)
      .map(([agentId, tokens]) => {
        const ref = resolveAgent(agentId)
        return { agentId, name: ref.name, role: ref.role, tokens }
      })
      .sort((a, b) => b.tokens - a.tokens)

    // ── Usage by Skill (desc) ── leave the UNATTRIBUTED_SKILL key as-is; the page
    // labels it ("Framework / unattributed"). Exported here so the contract is shared.
    const bySkill: SkillUsageRow[] = Object.entries(attribution.bySkill)
      .map(([skillId, tokens]) => ({ skillId, tokens }))
      .sort((a, b) => b.tokens - a.tokens)

    // ── Live Run_Traces ── shape each recent run for the per-Run Budget bar + steps.
    const runs: RunView[] = runDocs.map((r) => {
      const agentId = r.agentId != null ? String(r.agentId) : ''
      const ref = agentId ? agentMap.get(agentId) : undefined
      return {
        runId: String(r._id),
        agentId,
        agentName: ref?.name ?? 'Unknown agent',
        status: r.status,
        startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
        finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
        tokensUsed: r.tokensUsed ?? 0,
        perRunBudget: r.perRunBudget ?? 0,
        trace: (r.trace ?? []).map((t) => ({
          skillId: t.skillId ?? null,
          step: t.step,
          tokens: t.tokens ?? 0,
        })),
      }
    })

    const payload: CostPayload = {
      total: attribution.total,
      allowance: attribution.allowance,
      byAgent,
      bySkill,
      runs,
    }
    // Re-export the unattributed bucket key on the wire is unnecessary; the page
    // imports UNATTRIBUTED_SKILL from the lib directly to label the bucket.
    return NextResponse.json(payload)
  } catch (err) {
    // Never leak internals/secrets; a DB blip becomes a clean 500 the client's
    // ErrorView handles (retry), not an unhandled crash. Diagnostics go through
    // the redaction-guarded agent logger.
    agentLog.error('[agents/cost] failed to build cost payload', err)
    return NextResponse.json({ error: 'Could not load cost data' }, { status: 500 })
  }
}
