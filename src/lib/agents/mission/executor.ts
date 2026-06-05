// ── Mission Executor: pure decision core (task readiness + ready-task selection) ──
// The decision half of the Mission Executor. It answers two PURE questions with no
// I/O whatsoever: "given the current task graph, which not-yet-started tasks are
// READY / BLOCKED / WAITING?" (`classifyTask`) and "which tasks should we START right
// now?" (`selectReadyTasks`). See design.md → "Components and Interfaces · 3. Mission
// Executor" and Requirements 3.1, 4.1, 4.5, 4.6, 5.3, 5.4, 6.6, 9.11.
//
// WHY THIS FILE IS PURE: exactly like `scheduler.ts`, `budget.ts`, `lifecycle.ts`, and
// the sibling mission cores (`mission/lifecycle.ts`, `mission/limits.ts`,
// `mission/planner.ts`), this is a unit/property-testable decision core. It imports NO
// Mongoose model and performs NO I/O — no `connectDB`, no model reads, no clock, no
// `runAgentOnce`. Every input arrives as a plain value, so the property tests (tasks
// 1.13/1.14, Properties 1 & 5) can drive these functions directly with `fast-check`.
//
// ┌── CLEAN ROOM (intentionally NOT in this task) ────────────────────────────────┐
// │ The async orchestration `runMissionTick(missionId)` — which loads the Mission +  │
// │ its MissionTasks, re-derives usage, evaluates `missionGate`, calls the single    │
// │ audited Run path `runAgentOnce`, records Handoffs, and fires the lifecycle FSM —  │
// │ is **task 3.2**. It is the I/O layer that DELEGATES every decision to the pure    │
// │ cores in this file (`selectReadyTasks` + `classifyTask`) and to `missionGate` /   │
// │ `transition`. This task implements ONLY the pure decision core + its types.       │
// └───────────────────────────────────────────────────────────────────────────────┘
//
// The single source of truth for "may this mission start NEW Runs at all?" is
// `isExecutable` from the lifecycle FSM (reused verbatim, NOT re-derived here), so the
// "no Run before Plan_Approval, none while paused/terminal" rule (Req 3.1, 9.11) stays
// identical to the FSM's definition. The Mission_Budget / Wall_Clock ceiling decision
// is owned by `mission/limits.ts`; this core consumes its `MissionCeilingResult` rather
// than recomputing it, so a reached ceiling stops new Runs (Req 5.6, 5.9).

import type { MissionState } from './lifecycle'
import { isExecutable, transition } from './lifecycle'
import type { MissionCeilingResult, MissionCeilingReason, MissionBudget, MissionTiming } from './limits'
import { missionGate, missionCeilingReached } from './limits'

// ── I/O-layer imports (used ONLY by `runMissionTick`, the async executor driver) ──
// The PURE cores above (`classifyTask` + `selectReadyTasks`) import NONE of these. The
// async `runMissionTick` appended at the bottom is the orchestration layer (design.md
// §3): it DOES connect the DB, read the real `Mission` / `MissionTask` / `AgentRun`
// records, and call the single audited Run path `runAgentOnce` — it simply DELEGATES
// every DECISION back to the pure cores in this file plus `missionGate` /
// `missionCeilingReached` / `transition` / `handoffsForCompletion`. It adds NO new write
// path: every deliverable still flows through `runAgentOnce` → pending `Proposal` →
// `applyProposal` (Req 4.8, 12.4). Never logs a brain token / BYO key (AGENTS.md).
import { type HydratedDocument } from 'mongoose'
import { connectDB } from '@/lib/mongodb'
import { Mission, MissionTask, AgentRun, Agent } from '@/lib/models'
import type { IMission, IMissionTask } from '@/lib/models'
import { runAgentOnce } from '@/lib/agents/run-agent'
import { handoffsForCompletion } from './handoffs'
import { agentLog } from '@/lib/agents/redact'

// ── Task status ──────────────────────────────────────────────────────────────────
// EXACTLY the planned `MissionTask.status` enum from `src/lib/models.ts`. Kept as a
// local union (matching the pattern in `mission/lifecycle.ts`) so this stays a
// dependency-free pure module; it MUST stay in sync with the model's enum verbatim.
// (handoffs.ts / timeline.ts currently keep their own local `TaskStatus` to avoid
// cross-task ordering hazards; reconciliation to one shared type happens in task 3.2.)
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked'

