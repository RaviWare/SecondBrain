# Requirements Document

## Introduction

The Mission Orchestrator is the multi-agent objective layer for SecondBrain's Hermes Agents OS. It answers one promise — **"One ask. The squad runs."** The user states a single high-level objective (for example, "get our product to $1M ARR"), and a designated lead Agent decomposes that objective into a dependency-ordered task graph, assigns each task to the best-fit Agent in the user's squad, lets Agents hand findings to one another, and drives the squad to produce many deliverables autonomously. The user supervises a task-by-task, agent-by-agent timeline and only acts at sign-off points.

This feature is built strictly **on top of** the existing Hermes Agents OS spine and inherits its invariants without exception:

- **Propose-never-write (Aegis Gate).** Agents are structurally incapable of writing to the vault. Every Run emits Proposals to the Aegis Queue; the user approves, refines, or dismisses. The Mission Orchestrator introduces **no new unattended write path**. Every deliverable a mission produces flows through the existing `applyProposal` choke point under the user's own authentication.
- **Three-level token Budgets.** The existing per-Run, per-Agent, and Squad-wide token caps in `budget.ts` (`canStartRun`) remain authoritative. A Mission adds its **own** hard token/cost ceiling on top, and a Mission stops when any applicable ceiling is reached.
- **Sub-agent scope ⊆ parent.** Any Agent spawned for a mission task carries a Trust_Scope that is a subset of its assigner's, resolved through the audited `resolveSubScope` (`sub-agent.ts`). A mission never widens scope.
- **Reactive chaining with loop guards.** The Mission Orchestrator builds on the existing scheduler (`matchReactiveAgents`, terminal gate, self-trigger guard) and preserves its loop-prevention guards.
- **Sandboxed runtimes; never log secrets.** Container execution stays non-root, resource-capped, and network-isolated, and BYO LLM keys and brain tokens are never logged (`AGENTS.md`).
- **No dummy data.** Every mission timeline, progress count, cost figure, and contribution metric reflects real Run, Proposal, and Mission_Task records, never placeholders.

The build is **additive**. It introduces a new Mission model and Mission_Task records and reuses the existing Agent, AgentRun, and Proposal collections without altering the fields current features depend on. The single safety departure from "agents run freely" is deliberate and mandatory: an autonomous plan never executes unbounded — the decomposed plan is a reviewable, approvable checkpoint before any task runs.

All new mission surfaces follow the glass theme (`.kiro/steering/glass-theme.md`), and all security constraints from `AGENTS.md` are non-negotiable.

## Glossary

