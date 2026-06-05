// ── /api/missions/[id]/plan — present + approve/edit/reject a Mission_Plan ─────
// Clerk-authed, scoped to the signed-in user throughout (owner-only). A Mission not
// owned by the caller is indistinguishable from a missing one → 404. Same auth pattern
// as `/api/agents` and the other in-app `/api/*` routes:
//   const { userId } = await auth(); if (!userId) → 401; then connectDB().
//
// This is the mandatory Plan_Approval checkpoint (Req 3). It NEVER starts a Mission_Task
// Run itself — approval only flips the lifecycle FSM to `running`; the executor tick
// (a separate route) is what actually runs tasks. The route delegates every state move
// to the pure FSM `transition` (`@/lib/agents/mission/lifecycle`) and every graph check
// to the pure planner cores (`buildTaskGraph` / `assignByRole` / `validateTaskGraph`,
// `@/lib/agents/mission/planner`), so the "no transition to `running` without an explicit
// Plan_Approval" invariant lives in the FSM, not in ad-hoc route logic (Req 3.4, 3.7, 9.4).
//
// GET — present the Mission_Plan: every Mission_Task (key, description, assigned Agent,
//       dependsOn, status) + the mission's lifecycle. Read-only projection (Req 3.2).
//
// POST { action, ... } — drive the checkpoint:
//   'approve'   — from `awaiting-plan-approval` only: set `approvedAt`, fire FSM
//                 `approve` → `running`, anchor `startedAt` (Wall_Clock + Timeline T+0).
//                 Starts NO Run here (Req 3.4, 3.7, 9.4).
//   'edit'      — from `awaiting-plan-approval` only: apply the edited Task_Graph, re-run
//                 `validateTaskGraph`. Cyclic/over-limit → stay `awaiting-plan-approval`
//                 and return the reason (Req 3.5). Valid → persist the new MissionTasks,
//                 stay `awaiting-plan-approval` (awaiting a subsequent approve).
//   'reject'    — from `awaiting-plan-approval` only: fire FSM `reject` → `aborted`,
//                 start NO Run (Req 3.6).
//   'decompose' — OPTIONAL/secondary: from `planning` only, compose decomposeObjective →
//                 buildTaskGraph → assignByRole → validateTaskGraph, persist MissionTasks,
//                 fire `decomposed-ok` / `decomposition-failed` (Req 2.8, 9.3).
//
// All mutating actions are guarded against the current lifecycle. The pure `transition`
// already no-ops an invalid move (returns the state unchanged); we surface that as a 409
// with a clear message rather than silently doing nothing. Never logs the Objective,
// context, or any secret (AGENTS.md).
import { auth } from '@clerk/nextjs/server'
import { isValidObjectId } from 'mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Agent, Mission, MissionTask, type IMission } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { transition, type MissionState } from '@/lib/agents/mission/lifecycle'
import {
  buildTaskGraph,
  assignByRole,
  validateTaskGraph,
  decomposeObjective,
  type GraphLimits,
  type PlannedTask,
  type RawTask,
  type SquadAgentRef,
} from '@/lib/agents/mission/planner'
import { defaultDecomposeLlm } from '@/lib/agents/mission/decompose-llm'

// Actions this checkpoint route accepts. `decompose` is optional/secondary — the core
// checkpoint actions are approve / edit / reject on an already-decomposed plan.
const ACTIONS = ['approve', 'edit', 'reject', 'decompose'] as const
type Action = (typeof ACTIONS)[number]

/**
 * Map a Mission's stored Graph_Limit into the `GraphLimits` the pure validator reads,
 * honoring the mission-layer "`<= 0` / non-finite = UNLIMITED" convention (the same one
 * `limits.ts` uses, and what the model's `0` defaults mean). A configured positive limit
 * is enforced as-is; an unset/`0` limit becomes `Infinity` (unbounded) so an unconfigured
 * mission is never spuriously rejected for "over-limit".
 */
function graphLimitsFor(mission: Pick<IMission, 'limits'>): GraphLimits {
  const depth = Number(mission.limits?.maxGraphDepth)
  const count = Number(mission.limits?.maxTaskCount)
  return {
    maxDepth: Number.isFinite(depth) && depth > 0 ? depth : Infinity,
    maxTasks: Number.isFinite(count) && count > 0 ? count : Infinity,
  }
}

