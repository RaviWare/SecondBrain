// ── /api/agents/[id] — single Agent get / edit / lifecycle action / retire ────
// Clerk-authed, scoped to the signed-in user. Same auth pattern as `/api/pages`:
//   const { userId } = await auth(); if (!userId) → 401; then connectDB().
//
// PATCH does TWO things, independently or together (task 4.6):
//   1. CONFIG EDIT (Req 7.12) — set the mutable config fields a user may change
//      (name / role / customRoleDescription / schedule / signOffPolicy /
//      trustScope / assignedSkillIds). `trustScopeStatement` is REGENERATED
//      server-side from the resulting scope (Req 1.8), never client-supplied.
//   2. LIFECYCLE ACTION — apply a lifecycle EVENT via the pure FSM
//      `transition()` (`src/lib/agents/lifecycle.ts`). The client sends a
//      lifecycle EVENT name (`{ action: 'deploy' | 'pause' | … }`), NEVER a raw
//      target state. This is what ENFORCES the deploy-after-dry-run gate
//      (Req 7.10 / Property 14): a client can no longer set `lifecycle:'deploy'`
//      directly — deploy is permitted ONLY when `hadSuccessfulDryRun === true`.
//
// `lifecycle` is intentionally NOT in the editable whitelist — the ONLY way to
// move lifecycle is through a gated `action` so the FSM's invariants always hold.
//
// DELETE does NOT hard-delete: per Req 1.10/1.12 an Agent is RETIRED (lifecycle
// routed through `transition(state,'retire')`), retaining its config + history.
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Agent } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import {
  transition,
  LIFECYCLE_EVENTS,
  type LifecycleEvent,
  type LifecycleState,
} from '@/lib/agents/lifecycle'
import { renderTrustScopeStatement } from '@/lib/agents/role-defaults'
import type { TrustScope } from '@/lib/agents/scope'

// Mutable Agent CONFIG fields a PATCH may set (Req 7.12). `lifecycle` is NOT here
// on purpose — lifecycle only moves through the gated `action` path below, so a
// caller can never rewrite ownership (userId), trust, runtime linkage, OR the
// lifecycle state directly (which would bypass the deploy gate, Req 7.10).
const MUTABLE_FIELDS = [
  'name',
  'role',
  'customRoleDescription',
  'schedule',
  'signOffPolicy',
  'trustScope',
  'assignedSkillIds',
  'autoFix',
] as const

/**
 * Hard cap on what a user may set as their auto-fix budget ceiling (defense in
 * depth: even an opted-in agent can never auto-raise its budget past this). Tune
 * via env if needed; defaults to 1,000,000 tokens.
 */
function maxAutoFixCeiling(): number {
  const n = Number(process.env.AUTOFIX_MAX_BUDGET_CEILING)
  return Number.isFinite(n) && n > 0 ? n : 1_000_000
}

/**
 * Coerce + clamp a client-supplied autoFix payload into the safe shape. Unknown
 * keys are dropped; `budgetCeiling` is clamped to [0, maxAutoFixCeiling]. This is
 * the server-side guarantee that the no-approval tiers stay bounded.
 */
function asAutoFix(value: unknown): Record<string, unknown> {
  const s = (value ?? {}) as Record<string, unknown>
  const ceiling = Math.max(0, Math.min(Number(s.budgetCeiling) || 0, maxAutoFixCeiling()))
  return {
    enabled: s.enabled === true,
    retryTransient: s.retryTransient !== false,
    autoRaiseBudget: s.autoRaiseBudget === true,
    budgetCeiling: ceiling,
    autoApplyLowStakes: s.autoApplyLowStakes === true,
    proposeScopeChanges: s.proposeScopeChanges === true,
  }
}

/** True iff `value` is a known lifecycle EVENT the FSM accepts. */
function isLifecycleEvent(value: unknown): value is LifecycleEvent {
  return typeof value === 'string' && (LIFECYCLE_EVENTS as readonly string[]).includes(value)
}

/**
 * A `scheduled` (cron) or `reactive` Agent ACTIVATES on deploy — it should end up
 * in `monitor` so the Scheduler's `isRunnable` picks it up on its next tick
 * (Req 7.11). A `manual` Agent has nothing to schedule, so it rests at `deploy`
 * (still runnable on demand, never auto-started).
 */
function scheduleActivates(schedule: unknown): boolean {
  const kind = (schedule as { kind?: string } | null | undefined)?.kind
  return kind === 'scheduled' || kind === 'reactive'
}

/** Coerce a stored trustScope subdoc into the structural `TrustScope` shape. */
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

