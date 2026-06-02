// ── /api/agents/[id]/spawn-sub-agent — spawn a bounded Sub_Agent ──────────────
// Clerk-authed, scoped to the signed-in user. Same auth pattern as the sibling
// `/api/agents/[id]/run` route. This is a NEW route (no collision with existing
// `/api/agents/*`, `/api/agent/*`, or `/api/agent-instance/*` handlers).
//
// What it does (task 5.5, Req 8.9–8.11):
//   1. Load the PARENT Agent (scoped to the user).
//   2. Compute the BOUNDED Sub_Agent config via `resolveSubAgentScope` — the
//      scope is ⊆ the parent's Trust_Scope on every axis (Property 8). The
//      requested scope is clamped down; it is never widened.
//   3. Persist the Sub_Agent as a NEW `Agent` doc carrying `parentAgentId` + the
//      bounded `trustScope` + the regenerated Trust_Scope_Statement, in lifecycle
//      `dry-run` and starting trust ≤ the parent's.
//   4. Run it through `spawnSubAgent` — the SAME write-free runner + read-only
//      tools the parent uses. Its emitted proposals are persisted `pending` and
//      resolve through the SAME `applyProposal` gate (POST /api/proposals/[id]).
//      There is NO alternate write path (Property 1, Req 8.11).
//
// Never logs the scoped brain token or any BYO key (AGENTS.md, Req 11.4).
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Agent } from '@/lib/models'
import {
  resolveSubAgentScope,
  spawnSubAgent,
  defaultSpawnDeps,
  type ParentAgentLike,
} from '@/lib/agents/sub-agent'
import type { TrustScope } from '@/lib/agents/scope'
import { agentLog } from '@/lib/agents/redact'

/** Coerce a possibly-partial trustScope payload into the structural `TrustScope`. */
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

/**
 * POST /api/agents/[id]/spawn-sub-agent — spawn a bounded Sub_Agent under [id].
 * Body (all optional):
 *   { requestedScope?, parentRunId?, parentProposalId?, objective?,
 *     ingestInputs?, skillIds? }
 * When `requestedScope` is omitted the Sub_Agent inherits the parent's full
 * scope (which `resolveSubScope` returns unchanged — still ⊆ parent).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    // Empty/invalid body → inherit the parent's scope, no sub-task inputs.
  }

  await connectDB()
  const { id } = await params
  let parentDoc
  try {
    parentDoc = await Agent.findOne({ _id: id, userId })
  } catch (err) {
    agentLog.error('[agents/spawn-sub-agent] failed to load parent agent', err)
    return NextResponse.json({ error: 'Could not load the parent agent' }, { status: 500 })
  }
  if (!parentDoc) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const parent: ParentAgentLike = {
    _id: parentDoc._id,
    userId: parentDoc.userId,
    name: parentDoc.name,
    role: parentDoc.role,
    customRoleDescription: parentDoc.customRoleDescription,
    trustScope: asTrustScope(parentDoc.trustScope),
    signOffPolicy: parentDoc.signOffPolicy,
    trustScore: parentDoc.trustScore,
  }

  // When no scope is requested, inherit the parent's (clamped to itself = itself).
  const requestedScope: TrustScope =
    body.requestedScope && typeof body.requestedScope === 'object'
      ? asTrustScope(body.requestedScope)
      : parent.trustScope

  // 1. Compute the BOUNDED config (scope ⊆ parent — Property 8). Pure.
  const config = resolveSubAgentScope(parent, requestedScope)

  // 2. Persist the Sub_Agent as a NEW Agent doc carrying the parent linkage +
  //    the BOUNDED scope. lifecycle 'dry-run' (it has not deployed on its own);
  //    trust never above the parent's (config.trustScore is already clamped).
  let subAgent
  try {
    subAgent = await Agent.create({
      userId: config.userId,
      name: config.name,
      role: config.role,
      customRoleDescription: config.customRoleDescription,
      trustScope: {
        readableSourceIds: config.trustScope.readableSourceIds as never,
        readableCollections: config.trustScope.readableCollections,
        webAccess: config.trustScope.webAccess,
        perRunTokenBudget: config.trustScope.perRunTokenBudget,
      },
      trustScopeStatement: config.trustScopeStatement,
      signOffPolicy: config.signOffPolicy as never,
      trustScore: config.trustScore,
      lifecycle: 'dry-run',
      parentAgentId: parent._id as never,
    })
  } catch (err) {
    agentLog.error('[agents/spawn-sub-agent] failed to create sub-agent', err)
    return NextResponse.json({ error: 'Failed to create sub-agent' }, { status: 500 })
  }

  // 3. Run the Sub_Agent through the SAME write-free runner + Aegis gate. Its
  //    proposals land as `pending`; approval flows through applyProposal only.
  try {
    const result = await spawnSubAgent(
      {
        parent,
        requestedScope,
        subAgentId: subAgent._id,
        parentRunId: typeof body.parentRunId === 'string' ? body.parentRunId : undefined,
        parentProposalId:
          typeof body.parentProposalId === 'string' ? body.parentProposalId : undefined,
        objective: typeof body.objective === 'string' ? body.objective : undefined,
        ingestInputs: Array.isArray(body.ingestInputs) ? body.ingestInputs : [],
        skillIds: Array.isArray(body.skillIds)
          ? (body.skillIds as unknown[]).filter((x): x is string => typeof x === 'string')
          : [],
      },
      defaultSpawnDeps(),
    )

    return NextResponse.json(
      {
        subAgentId: subAgent._id,
        parentAgentId: parent._id,
        runId: result.runId,
        proposalIds: result.proposalIds,
        // Echo the bounded scope so the client can render the "cannot" list.
        trustScope: result.config.trustScope,
        trustScopeStatement: result.config.trustScopeStatement,
        outcome: result.output.outcome,
      },
      { status: 201 },
    )
  } catch (err) {
    agentLog.error('[agents/spawn-sub-agent] sub-agent run failed', err)
    return NextResponse.json({ error: 'Sub-agent run failed' }, { status: 500 })
  }
}
