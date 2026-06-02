// ── /api/agents — Clerk-authed Agent collection routes ────────────────────────
// List the signed-in user's configured Agents and create new ones. Uses the SAME
// Clerk auth pattern as the other in-app `/api/*` routes (e.g. `/api/pages`):
//   const { userId } = await auth(); if (!userId) → 401; then connectDB().
//
// These are the multi-agent control-plane routes (plural `agents`). They are
// SEPARATE from the token-authed `/api/agent/*` and `/api/agent-instance/*`
// handlers, which are intentionally left untouched.
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Agent } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { INITIAL_TRUST_SCORE } from '@/lib/agents/trust'
import { renderTrustScopeStatement } from '@/lib/agents/role-defaults'
import type { TrustScope } from '@/lib/agents/scope'

// Roles the Agent model accepts (mirrors the schema enum).
const ROLES = ['scout', 'synthesist', 'connector', 'critic', 'librarian', 'researcher', 'custom'] as const

/** Coerce a possibly-partial trustScope payload into the structural `TrustScope` shape. */
function asTrustScope(scope: unknown): TrustScope {
  const s = (scope ?? {}) as Record<string, unknown>
  return {
    readableSourceIds: Array.isArray(s.readableSourceIds)
      ? (s.readableSourceIds as unknown[]).map((x) => String(x))
      : [],
    readableCollections: Array.isArray(s.readableCollections) ? (s.readableCollections as string[]) : [],
    webAccess: Boolean(s.webAccess),
    perRunTokenBudget: Number(s.perRunTokenBudget) || 0,
  }
}

/** GET /api/agents — list the user's Agents, newest-touched first. */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await connectDB()
    const agents = await Agent.find({ userId }).sort({ updatedAt: -1 }).lean()
    return NextResponse.json({ agents })
  } catch (err) {
    agentLog.error('[agents] list failed', err)
    return NextResponse.json({ error: 'Could not load your agents' }, { status: 500 })
  }
}

/**
 * POST /api/agents — create a new Agent from a JSON body.
 * Body: { name, role, customRoleDescription?, schedule?, signOffPolicy?,
 *         trustScope?, assignedSkillIds? }. All omitted fields fall back to the
 * model defaults (conservative signOffPolicy, Watch/Proving trustScore, manual
 * schedule, etc.). A freshly-created Agent always starts in lifecycle 'describe'.
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

  // Minimal validation: a name and a known role are required.
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const role = typeof body.role === 'string' ? body.role.trim() : ''
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!role || !(ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: 'A valid role is required' }, { status: 400 })
  }

  try {
    await connectDB()

    // Only pass through known, caller-settable fields; everything else uses the
    // schema defaults. lifecycle is pinned to 'describe' for a new Agent, and the
    // initial Trust_Score is pinned into the Watch/Proving band (Req 4.2) — trust
    // is EARNED, never caller-supplied, so a NEW Agent can never start Trusted.
    const doc: Record<string, unknown> = {
      userId,
      name,
      role,
      lifecycle: 'describe',
      trustScore: INITIAL_TRUST_SCORE,
    }
    if (typeof body.customRoleDescription === 'string') doc.customRoleDescription = body.customRoleDescription
    if (body.schedule && typeof body.schedule === 'object') doc.schedule = body.schedule
    if (body.signOffPolicy && typeof body.signOffPolicy === 'object') doc.signOffPolicy = body.signOffPolicy
    if (body.trustScope && typeof body.trustScope === 'object') doc.trustScope = body.trustScope
    if (Array.isArray(body.assignedSkillIds)) doc.assignedSkillIds = body.assignedSkillIds

    // Generate the plain-language Trust_Scope_Statement server-side (Req 1.8) from
    // whatever scope was supplied (or the empty/whole-vault default). Never trust a
    // client-supplied statement — it is always derived from the resolved scope.
    doc.trustScopeStatement = renderTrustScopeStatement(asTrustScope(doc.trustScope))

    const agent = await Agent.create(doc)
    return NextResponse.json({ agent }, { status: 201 })
  } catch (err) {
    agentLog.error('[agents] create failed', err)
    return NextResponse.json({ error: 'Could not create the agent' }, { status: 500 })
  }
}
