# Requirements Document

## Introduction

Hermes Agents OS is the Pro-tier orchestration layer for SecondBrain Cloud. It turns the existing single-agent plumbing (token-authed `/api/agent/*`, `vault-ops`, the control plane, and the 5-skill catalog) into a multi-agent system that tends the user's knowledge vault: ingesting, synthesizing, connecting, monitoring, and filling gaps — autonomously, on a schedule or in reaction to events.

The spine of the system is the **Aegis Gate**: agents are *proposers, not editors*. Nothing an Agent does that alters or exits the brain happens without the user's sign-off. The run engine executes an Agent against real vault data using `vault-ops` as tools but emits **Proposals** instead of performing writes; approving a Proposal performs the actual write. This "propose-never-write" model is baked in from the start.

Around that spine sit the supporting capabilities: per-Agent Trust Scores that calibrate autonomy from a real track record, a Content Scanner that screens untrusted source material before it can enter the brain, a Squad Dashboard ("air traffic control" home), a conversational Agent Builder with mandatory dry-run, a Work Board that visualizes the knowledge pipeline, a Skills Library with blocking security scans and two-step (capability + authority) grants, and a Cost & Budget system that treats spend as a trust dimension.

The build is strictly **additive**. It reuses `AgentToken`, `UserAgent`, `agent-service.ts`, `agent-provisioner.ts`, and `vault-ops.ts`, and introduces new models (Proposal, AgentRun, Report, Suggestion, plus extensions to UserAgent and Skill) without breaking any existing surface. The current execution model runs Agents via Claude + the vault as tools now, with Hermes containers behind the same UI later. This document captures the **full feature vision**; phasing of the build happens in `tasks.md`.

All new Agent surfaces follow the glass theme (`.kiro/steering/glass-theme.md`), and all security constraints from `AGENTS.md` (non-root, resource-capped, network-isolated containers; never log BYO keys or brain tokens) are non-negotiable.

## Glossary

