# Implementation Plan: Mission Orchestrator

## Overview

This plan implements the Mission Orchestrator as six strictly-additive, incrementally
shippable phases, in the composition order the design dictates: the **pure decision
cores** (the safety logic) are built and property-tested first, then the **additive
persistence**, then the **orchestration glue** that wires those cores to the existing
agent spine, then the **API routes**, then the **glass UI surfaces**, and finally a
**non-breaking verification** pass.

The orchestrator is a thin coordination tier **on top of** the existing Hermes Agents
OS spine — it invents no new execution path, no new write path, and no new budget
bypass. Every Mission_Task executes through the existing single audited Run path
(`runAgentOnce`), every deliverable resolves through the single Aegis write choke point
(`applyProposal`), every task Run still passes the existing three-level `canStartRun`
guard, and every mission Sub_Agent reuses `resolveSubScope` (scope ⊆ parent). The one
deliberate safety gate the mission layer *adds* is the mandatory Plan_Approval
checkpoint — no Mission_Task Run starts until the user explicitly approves the plan.

Conventions used throughout (mirroring `.kiro/specs/hermes-agents/tasks.md`):
- Language: **TypeScript** (matches the existing Next.js codebase). No pseudocode.
- All pure cores live under `src/lib/agents/mission/` and import **no** Mongoose model,
  so they are unit/property-testable without a DB — exactly like `scheduler.ts`,
  `budget.ts`, and `lifecycle.ts`.
- Reuse the existing spine — never recreate: `runAgentOnce` (`src/lib/agents/run-agent.ts`),
  `canStartRun` (`src/lib/agents/budget.ts`), `resolveSubScope` / `spawnSubAgent`
  (`src/lib/agents/scope.ts`, `src/lib/agents/sub-agent.ts`), the scheduler self-trigger
  guard + terminal gate (`src/lib/agents/scheduler.ts`), `applyProposal`
  (`src/lib/agents/aegis/apply-proposal.ts`), the feed/tally builders
  (`src/lib/agents/dashboard-feed.ts`), and the `models.ts` conventions.
- All new data lands in **two new collections** (`Mission`, `MissionTask`) or
  **embedded additive** fields only; existing `Agent` / `AgentRun` / `Proposal` fields
  are never altered or removed (Req 12.1–12.3).
- New UI surfaces MUST follow the glass recipe in `.kiro/steering/glass-theme.md`
  (`sb-dashboard` shell + `dash-panel dash-grain dash-interactive` panels; portal
  overlays use root-level tokens).
- Security (Req 12.6–12.9, non-negotiable): provisioned containers stay non-root,
  resource-capped, network-isolated, with **no host Docker socket** in any environment;
  never log BYO LLM keys or brain tokens; mint brain tokens scoped to the Agent's
  Trust_Scope.
- Tests marked with `*` are optional (property-based / unit / component / route /
  smoke); core implementation subtasks are never optional. Each property test uses
  `fast-check` (already a dev dependency), runs `{ numRuns: 100 }` minimum, and is
  tagged `// Feature: mission-orchestrator, Property N: <text>`.

## Tasks

