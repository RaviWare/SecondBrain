// ── /api/missions — Clerk-authed Mission collection routes ────────────────────
// List the signed-in user's Missions and create new ones. Uses the SAME Clerk auth
// pattern as the other in-app `/api/*` control-plane routes (e.g. `/api/agents`):
//   const { userId } = await auth(); if (!userId) → 401; then connectDB().
//
// These are the Mission_Orchestrator control-plane routes. A Mission is created in
// the `planning` lifecycle state ONLY — creation never starts a Run (the Task_Graph
// is decomposed + approved later, through the plan route). Every Mission is scoped to
// its owning user so a Mission is visible only to its creator (Req 1.7, 12.5).
//
// The Lead_Agent is either supplied by the caller (`leadAgentId`) or AUTO-SELECTED by
// role fit via the pure `selectLeadAgent` core, which the route runs INDEPENDENTLY of
// the other creation validations (Req 1.8). When no eligible Lead_Agent exists, the
// Mission is rejected and NO record is created (Req 1.5).
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Agent, Mission } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { selectLeadAgent, type SquadAgentRef } from '@/lib/agents/mission/planner'

/**
 * Sensible default safety limits for a freshly-created Mission. The Graph_Limit
 * (depth + task count) and Concurrency_Limit are given conservative non-zero
 * bounds so an autonomous plan is bounded out of the box; the spend/time ceilings
 * default to `0` (= unlimited, the same convention the model + `limits.ts` use),
 * leaving the existing three-level `canStartRun` guard to bound spend until the
 * user sets a Mission_Budget. A caller may override any of these in the body.
 */
interface MissionLimits {
  maxGraphDepth: number
  maxTaskCount: number
  concurrencyLimit: number
  tokenCeiling: number
  costCeiling: number
  wallClockLimitMs: number
}

const DEFAULT_LIMITS: MissionLimits = {
  maxGraphDepth: 5,
  maxTaskCount: 20,
  concurrencyLimit: 3,
  tokenCeiling: 0,
  costCeiling: 0,
  wallClockLimitMs: 0,
}

/** A minimal, lean Agent shape — only the fields the squad mapping reads. */
interface LeanAgent {
  _id: unknown
  role?: string
  customRoleDescription?: string | null
  lifecycle?: string
}

/**
 * Map a user's Agent to the minimal `{ agentId, role }` view the planner cores read
 * (`selectLeadAgent` / `assignByRole`). A `custom` Agent's meaningful role lives in
 * its free-text `customRoleDescription`, so that is used as the role when present;
 * every other Agent uses its role enum verbatim. id + role ONLY — no trust scope, no
 * tokens, no secrets ever leave the model here.
 */
function toSquadRef(agent: LeanAgent): SquadAgentRef {
  const custom =
    agent.role === 'custom' &&
    typeof agent.customRoleDescription === 'string' &&
    agent.customRoleDescription.trim().length > 0
      ? agent.customRoleDescription
      : agent.role
  return { agentId: String(agent._id), role: typeof custom === 'string' ? custom : '' }
}

/** Coerce a non-negative finite number from an unknown body value, else `fallback`. */
function nonNegNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Merge a caller-supplied `limits` payload over the sensible defaults, defensively. */
function coerceLimits(input: unknown): MissionLimits {
  const s = (input ?? {}) as Record<string, unknown>
  return {
    maxGraphDepth: nonNegNumber(s.maxGraphDepth, DEFAULT_LIMITS.maxGraphDepth),
    maxTaskCount: nonNegNumber(s.maxTaskCount, DEFAULT_LIMITS.maxTaskCount),
    concurrencyLimit: nonNegNumber(s.concurrencyLimit, DEFAULT_LIMITS.concurrencyLimit),
    tokenCeiling: nonNegNumber(s.tokenCeiling, DEFAULT_LIMITS.tokenCeiling),
    costCeiling: nonNegNumber(s.costCeiling, DEFAULT_LIMITS.costCeiling),
    wallClockLimitMs: nonNegNumber(s.wallClockLimitMs, DEFAULT_LIMITS.wallClockLimitMs),
  }
}