/** Build the Squad view (`agentId` + `role`) from the user's Agents — the only fields
 *  the planner reads. No trust scope, no tokens, no secrets leave the model layer. */
function squadFrom(agents: Array<{ _id: unknown; role?: unknown }>): SquadAgentRef[] {
  return agents.map((a) => ({ agentId: String(a._id), role: typeof a.role === 'string' ? a.role : '' }))
}

/** Project one persisted MissionTask into the read-only Plan view (Req 3.2). The
 *  assigned Agent is enriched with its name/role from the user's own Agents map. */
function projectTask(
  task: {
    key: string
    description: string
    dependsOn: string[]
    status: string
    assignedAgentId: unknown
    assignmentFallback?: boolean
  },
  agentsById: Map<string, { name: string; role: string }>,
) {
  const assignedAgentId = task.assignedAgentId ? String(task.assignedAgentId) : null
  const agent = assignedAgentId ? agentsById.get(assignedAgentId) : undefined
  return {
    key: task.key,
    description: task.description,
    dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn : [],
    status: task.status,
    assignmentFallback: task.assignmentFallback === true,
    assignedAgent: assignedAgentId
      ? { id: assignedAgentId, name: agent?.name ?? null, role: agent?.role ?? null }
      : null,
  }
}

/**
 * Coerce the edited Task_Graph from a POST `edit` body into the planner's inputs.
 * Returns the `RawTask[]` (structure the pure `buildTaskGraph` normalizes) plus a
 * per-key assignment map carrying the user's chosen Agent for each task. Defensive —
 * malformed entries are skipped, never throw.
 */
function parseEditedTasks(value: unknown): {
  raw: RawTask[]
  assignmentByKey: Map<string, { assignedAgentId: string }>
} {
  const raw: RawTask[] = []
  const assignmentByKey = new Map<string, { assignedAgentId: string }>()
  if (!Array.isArray(value)) return { raw, assignmentByKey }

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const key = typeof e.key === 'string' ? e.key.trim() : ''
    if (key.length === 0) continue
    const description = typeof e.description === 'string' ? e.description : ''
    const dependsOn = Array.isArray(e.dependsOn)
      ? e.dependsOn.filter((d): d is string => typeof d === 'string')
      : []
    const roleHint = typeof e.roleHint === 'string' ? e.roleHint : undefined
    raw.push(roleHint ? { key, description, dependsOn, roleHint } : { key, description, dependsOn })

    // First occurrence wins (mirrors buildTaskGraph's dedupe) for the assignment too.
    if (!assignmentByKey.has(key)) {
      const assignedAgentId = typeof e.assignedAgentId === 'string' ? e.assignedAgentId.trim() : ''
      assignmentByKey.set(key, { assignedAgentId })
    }
  }
  return { raw, assignmentByKey }
}

/**
 * Persist a fresh set of MissionTasks for a mission, replacing any existing ones. Safe
 * during the planning / approval checkpoint because no task Run has started yet (every
 * task is `pending`, with no Run/Proposal references to lose). Keeps the partial-unique
 * `{ missionId, key }` index satisfied by clearing first, then inserting the new graph.
 */
async function replaceMissionTasks(
  userId: string,
  missionId: unknown,
  planned: PlannedTask[],
): Promise<void> {
  await MissionTask.deleteMany({ userId, missionId: missionId as never })
  if (planned.length === 0) return
  const now = new Date()
  const docs = planned.map((t) => ({
    userId,
    missionId,
    key: t.key,
    description: t.description,
    assignedAgentId: t.assignedAgentId,
    assignmentFallback: t.assignmentFallback,
    dependsOn: t.dependsOn,
    status: 'pending',
    outputRef: { runId: null, proposalIds: [] },
    handoffInputs: [],
    statusHistory: [{ status: 'pending', at: now }],
    failureReason: null,
  }))
  // Cast the plain-object array to the insertMany input type: `missionId`/`assignedAgentId`
  // are carried as strings/unknowns here while the schema types them as ObjectId — the same
  // `as never` ObjectId-ish casting discipline used for Mongoose writes in sub-agent.ts.
  await MissionTask.insertMany(docs as never)
}