- **Mission_Orchestrator**: The objective layer that turns one user objective into a planned, executed, supervised multi-agent effort built on Hermes Agents OS.
- **Mission**: A single user-stated objective and its lifecycle, plan, execution, deliverables, cost, and limits. Persisted as a new Mission record. A Mission owns exactly one Task_Graph.
- **Objective**: The plain-language goal the user states when creating a Mission (for example, "get our product to $1M ARR"), optionally accompanied by user-supplied context.
- **Lead_Agent**: The Agent designated for a Mission that decomposes the Objective into a Task_Graph and assigns each Mission_Task to a squad Agent. Selected by the user or auto-selected by the System.
- **Squad**: The collection of the user's existing Hermes Agents available to be assigned Mission_Tasks.
- **Task_Graph**: The dependency-ordered set of Mission_Tasks the Lead_Agent produces from the Objective. A directed acyclic graph (no circular dependencies).
- **Mission_Task**: One unit of work within a Task_Graph, persisted as a Mission_Task record. Carries its description, its assigned Agent, its dependencies on other Mission_Tasks, its status, and its produced output reference.
- **Task_Dependency**: A directed edge stating that one Mission_Task requires the completed output of another Mission_Task before it may start.
- **Assignment**: The mapping of a Mission_Task to the best-fit squad Agent by role fit, produced by the Lead_Agent during planning.
- **Mission_Plan**: The proposed Task_Graph plus its Assignments, presented to the user for review before any execution.
- **Plan_Approval**: The mandatory user decision to approve, edit, or reject a Mission_Plan. Execution cannot begin until the Mission_Plan is approved.
- **Handoff**: The act of one Mission_Task's produced output being supplied as input to a dependent Mission_Task assigned to another Agent.
- **Mention**: An annotation in which one Agent references or comments on another Agent's work; surfaced in the Activity_Feed.
- **Mission_Timeline**: The task-by-task, agent-by-agent chronological view of a Mission from its start (T+0) onward, derived only from real Run, Proposal, and Mission_Task records.
- **Deliverable**: A concrete artifact a Mission produces, represented as a Proposal in the Aegis_Queue. A Deliverable is realized in the vault only when the user approves its Proposal.
- **Aegis_Gate**: The existing single sign-off mechanism through which every Proposal that alters or exits the vault must pass before a write occurs.
- **Aegis_Queue**: The existing unified queue where Proposals requiring sign-off land for the user's Approve / Refine / Dismiss decision.
- **applyProposal**: The existing single write choke point that performs a proposed vault write on approval under the user's authentication.
- **Trust_Scope**: An Agent's least-privilege permission set (readable Sources/Collections, Web Access flag, per-Run token Budget). A spawned mission Agent's Trust_Scope is a subset of its assigner's.
- **Mission_Budget**: A Mission's own hard ceiling on total tokens and/or cost, enforced in addition to the existing per-Run, per-Agent, and Squad Budgets.
- **Concurrency_Limit**: The maximum number of Mission_Tasks a Mission may have running simultaneously.
- **Graph_Limit**: The maximum permitted depth and total size (task count) of a Mission's Task_Graph.
- **Wall_Clock_Limit**: The maximum permitted elapsed real-time duration of a running Mission.
- **Kill_Switch**: The user control that pauses or aborts a running Mission across all its Agents.
- **Mission_Lifecycle**: The set of Mission states — planning, awaiting-plan-approval, running, paused, completed, failed, aborted — and the permitted transitions among them.
- **Run**: A single execution of an Agent against real vault data, recorded as an AgentRun, producing a trace, zero or more Proposals, and a token/cost record.
- **Sub_Agent**: A bounded, nested worker an Agent spawns for a focused sub-task within a Mission_Task; its Trust_Scope never exceeds its parent's, and its writes still pass the Aegis_Gate.
- **Activity_Feed**: The existing unified ambient timeline of Agent events, extended to surface mission Handoffs and Mentions.
- **System** / **Mission_Orchestrator**: The Mission Orchestrator application logic, used as the SHALL subject where no more specific component applies.

## Requirements

### Requirement 1: Mission Creation

**User Story:** As a Pro user, I want to state one high-level objective and have a lead agent take it from there, so that I can mobilize my whole squad with a single ask.

#### Acceptance Criteria

1. WHEN a user creates a Mission with an Objective, THE Mission_Orchestrator SHALL create a Mission record storing the Objective text, the owning user, the creation time, and an initial lifecycle state of planning.
2. WHERE the user supplies optional context with the Objective, THE Mission_Orchestrator SHALL store the supplied context on the Mission record and make the context available to the Lead_Agent during planning.
3. WHEN a user creates a Mission and selects a Lead_Agent, THE Mission_Orchestrator SHALL record the selected Agent as the Mission's Lead_Agent.
4. WHEN a user creates a Mission without selecting a Lead_Agent, THE Mission_Orchestrator SHALL auto-select a Lead_Agent from the user's Squad by role fit and record the selected Agent as the Mission's Lead_Agent.
5. IF the user has no Agent eligible to act as a Lead_Agent, THEN THE Mission_Orchestrator SHALL reject the Mission creation, SHALL NOT create any Mission record, and return a message stating that an eligible Lead_Agent is required.
6. IF the Objective text is empty, THEN THE Mission_Orchestrator SHALL reject the Mission creation and return a validation message.
7. THE Mission_Orchestrator SHALL associate every Mission record with the creating user so that a Mission is visible only to its owner.
8. THE Mission_Orchestrator SHALL perform Lead_Agent auto-selection independently of the Objective validation and the Lead_Agent eligibility validation, so that auto-selection proceeds even when another Mission creation validation rejects the Mission.

### Requirement 2: Objective Decomposition into a Task Graph

**User Story:** As a user, I want the lead agent to break my objective into a clear set of dependent tasks assigned to the right agents, so that the work is organized before anyone starts.

#### Acceptance Criteria