/**
 * The minimal task view the selector reads — a `MissionTask` document projected to the
 * fields the pure decision needs, or a hand-built fixture in a property test. `key` is
 * the stable within-graph identifier; `status` is the task's current lifecycle status;
 * `dependsOn` lists the keys of the tasks whose output this one needs (its
 * Task_Dependencies); `assignedAgentId` is the Agent the planner assigned (carried
 * through so the async tick in task 3.2 can load + run it without a second lookup).
 */
export interface ExecTask {
  key: string
  status: TaskStatus
  dependsOn: string[]
  assignedAgentId: string
}

/**
 * The complete input to {@link selectReadyTasks}. All fields are plain values the async
 * tick (task 3.2) supplies from the real Mission + MissionTask records and the
 * `missionGate` ceiling result, so the decision stays pure and directly testable.
 */
export interface SelectInput {
  /** Every task in the mission's Task_Graph (the selector reads statuses + dependencies). */
  tasks: ExecTask[]
  /** The mission's current lifecycle state — only `running` authorizes new Runs (Req 3.1, 9.11). */
  missionState: MissionState
  /** How many tasks are currently `running` (used for the Concurrency_Limit slot math, Req 5.4). */
  runningCount: number
  /** The Concurrency_Limit: max tasks that may run simultaneously in this mission (Req 5.3). */
  concurrencyLimit: number
  /** The Mission_Budget / Wall_Clock ceiling result from `missionCeilingReached` (Req 5.6, 5.9). */
  ceiling: MissionCeilingResult
}