- **Hermes_Agents_OS**: The orchestration layer (squad, work board, activity feed, lifecycle, trust, budget) built on top of the existing brain and agent API.
- **Agent**: A configured worker that acts on the user's vault. Defined by five config fields (role, schedule, skills, sign-off policy, trust scope) plus identity (name) and lifecycle state. An Agent proposes; it never writes directly.
- **Agent_Role**: An Agent's archetype that shapes its default behavior and suggested skills. One of Scout, Synthesist, Connector, Critic, Librarian, Researcher, or a user-defined custom role.
- **Schedule**: When an Agent runs. Either Scheduled (time-based cron expression) or Reactive (triggered by an event such as another Agent's output or a vault change).
- **Reactive_Trigger**: An event-based Schedule that fires an Agent when a named event occurs, enabling Agent chaining (one Agent's output triggers another).
- **Skill**: A versioned, installable capability an Agent can be assigned. Defined by what it does, the vault Tools it may call, its declared capability category, and its blast-radius ("touches:") declaration. Lives in the Skill catalog/registry.
- **Tool**: A vault operation an Agent invokes during a Run, mapped to the existing `vault-ops` functions (search, query, ingest). Ingest-class Tools never write directly under Hermes_Agents_OS; they produce Proposals.
- **Run**: A single execution of an Agent against real vault data. Produces a trace, zero or more Proposals, a token/cost record, and an outcome that feeds the Trust Score. Recorded as an AgentRun.
- **Dry_Run**: A Run executed in propose-only mode before deployment so the user can preview the Agent's judgment. A Dry_Run writes nothing; every effect routes to the Aegis Queue or a preview summary.
- **Proposal**: A proposed change an Agent emits instead of writing. Carries what is proposed, why (rationale), evidence (citations), the concrete proposed change, and a status (pending, approved, refined, dismissed, auto-applied). Approving a Proposal performs the actual write (creates a node, draws graph edges).
- **Aegis_Gate**: The unified sign-off mechanism. The single point through which every Proposal that alters or exits the brain must pass before a write occurs. Enforces "propose-never-write."
- **Aegis_Queue**: The one unified queue (dashboard rail + Inbox) where Proposals requiring sign-off land, each with the consistent anatomy: what · why · your decision (Approve / Refine / Dismiss).
- **Sign_Off_Policy**: Per-Agent, per-action-type configuration declaring whether an action auto-applies or requires the user's sign-off. Conservative by default (ask-first for writes to knowledge structure).
- **Stakes_Scaling**: The rule that reversible low-stakes actions auto-apply with an Undo affordance, while writes to knowledge structure and Flagged Content require explicit sign-off.
- **Undo_Toast**: A transient, time-bounded affordance posted when a low-stakes action auto-applies, letting the user reverse it within a defined window.
- **Trust_Score**: A per-Agent integer from 0 to 100 representing an earned track record (not a user setting). Drives the Agent's default Sign_Off_Policy. Bands: Trusted (80–100), Proving (40–79), Watch (0–39).
- **Trust_Band**: The named range a Trust_Score falls into (Trusted, Proving, Watch).
- **Trust_Scope**: An Agent's least-privilege permission set: which Sources/Collections it may read, whether it has Web Access, and its token Budget per Run. Tight by default and stated in plain language with an explicit "cannot" list.
- **Content_Scanner**: The module that screens every source an Agent reads before it can become a node, detecting embedded instructions, credential/PII patterns, and text addressed to "the AI." Produces Scan Results.
- **Flagged_Content**: Source material the Content_Scanner has marked suspicious. Held for review with the suspicious passage shown; never ingested silently and never blocked silently.
- **Injection_Attempt**: Detected embedded instructions in scanned content intended to redirect the Agent's behavior (e.g., "ignore your task...").
- **Squad**: The collection of a user's Agents, viewed together on the Squad Dashboard.
- **Squad_Dashboard**: The mostly read-only "air traffic control" home showing the status strip, squad roster, and the right rail (Aegis Queue plus live feed).
- **Work_Board**: The visualization of the knowledge pipeline as columns: Queued → Reading → Connecting → Review → Woven in.
- **Work_Item**: A unit of Agent work that moves across the Work_Board columns, with a detail side sheet, a mandatory "why" evidence block, and a discussion thread.
- **Sub_Agent**: A bounded, nested worker an Agent spawns for a focused sub-task. Inherits and never exceeds the parent Agent's Trust_Scope; its writes still pass the Aegis_Gate.
- **Activity_Feed**: The unified, ambient timeline of Agent events (check-ins, completions, contradictions, @mentions) extending the existing Activity Log.
- **Inbox**: The "what needs me" surface. Only @mentions and sign-off-required items push to the Inbox; ambient feed events do not.
- **Skills_Library**: The UI for browsing, installing, and managing Skills, with two tabs: Installed (gstack runtime) and Discover (GBrain registry).
- **Security_Scan**: The blocking check run when installing or re-scanning a Skill, verifying no injection, no credential access, no exfiltration, and that declared capabilities match behavior.
- **Capability_Grant**: Installing a Skill into the user's gstack runtime. Grants the Skill's existence but NOT authority to any Agent.
- **Authority_Grant**: Assigning an installed Skill to a specific Agent, granting that Agent the right to use it within its Trust_Scope. Separate from Capability_Grant.
- **Budget**: A spending cap measured in tokens (and/or cost). Exists at three levels: per-Run, per-Agent (weekly/monthly), and Squad-level (master monthly cap).
- **Budget_Paused**: The state an Agent enters when it reaches its per-Agent Budget; it stops running and surfaces to the Aegis Queue until the user raises the cap or the period resets.
- **Run_Trace**: The live, machine-register record of a Run showing skills invoked, tokens consumed, and the per-Run Budget bar; preserved as part of the run history.
- **Trust_Scope_Statement**: The plain-language permission statement for an Agent, including the explicit "cannot" list.
- **System** / **Hermes**: The Hermes_Agents_OS application logic, used as the SHALL subject where no more specific component applies.

## Requirements

### Requirement 1: Agent Model & Roles

**User Story:** As a Pro user, I want to define agents with a clear role, schedule, skills, sign-off policy, and least-privilege scope, so that each agent does a well-understood job within boundaries I control.

#### Acceptance Criteria

1. THE System SHALL represent each Agent with a name, an Agent_Role, a Schedule, a set of assigned Skills, a Sign_Off_Policy, a Trust_Scope, a Trust_Score, and a lifecycle state.
2. WHEN a user creates an Agent, THE System SHALL require the Agent_Role to be one of Scout, Synthesist, Connector, Critic, Librarian, Researcher, or a user-defined custom role.
3. WHEN a user assigns an Agent_Role, THE System SHALL set role-appropriate default Skills and a default Sign_Off_Policy for that role.
4. WHERE an Agent's Schedule is Scheduled, THE System SHALL store a time-based cron expression and execute the Agent at the times that expression specifies.
5. WHERE an Agent's Schedule is Reactive, THE System SHALL store a Reactive_Trigger and execute the Agent when the named event occurs.
6. WHEN a Reactive_Trigger references the output of another Agent, THE System SHALL execute the triggered Agent after the source Agent completes its Run.
7. THE System SHALL store each Agent's Trust_Scope as the set of readable Sources or Collections, a Web Access flag, and a per-Run token Budget.
8. THE System SHALL generate a Trust_Scope_Statement for each Agent in plain language that includes an explicit "cannot" list.
9. WHEN an Agent is created, THE System SHALL set its lifecycle state to the first defined stage and support transitions through the stages describe, preview, dry-run, deploy, monitor, pause, and retire.
10. WHEN a user retires an Agent, THE System SHALL set the Agent's lifecycle state to retired, retain the Agent's configuration and history, and exclude the Agent from scheduled and reactive execution.
11. WHEN a user reactivates a retired Agent, THE System SHALL restore the Agent to a runnable lifecycle state with its prior configuration and history intact.
12. THE System SHALL NOT permanently delete an Agent's history as a result of retiring the Agent.
13. WHILE an Agent is in the paused or retired lifecycle state, THE System SHALL NOT start a scheduled or reactive Run for that Agent.
14. THE System SHALL reuse the existing UserAgent record and AgentToken model to back Agent identity and vault access rather than introducing a parallel credential store.

### Requirement 2: Propose-Never-Write Runner & Proposals

**User Story:** As a user, I want agents to propose changes with full evidence instead of writing to my brain directly, so that I stay in control of everything that enters or changes my knowledge.

#### Acceptance Criteria

1. WHEN an Agent executes a Run, THE System SHALL invoke vault Tools (search, query, ingest-class operations) through the existing `vault-ops` functions.
2. WHEN a Run would alter or add knowledge in the vault, THE System SHALL emit a Proposal instead of performing the write.
3. THE System SHALL record each Proposal with the proposed change, a rationale, supporting evidence as citations, the originating Agent, the originating Run, and a status.
4. THE System SHALL set every newly emitted Proposal that requires sign-off to a pending status.
5. THE System SHALL include at least one citation in the evidence of every Proposal that asserts a fact derived from vault or web content.
6. WHEN a user approves a Proposal, THE System SHALL perform the proposed write through `vault-ops`, including creating any new node and drawing the corresponding knowledge-graph edges.
7. WHEN a Proposal is approved and the write succeeds, THE System SHALL set the Proposal status to approved and record the resulting affected pages.
8. IF the write performed on approval fails, THEN THE System SHALL retain the Proposal in a non-approved state and record the failure reason without partially altering the vault.
9. WHEN a user dismisses a Proposal, THE System SHALL set the Proposal status to dismissed, perform no write, and record the dismissal as negative feedback for the originating Agent.
10. THE System SHALL NOT perform any vault write originating from an Agent Run except as the direct result of an approved Proposal or an auto-applied low-stakes action permitted by Stakes_Scaling.
11. THE System SHALL run the propose-never-write runner against the same vault data and operations regardless of whether the Agent executes via the Claude+vault runner or a Hermes container.

### Requirement 3: Aegis Sign-Off Queue

**User Story:** As a user, I want one consistent queue for every approval, so that I can review what an agent wants to do, understand why, and decide without hunting across the app.

#### Acceptance Criteria

1. THE System SHALL present a single Aegis_Queue surfaced in both the Squad_Dashboard right rail and the Inbox.
2. THE System SHALL display every item in the Aegis_Queue with a consistent anatomy comprising what is proposed, why (evidence), and the user's decision controls.
3. THE System SHALL offer exactly three decision actions on each Aegis_Queue item: Approve, Refine, and Dismiss.
4. WHERE a proposed action is reversible and classified low-stakes by Stakes_Scaling, THE System SHALL auto-apply the action and post an Undo_Toast rather than placing it in the Aegis_Queue, even when the low-stakes reversible action is a knowledge write.
5. WHERE a proposed action writes to knowledge structure and is not a reversible low-stakes action, or involves Flagged_Content, THE System SHALL require explicit sign-off through the Aegis_Queue before any write occurs.
6. WHEN a user selects Refine on a Proposal, THE System SHALL record the user's reply to the originating Agent and cause the Agent to produce a revised Proposal.
7. WHEN a user posts an Undo action from an Undo_Toast within the undo window, THE System SHALL reverse the action and restore the prior vault state, whether the action was auto-applied or manually approved.
8. WHEN a user approves a reversible action through the Aegis_Queue, THE System SHALL post an Undo_Toast for that action within the undo window.
9. WHEN a user approves or dismisses an Aegis_Queue item, THE System SHALL record the decision as Trust_Score input for the originating Agent.
10. THE System SHALL NOT generate push notifications for Aegis_Queue items and SHALL surface pending sign-offs only through the dashboard rail and Inbox.
11. WHEN an Aegis_Queue item is resolved, THE System SHALL remove it from the pending queue and reflect its outcome in the Activity_Feed.

### Requirement 4: Per-Agent Trust Score

**User Story:** As a user, I want each agent to earn a trust score from its actual track record, so that more reliable agents get more autonomy and unreliable ones are held back automatically.

#### Acceptance Criteria

1. THE System SHALL maintain a Trust_Score for each Agent as an integer between 0 and 100 inclusive.
2. WHEN a new Agent is created, THE System SHALL initialize its Trust_Score to a value within the Watch or Proving band rather than the Trusted band.
3. WHEN a Proposal from an Agent is approved without refinement, THE System SHALL increase that Agent's Trust_Score.
4. WHEN an Agent completes a Dry_Run with no Flagged_Content and no scope violation, THE System SHALL increase that Agent's Trust_Score. IF the Dry_Run involved any scope violation, THEN THE System SHALL NOT increase the Trust_Score for that Dry_Run.
5. WHEN an Agent operates within its Trust_Scope across a Run, THE System SHALL treat the in-scope behavior as positive Trust_Score input.
6. WHEN a Proposal from an Agent is dismissed or heavily refined, THE System SHALL decrease that Agent's Trust_Score.
7. WHEN an Agent attempts to act outside its Trust_Scope, THE System SHALL decrease that Agent's Trust_Score and record a scope-boundary event.
8. WHEN the Content_Scanner detects an Injection_Attempt in content an Agent read, THE System SHALL decrease that Agent's Trust_Score.
9. THE System SHALL classify an Agent with a Trust_Score from 80 to 100 as Trusted, from 40 to 79 as Proving, and from 0 to 39 as Watch.
10. WHILE an Agent's Trust_Score is in the Trusted band, THE System SHALL permit a greater proportion of its configured actions to auto-apply under Stakes_Scaling.
11. WHILE an Agent's Trust_Score is in the Watch band, THE System SHALL force every knowledge-altering action by that Agent to require sign-off regardless of its configured Sign_Off_Policy.
12. THE System SHALL constrain every Trust_Score adjustment so the resulting value remains between 0 and 100 inclusive.

### Requirement 5: Content Scanner

**User Story:** As a user, I want every source an agent reads to be screened for hidden instructions and sensitive data before it can enter my brain, so that untrusted web content cannot poison or manipulate my knowledge.

#### Acceptance Criteria

1. WHEN an Agent reads a source during a Run, THE Content_Scanner SHALL scan that source before the Agent acts on its content, regardless of whether the source is destined to become a vault node.
2. THE Content_Scanner SHALL detect embedded instructions addressed to an AI, including text instructing the Agent to ignore or override its task.
3. THE Content_Scanner SHALL detect credential patterns and personally identifiable information patterns within scanned content.
4. WHEN the Content_Scanner detects a suspicious pattern, THE System SHALL classify the source as Flagged_Content and hold it for review.
5. WHEN content is held as Flagged_Content, THE System SHALL display the specific suspicious passage to the user in the review surface.
6. THE System SHALL NOT ingest Flagged_Content into the vault until the user explicitly approves it through the Aegis_Queue.
7. THE System SHALL NOT silently discard Flagged_Content and SHALL record every Flagged_Content event for review.
8. WHEN the Content_Scanner completes a scan with no suspicious pattern, THE System SHALL allow the source to proceed to Proposal generation.
9. THE Content_Scanner SHALL execute within the ingest path so that the scan occurs before any vault write is proposed.

### Requirement 6: Squad Dashboard

**User Story:** As a user, I want a calm air-traffic-control home that shows what my agents are doing and what needs me, so that I can supervise the squad at a glance and only act when required.

#### Acceptance Criteria

1. THE Squad_Dashboard SHALL display a status strip showing the count of running Agents, the count of scheduled Agents, and the count of items awaiting the user's sign-off.
2. THE Squad_Dashboard SHALL display a "today" proof-of-work line with real counts of sources ingested, connections made, and syntheses proposed, derived from the Activity Log.
3. THE Squad_Dashboard SHALL display a squad roster of Agent cards, each showing a status indicator, the Agent_Role, a "now" line describing current activity, assigned Skill chips, and the Trust_Score.
4. THE Squad_Dashboard SHALL display a right rail containing the Aegis_Queue above a live Activity_Feed.
5. THE System SHALL render Agent status using the color language live=green, review=accent (the single reserved accent use), idle=grey, paused=disabled, and error=red.
6. THE Squad_Dashboard SHALL reserve the warm accent color for the review/awaiting-sign-off state and SHALL NOT apply the warm accent to live, idle, paused, or error states.
7. WHILE an Agent is awaiting the user's sign-off, THE System SHALL mark that Agent's card with the warm accent treatment.
8. WHERE the user has no Agents, THE Squad_Dashboard SHALL display a first-run empty state that suggests a starter Agent matched to the user's existing vault data.
9. THE Squad_Dashboard SHALL present a read-only view of Agent activity and SHALL require user action only at sign-off points.
10. THE Squad_Dashboard SHALL follow the glass theme recipe defined in `.kiro/steering/glass-theme.md` for its shell, panels, and overlays.

### Requirement 7: Conversational Agent Builder

**User Story:** As a user, I want to describe an agent in plain language and watch a live preview fill in, then dry-run it before deploying, so that I can create capable agents without forms and confirm their judgment before granting autonomy.

#### Acceptance Criteria

1. THE Agent Builder SHALL present a two-pane layout with a conversation pane and a live Agent preview pane.
2. WHEN the user describes an Agent in plain language, THE System SHALL parse the intent and populate the Agent preview's role, schedule, skills, sign-off policy, and trust scope fields from the description.
3. WHILE the user continues the conversation, THE System SHALL update the live Agent preview to reflect newly stated details.
4. WHERE the user's description is genuinely ambiguous on a required field, THE System SHALL ask exactly one clarifying question for that field.
5. THE System SHALL allow the user to edit every Agent config field directly in the preview in addition to setting it through conversation.
6. WHEN the user requests a Dry_Run, THE System SHALL execute the Agent once in propose-only mode against the user's real vault data.
7. WHEN a Dry_Run completes, THE System SHALL display a summary of what the Agent would have done, including counts such as sources it would ingest, sources it filtered, and connections it would propose.
8. THE System SHALL NOT write to the vault during a Dry_Run and SHALL route every Dry_Run effect to the Aegis_Queue or the preview summary.
9. WHEN a Dry_Run completes successfully, THE System SHALL make the Agent eligible to transition to the deploy lifecycle state but SHALL NOT deploy the Agent automatically.
10. THE System SHALL require at least one successful Dry_Run before an Agent can transition to the deploy lifecycle state.
11. WHEN the user deploys an Agent, THE System SHALL activate the Agent according to its configured Schedule.
12. WHEN a user edits a deployed Agent, THE System SHALL reuse the same two-pane builder for the edit.

### Requirement 8: Work Board

**User Story:** As a user, I want to see the knowledge pipeline as a board with a clear review gate, so that I can watch agents move work toward my brain and approve or reject items with full evidence.

#### Acceptance Criteria

1. THE Work_Board SHALL display five columns in the order Queued, Reading, Connecting, Review, and Woven in.
2. THE System SHALL place every Work_Item requiring sign-off in the Review column and SHALL treat the Review column as the Aegis_Gate.
3. THE System SHALL render the Review column with the warm accent and SHALL render the other four columns without the warm accent.
4. THE System SHALL allow drag interactions only on Review-column Work_Items, supporting approve and reject via drag.
5. THE System SHALL NOT allow the user to drag Work_Items in the Queued, Reading, Connecting, or Woven in columns.
6. WHEN the user opens a Work_Item, THE System SHALL present its detail as a side sheet that keeps the board in context.
7. THE System SHALL display a mandatory "why" evidence block with citations on every Work_Item detail.
8. THE System SHALL provide a discussion thread on each Work_Item, and WHEN the user replies in the thread, THE System SHALL cause the originating Agent to refine its Proposal.
9. WHEN an Agent spawns a Sub_Agent, THE System SHALL display the Sub_Agent's work as a nested Work_Item.
10. THE System SHALL constrain every Sub_Agent to its parent Agent's Trust_Scope and SHALL NOT grant a Sub_Agent any access beyond the parent's Trust_Scope.
11. THE System SHALL route every Sub_Agent write through the same Aegis_Gate as its parent.

### Requirement 9: Skills Library

**User Story:** As a user, I want to browse and install skills with a visible security scan and a separate step to grant authority to an agent, so that capabilities are vetted and least-privilege is enforced.

#### Acceptance Criteria

1. THE Skills_Library SHALL present two tabs: Installed (the user's gstack runtime) and Discover (the GBrain registry).
2. THE System SHALL display each Skill card with what the Skill does, its capability category, a "touches:" blast-radius line, and a scanned-status badge.
3. WHEN a user installs a Skill, THE System SHALL run a Security_Scan that verifies no injection, no credential access, no exfiltration, and that the Skill's declared capabilities match its behavior.
4. IF a Security_Scan fails any check, THEN THE System SHALL block the installation and SHALL NOT add the Skill to the user's runtime.
5. WHEN a Security_Scan passes, THE System SHALL complete the Capability_Grant by adding the Skill to the user's gstack runtime.
6. THE System SHALL treat a Capability_Grant as granting the Skill's existence plus read-only visibility of the Skill's metadata to Agents, and SHALL NOT grant any Agent authority to invoke the Skill as a result of installation.
7. WHEN a user assigns an installed and enabled Skill to an Agent, THE System SHALL perform an Authority_Grant that permits that Agent to use the Skill within the Agent's Trust_Scope.
8. IF a Skill is currently disabled, THEN THE System SHALL block any Authority_Grant of that Skill to an Agent.
9. WHERE a Skill declares "touches: nothing" but exhibits network or credential access during a Security_Scan, THE System SHALL flag the mismatch and fail the scan.
10. THE System SHALL periodically re-scan installed Skills with a Security_Scan.
11. IF a periodic re-scan fails for an installed Skill, THEN THE System SHALL auto-disable that Skill and surface the failure to the Aegis_Queue.
12. WHILE a Skill is disabled, THE System SHALL NOT allow any Agent to invoke that Skill.

### Requirement 10: Cost & Budget

**User Story:** As a user, I want agent cost to be always visible and bounded by budgets with teeth, so that autonomous work never spends more than I allow.

#### Acceptance Criteria

1. WHILE a Run is executing, THE System SHALL display a live Run_Trace showing the skills invoked, the tokens consumed, and a per-Run Budget bar.
2. THE System SHALL provide a usage view that breaks down token consumption by Agent and by Skill using real attribution from Run_Traces.
3. THE System SHALL display the user's plan token allowance and the amount consumed in the current period in the usage view.
4. THE System SHALL support a per-Run Budget cap, a per-Agent weekly or monthly Budget cap, and a Squad-level master Budget cap.
5. WHEN a Run terminates for any reason, including reaching its per-Run Budget cap, an error, or a timeout, THE System SHALL report the termination and carry the unfinished work to the Agent's next Run, allowing in-progress reporting and work carryover to complete even if the Run does not halt instantaneously.
6. WHEN an Agent reaches its per-Agent Budget cap, THE System SHALL set the Agent to Budget_Paused and surface the state to the Aegis_Queue.
7. WHILE an Agent is Budget_Paused, THE System SHALL NOT start a new Run for that Agent until the user raises the cap or the Budget period resets.
8. WHEN the Squad-level master Budget cap is reached, THE System SHALL stop starting new Runs for all Agents until the user raises the cap or the period resets.
9. WHEN the per-Run token consumption exceeds 80 percent of the per-Run Budget cap, THE System SHALL render the per-Run Budget bar in the amber warning treatment.
10. WHEN the per-Run token consumption reaches the per-Run Budget cap, THE System SHALL render the per-Run Budget bar in the over-budget (red) treatment.
11. THE System SHALL retain each Run_Trace as part of the run history, including for failed or stopped Runs, so the Run remains inspectable after completion.

### Requirement 11: Non-Breaking Integration & Security

**User Story:** As the product owner, I want the agent layer to reuse existing infrastructure, keep containers sandboxed, and never leak secrets, so that adding agents does not break the live app or weaken security.

#### Acceptance Criteria

1. THE System SHALL reuse the existing AgentToken model, UserAgent model, `agent-service.ts` control plane, `agent-provisioner.ts`, and `vault-ops.ts` operations rather than creating parallel implementations.
2. THE System SHALL preserve the behavior of the existing `/api/agent/*` and `/api/agent-instance/*` endpoints so that current single-agent functionality continues to work.
3. WHERE the System provisions an agent container, THE System SHALL run the container as a non-root user, with resource caps, network isolation, and no access to the host Docker socket, in every environment including development and testing.
4. THE System SHALL NOT write BYO LLM API keys or brain tokens to any log.
5. THE System SHALL NOT persist a BYO LLM API key outside the container environment into which it is injected at start.
6. WHEN the System mints a brain token for an Agent, THE System SHALL scope the token to the Agent's Trust_Scope.
7. THE System SHALL apply the glass theme recipe from `.kiro/steering/glass-theme.md` to every new Agent surface, including portal-rendered overlays using root-level tokens.
8. THE System SHALL store new Agent-layer data in new models (Proposal, AgentRun, Report, Suggestion) and extensions to existing models without altering the existing fields that current features depend on.
9. WHILE the System surfaces security posture detail (tool-call audit and injection log), THE System SHALL place that detail one level in from the Squad_Dashboard rather than on the home view.
```