- [x] 1. Phase 1 — Pure decision cores (FSM · planner · executor · limits · handoffs · timeline)
  - Lands Properties 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 13. Builds the entire deterministic
    safety core under `src/lib/agents/mission/` with zero I/O, each core paired with its
    property test. No model, route, or UI exists yet; nothing in the live app changes.

  - [x] 1.1 Implement the Mission lifecycle FSM (`mission/lifecycle.ts`)
    - Create `src/lib/agents/mission/lifecycle.ts` following the exact pattern of
      `src/lib/agents/lifecycle.ts`: export `MissionState`, `MISSION_STATES`,
      `INITIAL_MISSION_STATE = 'planning'`, the `MissionEvent` union, a pure/total/
      deterministic `transition(state, event)` (permitted move → target; non-permitted
      pair → state unchanged; `completed`/`failed`/`aborted` absorbing; never throws),
      and `isExecutable(state)` returning `true` iff `running`.
    - Encode the transition table from the design: `planning → {decomposed-ok →
      awaiting-plan-approval, decomposition-failed → failed}`, `awaiting-plan-approval →
      {approve → running, reject → aborted}`, `running → {pause → paused, complete →
      completed, abort → aborted}`, `paused → {resume → running, abort → aborted}`. Keep
      the enum in sync with the planned `Mission.lifecycle` enum.
    - _Requirements: 3.1, 3.4, 3.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11_

  - [x]* 1.2 Write property test for the Mission lifecycle FSM
    - **Property 3: Mission lifecycle transitions are total, gated, and terminal-absorbing**
    - **Validates: Requirements 2.8, 3.4, 3.5, 3.7, 4.7, 9.1, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11**
    - Over arbitrary `(MissionState, MissionEvent)` pairs assert: `transition` always
      returns a valid `MissionState`; non-permitted pairs leave state unchanged;
      `approve` is the only edge producing `running` from `awaiting-plan-approval`;
      `complete` yields `completed` only from `running`; the three terminal states are
      absorbing. Tag `// Feature: mission-orchestrator, Property 3: ...`, `numRuns: 100`.

  - [x] 1.3 Implement the Task_Graph builder and validator (`mission/planner.ts`)
    - Create `src/lib/agents/mission/planner.ts` with the pure `buildTaskGraph(raw)`
      (normalize `RawTask[]`: dedupe keys, drop self-deps and dangling deps) and
      `validateTaskGraph(graph, limits): GraphValidation`. Validate **only** for cycles
      (Kahn topological sort — remove zero-in-degree nodes; if any remain →
      `{ ok:false, reason:'cycle' }`) and the Graph_Limit (longest-path **depth** and
      **task count**, computed after the cycle check passes). Disconnected components
      MUST pass. Pure/total — never throws.
    - Define the supporting types (`RawTask`, `PlannedTask`, `TaskGraph`, `GraphLimits`,
      `GraphValidation`) per the design's Components section.
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7, 5.1, 5.2, 6.1_

  - [x]* 1.4 Write property test for the Task_Graph validator
    - **Property 2: The Task_Graph validator rejects every cycle and every over-limit graph, and nothing else**
    - **Validates: Requirements 2.5, 2.6, 2.7, 5.1, 5.2, 6.1**
    - Over arbitrary graphs + `GraphLimits` assert: `reason:'cycle'` iff a cycle exists;
      for acyclic graphs `graph-limit-depth`/`-count` exactly when the longest chain
      exceeds `maxDepth` or count exceeds `maxTasks`; `{ ok:true }` for every acyclic
      within-limit graph including disconnected components. `numRuns: 100`.

  - [x] 1.5 Implement role-fit assignment (`assignByRole` in `mission/planner.ts`)
    - Add the pure, total `assignByRole(tasks, squad, leadAgentId): PlannedTask[]`:
      assign each task to a best-fit Squad Agent by role match between the task's role
      hint and the Agent's role; where no Squad Agent fits, assign to the Lead_Agent and
      set `assignmentFallback = true`. Every task ends up with exactly one
      `assignedAgentId`.
    - _Requirements: 2.3, 2.4_

  - [x]* 1.6 Write property test for role-fit assignment
    - **Property 7: Every task is assigned exactly once, with Lead_Agent fallback**
    - **Validates: Requirements 2.3, 2.4**
    - Over arbitrary tasks/squad/lead assert: every task has exactly one
      `assignedAgentId`; a role-matched task goes to a matching Squad Agent; a no-fit
      task goes to the Lead_Agent with `assignmentFallback = true`. `numRuns: 100`.

  - [x] 1.7 Implement Lead_Agent auto-selection (`selectLeadAgent` in `mission/planner.ts`)
    - Add a pure `selectLeadAgent(squad): SquadAgentRef | null` that picks a Lead-eligible
      Agent from the Squad by role fit and returns `null` when none is eligible. It MUST
      be a self-contained pure function so the creation route can run it **independently**
      of Objective validation and Lead-eligibility validation (Req 1.8).
    - _Requirements: 1.4, 1.8_

  - [x]* 1.8 Write property test for Lead_Agent auto-selection
    - **Property 6: Lead_Agent auto-selection picks an eligible agent independently of validation**
    - **Validates: Requirements 1.4, 1.8**
    - For any Squad containing ≥1 Lead-eligible Agent, assert auto-selection returns an
      eligible Agent and yields its result independently of the other creation
      validations. `numRuns: 100`.

  - [x] 1.9 Implement the safety gate + Mission_Budget (`mission/limits.ts`)
    - Create `src/lib/agents/mission/limits.ts`, pure/total like `budget.ts`, with:
      `missionCeilingReached(budget, timing): MissionCeilingResult` (token ceiling when
      `tokensUsed ≥ tokenCeiling`, cost ceiling when `costUsed ≥ costCeiling`, wall-clock
      when `now − startedAt ≥ wallClockLimitMs`; `0`/non-finite = unset = never stops;
      token vs cost distinguished so the abort record names the specific limit);
      `missionGate(input)` (`allowed` iff `missionState === 'running'` ∧ no ceiling
      reached ∧ `runningCount < concurrencyLimit`, with a `reason` otherwise); and
      `canSpawnSubAgent(currentDepth, graphLimitDepth)` (permit iff
      `currentDepth < graphLimitDepth`). Define `MissionBudget` + `MissionCeilingResult`.
    - This gate is the **new fourth ceiling** layered on top of `canStartRun`; it never
      weakens the existing guard (which still runs inside `runAgentOnce`, Req 5.7).
    - _Requirements: 5.5, 5.6, 5.8, 5.9, 6.2, 6.3_

  - [x]* 1.10 Write property test for the Mission ceilings
    - **Property 4: A mission stops starting runs exactly when one of its own ceilings is reached**
    - **Validates: Requirements 5.5, 5.6, 5.8, 5.9**
    - Over arbitrary `MissionBudget` + timing assert: `stop:true` with the correct reason
      at the token, cost, and wall-clock thresholds; an unset (`0`/non-finite) ceiling
      never triggers a stop; token vs cost are distinguished; and whenever a stop is
      reported `missionGate` disallows a new run. `numRuns: 100`.

  - [x]* 1.11 Write property test for the Sub_Agent depth bound
    - **Property 10: Sub_Agent nesting depth is bounded by the Graph_Limit depth**
    - **Validates: Requirements 6.2, 6.3**
    - Over arbitrary `(currentDepth, graphLimitDepth)` assert `canSpawnSubAgent` permits
      the spawn iff `currentDepth < graphLimitDepth` — a spawn that would exceed the depth
      is refused, one within it is not refused on the depth basis. `numRuns: 100`.

  - [x] 1.12 Implement the executor's pure decision core (`mission/executor.ts`)
    - Create `src/lib/agents/mission/executor.ts` with the pure `classifyTask(task,
      byKey): 'ready' | 'blocked' | 'waiting'` (any dependency failed/blocked → blocked;
      all completed → ready; else waiting) and the pure/total `selectReadyTasks(input):
      ExecTask[]`. Guarantees: never returns a non-`pending` task (run-at-most-once);
      never returns a task with an unmet/failed/blocked dependency; returns `[]` unless
      `missionState === 'running'`; returns `[]` when a safety ceiling is reached;
      returns at most `max(0, concurrencyLimit − runningCount)` tasks.
    - Import `MissionState` from `mission/lifecycle.ts` and `MissionCeilingResult` from
      `mission/limits.ts`; define `TaskStatus`, `ExecTask`, `SelectInput`.
    - _Requirements: 3.1, 4.1, 4.5, 4.6, 5.3, 5.4, 6.6, 9.11_

  - [x]* 1.13 Write property test for the ready-task selector's safety
    - **Property 1: The ready-task selector never starts an unsafe or premature task**
    - **Validates: Requirements 3.1, 3.6, 4.1, 4.5, 4.6, 5.11, 5.12, 6.6, 9.11**
    - Over arbitrary task sets / states / ceilings assert: only `pending` tasks returned;
      never one with a non-`completed` dependency; `[]` whenever `missionState ≠ running`;
      `[]` when a ceiling is reached; a completed task is never re-selected. `numRuns: 100`.

  - [x]* 1.14 Write property test for the concurrency cap
    - **Property 5: The concurrency cap is never exceeded**
    - **Validates: Requirements 5.3, 5.4**
    - Over arbitrary tasks / `runningCount` / `concurrencyLimit` assert the count returned
      by `selectReadyTasks` is at most `max(0, concurrencyLimit − runningCount)` (never
      negative). `numRuns: 100`.

  - [x] 1.15 Implement the Handoff / Mention recorder (`mission/handoffs.ts`)
    - Create `src/lib/agents/mission/handoffs.ts` with the `Handoff` / `Mention` types and
      the pure `handoffsForCompletion(completedTaskKey, outputRef, tasks, at): Handoff[]`
      — one Handoff per task that depends on the completed task and no others, each
      carrying the completed task's real `outputRef` (`runId` + `proposalIds`) and naming
      the source and receiving tasks. The recorder records absence; it never blocks a
      dependent that received no Handoff (Req 4.9).
    - _Requirements: 4.3, 7.1, 7.5_

  - [x]* 1.16 Write property test for the Handoff recorder
    - **Property 8: Handoffs are recorded for exactly the dependents and carry the real output reference**
    - **Validates: Requirements 4.3, 7.1, 7.5**
    - Over arbitrary completed task + task set assert: exactly one Handoff per dependent
      and none for non-dependents; every Handoff carries the completed task's real
      `runId` + `proposalIds` and names source + receiver. `numRuns: 100`.

  - [x] 1.17 Implement the Mission Timeline + observability tally helpers (`mission/timeline.ts`)
    - Create `src/lib/agents/mission/timeline.ts` mirroring `dashboard-feed.ts`: the pure/
      total `buildMissionTimeline(input): TimelineEntry[]` merging real task status
      transitions + Handoffs + Mentions into one chronological list from T+0, returning
      `[]` whenever `startedAnyRun` is false (honest empty state) and never fabricating an
      entry. Add small pure tally helpers in the same module (per-status task counts,
      accumulated tokens/cost summed from real run records with no loss/double-count,
      per-Agent contribution, usage-vs-ceiling) that are honest about zero.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x]* 1.18 Write property test for the Mission Timeline
    - **Property 12: The Mission Timeline is chronological, projection-only, and honest about emptiness**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**
    - Over arbitrary inputs assert: entries sorted chronologically from T+0; every entry
      projects a supplied real record (transition / Handoff / Mention) with none
      fabricated; `[]` whenever `startedAnyRun` is false regardless of other input.
      `numRuns: 100`.

  - [x]* 1.19 Write property test for the observability tallies
    - **Property 13: Observability tallies conserve real usage and are honest about zero**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6**
    - Over arbitrary `MissionTask` + `AgentRun` fixtures assert: per-status counts equal
      the true tallies; accumulated tokens/cost equal the sum of the underlying records
      with no loss or double-count across the per-Agent breakdown; an absence of records
      yields an all-zero state, never a fabricated non-zero value. `numRuns: 100`.

  - [x] 1.20 Checkpoint — Phase 1 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npx vitest run`; confirm the existing suite stays green and
      the new pure-core property tests pass. No model, route, or UI was touched, so
      `/api/agents/*`, `/api/proposals/*`, and `/api/agent/*` behavior is unchanged. STOP
      for user review before Phase 2.

- [x] 2. Phase 2 — Additive persistence (`Mission` + `MissionTask` models)
  - Adds two new collections following the exact `models.ts` conventions, referencing
    `Agent` / `AgentRun` / `Proposal` by id only. Strictly additive — no existing field
    changes — so adding missions cannot break the live agent system.

  - [x] 2.1 Add the `Mission` and `MissionTask` models to `models.ts`
    - In `src/lib/models.ts`, add the `Mission` and `MissionTask` collections per the
      design's Data Models section (TypeScript interface + `Schema` + `{ timestamps:true }`
      + hot-reload-safe `mongoose.models.X || mongoose.model(...)` export). `Mission`
      carries `userId`, `objective`, `context`, `leadAgentId`, `leadAutoSelected`,
      `lifecycle`, the `limits` block (maxGraphDepth, maxTaskCount, concurrencyLimit,
      tokenCeiling, costCeiling, wallClockLimitMs), `usage`, `failureReason`,
      `ceilingReached`, embedded `handoffs`/`mentions`, and `startedAt`/`approvedAt`/
      `finishedAt`. `MissionTask` carries `userId`, `missionId`, `key`, `description`,
      `assignedAgentId`, `assignmentFallback`, `dependsOn`, `status`, `outputRef`
      (`runId` + `proposalIds` by id), `handoffInputs`, `statusHistory`, `failureReason`.
    - Add indexes `{ userId:1 }` and `{ userId:1, lifecycle:1 }` on `Mission`;
      `{ userId:1, missionId:1 }` and a **partial unique** index `{ missionId:1, key:1 }`
      on `MissionTask` (same discipline as `InstalledSkill`/`SupportTicket`). Reference
      `Agent`/`AgentRun`/`Proposal` by `ObjectId` only — duplicate none of their data.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 2.2, 4.4, 5.1, 5.3, 5.5, 5.8, 7.1, 7.2, 8.2, 9.1, 9.2, 12.1, 12.2, 12.3, 12.5_

  - [x]* 2.2 Write a smoke / static test for the new models
    - Assert the `Mission` + `MissionTask` schemas exist and reference
      `Agent`/`AgentRun`/`Proposal` via `ObjectId` (or id string) only; assert the
      partial-unique `{ missionId, key }` index is declared; and assert (snapshot or
      field-list comparison) that **no existing field** on `Agent`, `AgentRun`, or
      `Proposal` was altered or removed — the additive, non-breaking guarantee.
    - _Requirements: 12.1, 12.2, 12.3, 12.5_

  - [x] 2.3 Checkpoint — Phase 2 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npx vitest run`; confirm the existing suite stays green and
      the smoke test passes, and that existing `Agent` / `AgentRun` / `Proposal` behavior
      is unchanged. STOP for user review before Phase 3.

- [x] 3. Phase 3 — Orchestration glue (decompose · tick · sub-agents · container predicate)
  - Lands Properties 9, 11, 14. Wires the pure cores to the existing spine: the one
    isolated LLM decomposition call, the async `runMissionTick` driver, the mission
    Sub_Agent path, and the four-control container predicate. Adds **zero** new write
    path — every task Run goes through `runAgentOnce`, every write through `applyProposal`.

  - [x] 3.1 Implement `decomposeObjective` (the one injectable LLM call) in `mission/planner.ts`
    - Add the async `decomposeObjective(input, deps): Promise<RawTask[]>` — the **only**
      I/O in the planner, with the model call injected as `deps.llm` so it is trivially
      stubbed in tests. It produces a plan, not knowledge: it performs **no** vault write.
      The planning route composes `decomposeObjective → buildTaskGraph → assignByRole →
      validateTaskGraph`, then on `ok` persists tasks + fires FSM `decomposed-ok`, on
      failure records the reason + fires `decomposition-failed`.
    - _Requirements: 2.1, 2.3, 2.4, 9.3, 9.8_

  - [x] 3.2 Implement `runMissionTick` (the async executor driver) in `mission/executor.ts`
    - Add `runMissionTick(missionId): Promise<MissionTickResult>`: load the Mission + its
      user-scoped `MissionTask`s, re-derive accumulated usage from the real `AgentRun`
      records; evaluate `missionGate` (state · Mission_Budget · Wall_Clock) and on a
      reached ceiling fire FSM `abort` recording `ceilingReached`; compute
      `selectReadyTasks`; for each selected task execute `runAgentOnce(agent, trigger)` —
      the single audited Run path — marking the task `running` → `completed`/`failed`,
      storing `outputRef { runId, proposalIds }` and accumulating Mission_Budget usage from
      `AgentRun.tokensUsed`; on each completion record Handoffs to dependents
      (`handoffsForCompletion`) and re-classify newly-blocked tasks; when every task is
      terminal fire FSM `complete` iff ≥1 completed.
    - Reuse the scheduler's **terminal gate + self-trigger guard** for the reactive
      Handoff step (a dependent becomes eligible only after the source Run is terminal; a
      task never chains off its own completion). One task's failure never aborts the batch
      (mirror `runAgentOnce`'s never-throw contract + the scheduler tick's per-task
      try/catch). Re-deriving usage + selecting only `pending` tasks keeps the tick
      idempotent.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5.6, 5.7, 5.9, 5.13, 6.4, 6.5, 6.6, 9.7, 11.2, 12.4_

  - [x] 3.3 Implement the mission Sub_Agent spawn path
    - Wire the mission sub-task spawn to reuse `resolveSubScope(parent.trustScope,
      requested)` + `spawnSubAgent` from `sub-agent.ts` **verbatim** (resolved scope is
      always ⊆ the assigning Agent's), gated by `canSpawnSubAgent(currentDepth,
      graphLimitDepth)` for the nesting bound, and route every Sub_Agent write through the
      same `applyProposal` Aegis gate as the parent. The mission path adds only the depth
      bound; it never widens scope and mints any brain token scoped to the Sub_Agent's
      Trust_Scope.
    - _Requirements: 6.2, 6.3, 10.5, 10.6, 12.9_

  - [x] 3.4 Implement the four-control container predicate
    - Implement a pure predicate that returns "Agent work may execute" iff **all four**
      container controls are enforced (non-root user, resource caps, network isolation,
      no host Docker socket); if any control cannot be enforced it returns false so the
      orchestrator fails the entire Mission and runs no Agent work under a partial set of
      controls. Reuse the existing provisioner `HostConfig` shape (`CapDrop:['ALL']`,
      `no-new-privileges`, network isolation, no socket mount).
    - _Requirements: 12.6, 12.7_

  - [x]* 3.5 Write property test for the mission Sub_Agent scope subset
    - **Property 9: A mission Sub_Agent's scope never exceeds its assigner's scope**
    - **Validates: Requirements 10.5**
    - Over arbitrary assigner Trust_Scope + requested Sub_Agent scope assert the resolved
      mission scope is ⊆ the assigner's: `readableSourceIds`/`readableCollections` ⊆
      parent's, `webAccess ⇒ parent.webAccess`, `perRunTokenBudget ≤` parent's. Reuse the
      hermes-agents Property 8 harness shape for the mission path. `numRuns: 100`.

  - [x]* 3.6 Write property test for propose-never-write on mission task Runs
    - **Property 11: Mission task Runs propose, they never write**
    - **Validates: Requirements 4.8, 10.1, 10.2, 10.3**
    - With the LLM stubbed and an in-memory/spy vault, run mission task Runs (incl. a
      spawned Sub_Agent) for arbitrary agents/triggers; assert zero runner knowledge
      writes, every intended alteration appears only as a `pending` Proposal, and a vault
      write occurs only as the direct result of `applyProposal`. Reuse the hermes-agents
      Property 1 harness so 100+ iterations stay cheap. `numRuns: 100`.

  - [x]* 3.7 Write property test for the four-control container predicate
    - **Property 14: Agent work runs only when all four container controls are enforced**
    - **Validates: Requirements 12.7**
    - Over every combination of the four boolean controls assert Agent work is permitted
      iff all four are enforced, and that any missing control fails the Mission with no
      Agent work run. `numRuns: 100`.

  - [x] 3.8 Checkpoint — Phase 3 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npx vitest run`; confirm the existing suite stays green plus
      the new property tests pass, and that `runAgentOnce`, `applyProposal`, `canStartRun`,
      `resolveSubScope`, and scheduler contracts are unchanged — missions consume them,
      they do not modify them. STOP for user review before Phase 4.

- [x] 4. Phase 4 — API routes (Clerk-authed, user-scoped, + protected executor cron)
  - Adds the mission route handlers, mirroring the repo's mocked-model + mocked-Clerk
    route-test pattern. Leaves existing `/api/agents/*`, `/api/proposals/*`, and
    `/api/agent/*` handlers untouched.

  - [x] 4.1 Implement `/api/missions` CRUD
    - Create the Next.js route handlers under `src/app/api/missions` (create / list / get),
      Clerk-authed and user-scoped as the existing UI routes are. Create: validate the
      Objective (reject empty/whitespace with a validation message, Req 1.6); run
      `selectLeadAgent` **independently** (Req 1.8) and persist `leadAutoSelected` when
      auto-selected (Req 1.4); reject with **no** Mission record + an explicit message when
      no eligible Lead_Agent exists (Req 1.5); on success persist a `planning` Mission with
      objective/context/lead/owner (Req 1.1–1.3, 1.7). List/get are user-scoped (owner-only
      visibility). Never log tokens.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 9.2, 12.5_

  - [x]* 4.2 Write route tests for `/api/missions` CRUD
    - With `@/lib/mongodb` + `@/lib/models` mocked and `@clerk/nextjs/server`'s `auth()`
      injecting a `userId`, assert: creation persists `planning` + stores
      objective/context/lead (Req 1.1–1.4); rejects no-eligible-lead with no record
      (Req 1.5) and empty/whitespace objective (Req 1.6); list/get are user-scoped
      (Req 1.7, 12.5).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 12.5_

  - [x] 4.3 Implement `/api/missions/[id]/plan` (approve · edit · reject)
    - Create the route handler that presents the Mission_Plan (every Mission_Task, its
      assigned Agent, its dependencies) and offers Approve / Edit / Reject (Req 3.2, 3.3).
      Approve sets `approvedAt` + fires FSM `approve` → `running` only on an explicit
      approval (Req 3.4, 3.7, 9.4); Edit applies the user's changes then re-runs
      `validateTaskGraph`, keeping the Mission in `awaiting-plan-approval` while the edited
      graph is cyclic (Req 3.5); Reject fires FSM `reject` → `aborted` and starts no Run
      (Req 3.6). User-scoped throughout.
    - _Requirements: 2.8, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 9.3, 9.4_

  - [x]* 4.4 Write route tests for the plan approve/edit/reject route
    - With mocked models + Clerk assert: approve drives the FSM to `running` and records
      `approvedAt`; a cyclic edit is rejected and the Mission stays in
      `awaiting-plan-approval`; reject drives the FSM to `aborted` and starts no Run; all
      queries are user-scoped.
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.5 Implement `/api/missions/[id]/control` (pause · resume · abort = Kill_Switch)
    - Create the route handler driving the FSM: pause `running → paused` (Req 5.11, 9.5),
      resume `paused → running` (Req 9.6), abort `running|paused → aborted` (Req 5.12, 9.9).
      Because `paused`/`aborted` are non-running states, the pure `missionGate` then
      authorizes no new Runs; already-running Runs report in-progress and carry over
      (Req 5.13). User-scoped.
    - _Requirements: 5.10, 5.11, 5.12, 5.13, 9.5, 9.6, 9.9_

  - [x]* 4.6 Write route tests for the control (Kill_Switch) route
    - With mocked models + Clerk assert pause/resume/abort drive the correct FSM
      transitions, that a non-running state authorizes no new Run start, and that the route
      is user-scoped.
    - _Requirements: 5.10, 5.11, 5.12_

  - [x] 4.7 Implement `/api/missions/executor/tick` (SCHEDULER_CRON_SECRET-protected)
    - Create `src/app/api/missions/executor/tick/route.ts` secured by the **same**
      `SCHEDULER_CRON_SECRET` + constant-time compare + rate-limit pattern as
      `/api/agents/scheduler/tick`, invoking `runMissionTick(missionId)`. Also invoke a
      tick opportunistically after a Mission_Task Run reaches a terminal state to start
      newly-unblocked tasks (the reactive Handoff path, gated by the scheduler's terminal
      gate). No blocking in-process timer.
    - _Requirements: 4.1, 4.2, 4.7_

  - [x]* 4.8 Write route tests for the executor-tick cron gate
    - Mirror `scheduler/tick/route.test.ts`: assert 503 when `SCHEDULER_CRON_SECRET` is
      unset, 401 on mismatch, constant-time compare, and that a valid secret invokes
      `runMissionTick`.
    - _Requirements: 4.1, 4.2_

  - [x] 4.9 Checkpoint — Phase 4 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npx vitest run`; confirm the existing suite stays green plus
      the new route tests pass, and that `/api/agents/*`, `/api/proposals/*`, and
      `/api/agent/*` behavior is unchanged. STOP for user review before Phase 5.

- [x] 5. Phase 5 — Glass UI surfaces (+ sidebar nav)
  - Builds the five mission surfaces, all following the mandatory glass recipe; the
    warm accent stays reserved for the Plan-Approval / sign-off moments.

  - [x] 5.1 Build the Mission Console (create + roster)
    - Create `src/app/app/missions/page.tsx` with the Objective input (inset well:
      `--dash-card-solid` + `--dash-border`), an optional-context field, Lead_Agent
      selection, and the roster of the user's missions with current lifecycle state +
      per-status task counts (from the real tally helpers). Apply the glass recipe:
      `sb-dashboard` shell + `dash-panel dash-grain dash-interactive` panels (hero card
      adds `dash-spotlight` + `useSpotlight`). Honest zero state where there are no
      missions.
    - _Requirements: 1.1, 1.2, 1.3, 11.1, 12.10_

  - [x] 5.2 Build the Plan Review screen
    - Create the Plan Review surface (e.g. `src/app/app/missions/[id]/plan/page.tsx`)
      rendering the Task_Graph (tasks + dependencies) and Assignments with the Approve /
      Edit / Reject actions; the primary **Approve Plan** button uses `.dash-accent-grad`
      and the checkpoint reads with the reserved warm accent. Glass recipe mandatory.
    - _Requirements: 3.2, 3.3, 12.10_

  - [x] 5.3 Build the Mission Timeline surface
    - Create the Mission Timeline view rendering `buildMissionTimeline` output
      chronologically from T+0 (task status transitions + Handoffs + Mentions), with an
      **honest empty state** when no Run has started — never placeholder activity. Glass
      recipe mandatory.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 12.10_

  - [x] 5.4 Build the Observability / Cost panel
    - Create the per-mission observability panel showing lifecycle state + per-status task
      counts, accumulated tokens/cost from real run records, per-Agent contribution, and
      usage-vs-`Mission_Budget` ceiling — all from the tally helpers, honest about zero.
      Glass recipe mandatory.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.10_

  - [x] 5.5 Build the Kill_Switch control
    - Add the Kill_Switch control (pause / resume / abort) wired to `/control`, with the
      abort confirmation rendered as a **portalled overlay** that uses **root tokens**
      (`--bg-elev-3` solid background, `--surface-2`, `--border-bright`, `--text-primary`,
      `--accent`, `--shadow-3`) — never `--dash-*`, which do not resolve outside the
      dashboard shell. Always-opaque background.
    - _Requirements: 5.10, 5.11, 5.12, 12.10_

  - [x] 5.6 Add the Mission Orchestrator sidebar nav entry
    - Add a nav item (e.g. "Missions") pointing at `/app/missions` to
      `src/components/sidebar.tsx`, alongside the existing Squad / Board / Skills / Cost
      entries.
    - _Requirements: 12.10_

  - [x]* 5.7 Write component tests for glass conformance + honest empty state
    - Verify (jsdom) every mission surface carries the glass recipe — `sb-dashboard` shell
      + `dash-panel dash-grain dash-interactive` panels, portalled overlays using root
      tokens — and that the Mission Timeline renders its honest empty state when no Run has
      started.
    - _Requirements: 8.4, 12.10_

  - [x] 5.8 Checkpoint — Phase 5 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npx vitest run`; confirm the existing suite stays green plus
      the new component tests pass, and that existing surfaces are unchanged. STOP for user
      review before Phase 6.

- [x] 6. Phase 6 — Non-breaking verification
  - The final gate: the whole feature is green and provably additive.

  - [x] 6.1 Run the full verification sweep
    - Run `npx vitest run` (full unit/property/route/component suite), `npm run build`, and
      the project lint — all must be green. Confirm the existing suite still passes
      unchanged (new tests added, none replaced) and that `Agent` / `AgentRun` / `Proposal`
      and the `runAgentOnce` / `applyProposal` / `canStartRun` / `resolveSubScope` /
      scheduler contracts are unmodified — the additive, non-breaking guarantee. Fix any
      failure surfaced before sign-off.
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

## Notes

- Tasks marked with `*` are optional (property-based, smoke, route, and component tests)
  and can be skipped for a faster MVP; core implementation subtasks are never optional.
- Each top-level task is one phase: self-contained, independently reviewable, and leaves
  the live app non-broken. The build order follows the design's composition order — the
  pure decision cores first, then persistence, then the orchestration glue that consumes
  them; no phase depends on a later phase.
- Every phase ends with a checkpoint that runs `npm run build` + `npx vitest run` and
  confirms existing `/api/agents/*`, `/api/proposals/*`, and `/api/agent/*` behavior is
  unchanged — then STOPS for user review.
- Property tests use `fast-check` (`{ numRuns: 100 }` minimum), are tagged
  `// Feature: mission-orchestrator, Property N: ...`, live next to the pure core they
  cover (mirroring `scheduler.test.ts` / `budget.test.ts` / `lifecycle.test.ts`), and pass
  plain fixtures so they need no DB. Route tests mock `@/lib/mongodb` + `@/lib/models` and
  `@clerk/nextjs/server`'s `auth()`; CSS/DOM/glass checks use jsdom component tests.
- Each property test maps to exactly one design Correctness Property: P1 (`selectReadyTasks`
  safety), P2 (`validateTaskGraph`), P3 (Mission FSM), P4 (mission ceilings), P5
  (concurrency cap), P6 (Lead_Agent auto-selection), P7 (`assignByRole`), P8
  (`handoffsForCompletion`), P9 (mission Sub_Agent scope subset), P10 (`canSpawnSubAgent`),
  P11 (propose-never-write), P12 (Mission Timeline), P13 (observability tallies), P14
  (four-control container predicate).
- The build is strictly additive: all new logic lives under `src/lib/agents/mission/` plus
  two new collections; existing `Agent` / `AgentRun` / `Proposal` fields are never altered.
  Every Mission_Task Run goes through the existing `runAgentOnce`; every deliverable
  resolves through the existing `applyProposal`; the existing three-level `canStartRun`
  guard always runs underneath the new Mission_Budget ceiling.
- All new UI surfaces follow the glass recipe in `.kiro/steering/glass-theme.md`. Security
  is non-negotiable: mission containers stay non-root, resource-capped, network-isolated,
  with no host Docker socket in any environment; brain tokens are scoped to the Agent's
  Trust_Scope; BYO keys and tokens are never logged.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.9", "1.15", "1.17"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.5", "1.10", "1.11", "1.12", "1.16", "1.18", "1.19"] },
    { "id": 2, "tasks": ["1.6", "1.7", "1.13", "1.14"] },
    { "id": 3, "tasks": ["1.8"] },
    { "id": 4, "tasks": ["2.1"] },
    { "id": 5, "tasks": ["2.2"] },
    { "id": 6, "tasks": ["3.1", "3.3", "3.4"] },
    { "id": 7, "tasks": ["3.2", "3.5", "3.7"] },
    { "id": 8, "tasks": ["3.6"] },
    { "id": 9, "tasks": ["4.1", "4.3", "4.5", "4.7"] },
    { "id": 10, "tasks": ["4.2", "4.4", "4.6", "4.8"] },
    { "id": 11, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6"] },
    { "id": 12, "tasks": ["5.7"] },
    { "id": 13, "tasks": ["6.1"] }
  ]
}
```