/** GET /api/agents/[id] — fetch one Agent owned by the user; 404 if absent. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await connectDB()
    const { id } = await params
    const agent = await Agent.findOne({ _id: id, userId }).lean()
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    return NextResponse.json({ agent })
  } catch (err) {
    agentLog.error('[agents/[id]] get failed', err)
    return NextResponse.json({ error: 'Could not load the agent' }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/[id] — edit config fields and/or apply a lifecycle action.
 *
 * Body (all optional, may be combined):
 *   { name?, role?, customRoleDescription?, schedule?, signOffPolicy?,
 *     trustScope?, assignedSkillIds? }   ← config edit (Req 7.12)
 *   { action?: 'preview'|'describe'|'run-dry-run'|'deploy'|'monitor'|'pause'
 *             |'resume'|'retire'|'reactivate' }  ← gated lifecycle transition
 *
 * The deploy gate (Req 7.10): `{ action: 'deploy' }` advances to `deploy` ONLY
 * when the Agent has had a successful Dry_Run; otherwise the state is unchanged
 * and we return 409 with a clear message. A `scheduled`/`reactive` Agent that
 * deploys is then advanced to `monitor` so it activates per its Schedule
 * (Req 7.11).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Reject a raw `lifecycle` write up front — lifecycle only moves through the
  // gated `action` path so the deploy gate (Req 7.10) can never be bypassed.
  if ('lifecycle' in body) {
    return NextResponse.json(
      { error: 'lifecycle cannot be set directly; send an `action` event instead' },
      { status: 400 },
    )
  }

  // If an action is present, it must be a valid lifecycle event.
  const hasAction = 'action' in body && body.action !== undefined
  if (hasAction && !isLifecycleEvent(body.action)) {
    return NextResponse.json({ error: 'Unknown lifecycle action' }, { status: 400 })
  }

  await connectDB()
  const { id } = await params

  try {
    // Load the document so we can read the current lifecycle + hadSuccessfulDryRun
    // (needed for the deploy gate) and mutate it through the FSM.
    const agent = await Agent.findOne({ _id: id, userId })
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    // 1. Apply config-field edits (whitelist only).
    let trustScopeChanged = false
    for (const field of MUTABLE_FIELDS) {
      if (field in body && body[field] !== undefined) {
        // autoFix is clamped server-side (budget ceiling capped, unknown keys
        // dropped) so the no-approval tiers can never exceed safe bounds.
        agent.set(field, field === 'autoFix' ? asAutoFix(body[field]) : body[field])
        // `schedule` is a Mixed path — mark it modified so Mongoose persists a
        // whole-object replacement reliably.
        if (field === 'schedule') agent.markModified('schedule')
        if (field === 'autoFix') agent.markModified('autoFix')
        if (field === 'trustScope') trustScopeChanged = true
      }
    }
    // Regenerate the plain-language Trust_Scope_Statement from the resulting scope
    // (Req 1.8) whenever the scope changed — never trust a client-supplied value.
    if (trustScopeChanged) {
      agent.trustScopeStatement = renderTrustScopeStatement(asTrustScope(agent.trustScope))
    }

    // 2. Apply a gated lifecycle action through the pure FSM (Req 7.10, 7.11).
    if (hasAction) {
      const event = body.action as LifecycleEvent
      const current = agent.lifecycle as LifecycleState
      const ctx = { hadSuccessfulDryRun: agent.hadSuccessfulDryRun === true }
      let next = transition(current, event, ctx)

      // Deploy gate: a `deploy` that did NOT advance means the dry-run gate is unmet
      // (Req 7.10 / Property 14). Reject with a clear message and persist nothing.
      if (event === 'deploy' && next !== 'deploy') {
        return NextResponse.json(
          { error: 'A successful dry run is required before this agent can deploy.' },
          { status: 409 },
        )
      }

      // Schedule activation (Req 7.11): a deployed scheduled/reactive Agent advances
      // to `monitor` so the Scheduler (Phase 8) will pick it up; manual rests at deploy.
      if (event === 'deploy' && next === 'deploy' && scheduleActivates(agent.schedule)) {
        next = transition('deploy', 'monitor', ctx)
      }

      agent.lifecycle = next
    }

    await agent.save()
    return NextResponse.json({ agent: agent.toObject() })
  } catch (err) {
    agentLog.error('[agents/[id]] patch failed', err)
    return NextResponse.json({ error: 'Could not update the agent' }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/[id] — RETIRE the Agent (never a hard delete, Req 1.10/1.12).
 * Routes the state change through the FSM `transition(state, 'retire')` (always
 * lands in `retire`) so config + run history are retained and the Agent can later
 * be reactivated via PATCH `{ action: 'reactivate' }`. Returns { ok: true }.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await connectDB()
    const { id } = await params
    const agent = await Agent.findOne({ _id: id, userId })
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    agent.lifecycle = transition(agent.lifecycle as LifecycleState, 'retire')
    await agent.save()

    return NextResponse.json({ ok: true })
  } catch (err) {
    agentLog.error('[agents/[id]] retire failed', err)
    return NextResponse.json({ error: 'Could not retire the agent' }, { status: 500 })
  }
}