1. WHEN a Mission enters planning, THE Lead_Agent SHALL decompose the Objective into a Task_Graph of one or more Mission_Tasks.
2. THE Mission_Orchestrator SHALL record each Mission_Task with a description, its assigned Agent, its set of Task_Dependencies on other Mission_Tasks, a status, and a reference to its produced output.
3. THE Lead_Agent SHALL assign each Mission_Task to a Squad Agent selected by role fit between the Mission_Task and the Agent's Agent_Role.
4. WHERE no Squad Agent fits a Mission_Task by role, THE Mission_Orchestrator SHALL assign the Mission_Task to the Lead_Agent and record the assignment as a fallback.
5. THE Mission_Orchestrator SHALL represent the Task_Graph as a directed acyclic graph in which each Task_Dependency points from a dependent Mission_Task to the Mission_Task whose output it requires.
6. WHEN the Lead_Agent produces a Task_Graph, THE Mission_Orchestrator SHALL validate the Task_Graph only for circular dependencies before presenting it for review, and SHALL allow other non-DAG structures such as disconnected components to pass validation.
7. IF the produced Task_Graph contains a circular dependency, THEN THE Mission_Orchestrator SHALL reject the Task_Graph, record the rejection reason, and set the Mission lifecycle state to failed.
8. WHEN decomposition completes, THE Mission_Orchestrator SHALL set the Mission lifecycle state to awaiting-plan-approval only if no circular dependency was detected at any point in the Mission lifecycle.

### Requirement 3: Mandatory Plan Approval Checkpoint

**User Story:** As a user, I want to review and approve the plan before any agent runs, so that an autonomous mission never executes unbounded without my consent.

#### Acceptance Criteria

1. WHILE a Mission is in the awaiting-plan-approval state, THE Mission_Orchestrator SHALL NOT start any Mission_Task Run.
2. WHEN a Mission reaches awaiting-plan-approval, THE Mission_Orchestrator SHALL present the Mission_Plan showing every Mission_Task, its assigned Agent, and its Task_Dependencies for the user's review.
3. THE Mission_Orchestrator SHALL offer the user the actions Approve, Edit, and Reject on the Mission_Plan.
4. WHEN the user grants an explicit Plan_Approval on the Mission_Plan, THE Mission_Orchestrator SHALL set the Mission lifecycle state to running and begin execution according to the Task_Graph, and SHALL perform no transition to running in the absence of an explicit Plan_Approval.
5. WHEN the user edits the Mission_Plan, THE Mission_Orchestrator SHALL apply the user's changes and re-validate that the Task_Graph remains acyclic, and IF the edited Task_Graph is cyclic, THEN THE Mission_Orchestrator SHALL prevent the transition to running and keep the Mission in awaiting-plan-approval until the Task_Graph is acyclic and the user approves.
6. WHEN the user rejects the Mission_Plan, THE Mission_Orchestrator SHALL set the Mission lifecycle state to aborted and start no Mission_Task Run.
7. THE Mission_Orchestrator SHALL require an explicit Plan_Approval before the Mission lifecycle state transitions from awaiting-plan-approval to running.

### Requirement 4: Execution and Orchestration

**User Story:** As a user, I want tasks to run in dependency order with one agent's output feeding the next, so that the squad makes coordinated progress on my objective.

#### Acceptance Criteria

1. WHILE a Mission is running, THE Mission_Orchestrator SHALL start a Mission_Task only after every Mission_Task it depends on has reached a completed status.
2. WHEN a Mission_Task's dependencies are all completed, THE Mission_Orchestrator SHALL execute the Mission_Task as a Run of its assigned Agent through the existing single Run path.
3. WHEN a Mission_Task that another Mission_Task depends on completes, THE Mission_Orchestrator SHALL supply the completed Mission_Task's produced output as input to the dependent Mission_Task as a Handoff.
4. THE Mission_Orchestrator SHALL record each Mission_Task's produced output as a reference to the originating Run and its emitted Proposals.
5. IF a Mission_Task's Run fails, THEN THE Mission_Orchestrator SHALL mark that Mission_Task failed and continue executing every other Mission_Task that does not depend on the failed Mission_Task.
6. IF a Mission_Task is blocked because a Mission_Task it depends on failed, THEN THE Mission_Orchestrator SHALL mark the blocked Mission_Task blocked and SHALL NOT start its Run.
7. WHEN every Mission_Task in the Task_Graph has reached a terminal status of completed, failed, or blocked, THE Mission_Orchestrator SHALL evaluate the Mission for completion under Requirement 9.
8. THE Mission_Orchestrator SHALL execute each Mission_Task Run through the existing propose-never-write Run path so that a Mission_Task Run emits Proposals and performs no direct vault write.
9. WHERE a dependent Mission_Task received no Handoff input from a completed dependency, THE Mission_Orchestrator SHALL allow the dependent Mission_Task to reach a completed status.