/**
 * GET /api/missions/[id]/plan — present the Mission_Plan for review (Req 3.2).
 * Read-only: returns the mission's lifecycle + every Mission_Task (key, description,
 * assigned Agent, dependsOn, status). User-scoped — a mission the caller does not own
 * is reported as 404.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!isValidObjectId(id)) return NextResponse.json({ error: 'Mission not found' }, { status: 404 })

  try {
    await connectDB()
    const mission = await Mission.findOne({ _id: id, userId }).lean()
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 })

    const [tasks, agents] = await Promise.all([
      MissionTask.find({ userId, missionId: id }).sort({ key: 1 }).lean(),
      Agent.find({ userId }).select('name role').lean(),
    ])

    const agentsById = new Map<string, { name: string; role: string }>()
    for (const a of agents) {
      agentsById.set(String(a._id), {
        name: typeof a.name === 'string' ? a.name : '',
        role: typeof a.role === 'string' ? a.role : '',
      })
    }

    return NextResponse.json({
      plan: {
        missionId: String(mission._id),
        objective: mission.objective,
        lifecycle: mission.lifecycle,
        leadAgentId: mission.leadAgentId ? String(mission.leadAgentId) : null,
        approvedAt: mission.approvedAt,
        startedAt: mission.startedAt,
        tasks: tasks.map((t) => projectTask(t as never, agentsById)),
      },
    })
  } catch (err) {
    agentLog.error('[missions/[id]/plan] get failed', err)
    return NextResponse.json({ error: 'Could not load the mission plan' }, { status: 500 })
  }
}

/**
 * POST /api/missions/[id]/plan — approve · edit · reject (· decompose) the Mission_Plan.
 * Body: { action: 'approve' | 'edit' | 'reject' | 'decompose', tasks?: EditedTask[] }.
 * User-scoped; starts NO Mission_Task Run (approval only flips the FSM to `running`).
 */
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

  const { id } = await params
  if (!isValidObjectId(id)) return NextResponse.json({ error: 'Mission not found' }, { status: 404 })

  try {
    await connectDB()

    // Load the mission (user-scoped). A mission the caller does not own → 404, never a
    // leak that it exists for someone else.
    const mission = await Mission.findOne({ _id: id, userId })
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 })

    const current = mission.lifecycle as MissionState

    switch (action as Action) {
      // ── approve: explicit Plan_Approval → running (Req 3.4, 3.7, 9.4) ────────────
      case 'approve': {
        const next = transition(current, 'approve')
        // The FSM only moves `awaiting-plan-approval → running` on `approve`; any other
        // origin no-ops (next === current). Surface that as a clear 409.
        if (next === current || next !== 'running') {
          return NextResponse.json(
            { error: `Cannot approve a plan from "${current}"; the mission must be awaiting plan approval.` },
            { status: 409 },
          )
        }
        const now = new Date()
        mission.lifecycle = next
        mission.approvedAt = now // explicit Plan_Approval instant (Req 3.4)
        mission.startedAt = now // anchors Wall_Clock + Timeline T+0 on entering `running`
        await mission.save()
        // No Run is started here — the executor tick advances the running mission.
        return NextResponse.json({
          ok: true,
          lifecycle: mission.lifecycle,
          approvedAt: mission.approvedAt,
          startedAt: mission.startedAt,
        })
      }

      // ── reject: → aborted, start no Run (Req 3.6) ────────────────────────────────
      case 'reject': {
        const next = transition(current, 'reject')
        if (next === current || next !== 'aborted') {
          return NextResponse.json(
            { error: `Cannot reject a plan from "${current}"; the mission must be awaiting plan approval.` },
            { status: 409 },
          )
        }
        mission.lifecycle = next
        mission.finishedAt = new Date()
        await mission.save()
        return NextResponse.json({ ok: true, lifecycle: mission.lifecycle })
      }

      // ── edit: apply changes, re-validate, stay awaiting-plan-approval (Req 3.5) ───
      case 'edit': {
        if (current !== 'awaiting-plan-approval') {
          return NextResponse.json(
            { error: `Cannot edit a plan from "${current}"; the mission must be awaiting plan approval.` },
            { status: 409 },
          )
        }

        const { raw, assignmentByKey } = parseEditedTasks(body.tasks)

        // Normalize the edited graph (dedupe keys, drop self/dangling deps) via the pure
        // builder, then resolve each task's assigned Agent: honor the user's chosen Agent
        // when it is one of THEIR own Agents (user-scoped), else fall back to the Lead.
        const normalized = buildTaskGraph(raw).tasks
        const ownAgentIds = new Set(
          (await Agent.find({ userId }).select('_id').lean()).map((a) => String(a._id)),
        )
        const leadAgentId = mission.leadAgentId ? String(mission.leadAgentId) : ''
        const planned: PlannedTask[] = normalized.map((n) => {
          const chosen = assignmentByKey.get(n.key)?.assignedAgentId ?? ''
          const valid = chosen.length > 0 && ownAgentIds.has(chosen)
          return {
            key: n.key,
            description: n.description,
            dependsOn: n.dependsOn,
            assignedAgentId: valid ? chosen : leadAgentId,
            assignmentFallback: !valid, // assigned to the Lead_Agent as a fallback (Req 2.4)
          }
        })

        // Re-validate that the edited Task_Graph remains acyclic and within the
        // Graph_Limit. A cyclic / over-limit edit is REJECTED: the mission stays in
        // `awaiting-plan-approval` (we persist nothing) and we return the reason (Req 3.5).
        const validation = validateTaskGraph({ tasks: planned }, graphLimitsFor(mission))
        if (!validation.ok) {
          return NextResponse.json(
            {
              ok: false,
              lifecycle: mission.lifecycle, // unchanged — still awaiting-plan-approval
              reason: validation.reason,
              ...(validation.reason === 'graph-limit-depth' ? { depth: validation.depth } : {}),
              ...(validation.reason === 'graph-limit-count' ? { taskCount: validation.taskCount } : {}),
              error: `The edited plan is invalid: ${validation.reason}.`,
            },
            { status: 422 },
          )
        }

        // Valid edit: persist the updated MissionTasks and stay in awaiting-plan-approval
        // (a subsequent `approve` is still required before any Run starts).
        await replaceMissionTasks(userId, mission._id, planned)
        return NextResponse.json({
          ok: true,
          lifecycle: mission.lifecycle,
          depth: validation.depth,
          taskCount: validation.taskCount,
          tasks: planned.map((t) => ({
            key: t.key,
            description: t.description,
            dependsOn: t.dependsOn,
            assignedAgentId: t.assignedAgentId,
            assignmentFallback: t.assignmentFallback,
            status: 'pending',
          })),
        })
      }

      // ── decompose (optional/secondary): planning → awaiting-plan-approval | failed ─
      case 'decompose': {
        if (current !== 'planning') {
          return NextResponse.json(
            { error: `Cannot decompose from "${current}"; the mission must be in planning.` },
            { status: 409 },
          )
        }

        const agents = await Agent.find({ userId }).select('_id role').lean()
        const squad = squadFrom(agents)
        const leadAgentId = mission.leadAgentId ? String(mission.leadAgentId) : ''

        // Compose the pipeline: the ONE injected model call, then the pure cores. The LLM
        // is injected (never an inline SDK import) so the route stays testable and the
        // planner stays pure. The Objective/context flow INTO the prompt, never to a log.
        const rawTasks = await decomposeObjective(
          { objective: mission.objective, context: mission.context, squad, leadAgentId },
          { llm: defaultDecomposeLlm },
        )
        const normalized = buildTaskGraph(rawTasks).tasks
        const planned = assignByRole(normalized, squad, leadAgentId)
        const validation = validateTaskGraph({ tasks: planned }, graphLimitsFor(mission))

        if (!validation.ok) {
          // Cyclic / over-limit (or empty decomposition) → record the reason and fail the
          // mission via the FSM (Req 2.7, 5.2, 9.8). No task is ever persisted/run.
          mission.lifecycle = transition(current, 'decomposition-failed')
          mission.failureReason = validation.reason
          mission.finishedAt = new Date()
          await mission.save()
          return NextResponse.json(
            { ok: false, lifecycle: mission.lifecycle, reason: validation.reason },
            { status: 422 },
          )
        }

        // Acyclic + within Graph_Limit → persist the Task_Graph and move to
        // awaiting-plan-approval (Req 2.8, 9.3). Still NO Run starts — the user must
        // approve the plan first.
        await replaceMissionTasks(userId, mission._id, planned)
        mission.lifecycle = transition(current, 'decomposed-ok')
        mission.failureReason = null
        await mission.save()
        return NextResponse.json({
          ok: true,
          lifecycle: mission.lifecycle,
          depth: validation.depth,
          taskCount: validation.taskCount,
        })
      }
    }
  } catch (err) {
    agentLog.error('[missions/[id]/plan] action failed', err)
    return NextResponse.json({ error: 'Could not update the mission plan' }, { status: 500 })
  }
}
