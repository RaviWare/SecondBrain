// ── /api/missions/[id]/control — the Kill_Switch (pause · resume · abort) ─────
// Clerk-authed, scoped to the signed-in user. Same auth pattern as `/api/agents`
// and `/api/proposals/[id]`:
//   const { userId } = await auth(); if (!userId) → 401; then connectDB();
//   then a USER-SCOPED lookup so a Mission the caller does not own reads as 404.
//
// This route is the user-facing Kill_Switch (Req 5.10). It drives the Mission
// lifecycle FSM and NOTHING else — lifecycle only moves through a gated `action`
// event run through the pure `transition()` (`src/lib/agents/mission/lifecycle.ts`),
// never a raw target state, so the FSM's invariants always hold:
//
//   POST { action: 'pause'  }  running        → paused   (Req 5.11, 9.5)
//   POST { action: 'resume' }  paused         → running  (Req 9.6)
//   POST { action: 'abort'  }  running|paused → aborted  (Req 5.12, 9.9) + set finishedAt
//
// WHY THE ROUTE NEED NOT KILL IN-FLIGHT RUNS (Req 5.13): `paused` and `aborted`
// are both NON-running states, and the pure executor cores key entirely off the
// lifecycle state — `missionGate()` / `selectReadyTasks()` return "no new runs"
// for any state other than `running`. So the instant this route persists the new
// lifecycle, the next executor tick authorizes ZERO new Mission_Task Runs. Already
// in-flight task Runs are left to finish their own in-progress reporting and carry
// over unfinished work via the existing AgentRun termination behavior — the limit
// stops STARTING new runs, it does not reach around and kill running ones.
//
// The pure `transition` NO-OPS an invalid move (returns the state unchanged), so an
// action that is not valid from the Mission's current state (e.g. pausing a Mission
// that is not running, or aborting one already terminal) changes nothing and is
// reported as a 409 Conflict with a clear message — never a silent success.
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Mission } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { transition, type MissionEvent, type MissionState } from '@/lib/agents/mission/lifecycle'

// The Kill_Switch actions a user may POST. Each maps 1:1 onto the FSM event of the
// same name, so the action IS the lifecycle event — the route never invents a move
// the FSM does not already permit.
const CONTROL_ACTIONS = ['pause', 'resume', 'abort'] as const
type ControlAction = (typeof CONTROL_ACTIONS)[number]

/**
 * POST /api/missions/[id]/control — pause / resume / abort a Mission (Kill_Switch).
 *
 * Body: { action: 'pause' | 'resume' | 'abort' }
 *
 * Loads the caller-owned Mission (404 otherwise), fires the matching lifecycle
 * EVENT through the pure FSM, and persists the resulting state. If the FSM no-ops
 * the move (the action is invalid from the current state) nothing is persisted and
 * a 409 is returned. On `abort` the terminal `finishedAt` instant is stamped.
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
  if (!(CONTROL_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json(
      { error: `Unknown control action "${action}". Expected one of: pause, resume, abort.` },
      { status: 400 },
    )
  }

  await connectDB()
  const { id } = await params

  try {
    // User-scoped lookup: a Mission the caller does not own is indistinguishable
    // from one that does not exist — both read as 404 (owner-only, Req 1.7, 12.5).
    const mission = await Mission.findOne({ _id: id, userId })
    if (!mission) return NextResponse.json({ error: 'Mission not found' }, { status: 404 })

    // The action name is exactly the FSM event name (pause/resume/abort).
    const event = action as ControlAction satisfies MissionEvent
    const current = mission.lifecycle as MissionState
    const next = transition(current, event)

    // The pure FSM leaves the state UNCHANGED for a move that is not permitted from
    // `current` (e.g. pause when not running, resume when not paused, abort when
    // already terminal). Detect that no-op and report it without persisting — the
    // Kill_Switch never silently "succeeds" on an action it could not apply.
    if (next === current) {
      return NextResponse.json(
        { error: `Cannot ${action} a mission in state "${current}".`, lifecycle: current },
        { status: 409 },
      )
    }

    mission.lifecycle = next
    // `abort` is terminal — stamp the finish instant. `pause`/`resume` only toggle
    // between paused⇄running and never finish the Mission, so finishedAt is untouched.
    if (next === 'aborted') mission.finishedAt = new Date()

    await mission.save()

    // Persisting a non-running lifecycle is the whole job: the next executor tick's
    // pure missionGate/selectReadyTasks will authorize NO new Mission_Task Runs while
    // paused/aborted, while any already-running Runs carry over (Req 5.13).
    return NextResponse.json({ mission: mission.toObject() })
  } catch (err) {
    agentLog.error('[missions/[id]/control] action failed', err)
    return NextResponse.json({ error: 'Could not update the mission' }, { status: 500 })
  }
}