// ── Numeric helper (keep everything total) ───────────────────────────────────────
// Mirror of `limits.ts`'s private `nonNegFinite`: a count clamped to `>= 0`, with any
// non-finite (NaN / Infinity) or negative input collapsing to 0. Sanitizing the
// concurrency inputs this way is what guarantees the slot math can NEVER go negative
// (Req 5.4) and that a garbage `runningCount` / `concurrencyLimit` can never spuriously
// authorize a Run.
function nonNegFinite(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

// ── classifyTask ─────────────────────────────────────────────────────────────────

/**
 * Re-classify a not-yet-started task purely from its dependencies' current statuses.
 * PURE, TOTAL, DETERMINISTIC — never throws. See design.md §3 and Req 4.1, 4.6.
 *
 * Returns, in this FIXED precedence:
 *   • `'blocked'` — when ANY dependency is `failed` or `blocked`. A failed/blocked
 *     prerequisite can never produce the output this task needs, so the failure
 *     propagates downstream and this task must not run (Req 4.6). This is checked FIRST
 *     so a single poisoned dependency blocks regardless of the others.
 *   • `'ready'`   — when EVERY dependency is `completed` (vacuously true for a task with
 *     no dependencies), and none was failed/blocked. All inputs are available, so the
 *     task may start (Req 4.1).
 *   • `'waiting'` — otherwise: at least one dependency is still `pending` / `running`
 *     (or is absent from `byKey`, e.g. a not-yet-loaded or dangling key). The task is
 *     not yet runnable but is not poisoned either.
 *
 * A dependency key not present in `byKey` is treated as "not completed" (it cannot be
 * confirmed done) but not as failed/blocked, so it yields `'waiting'` — which is SAFE
 * because `selectReadyTasks` only ever starts a `'ready'` task. Defensive against a
 * non-array `dependsOn`, a non-`Map` `byKey`, and non-string dependency entries (all
 * treated as "unmet") so the function is total.
 */
export function classifyTask(
  task: ExecTask,
  byKey: Map<string, ExecTask>,
): 'ready' | 'blocked' | 'waiting' {
  const deps = task && Array.isArray(task.dependsOn) ? task.dependsOn : []
  const lookup = byKey instanceof Map ? byKey : new Map<string, ExecTask>()

  let allCompleted = true
  for (const depKey of deps) {
    const depStatus = lookup.get(depKey as string)?.status
    // Precedence: a failed/blocked dependency poisons this task immediately (Req 4.6).
    if (depStatus === 'failed' || depStatus === 'blocked') {
      return 'blocked'
    }
    // Any non-`completed` dependency (pending / running / missing) leaves us waiting.
    if (depStatus !== 'completed') {
      allCompleted = false
    }
  }

  // All dependencies completed (or none exist) ⇒ ready (Req 4.1); else still waiting.
  return allCompleted ? 'ready' : 'waiting'
}

// ── selectReadyTasks ─────────────────────────────────────────────────────────────

/**
 * The set of tasks to START right now. PURE, TOTAL, DETERMINISTIC — never throws, no
 * I/O. PBT targets: Property 1 (safety, task 1.13) and Property 5 (concurrency, task
 * 1.14). See design.md §3.
 *
 * Guarantees — each is enforced explicitly below, in this short-circuit order:
 *   1. NEVER returns a task whose `status !== 'pending'` → run-at-most-once: a task that
 *      already ran (running/completed/failed/blocked) is never re-selected (Req 6.6).
 *   2. NEVER returns a task with an unmet OR failed/blocked dependency: only a task that
 *      `classifyTask` reports `'ready'` (all dependencies `completed`) is selected
 *      (Req 4.1, 4.6).
 *   3. Returns `[]` unless `missionState === 'running'` (via `isExecutable`) → no Run
 *      before the Plan_Approval gate, and none while paused or in a terminal state
 *      (Req 3.1, 9.11).
 *   4. Returns `[]` when a safety ceiling is reached (`ceiling.stop === true`) → the
 *      Mission_Budget / Wall_Clock ceiling stops NEW Runs (Req 5.6, 5.9).
 *   5. Returns AT MOST `max(0, concurrencyLimit − runningCount)` tasks, NEVER negative →
 *      the Concurrency_Limit is never exceeded (Req 5.3, 5.4). Inputs are sanitized to
 *      non-negative finite, so a garbage count/limit can never open a phantom slot.
 *
 * Selection preserves the input task order (deterministic) and reads dependency
 * statuses through a `key → ExecTask` map built once from `tasks`. Duplicate keys keep
 * the first occurrence in the lookup (matching `buildTaskGraph`'s dedupe discipline),
 * though persisted MissionTasks carry unique keys via the partial-unique
 * `{ missionId, key }` index.
 */
export function selectReadyTasks(input: SelectInput): ExecTask[] {
  const tasks = input && Array.isArray(input.tasks) ? input.tasks : []

  // Guarantee 3 — only a `running` mission may start NEW Runs. Reuse the lifecycle
  // FSM's `isExecutable` as the SINGLE source of truth (Req 3.1, 9.11). This also
  // covers planning / awaiting-plan-approval (no Run before Plan_Approval), paused
  // (Kill_Switch), and the absorbing terminals.
  if (!isExecutable(input?.missionState)) return []

  // Guarantee 4 — a reached Mission_Budget / Wall_Clock ceiling stops NEW Runs (the
  // already-running Runs are left to finish by the async tick, Req 5.13). Only an
  // explicit `{ stop: true }` halts selection; a `{ stop: false }` (or absent) result
  // proceeds (Req 5.6, 5.9).
  if (input?.ceiling?.stop === true) return []

  // Guarantee 5 — compute the free Concurrency_Limit slots, clamped at zero so it can
  // NEVER go negative (Req 5.3, 5.4). Sanitize both operands first so a non-finite or
  // negative count/limit cannot fabricate a slot.
  const runningCount = nonNegFinite(input?.runningCount)
  const concurrencyLimit = nonNegFinite(input?.concurrencyLimit)
  const slots = Math.max(0, concurrencyLimit - runningCount)
  if (slots === 0) return []

  // Build the `key → ExecTask` lookup once for dependency classification (first key wins).
  const byKey = new Map<string, ExecTask>()
  for (const t of tasks) {
    if (t && typeof t.key === 'string' && t.key.length > 0 && !byKey.has(t.key)) {
      byKey.set(t.key, t)
    }
  }

  // Walk tasks in order, taking up to `slots` that are BOTH pending (Guarantee 1) and
  // ready (Guarantee 2). Stop as soon as the slots are filled.
  const selected: ExecTask[] = []
  for (const t of tasks) {
    if (selected.length >= slots) break
    if (!t || t.status !== 'pending') continue // Guarantee 1 — run-at-most-once (Req 6.6)
    if (classifyTask(t, byKey) !== 'ready') continue // Guarantee 2 — deps all completed (Req 4.1, 4.6)
    selected.push(t)
  }
  return selected
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ── runMissionTick — the async executor driver (task 3.2, design.md §3) ─────────────
// ═══════════════════════════════════════════════════════════════════════════════════
// This is the I/O layer of the Mission Executor. Unlike the pure cores above, it DOES
// import models + `connectDB` + `runAgentOnce` — but it invents NO new decision logic:
// every choice is DELEGATED to a pure core. "Which mission may run / has it tripped a
// ceiling?" → `missionGate` / `missionCeilingReached` (`mission/limits.ts`). "Which
// tasks start now?" → `selectReadyTasks` (this file). "What lifecycle move follows?" →
// `transition` (`mission/lifecycle.ts`). "Which dependents get the handoff?" →
// `handoffsForCompletion` (`mission/handoffs.ts`). The driver only performs the reads,
// the `runAgentOnce` calls, and the persistence in between.
//
// IT ADDS NO NEW WRITE PATH (Req 4.8, 12.4): every Mission_Task executes through the
// SINGLE audited Run path `runAgentOnce`, which emits only `pending` Proposals; a
// deliverable is realized in the vault solely when the user later approves that Proposal
// via `applyProposal`. The tick never writes knowledge itself.
//
// IDEMPOTENCY (Req 11.2): usage is RE-DERIVED every tick from the real `AgentRun`
// records of this mission's tasks (never a trusted stale counter), and only `pending`
// tasks are ever selected (run-at-most-once, Req 6.6). Re-running a tick therefore does
// not double-spend, double-run, or double-count.
//
// NEVER-THROW / BATCH ISOLATION (Req 4.5): like the scheduler tick + `runAgentOnce`,
// each task Run is wrapped in its own try/catch so one task's failure never aborts the
// batch, and the whole function captures any unexpected error into a structured result
// rather than throwing.

// ── MissionTickResult ───────────────────────────────────────────────────────────────

/**
 * The structured outcome of one {@link runMissionTick} call. Reported back to the cron
 * route (`/api/missions/executor/tick`) and the opportunistic post-run chaining caller;
 * never throws, so a caller can run a batch of ticks and isolate any single failure.
 *
 *   • `started`   — keys of the tasks this tick moved into `running` (and executed).
 *   • `completed` — keys of the tasks whose Run finished as `ok` + `completed`.
 *   • `failed`    — keys of the tasks whose Run did not cleanly complete (blocked /
 *     budget-blocked / errored / non-`completed` runStatus).
 *   • `lifecycle` — the mission's lifecycle state AFTER this tick (post any FSM move).
 *   • `ceilingReached` — the specific Mission_Budget / Wall_Clock ceiling that forced an
 *     abort this tick, when one did (Req 5.6, 5.9); omitted otherwise.
 *   • `ok` — false only when the tick hit an unexpected I/O error (e.g. mission not
 *     found / DB failure); the decision cores themselves never throw.
 *   • `error` — a SAFE human message when `ok === false` (never includes secrets).
 */
export interface MissionTickResult {
  missionId: string
  ok: boolean
  started: string[]
  completed: string[]
  failed: string[]
  lifecycle: MissionState
  ceilingReached?: MissionCeilingReason
  error?: string
}

/** Coerce a possibly-undefined numeric field to a finite, non-negative number. */
function safeUsage(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Advance ONE running mission by one tick. PUBLIC async entry point (design.md §3,
 * Req 4.1–4.9, 5.6, 5.7, 5.9, 5.13, 6.4, 6.5, 6.6, 9.7, 11.2, 12.4).
 *
 * The six steps, each delegating its decision to a pure core:
 *   1. Connect DB; load the Mission + its user-scoped MissionTasks. Re-derive
 *      accumulated usage from the real `AgentRun` records (Req 11.2) — idempotent.
 *   2. Evaluate `missionGate` (state · Mission_Budget · Wall_Clock). If a ceiling /
 *      wall-clock forced a stop, fire FSM `abort`, persist lifecycle + `ceilingReached`
 *      + `finishedAt`, and stop starting runs (Req 5.6, 5.9, 5.13).
 *   3. Compute `selectReadyTasks` (concurrency- + dependency- + state-safe).
 *   4. For each selected task: load its assigned Agent, mark it `running`, execute
 *      `runAgentOnce(agent, { kind: 'reactive', event: 'mission.task', ... })` — the
 *      SINGLE audited Run path. On the result, mark `completed` | `failed`, store
 *      `outputRef { runId, proposalIds }`, and accumulate usage from `AgentRun.tokensUsed`.
 *      Each task is isolated in its own try/catch (Req 4.5).
 *   5. On each completion, record Handoffs to dependents (`handoffsForCompletion`),
 *      persist them on the Mission + each dependent's `handoffInputs` (Req 4.3, 7.1),
 *      and re-classify newly-blocked tasks via `classifyTask` (Req 4.6).
 *   6. When every task is terminal, fire FSM `complete` iff ≥1 completed (Req 4.7, 9.7).
 *
 * Reuses the scheduler's TERMINAL GATE + SELF-TRIGGER GUARD concepts: a dependent becomes
 * eligible for its handoff only after the source task's Run reaches a terminal state, and
 * — because `handoffsForCompletion` never hands a task off to itself and `selectReadyTasks`
 * only returns `pending` tasks — a task is never chained off its own completion (Req 6.4,
 * 6.5, 6.6). Never throws: any unexpected error is captured into the result.
 */
export async function runMissionTick(missionId: string): Promise<MissionTickResult> {
  const started: string[] = []
  const completed: string[] = []
  const failed: string[] = []

  try {
    // ── Step 1 · load the Mission + its user-scoped tasks; re-derive usage ──────────
    await connectDB()

    const mission = await Mission.findById(missionId)
    if (!mission) {
      // Not found / already deleted — nothing to advance; report a safe failure.
      return {
        missionId,
        ok: false,
        started,
        completed,
        failed,
        lifecycle: 'failed',
        error: 'Mission not found',
      }
    }

    const userId = String(mission.userId)
    // User-scoped read (Req 12.5): only THIS mission's tasks, owned by THIS user.
    const taskDocs = await MissionTask.find({ missionId: mission._id, userId })

    // Re-derive accumulated usage from the REAL AgentRun records of this mission's
    // tasks — never trust the stored counter (Req 11.2). Summing the live runs keeps
    // the tick idempotent: a re-run recomputes the same total instead of re-adding.
    const runIds = taskDocs
      .map((t) => t.outputRef?.runId)
      .filter((id): id is NonNullable<typeof id> => id != null)
    let tokensUsed = 0
    if (runIds.length > 0) {
      const runs = await AgentRun.find({ _id: { $in: runIds }, userId }, 'tokensUsed').lean()
      for (const r of runs) tokensUsed += safeUsage(r.tokensUsed)
    }
    // Cost is not separately recorded on AgentRun in this phase; carry the persisted
    // figure forward (honest zero when unset, Req 11.5) without fabricating a value.
    const costUsed = safeUsage(mission.usage?.costUsed)

    // Persist the re-derived token usage so observability reads the real total (Req 11.2).
    mission.usage = { tokensUsed, costUsed }

    // ── Step 2 · evaluate the mission safety gate (state · Budget · Wall_Clock) ─────
    const budget: MissionBudget = {
      tokenCeiling: mission.limits?.tokenCeiling ?? 0,
      costCeiling: mission.limits?.costCeiling ?? 0,
      tokensUsed,
      costUsed,
    }
    const timing: MissionTiming = {
      startedAt: mission.startedAt ? mission.startedAt.getTime() : 0,
      now: Date.now(),
      wallClockLimitMs: mission.limits?.wallClockLimitMs ?? 0,
    }
    const concurrencyLimit = mission.limits?.concurrencyLimit ?? 0
    const runningCount = taskDocs.filter((t) => t.status === 'running').length

    // The mission's own ceilings, computed once and reused for both the abort decision
    // (here) and the `selectReadyTasks` ceiling guard below.
    const ceiling: MissionCeilingResult = missionCeilingReached(budget, timing)

    // A reached Mission_Budget / Wall_Clock ceiling forces an abort (Req 5.6, 5.9). Fire
    // the FSM `abort`, record the SPECIFIC limit type, and stop starting new runs —
    // already-running Runs are left to finish their reporting (Req 5.13).
    if (ceiling.stop) {
      const next = transition(mission.lifecycle as MissionState, 'abort')
      mission.lifecycle = next
      mission.ceilingReached = ceiling.reason
      mission.failureReason = `Mission aborted: ${ceiling.reason} ceiling reached`
      if (next !== 'running') mission.finishedAt = new Date()
      await mission.save()
      agentLog.info('[mission/executor] mission aborted on ceiling', {
        missionId,
        reason: ceiling.reason,
        lifecycle: next,
      })
      return {
        missionId,
        ok: true,
        started,
        completed,
        failed,
        lifecycle: next,
        ceilingReached: ceiling.reason,
      }
    }

    // The gate ALSO short-circuits a non-running mission (planning / awaiting-plan-
    // approval / paused / terminal). When it is not running, `selectReadyTasks` will
    // already return [] (it reuses `isExecutable`), but evaluating the gate keeps the
    // I/O layer honest about WHY no run started, and mirrors the design's contract that
    // `missionGate` is the single pre-flight (Req 3.1, 9.11).
    const gate = missionGate({
      missionState: mission.lifecycle as MissionState,
      budget,
      timing,
      runningCount,
      concurrencyLimit,
    })

    // ── Step 3 · compute the ready-to-start tasks (the PURE decision) ───────────────
    // Map each MissionTask doc → the minimal ExecTask view the selector reads. The
    // selector enforces: only `pending` tasks, only fully-satisfied dependencies, only
    // while `running`, none on a reached ceiling, and at most the free concurrency
    // slots (Req 3.1, 4.1, 4.6, 5.3, 5.4, 6.6, 9.11).
    const execTasks: ExecTask[] = taskDocs.map(toExecTask)
    const selected =
      gate.allowed
        ? selectReadyTasks({
            tasks: execTasks,
            missionState: mission.lifecycle as MissionState,
            runningCount,
            concurrencyLimit,
            ceiling,
          })
        : []

    // Index the task docs by key for fast status updates + dependent lookups.
    const docByKey = new Map<string, (typeof taskDocs)[number]>()
    for (const t of taskDocs) docByKey.set(t.key, t)

    // ── Step 4 · execute each selected task through the SINGLE audited Run path ─────
    for (const sel of selected) {
      const taskDoc = docByKey.get(sel.key)
      if (!taskDoc) continue

      // Each task Run is isolated: one failure never aborts the batch (Req 4.5),
      // mirroring the scheduler tick + `runAgentOnce`'s never-throw contract.
      try {
        // Load the FULL assigned Agent doc (not lean — `runAgentOnce` reads/writes
        // budget, trustScope, signOffPolicy, assignedSkillIds). User-scoped (Req 12.5).
        const agent = await Agent.findOne({ _id: taskDoc.assignedAgentId, userId })
        if (!agent) {
          // The assigned Agent is gone — the task cannot run; mark it failed so the
          // mission can still reach a terminal state (and its dependents block).
          markStatus(taskDoc, 'failed')
          taskDoc.failureReason = 'Assigned agent not found'
          await taskDoc.save()
          failed.push(sel.key)
          continue
        }

        // Mark `running` BEFORE the Run so a crash mid-tick leaves an honest record and
        // the next tick's `runningCount` reflects it (run-at-most-once still holds —
        // a `running` task is never re-selected, Req 6.6).
        markStatus(taskDoc, 'running')
        await taskDoc.save()
        started.push(sel.key)

        // Execute via the SINGLE audited Run path (Req 4.2, 4.8, 12.4). A mission task
        // is a `reactive` Run — its `event` names the mission-task trigger and
        // `sourceAgentId` is the assigned Agent (used by the scheduler's self-trigger
        // guard concept downstream). `runAgentOnce` NEVER throws: it returns a
        // structured { status: 'ok' | 'blocked' | 'error', ... }.
        const result = await runAgentOnce(agent, {
          kind: 'reactive',
          event: 'mission.task',
          sourceAgentId: String(agent._id),
        })

        if (result.status === 'ok' && result.runStatus === 'completed') {
          // Clean completion: store the REAL output reference (Req 4.4) + accumulate
          // usage from the real AgentRun (Req 11.2), then mark `completed`.
          const runId = result.run?._id
          const proposalIds = (result.proposalIds ?? []) as IMissionTaskDoc['outputRef']['proposalIds']
          taskDoc.outputRef = {
            runId: (runId ?? null) as IMissionTaskDoc['outputRef']['runId'],
            proposalIds,
          }
          markStatus(taskDoc, 'completed')
          await taskDoc.save()
          completed.push(sel.key)

          // Accumulate the mission's token usage from the real Run record (Req 11.2).
          tokensUsed += safeUsage(result.run?.tokensUsed)

          // ── Step 5 · record Handoffs to dependents + re-classify newly blocked ────
          await recordHandoffsAndReclassify(mission, taskDoc, result, taskDocs, docByKey)
        } else {
          // `blocked` (Budget guard refused) or `error` (Run threw) or any non-clean
          // runStatus (failed / budget-stopped / timeout): the task FAILED (Req 4.5).
          // Still capture the output reference when a Run record exists, so the failed
          // task's trace stays linkable. Dependents will block via `classifyTask`.
          const runId = result.status !== 'blocked' ? result.run?._id : null
          if (runId) {
            taskDoc.outputRef = {
              runId: runId as IMissionTaskDoc['outputRef']['runId'],
              proposalIds: [] as IMissionTaskDoc['outputRef']['proposalIds'],
            }
            tokensUsed += safeUsage(result.status !== 'blocked' ? result.run?.tokensUsed : 0)
          }
          markStatus(taskDoc, 'failed')
          taskDoc.failureReason =
            result.status === 'blocked'
              ? `Run blocked by budget guard: ${result.reason}`
              : result.status === 'error'
                ? result.message
                : `Run ended as ${result.runStatus}`
          await taskDoc.save()
          failed.push(sel.key)

          // A failed dependency blocks its dependents (Req 4.6) — re-classify now so the
          // terminal evaluation below sees the propagated blocks.
          await reclassifyBlocked(taskDocs)
        }
      } catch (oneErr) {
        // Defensive: the per-task path should never throw (runAgentOnce never does), but
        // if something unexpected does, isolate it — mark the task failed and continue
        // the batch (Req 4.5). Never log secrets (AGENTS.md).
        agentLog.error('[mission/executor] task run failed', oneErr)
        try {
          markStatus(taskDoc, 'failed')
          taskDoc.failureReason = 'Task run failed'
          await taskDoc.save()
        } catch {
          // Swallow secondary persistence errors — the batch must continue.
        }
        if (!failed.includes(sel.key)) failed.push(sel.key)
        await reclassifyBlocked(taskDocs)
      }
    }

    // Persist the re-accumulated usage from this tick's runs (Req 11.2).
    mission.usage = { tokensUsed, costUsed }

    // ── Step 6 · terminal evaluation: complete the mission when every task is done ──
    // Re-read statuses from the (now-updated) docs. A task is TERMINAL when it is
    // completed / failed / blocked; a mission is done when NO task is still pending or
    // running (Req 4.7).
    const allTerminal = taskDocs.length > 0 && taskDocs.every((t) => isTerminalStatus(t.status))
    const anyCompleted = taskDocs.some((t) => t.status === 'completed')

    if (allTerminal && mission.lifecycle === 'running') {
      if (anyCompleted) {
        // ≥1 task completed ⇒ the mission completed (Req 4.7, 9.7).
        const next = transition('running', 'complete')
        mission.lifecycle = next
        mission.finishedAt = new Date()
      } else {
        // Every task is terminal but NONE completed (all failed/blocked). There is no
        // `complete` edge for a zero-completion mission, so the FSM stays `running`
        // until the user aborts via the Kill_Switch — `selectReadyTasks` already
        // authorizes no further runs (no `pending` tasks remain), so the mission is
        // inert and honest rather than falsely marked `completed` (Req 4.7, 9.7).
        agentLog.info('[mission/executor] all tasks terminal with zero completions', {
          missionId,
          lifecycle: mission.lifecycle,
        })
      }
    }

    await mission.save()

    return {
      missionId,
      ok: true,
      started,
      completed,
      failed,
      lifecycle: mission.lifecycle as MissionState,
    }
  } catch (err) {
    // The decision cores never throw; this catches only unexpected I/O (DB) errors.
    // Capture a SAFE message (never secrets) and report a structured failure so a batch
    // caller can isolate this mission's tick (Req 4.5 discipline at the mission level).
    agentLog.error('[mission/executor] tick failed', err)
    return {
      missionId,
      ok: false,
      started,
      completed,
      failed,
      lifecycle: 'running',
      error: 'Mission tick failed',
    }
  }
}

// ── runMissionTick I/O helpers ────────────────────────────────────────────────────
// Small private helpers the driver uses for the model-touching steps. They live below
// the public function (and after the pure cores) so the pure section stays import-free.

/** A loaded MissionTask document (hydrated, not lean) — the shape the driver mutates.
 * Based on the real `IMissionTask` document interface via `HydratedDocument` so every
 * field (`key`, `status`, `dependsOn`, `outputRef`, `handoffInputs`, `statusHistory`) and
 * the document methods (`.save()`) type-check. This is exactly the element type that
 * `MissionTask.find(...)` resolves to, so the `docByKey` map + helper params line up. */
type IMissionTaskDoc = HydratedDocument<IMissionTask>

/** Project a MissionTask doc → the minimal `ExecTask` view the pure selector reads. */
function toExecTask(doc: { key: string; status: TaskStatus; dependsOn: string[]; assignedAgentId: unknown }): ExecTask {
  return {
    key: doc.key,
    status: doc.status,
    dependsOn: Array.isArray(doc.dependsOn) ? doc.dependsOn : [],
    assignedAgentId: String(doc.assignedAgentId),
  }
}

/** Is this status terminal (no further Run will start for it)? completed/failed/blocked. */
function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'blocked'
}

/**
 * Mutate a task doc to `status` and append a real, timestamped `statusHistory` entry so
 * the Mission Timeline (task 1.17) projects genuine transition times (Req 8.2, 8.6).
 * Caller is responsible for `await doc.save()`.
 */
function markStatus(doc: { status: TaskStatus; statusHistory: Array<{ status: string; at: Date }> }, status: TaskStatus): void {
  doc.status = status
  if (!Array.isArray(doc.statusHistory)) doc.statusHistory = []
  doc.statusHistory.push({ status, at: new Date() })
}

/**
 * Step 5 — record the Handoffs a just-completed task produces, persist them on the
 * Mission (embedded `handoffs[]`) and each receiving dependent's `handoffInputs[]`
 * (Req 4.3, 7.1), then re-classify newly-blocked tasks. PURE DECISION delegated to
 * `handoffsForCompletion`; this only performs the persistence.
 *
 * The handoff carries the completed task's REAL output reference verbatim — the
 * `runId` + emitted `proposalIds` from the actual Run (Req 7.5). A dependent is only
 * handed to AFTER the source Run reached its terminal `completed` state (the terminal
 * gate, Req 6.5), and the recorder never hands a task off to itself (self-trigger
 * guard, Req 6.4).
 */
async function recordHandoffsAndReclassify(
  mission: { handoffs: IMission['handoffs'] },
  completedDoc: IMissionTaskDoc,
  result: Extract<Awaited<ReturnType<typeof runAgentOnce>>, { status: 'ok' }>,
  taskDocs: IMissionTaskDoc[],
  docByKey: Map<string, IMissionTaskDoc>,
): Promise<void> {
  const runIdStr = result.run?._id ? String(result.run._id) : ''
  const proposalIdStrs = (result.proposalIds ?? []).map((p) => String(p))

  // Build the Handoff records for EXACTLY the dependents of the completed task (Req 4.3,
  // 7.1) — one per dependent, none for non-dependents, never self.
  const handoffs = handoffsForCompletion(
    completedDoc.key,
    { runId: runIdStr, proposalIds: proposalIdStrs },
    taskDocs.map((t) => ({ key: t.key, dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [] })),
    new Date().toISOString(),
  )

  for (const h of handoffs) {
    // Persist on the Mission (additive embedded array → Activity_Feed + Timeline, Req 7.3).
    mission.handoffs.push({
      at: new Date(h.at),
      fromTaskKey: h.fromTaskKey,
      toTaskKey: h.toTaskKey,
      runId: result.run!._id as IMission['handoffs'][number]['runId'],
      proposalIds: (result.proposalIds ?? []) as IMission['handoffs'][number]['proposalIds'],
    })

    // Record the handed-off input on the receiving dependent so its Run can consume it
    // (Req 4.3). A dependent that receives no handoff is still allowed to complete — the
    // recorder records presence, it never blocks (Req 4.9).
    const dependent = docByKey.get(h.toTaskKey)
    if (dependent) {
      if (!Array.isArray(dependent.handoffInputs)) dependent.handoffInputs = []
      dependent.handoffInputs.push({
        fromTaskKey: h.fromTaskKey,
        runId: result.run!._id as IMissionTask['handoffInputs'][number]['runId'],
      })
      await dependent.save()
    }
  }

  // A completion can unblock waiting tasks but never blocks them; still run the
  // re-classification pass so any task whose OTHER dependency previously failed settles
  // to `blocked` consistently (Req 4.6).
  await reclassifyBlocked(taskDocs)
}

/**
 * Re-classify every not-yet-started (`pending`) task: if any of its dependencies has
 * failed or blocked, the failure propagates and the task becomes `blocked` and will
 * never start (Req 4.6). DELEGATES the decision to the pure `classifyTask`; this only
 * persists a `pending → blocked` transition. Idempotent: a task already blocked/terminal
 * is left untouched, and a still-`waiting`/`ready` task stays `pending`.
 */
async function reclassifyBlocked(taskDocs: IMissionTaskDoc[]): Promise<void> {
  // Build the `key → ExecTask` view ONCE from the live docs for the pure classifier.
  const byKey = new Map<string, ExecTask>()
  for (const t of taskDocs) byKey.set(t.key, toExecTask(t))

  for (const doc of taskDocs) {
    if (doc.status !== 'pending') continue // only not-yet-started tasks can become blocked
    if (classifyTask(toExecTask(doc), byKey) === 'blocked') {
      markStatus(doc, 'blocked')
      await doc.save()
    }
  }
}
