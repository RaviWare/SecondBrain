// ── Mission Handoff / Mention recorder (PURE, total, deterministic) ───────────────
// When a Mission_Task completes, the work it produced must be handed to the tasks that
// depend on it, and inter-agent references must be recorded as Mentions. This module
// owns the PURE half of that collaboration record: the data shapes (`Handoff`,
// `Mention`) and `handoffsForCompletion` — the function that, given a just-completed
// task and its real output reference, produces exactly one Handoff per dependent task.
// See design.md → "Components and Interfaces · 5. Handoff / Mention recorder" and
// Requirements 4.3, 7.1, 7.5.
//
// WHY THIS FILE IS PURE: like `scheduler.ts`, `budget.ts`, `lifecycle.ts`, and the
// other mission cores (`mission/lifecycle.ts`, `mission/planner.ts`), this is a
// unit/property-testable decision core. It imports NO Mongoose model and performs NO
// I/O — no `connectDB`, no model reads, no clock, no randomness. The async executor
// (task 3.2) calls `handoffsForCompletion` after a task's Run reaches a terminal
// state, then persists the returned Handoffs on the Mission (additive embedded array)
// and surfaces them as Activity_Feed events (Req 7.3) — those are I/O steps that live
// in the orchestration layer, not here.
//
// REQUIREMENTS ANCHORED HERE:
//   • Req 4.3 — when a task that another depends on completes, supply the completed
//     task's produced output as input to the dependent task as a Handoff.
//   • Req 7.1 — record each Handoff with the source task, the receiving task, and the
//     handed-off output reference.
//   • Req 7.5 — attribute every Handoff using REAL Run records: the `outputRef`
//     ({ runId, proposalIds }) is carried verbatim from the completed task's real Run,
//     never fabricated.
//
// The recorder records PRESENCE only — it never blocks. A dependent task that receives
// no Handoff input is still permitted to reach `completed` (Req 4.9); that allowance
// lives in the executor's classification, not here. This function simply emits the
// Handoffs that DO occur and emits none where there is no dependent.

// ── Handoff ───────────────────────────────────────────────────────────────────────

/**
 * A recorded Handoff: the moment a completed Mission_Task's produced output is supplied
 * as input to a task that depends on it (Req 4.3, 7.1).
 *
 *   • `at`         — ISO-8601 instant the Handoff was recorded.
 *   • `fromTaskKey`— the SOURCE task (the one that just completed).
 *   • `toTaskKey`  — the RECEIVING task (a dependent of the source).
 *   • `outputRef`  — the handed-off output reference: the id of the originating Run and
 *                    the ids of the Proposals it emitted. These come from REAL Run
 *                    records (Req 7.5) — the recorder copies them, it never invents them.
 */
export interface Handoff {
  at: string
  fromTaskKey: string
  toTaskKey: string
  outputRef: { runId: string; proposalIds: string[] }
}

// ── Mention ─────────────────────────────────────────────────────────────────────

/**
 * A recorded Mention: when an Agent references another Agent's work during a
 * Mission_Task Run, the reference is recorded identifying the referencing Agent/task
 * and the referenced Agent/task (Req 7.2, 7.5).
 *
 *   • `at`               — ISO-8601 instant the Mention was recorded.
 *   • `byTaskKey` / `byAgentId`             — the referencing task and its Agent.
 *   • `referencedTaskKey` / `referencedAgentId` — the referenced task and its Agent.
 *   • `note`             — the free-text annotation the referencing Agent attached.
 *
 * The type is declared here alongside `Handoff` because they are the two record shapes
 * the recorder owns and the async layer persists on the Mission together; Mention
 * recording from a Run's emitted references is wired in the orchestration layer.
 */
export interface Mention {
  at: string
  byTaskKey: string
  byAgentId: string
  referencedTaskKey: string
  referencedAgentId: string
  note: string
}

// ── handoffsForCompletion ─────────────────────────────────────────────────────────

/**
 * The minimal task view the recorder reads: a stable within-graph `key` and the keys
 * of the tasks it depends on. Declared LOCALLY (rather than importing `ExecTask` from
 * `mission/executor.ts`) on purpose: the executor is a parallel task that may not exist
 * yet, and the recorder needs only these two structural fields. A `MissionTask` doc or
 * an `ExecTask` fixture both satisfy this shape, so no cross-task ordering hazard is
 * introduced and the executor can later pass its richer `ExecTask[]` without change.
 */
export interface HandoffTaskRef {
  key: string
  dependsOn: string[]
}

/**
 * Build the Handoff records produced when `completedTaskKey` finishes. PURE, TOTAL,
 * DETERMINISTIC — never throws (Req 4.3, 7.1, 7.5).
 *
 * Produces EXACTLY one Handoff for each task whose `dependsOn` includes
 * `completedTaskKey`, and NONE for any task that does not depend on it. Each Handoff:
 *   • names the SOURCE (`fromTaskKey = completedTaskKey`) and the RECEIVER
 *     (`toTaskKey = dependent.key`) — Req 7.1,
 *   • carries the completed task's REAL `outputRef` ({ runId, proposalIds }) verbatim,
 *     so every Handoff is attributed to the real Run record that produced it (Req 7.5),
 *   • stamps the supplied `at` instant.
 *
 * Determinism + safety:
 *   • The result preserves the input order of `tasks`, so the same inputs always yield
 *     the same Handoff sequence.
 *   • The completed task is never handed off to ITSELF — a self-dependency (which the
 *     planner's `buildTaskGraph` already strips, and `validateTaskGraph` would reject
 *     as a cycle) is ignored here as a second line of defence, so a task can never
 *     chain off its own completion (consistent with the scheduler self-trigger guard,
 *     Req 6.4).
 *   • `proposalIds` is defensively COPIED so the returned Handoffs never alias the
 *     caller's array; a mutation of one Handoff's ids cannot leak into another.
 *   • Malformed input is tolerated for totality: a non-array `tasks`, null/non-object
 *     entries, a non-string `key`, and a `dependsOn` that is not an array are all
 *     skipped rather than throwing. A non-array `outputRef.proposalIds` normalizes to
 *     an empty array.
 */
export function handoffsForCompletion(
  completedTaskKey: string,
  outputRef: Handoff['outputRef'],
  tasks: HandoffTaskRef[],
  at: string,
): Handoff[] {
  if (!Array.isArray(tasks)) return []

  // Normalize the output reference once so every emitted Handoff carries a clean,
  // independently-owned copy of the real Run reference (Req 7.5). A missing/garbage
  // shape degrades to empty strings / an empty id list rather than throwing.
  const runId = outputRef && typeof outputRef.runId === 'string' ? outputRef.runId : ''
  const proposalIds =
    outputRef && Array.isArray(outputRef.proposalIds)
      ? outputRef.proposalIds.filter((id): id is string => typeof id === 'string')
      : []

  const handoffs: Handoff[] = []
  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue
    const key = task.key
    if (typeof key !== 'string' || key.length === 0) continue
    if (key === completedTaskKey) continue // never hand a completed task off to itself
    const deps = Array.isArray(task.dependsOn) ? task.dependsOn : []
    if (!deps.includes(completedTaskKey)) continue // only real dependents receive a Handoff

    handoffs.push({
      at,
      fromTaskKey: completedTaskKey,
      toTaskKey: key,
      // Copy the proposal ids per-Handoff so no two records alias the same array.
      outputRef: { runId, proposalIds: [...proposalIds] },
    })
  }

  return handoffs
}