/** GET /api/missions — list the signed-in user's Missions, newest-first (Req 1.7, 12.5). */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await connectDB()
    // Owner-only: scope the query to the signed-in user so a Mission is visible only
    // to its creator (Req 1.7, 12.5). Newest-created first.
    const missions = await Mission.find({ userId }).sort({ createdAt: -1 }).lean()
    return NextResponse.json({ missions })
  } catch (err) {
    agentLog.error('[missions] list failed', err)
    return NextResponse.json({ error: 'Could not load your missions' }, { status: 500 })
  }
}

/**
 * POST /api/missions — create a Mission from a JSON body.
 * Body: { objective, context?, leadAgentId?, limits? }.
 *
 * Behavior (Req 1.1–1.8, 9.2):
 *   • The Objective is REQUIRED — an empty/whitespace objective is rejected with a
 *     validation message and NO Mission record is created (Req 1.6).
 *   • The Lead_Agent is the caller's `leadAgentId` when it is a valid, non-retired
 *     Agent owned by the user (Req 1.3); otherwise it is AUTO-SELECTED from the user's
 *     eligible Squad via the pure `selectLeadAgent` (`leadAutoSelected = true`, Req 1.4).
 *     Auto-selection is computed INDEPENDENTLY of the Objective + eligibility
 *     validations (Req 1.8).
 *   • If no eligible Lead_Agent exists (no valid `leadAgentId` AND `selectLeadAgent`
 *     returns null), the Mission is rejected, NO record is created, and the response
 *     states that an eligible Lead_Agent is required (Req 1.5).
 *   • On success a `planning` Mission is persisted with objective / context / lead /
 *     owner + an initialized `limits` block, and returned 201 (Req 1.1, 1.2, 1.7, 9.2).
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    await connectDB()

    // Load the user's eligible Squad (every non-retired Agent they own) and map to the
    // minimal id+role view the planner cores read. Retired Agents are excluded — they
    // are retained-but-halted and can neither lead nor be assigned work.
    const agents = (await Agent.find({ userId }).lean()) as unknown as LeanAgent[]
    const eligibleAgents = agents.filter((a) => a.lifecycle !== 'retire')
    const squad: SquadAgentRef[] = eligibleAgents.map(toSquadRef)

    // Lead_Agent AUTO-SELECTION — run the pure core INDEPENDENTLY of the Objective and
    // Lead-eligibility validations (Req 1.8). Computing it here, before any rejection,
    // means auto-selection proceeds on its own regardless of the other checks.
    const autoLead = selectLeadAgent(squad)

    // ── Objective validation (Req 1.6) ──────────────────────────────────────────────
    // Reject an empty/whitespace Objective with a validation message and create NO
    // Mission record.
    const objective = typeof body.objective === 'string' ? body.objective.trim() : ''
    if (objective.length === 0) {
      return NextResponse.json({ error: 'An objective is required' }, { status: 400 })
    }

    // ── Lead_Agent determination (Req 1.3, 1.4, 1.5) ─────────────────────────────────
    // A caller-supplied `leadAgentId` wins WHEN it is a valid, non-retired Agent owned
    // by the user; otherwise fall back to the independently-computed auto-selection.
    const suppliedLeadId = typeof body.leadAgentId === 'string' ? body.leadAgentId.trim() : ''
    const eligibleIds = new Set(squad.map((s) => s.agentId))
    const validSuppliedLead = suppliedLeadId.length > 0 && eligibleIds.has(suppliedLeadId)

    let leadAgentId: string
    let leadAutoSelected: boolean
    if (validSuppliedLead) {
      leadAgentId = suppliedLeadId
      leadAutoSelected = false
    } else if (autoLead) {
      leadAgentId = autoLead.agentId
      leadAutoSelected = true
    } else {
      // No valid supplied lead AND no auto-selectable eligible lead → reject, no record.
      return NextResponse.json(
        { error: 'An eligible Lead_Agent is required to create a mission' },
        { status: 400 },
      )
    }

    const context = typeof body.context === 'string' ? body.context.trim() : ''

    // Persist a `planning` Mission (Req 9.2). Creation NEVER starts a Run — the plan is
    // decomposed + approved later. `limits` is initialized from the body or defaults.
    const mission = await Mission.create({
      userId,
      objective,
      context,
      leadAgentId,
      leadAutoSelected,
      lifecycle: 'planning',
      limits: coerceLimits(body.limits),
    })

    return NextResponse.json({ mission }, { status: 201 })
  } catch (err) {
    agentLog.error('[missions] create failed', err)
    return NextResponse.json({ error: 'Could not create the mission' }, { status: 500 })
  }
}