### Requirement 5: Mission Safety Limits

**User Story:** As a user, I want hard limits on how large, how parallel, how expensive, and how long a mission can run, plus a kill switch, so that autonomy can never run away with my resources.

#### Acceptance Criteria

1. THE Mission_Orchestrator SHALL enforce a Graph_Limit on the maximum depth and the maximum total Mission_Task count of a Task_Graph.
2. IF a produced Task_Graph exceeds the Graph_Limit on depth or task count, THEN THE Mission_Orchestrator SHALL reject the Task_Graph, record the limit that was exceeded, and set the Mission lifecycle state to failed before any Mission_Task Run starts.
3. THE Mission_Orchestrator SHALL enforce a Concurrency_Limit on the maximum number of Mission_Tasks running simultaneously within a Mission.
4. WHILE the number of running Mission_Tasks in a Mission equals the Concurrency_Limit, THE Mission_Orchestrator SHALL defer starting additional ready Mission_Tasks until a running Mission_Task reaches a terminal status.
5. THE Mission_Orchestrator SHALL enforce a Mission_Budget as a hard ceiling on the Mission's total tokens and cost, in addition to the existing per-Run, per-Agent, and Squad Budgets.
6. WHEN a Mission's accumulated token or cost usage reaches the Mission_Budget, THE Mission_Orchestrator SHALL stop starting new Mission_Task Runs, set the Mission lifecycle state to aborted, and record that the Mission_Budget ceiling was reached together with the specific limit type that was exceeded, identifying whether the token ceiling or the cost ceiling was reached.
7. THE Mission_Orchestrator SHALL evaluate the existing three-level Budget guard before starting each Mission_Task Run and SHALL NOT start a Mission_Task Run that the existing Budget guard refuses.
8. THE Mission_Orchestrator SHALL enforce a Wall_Clock_Limit on the maximum elapsed duration of a running Mission.
9. WHEN a running Mission's elapsed duration reaches the Wall_Clock_Limit, THE Mission_Orchestrator SHALL stop starting new Mission_Task Runs and set the Mission lifecycle state to aborted.
10. THE Mission_Orchestrator SHALL provide a Kill_Switch that lets the user pause or abort a running Mission.
11. WHEN the user activates the Kill_Switch to pause a Mission, THE Mission_Orchestrator SHALL set the Mission lifecycle state to paused and SHALL NOT start new Mission_Task Runs while paused.
12. WHEN the user activates the Kill_Switch to abort a Mission, THE Mission_Orchestrator SHALL set the Mission lifecycle state to aborted and SHALL NOT start new Mission_Task Runs.
13. WHEN a Mission stops starting new Mission_Task Runs because a safety limit was reached, THE Mission_Orchestrator SHALL allow already-running Mission_Task Runs to report their in-progress state and carry over unfinished work, consistent with the existing Run termination behavior.

### Requirement 6: Loop and Runaway Prevention

**User Story:** As a user, I want missions to be structurally unable to spawn agents forever or build circular plans, so that the orchestrator cannot create an unstoppable loop.

#### Acceptance Criteria

1. THE Mission_Orchestrator SHALL reject any Task_Graph that contains a circular Task_Dependency.
2. THE Mission_Orchestrator SHALL bound Sub_Agent spawning within a Mission so that the nesting depth of spawned Sub_Agents does not exceed the Graph_Limit depth.
3. IF starting a Mission_Task or spawning a Sub_Agent would actually exceed the Graph_Limit depth, THEN THE Mission_Orchestrator SHALL refuse to start that Mission_Task or spawn that Sub_Agent and record the refusal, and WHERE the start or spawn request remains within the Graph_Limit depth, THE Mission_Orchestrator SHALL NOT refuse the request on the basis of the depth limit.
4. THE Mission_Orchestrator SHALL preserve the existing scheduler self-trigger guard so that an Agent is never chained to run off its own Run completion within a Mission.
5. THE Mission_Orchestrator SHALL preserve the existing scheduler terminal gate so that a reactive Handoff within a Mission is blocked until the source Mission_Task Run reaches a terminal state, and SHALL chain the reactive Handoff only after the source Mission_Task Run has reached a terminal state.
6. THE Mission_Orchestrator SHALL ensure each Mission_Task is executed at most once per successful completion within a single Mission run so that completed Mission_Tasks are not re-executed in a loop.

### Requirement 7: Inter-Agent Handoffs and Mentions

**User Story:** As a user, I want agents to reference and annotate each other's work, so that the squad collaborates visibly rather than working in isolation.

#### Acceptance Criteria

1. WHEN a Mission_Task receives a Handoff from a completed dependency, THE Mission_Orchestrator SHALL record the Handoff with the source Mission_Task, the receiving Mission_Task, and the handed-off output reference.
2. WHEN an Agent references another Agent's work during a Mission_Task Run, THE Mission_Orchestrator SHALL record the reference as a Mention identifying the referencing Agent and the referenced work.
3. WHEN a Handoff is recorded, THE Mission_Orchestrator SHALL surface the Handoff as an event in the Activity_Feed.
4. WHEN a Mention is recorded, THE Mission_Orchestrator SHALL surface the Mention as an event in the Activity_Feed.
5. THE Mission_Orchestrator SHALL attribute every Handoff and Mention to its originating Agent and Mission_Task using real Run records.

### Requirement 8: Mission Timeline

**User Story:** As a user, I want a task-by-task, agent-by-agent timeline of the mission, so that I can watch progress unfold and understand who did what when.

#### Acceptance Criteria

1. THE Mission_Orchestrator SHALL present a Mission_Timeline ordered chronologically from the Mission's start at T+0 through its most recent event.
2. THE Mission_Timeline SHALL display each Mission_Task with its assigned Agent, its status, and the time of each status transition, derived from real Mission_Task and Run records.
3. THE Mission_Timeline SHALL display each recorded Handoff and Mention in chronological position relative to the Mission_Tasks.
4. WHERE a Mission has started no Mission_Task Run, THE Mission_Timeline SHALL display an honest empty state rather than placeholder activity, regardless of any other display setting.
5. THE Mission_Orchestrator SHALL derive every Mission_Timeline entry from real Run, Proposal, and Mission_Task records and SHALL NOT display dummy or simulated activity.
6. WHEN a Mission_Task changes status, THE Mission_Orchestrator SHALL update the Mission_Timeline to reflect the new status.

### Requirement 9: Mission Lifecycle and State Transitions

**User Story:** As a user, I want a mission to move through clear, well-defined states, so that I always know whether it is planning, waiting for me, running, paused, or finished.

#### Acceptance Criteria

1. THE Mission_Orchestrator SHALL represent each Mission's lifecycle state as exactly one of planning, awaiting-plan-approval, running, paused, completed, failed, or aborted.
2. WHEN a Mission is created, THE Mission_Orchestrator SHALL set its lifecycle state to planning.
3. WHEN decomposition completes with an acyclic Task_Graph within the Graph_Limit, THE Mission_Orchestrator SHALL transition the Mission from planning to awaiting-plan-approval.
4. WHEN the user approves the Mission_Plan, THE Mission_Orchestrator SHALL transition the Mission from awaiting-plan-approval to running.
5. WHEN the user pauses a running Mission, THE Mission_Orchestrator SHALL transition the Mission from running to paused.
6. WHEN the user resumes a paused Mission, THE Mission_Orchestrator SHALL transition the Mission from paused to running and resume starting ready Mission_Task Runs.
7. WHEN every Mission_Task has reached a terminal status and at least one Mission_Task completed, THE Mission_Orchestrator SHALL transition the Mission to completed.
8. IF planning fails because the Task_Graph is circular or exceeds the Graph_Limit, THEN THE Mission_Orchestrator SHALL transition the Mission to failed.
9. WHEN the user aborts a Mission or a safety ceiling forces an abort, THE Mission_Orchestrator SHALL transition the Mission to aborted.
10. THE Mission_Orchestrator SHALL reject any lifecycle transition that is not among the permitted transitions and SHALL leave the Mission in its current state when a transition is rejected.
11. WHILE a Mission is in a terminal state of completed, failed, or aborted, THE Mission_Orchestrator SHALL NOT start any new Mission_Task Run for that Mission.

### Requirement 10: Sign-Off Preserved Through the Aegis Gate

**User Story:** As a user, I want every mission deliverable to still require my approval, so that a mission never writes to my brain unattended.

#### Acceptance Criteria

1. WHEN a Mission_Task Run would alter or add knowledge in the vault, THE Mission_Orchestrator SHALL emit a Proposal to the Aegis_Queue instead of performing the write.
2. THE Mission_Orchestrator SHALL realize a Deliverable in the vault only as the direct result of the user approving its Proposal through the existing applyProposal choke point.
3. THE Mission_Orchestrator SHALL NOT introduce any vault write path for mission work other than the existing applyProposal choke point under the user's own authentication.
4. WHEN a Mission completes with unapproved Proposals, THE Mission_Orchestrator SHALL retain those Proposals in the Aegis_Queue for the user's decision. (Resolved intent: unapproved Proposals are retained, not discarded, because retaining preserves the user's sign-off authority and is the safe behavior.)
5. THE Mission_Orchestrator SHALL constrain every Sub_Agent spawned for a Mission_Task to a Trust_Scope that is a subset of its assigning Agent's Trust_Scope, resolved through the existing scope resolver, and SHALL NOT widen a Sub_Agent's Trust_Scope.
6. THE Mission_Orchestrator SHALL route every Sub_Agent write through the same Aegis_Gate as its parent Agent.

### Requirement 11: Mission Observability

**User Story:** As a user, I want honest per-mission cost, per-agent contribution, and status, so that I can judge whether the mission is worth continuing.

#### Acceptance Criteria

1. THE Mission_Orchestrator SHALL display each Mission's current lifecycle state and the count of its Mission_Tasks in each status.
2. THE Mission_Orchestrator SHALL display each Mission's accumulated token consumption and cost attributed from the real Run records of its Mission_Tasks.
3. THE Mission_Orchestrator SHALL display per-Agent contribution for a Mission as the count of Mission_Tasks each Agent completed and the tokens each Agent consumed, derived from real Run records.
4. THE Mission_Orchestrator SHALL display the Mission's accumulated usage against its Mission_Budget ceiling.
5. WHERE a Mission has consumed zero tokens, THE Mission_Orchestrator SHALL display an honest zero state rather than a fabricated value.
6. THE Mission_Orchestrator SHALL derive every observability metric from real Run, Proposal, and Mission_Task records and SHALL NOT fabricate non-zero data, and WHERE a metric has a true value of zero, THE Mission_Orchestrator MAY present an honest zero-state placeholder for that metric.

### Requirement 12: Additive Persistence and Non-Breaking Integration

**User Story:** As the product owner, I want the mission layer to add new models without disturbing existing collections, so that adding missions does not break the live agent system.

#### Acceptance Criteria

1. THE Mission_Orchestrator SHALL store mission data in a new Mission model and Mission_Task records.
2. THE Mission_Orchestrator SHALL reference existing Agent, AgentRun, and Proposal records from Mission and Mission_Task records by identifier rather than duplicating their data. (Resolved intent: reference-by-identifier is the required additive design; duplicating existing record data is not permitted.)
3. THE Mission_Orchestrator SHALL NOT alter or remove existing fields on the Agent, AgentRun, or Proposal collections that current features depend on.
4. THE Mission_Orchestrator SHALL execute every Mission_Task Run through the existing single Run path so that scheduled, reactive, manual, and mission Runs share one audited code path.
5. THE Mission_Orchestrator SHALL associate every Mission and Mission_Task record with the owning user so that mission data is scoped per user.
6. WHERE the Mission_Orchestrator provisions or executes Agent work in a container, THE Mission_Orchestrator SHALL run the container as a non-root user, with resource caps, network isolation, and no access to the host Docker socket.
7. IF the container provisioning system cannot enforce the non-root user control, the resource caps, the network isolation control, and the no-host-Docker-socket control simultaneously, THEN THE Mission_Orchestrator SHALL fail the entire Mission and SHALL NOT execute Agent work under a partial set of these security controls.
8. THE Mission_Orchestrator SHALL NOT write BYO LLM API keys or brain tokens to any log.
9. WHEN the Mission_Orchestrator mints a brain token for a mission Agent, THE Mission_Orchestrator SHALL scope the token to that Agent's Trust_Scope.
10. THE Mission_Orchestrator SHALL apply the glass theme recipe from `.kiro/steering/glass-theme.md` to every new mission surface, including portal-rendered overlays using root-level tokens.
