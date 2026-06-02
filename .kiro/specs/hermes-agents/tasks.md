# Implementation Plan: Hermes Agents OS

## Overview

This plan implements Hermes Agents OS as eight strictly-additive, independently
shippable phases, in the composition order dictated by the design's "Phased Build
Note". Everything sits on the **propose-never-write spine**, so that spine
(`planIngest`/`applyIngestPlan` + runner + `Proposal` + `applyProposal` + Aegis
core) is built and reviewed first; no later phase is depended on by an earlier one.

**Each top-level numbered task is one self-contained, reviewable, shippable phase**
that leaves the live app in a working, non-broken state. Every phase ends with a
**checkpoint** that runs `npm run build` + `npm test` (the existing **71 tests**
must stay green and new tests must pass) and confirms `/api/agent/*` and
`/api/agent-instance/*` behavior is unchanged — then STOPS for user review before
the next phase begins.

Conventions used throughout:
- Language: **TypeScript** (matches the existing Next.js codebase). No pseudocode.
- Reuse existing infra — never recreate: `src/lib/vault-ops.ts`,
  `src/lib/agent-service.ts`, `src/lib/agent-provisioner.ts`, `src/lib/agent-auth.ts`,
  `src/lib/skills/catalog.ts`, `src/lib/auto-link.ts` (`wireGraphBatch`),
  `src/lib/claude.ts`, and the `AgentToken` / `UserAgent` models.
- All new data lands in **new** collections or **additive optional** fields only
  (Req 11.8). New UI surfaces MUST follow the glass recipe in
  `.kiro/steering/glass-theme.md` (`sb-dashboard` shell + `dash-panel dash-grain
  dash-interactive` panels; portal overlays use root tokens).
- Security (Req 11.3–11.6, non-negotiable): provisioned containers stay non-root,
  resource-capped, network-isolated, with **no host Docker socket in any
  environment** (dev/test included); never log BYO LLM keys or brain tokens; mint
  brain tokens scoped to the Agent's `trustScope`.
- Tests marked with `*` are optional (property-based / unit / component /
  integration); core implementation subtasks are never optional. Each property
  test uses `fast-check` (v4.8.0, already installed), runs `{ numRuns: 100 }`
  minimum, and is tagged `// Feature: hermes-agents, Property N: <text>`.

## Tasks

- [x] 1. Phase 1 — Propose-never-write Spine (planner split, runner, Proposal, Aegis core)
  - Lands Properties 1, 2, 6, 7, 15, 16. Builds the safety spine everything else
    composes on; ships read-only-to-the-vault except the single `applyProposal`
    write choke point. Existing surfaces remain untouched.

  - [x] 1.1 Refactor `runIngest` into pure `planIngest` + `applyIngestPlan`
    - In `src/lib/vault-ops.ts`, extract the LLM/plan-resolution half of `runIngest`
      into `planIngest(userId, input): Promise<IngestPlan>` (no `Page`/`Source`/
      `Vault`/`Log` writes) and the persistence half into
      `applyIngestPlan(userId, plan, opts?)` (the ONLY ingest write path, calling
      `wireGraphBatch` and writing `Log` with optional `logActor` attribution).
    - Re-express `runIngest` as `const plan = await planIngest(...); return applyIngestPlan(...)`
      keeping its existing signature and `IngestResult` shape **unchanged**.
    - Define the `IngestPlan` type (source, `pageOps`, `entityOps`,
      `expectedGraphSlugs`, `tokensUsed`, `ingestedAt`) per the design.
    - _Requirements: 2.1, 2.6, 2.7, 11.1, 11.2_

  - [x] 1.2 Write characterization test for the `runIngest` refactor
    - Add a test asserting `runIngest` produces output identical to the pre-refactor
      behavior on representative URL and text inputs (page/entity ops, graph stats,
      tokens, `Log`/`Vault` side effects), so the Clerk UI and `/api/agent/ingest`
      are provably unaffected. This gates the non-breaking guarantee and is required.
    - _Requirements: 11.2, 11.1_

  - [x] 1.3 Add `Agent`, `Proposal`, `AgentRun` models + additive `Log`/`UserAgent` extensions
    - In `src/lib/models.ts`, add the `Agent`, `Proposal`, and `AgentRun` collections
      following existing conventions (Mongoose schema, `{ timestamps: true }`,
      hot-reload-safe export, indexed `userId`) with the fields specified in the
      design's Data Models section.
    - Extend `Log` with optional `agentId?` and widen its `operation` enum additively
      (add `'agent'`); add optional `runnerDriver?: 'claude'|'hermes'` to `UserAgent`.
      Do not alter existing required fields.
    - _Requirements: 1.1, 1.9, 1.14, 2.3, 11.8_

  - [x] 1.4 Define the `AgentRunner` driver interface and tool/context types
    - Create `src/lib/agents/runner/types.ts` with `AgentRunner`, `RunContext`,
      `RunOutput`, `RunTrigger`, `DraftProposal`, and the read-only `VaultTools`
      binding (`search`, `query`, `planIngest`, `fetchSource`, `scan`) — note: **no
      `applyIngestPlan`** is exposed to the runner.
    - _Requirements: 2.1, 2.11_

  - [x] 1.5 Implement `ClaudeVaultRunner` and the `getRunner` factory
    - Create `src/lib/agents/runner/claude-vault-runner.ts` implementing `AgentRunner`:
      builds the system prompt from role + assigned skill `promptTemplate`s, calls
      Claude with the read-only `VaultTools`, runs `fetchSource` → (scanner hook) →
      `planIngest`, converts each plan into a `DraftProposal` (plan + rationale +
      citations), accumulates a `RunTrace`, and stops before exceeding
      `ctx.budget.perRunTokens`. It MUST NOT write knowledge to the vault.
    - Create `src/lib/agents/runner/index.ts` exporting `getRunner()` selecting the
      driver from `process.env.AGENT_RUNNER` (default `claude`).
    - _Requirements: 2.1, 2.2, 2.10, 2.11_

  - [x] 1.6 Implement `classifyStakes` and the `band()` helper
    - Create `src/lib/agents/aegis/classify-stakes.ts` with
      `classifyStakes(p, agent): 'low-reversible' | 'sign-off-required'` — total and
      deterministic; returns `sign-off-required` for knowledge-structure writes that
      are not reversible low-stakes actions, for flagged content, and for every
      knowledge-altering proposal when the Agent is in the Watch band.
    - Create `src/lib/agents/trust.ts` with the pure `band(score)` helper
      (80–100 trusted, 40–79 proving, 0–39 watch) needed by the classifier; the full
      `adjustTrust` engine is added in Phase 2 (additive to this file).
    - _Requirements: 2.4, 3.4, 3.5, 4.10, 4.11_

  - [x] 1.7 Implement the Aegis write choke point (`applyProposal` / refine / dismiss / undo)
    - Create `src/lib/agents/aegis/apply-proposal.ts` with `applyProposal`,
      `refineProposal`, `dismissProposal`, `undoProposal`. `applyProposal` is the only
      caller (besides direct `runIngest`) of `applyIngestPlan`: it validates status,
      calls `applyIngestPlan(userId, plan, { logActor })`, on success sets
      `approved` + records `affectedPages` + posts an `Undo_Toast` window if
      reversible, and on failure leaves status non-approved with a `failureReason`
      and **no partial vault mutation**.
    - `refineProposal` records the reply and re-runs the Agent to emit a child
      Proposal; `dismissProposal` sets `dismissed` with no write; `undoProposal`
      reverses a reversible action within its window (auto-applied or approved) and
      reflects the outcome in the Activity_Feed.
    - _Requirements: 2.6, 2.7, 2.8, 2.10, 3.6, 3.7, 3.8, 3.11_

  - [x] 1.8 Build the Proposal queue view-model
    - Create `src/lib/agents/aegis/queue-view.ts` with a pure `toQueueItem(proposal)`
      that exposes the consistent anatomy — what (title), why (rationale + ≥1
      citation for factual proposals), and exactly three decision actions
      (Approve / Refine / Dismiss) — and excludes terminal-status proposals from the
      pending set. Shared by the dashboard rail, Inbox, and Work Board.
    - _Requirements: 3.2, 3.3, 3.11, 8.7_

  - [x] 1.9 Add `/api/agents` and `/api/proposals` routes (Clerk-authed)
    - Create the Next.js route handlers under `src/app/api/agents` (create/list/get
      Agents, trigger a manual/dry-run) and `src/app/api/proposals`
      (list pending, approve → `applyProposal`, refine, dismiss, undo). Reuse Clerk
      auth as the existing `/api/*` UI routes do; never log tokens. Leave existing
      `/api/agent/*` and `/api/agent-instance/*` handlers untouched.
    - _Requirements: 2.6, 3.2, 3.3, 11.2_

  - [x]* 1.10 Write property test for propose-never-write
    - **Property 1: Propose-never-write (the core safety invariant)**
    - **Validates: Requirements 2.2, 2.10, 5.6, 7.8, 8.11**
    - Run `ClaudeVaultRunner` (LLM stubbed with deterministic plan fixtures) against
      an instrumented/spy vault for arbitrary agents and triggers; assert zero
      runner writes and that writes occur only via `applyProposal`.

  - [x]* 1.11 Write property test for the stakes classifier
    - **Property 2: Stakes classifier is total, correct, and trust-monotone**
    - **Validates: Requirements 3.4, 3.5, 4.10, 4.11**
    - Assert totality, the sign-off-required conditions, the Watch-band override, and
      trust-band monotonicity over arbitrary `DraftProposal`/Agent inputs.

  - [x]* 1.12 Write property test for apply-then-undo round-trip
    - **Property 6: Apply-then-undo restores the prior vault state (round-trip)**
    - **Validates: Requirements 3.7, 3.8**
    - Over a spy vault, apply a reversible Proposal then `undoProposal` and assert the
      vault equals its pre-apply state, for both auto-applied and approved actions.

  - [x]* 1.13 Write property test for failed-apply atomicity
    - **Property 7: Failed apply leaves the vault unchanged (atomicity)**
    - **Validates: Requirements 2.8**
    - Inject failures at each `applyIngestPlan` step; assert post-failure vault equals
      pre-apply state and the Proposal is non-approved with a non-empty `failureReason`.

  - [x]* 1.14 Write property test for Proposal well-formedness
    - **Property 15: Every emitted Proposal is well-formed and cites its facts**
    - **Validates: Requirements 2.3, 2.4, 2.5**
    - Assert every emitted Proposal carries a plan/scan reference, rationale,
      `agentId`, `runId`, a valid status enum; factual proposals have ≥1 citation;
      newly emitted sign-off-required proposals are `pending`.

  - [x]* 1.15 Write property test for Aegis Queue anatomy
    - **Property 16: Aegis Queue items have consistent anatomy and resolve cleanly**
    - **Validates: Requirements 3.2, 3.3, 3.11, 8.7**
    - Over arbitrary proposals, assert `toQueueItem` exposes what/why/≥1-citation and
      exactly the three actions, and that terminal-status proposals leave the pending
      queue with their outcome reflected.

  - [x] 1.16 Checkpoint — Phase 1 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npm test`; confirm the existing 71 tests stay green and
      new tests pass, and that `/api/agent/*` and `/api/agent-instance/*` behavior is
      unchanged. STOP for user review before Phase 2.

- [x] 2. Phase 2 — Trust engine + Content Scanner (+ scope subset, scoped tokens, redaction, accent)
  - Lands Properties 3, 4, 5, 8, 17 (status colors), 20. Adds the calibration and
    safety screening that wrap the spine; still no new user-facing surface.

  - [x] 2.1 Implement the trust adjustment engine
    - Add `adjustTrust(score, event): number` and the `TrustEvent` union to
      `src/lib/agents/trust.ts` (finalizing alongside the `band()` from Phase 1):
      positive events never decrease, negative events never increase, scope-violating
      dry-runs never increase, and every result is an integer clamped to `[0,100]`.
    - _Requirements: 3.9, 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.12_

  - [x] 2.2 Wire trust events into the Aegis layer and run outcomes
    - From `applyProposal`/`dismissProposal`/`refineProposal` (Phase 1 files) and the
      `AgentRun` outcome path, emit the appropriate `TrustEvent`s
      (approve-clean, dismiss, heavy-refine, clean/violating dry-run, in-scope run,
      injection-detected) and persist the clamped `Agent.trustScore`. Initialize new
      Agents below 80 (Watch/Proving).
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 2.3 Implement the Content Scanner
    - Create `src/lib/agents/scanner.ts` with the pure, synchronous, deterministic
      `scanContent(text): ScanResult` detecting `injection`, `credential`, `pii`, and
      `addressed-to-ai` patterns; each finding's `passage` is a substring of the input
      with its matched `category`. Clean text returns `status:'clean'`.
    - _Requirements: 5.2, 5.3, 5.8_

  - [x] 2.4 Wire the scanner into the runner read path and hold flagged content
    - In `ClaudeVaultRunner` (the `VaultTools.scan` hook from Phase 1), call
      `scanContent` immediately after `fetchSource` and **before** `planIngest`. A
      `flagged` result short-circuits planning and emits a
      `Proposal(kind='flagged-content', status='pending')` carrying the suspicious
      passages for display; it is never silently ingested or discarded, and it emits an
      `injection-detected` trust event.
    - _Requirements: 5.1, 5.4, 5.5, 5.6, 5.7, 5.9_

  - [x] 2.5 Implement scope-subset resolution and scoped brain-token mint
    - Create `src/lib/agents/scope.ts` with `resolveSubScope(parent, requested)`
      returning a scope that is a subset of the parent (sources/collections ⊆ parent,
      `webAccess ⇒ parent.webAccess`, `perRunTokenBudget ≤ parent`). Add a scoped-token
      mint that derives `AgentToken.scopes` from the Agent's `trustScope` (never
      broader) reusing the existing `AgentToken` model and `agent-auth.ts`.
    - _Requirements: 8.10, 11.6_

  - [x] 2.6 Implement the secret-redaction log helper
    - Create `src/lib/agents/redact.ts` with a redaction function used by all
      agent-layer logging so no brain token or BYO LLM key value can appear as a
      substring of emitted output. Route agent-layer logs through it.
    - _Requirements: 11.4, 11.5_

  - [x] 2.7 Implement the status/column accent mapping
    - Create `src/lib/agents/accent.ts` with pure helpers mapping Agent status
      (`live`/`review`/`idle`/`paused`/`error`) and Work_Board column to whether the
      reserved warm accent applies — accent iff the review/awaiting-sign-off state (or
      the Review column). Consumed by the dashboard (Phase 3) and Work Board (Phase 5).
    - _Requirements: 6.5, 6.6, 6.7, 8.3_

  - [x]* 2.8 Write property test for trust direction
    - **Property 3: Trust adjustment moves in the correct direction**
    - **Validates: Requirements 3.9, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8**

  - [x]* 2.9 Write property test for trust bounds and bands
    - **Property 4: Trust score stays an integer in [0,100] with correct bands**
    - **Validates: Requirements 4.1, 4.2, 4.9, 4.12**

  - [x]* 2.10 Write property test for the content scanner
    - **Property 5: Content scanner flags any detectable pattern and never drops content**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.7, 5.8**

  - [x]* 2.11 Write property test for scope subset
    - **Property 8: Sub-agent and token scope never exceed the parent/agent scope (subset)**
    - **Validates: Requirements 8.10, 11.6**

  - [x]* 2.12 Write property test for accent reservation
    - **Property 17: The warm accent is reserved for the review state only**
    - **Validates: Requirements 6.5, 6.6, 6.7, 8.3**
    - Cover both arbitrary Agent statuses and Work_Board columns via the pure
      `accent.ts` helpers.

  - [x]* 2.13 Write property test for secret redaction
    - **Property 20: Secrets are never present in emitted log output**
    - **Validates: Requirements 11.4**

  - [x] 2.14 Checkpoint — Phase 2 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npm test`; confirm the existing 71 tests stay green plus
      new tests pass, and `/api/agent/*` and `/api/agent-instance/*` behavior is
      unchanged. STOP for user review before Phase 3.

- [x] 3. Phase 3 — Squad Dashboard (read-only air-traffic-control home)
  - Lands Property 19 and the dashboard half of Properties 16/17. Read-only surface;
    user action required only at sign-off points. Glass recipe mandatory.

  - [x] 3.1 Implement dashboard tally functions
    - Create a pure tally module computing the status-strip counts
      (running / scheduled / awaiting-sign-off) and the "today" proof-of-work counts
      (sources ingested / connections made / syntheses proposed) from `Agent`,
      `Proposal`, and today's `Log` rows — real tallies, no fabricated data. Reuse the
      patterns in `src/lib/dashboard-data.ts`.
    - _Requirements: 6.1, 6.2_

  - [x] 3.2 Build the dashboard data API route
    - Add a Clerk-authed handler under `src/app/api/agents` returning the squad roster,
      the Aegis Queue items (via `toQueueItem`), and the Activity_Feed slice for the
      dashboard. Surface pending sign-offs only here and in the Inbox (no push
      notifications).
    - _Requirements: 3.1, 3.10, 6.3, 6.4_

  - [x] 3.3 Build the Squad Dashboard page
    - Create `src/app/app/agents/page.tsx` with the status strip, the today
      proof-of-work line, the squad roster, the right rail (Aegis Queue above the live
      Activity_Feed), and the first-run empty state suggesting a starter Agent matched
      to the user's vault data. Apply the glass recipe: `sb-dashboard` shell +
      `dash-panel dash-grain dash-interactive` panels; any portal overlays use root
      tokens.
    - _Requirements: 6.1, 6.2, 6.4, 6.8, 6.9, 6.10, 11.7_

  - [x] 3.4 Build the Agent card component
    - Create the roster Agent card showing the status indicator (color language via
      `accent.ts`), the Agent_Role, a "now" line, assigned Skill chips, and the
      Trust_Score; apply the warm accent treatment only while awaiting sign-off.
    - _Requirements: 6.3, 6.5, 6.6, 6.7_

  - [x]* 3.5 Write property test for dashboard tallies
    - **Property 19: Dashboard counts equal the true tallies (no fabricated data)**
    - **Validates: Requirements 6.1, 6.2**

  - [x]* 3.6 Write component test for dashboard glass recipe and accent
    - Verify (jsdom) the `sb-dashboard` shell, `dash-panel dash-grain dash-interactive`
      panels, root-token portal overlays, the queue-item anatomy (what/why/three
      actions) and review-accent reservation on cards (dashboard half of Properties
      16/17).
    - _Requirements: 6.10, 11.7, 3.2, 6.6_

  - [x] 3.7 Checkpoint — Phase 3 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npm test`; confirm the existing 71 tests stay green plus
      new tests pass, and `/api/agent/*` and `/api/agent-instance/*` behavior is
      unchanged. STOP for user review before Phase 4.

- [x] 4. Phase 4 — Conversational Builder + lifecycle + dry-run gate
  - Lands Properties 14, 21, 22. Adds Agent creation/edit and the mandatory dry-run
    that writes nothing. Glass recipe mandatory.

  - [x] 4.1 Implement lifecycle transitions and the runnable predicate
    - Create `src/lib/agents/lifecycle.ts` with a total `transition(state, event)`
      across describe → preview → dry-run → deploy → monitor → pause → retire,
      gating the `deploy` transition on `hadSuccessfulDryRun`, supporting retire
      (retain config/history) and reactivate. Add a pure `isRunnable(agent)` predicate
      (false for pause/retire/`budgetPaused`) consumed by the Scheduler in Phase 8.
    - _Requirements: 1.9, 1.10, 1.11, 1.12, 1.13, 7.9, 7.10_

  - [x] 4.2 Implement role defaults and the Trust_Scope_Statement generator
    - Create `src/lib/agents/role-defaults.ts` mapping each Agent_Role
      (Scout/Synthesist/Connector/Critic/Librarian/Researcher/custom) to a well-formed
      default skill set and a conservative default `signOffPolicy` (every
      knowledge-write action = `ask`); generate the plain-language
      `trustScopeStatement` listing granted capabilities plus a non-empty explicit
      "cannot" list.
    - _Requirements: 1.2, 1.3, 1.8_

  - [x] 4.3 Implement preview merge and clarifying-question selection
    - Create `src/lib/agents/builder.ts` with `mergePreview(state, update)` (changes
      only explicitly stated fields, preserves all others) and a clarifying-question
      selector that emits exactly one question when a required field is genuinely
      ambiguous.
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

  - [x] 4.4 Implement dry-run execution
    - Add a dry-run path that runs the Agent once in propose-only mode against real
      vault data via `getRunner()` with `dryRun:true` — routes every effect to the
      Aegis Queue / preview summary, writes nothing, and produces summary counts
      (would-ingest / filtered / would-propose). On clean completion, set
      `hadSuccessfulDryRun` and make the Agent deploy-eligible (does not auto-deploy);
      a scope-violating dry-run grants no positive trust.
    - _Requirements: 7.6, 7.7, 7.8, 7.9, 7.10, 4.4_

  - [x] 4.5 Build the two-pane Agent Builder UI
    - Create `src/app/app/agents/builder/page.tsx` with a conversation pane and a live
      Agent preview pane; the preview updates as the conversation proceeds and every
      config field is directly editable. Reuse the same builder for editing a deployed
      Agent. Apply the glass recipe (shell + `dash-panel dash-grain dash-interactive`;
      portal overlays use root tokens).
    - _Requirements: 7.1, 7.3, 7.5, 7.12, 11.7_

  - [x] 4.6 Wire builder, lifecycle, and dry-run into `/api/agents`
    - Extend the `src/app/api/agents` handlers to create/edit Agents from preview state,
      run a dry-run, deploy (activating per the configured Schedule), and
      retire/reactivate — enforcing the deploy-after-dry-run gate.
    - _Requirements: 7.9, 7.10, 7.11, 1.10, 1.11_

  - [x]* 4.7 Write property test for lifecycle transitions
    - **Property 14: Lifecycle transitions are total, gated, and never schedule a halted agent**
    - **Validates: Requirements 1.9, 1.13, 7.10, 10.7, 1.5**
    - Cover `transition` totality/gating and `isRunnable` (halted agents excluded).

  - [x]* 4.8 Write property test for role defaults and scope statements
    - **Property 21: Role defaults are conservative and scope statements deny by name**
    - **Validates: Requirements 1.3, 1.8**

  - [x]* 4.9 Write property test for builder merge, ambiguity, and dry-run counts
    - **Property 22: Builder preview merge is field-precise; ambiguity asks exactly one question; dry-run counts are accurate**
    - **Validates: Requirements 7.3, 7.4, 7.7**

  - [x]* 4.10 Write component test for the two-pane builder
    - Verify (jsdom) the two-pane layout, editable preview fields, and glass recipe
      conformance (shell + texture stack; portal overlays use root tokens).
    - _Requirements: 7.1, 7.5, 11.7_

  - [x] 4.11 Checkpoint — Phase 4 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npm test`; confirm the existing 71 tests stay green plus
      new tests pass, and `/api/agent/*` and `/api/agent-instance/*` behavior is
      unchanged. STOP for user review before Phase 5.

- [x] 5. Phase 5 — Work Board (knowledge pipeline with the Review = Aegis gate)
  - Reuses Properties 1, 8, 16, 17. Visualizes the pipeline and routes sub-agent work
    through the same Aegis gate. Glass recipe mandatory.

  - [x] 5.1 Build the Work Board page with five columns
    - Create `src/app/app/agents/board/page.tsx` rendering the columns in order
      Queued → Reading → Connecting → Review → Woven in, with the Review column
      treated as the Aegis_Gate and rendered with the warm accent (via `accent.ts`);
      the other four columns carry no accent. Apply the glass recipe.
    - _Requirements: 8.1, 8.2, 8.3, 11.7_

  - [x] 5.2 Implement Review-only drag interactions
    - Enable drag only on Review-column Work_Items (approve/reject via drag); disable
      drag in the Queued, Reading, Connecting, and Woven in columns.
    - _Requirements: 8.4, 8.5_

  - [x] 5.3 Build the Work_Item side sheet
    - Create the side-sheet detail that keeps the board in context, showing a mandatory
      "why" evidence block with citations (reuse `toQueueItem`) and a discussion thread.
    - _Requirements: 8.6, 8.7, 8.8_

  - [x] 5.4 Wire discussion-to-refine and nested sub-agent items
    - On a user reply in a Work_Item thread, call `refineProposal` to produce a revised
      Proposal; render a spawned Sub_Agent's work as a nested Work_Item.
    - _Requirements: 8.8, 8.9_

  - [x] 5.5 Implement bounded sub-agent spawn through the Aegis gate
    - Spawn Sub_Agents whose scope is resolved via `resolveSubScope` (⊆ parent's
      Trust_Scope) and route every Sub_Agent write through the same `applyProposal`
      Aegis gate as the parent.
    - _Requirements: 8.10, 8.11, 8.9_

  - [x]* 5.6 Write component test for board columns, accent, and drag
    - Verify (jsdom) the five-column order, Review-only accent (reuse Property 17 via
      `accent.ts`), drag restricted to Review, the side-sheet "why" block + three
      actions (Property 16 reuse), and glass recipe conformance.
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.6, 8.7, 11.7_

  - [x]* 5.7 Extend the propose-never-write and scope-subset properties to sub-agents
    - **Property 1: Propose-never-write (the core safety invariant)** — extend to
      sub-agent runs (zero writes; writes only via `applyProposal`).
    - **Property 8: Sub-agent and token scope never exceed the parent/agent scope** —
      extend to spawned sub-agents.
    - **Validates: Requirements 8.10, 8.11**

  - [x] 5.8 Checkpoint — Phase 5 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npm test`; confirm the existing 71 tests stay green plus
      new tests pass, and `/api/agent/*` and `/api/agent-instance/*` behavior is
      unchanged. STOP for user review before Phase 6.

- [x] 6. Phase 6 — Skills Library (blocking scans, capability vs authority grants)
  - Lands Properties 11, 12, 13. Glass recipe mandatory.

  - [x] 6.1 Extend `SkillDef` in the catalog additively
    - In `src/lib/skills/catalog.ts`, add `version`, `touches`
      (`vault-read|vault-write|network|credentials|nothing`), and `scanned`
      (`{ status, lastScannedAt }`) to `SkillDef` without altering existing fields;
      keep `catalog.ts` as the curated Discover registry.
    - _Requirements: 9.1, 9.2_

  - [x] 6.2 Add the `InstalledSkill` model
    - In `src/lib/models.ts`, add the `InstalledSkill` collection (per-user install
      state: `skillId`, `installedVersion`, `enabled`, `scanStatus`, `scanReasons`,
      `lastScannedAt`, `autoDisabledByScan`), unique on `userId`+`skillId`. Additive only.
    - _Requirements: 9.5, 9.6, 9.8, 9.11, 11.8_

  - [x] 6.3 Implement `scanSkill` (Security_Scan)
    - Create `src/lib/skills/security-scan.ts` with `scanSkill(def): SkillScanResult`
      returning `failed` iff injection, credential access, or exfiltration is present,
      or the declared `touches` does not match observed behavior (including
      `touches: nothing` with network/credential access).
    - _Requirements: 9.3, 9.9_

  - [x] 6.4 Implement the install flow with the scan gate (Capability_Grant)
    - On install, run `scanSkill`; if it fails, block installation and add nothing to
      the runtime; on pass, create the `InstalledSkill` Capability_Grant (existence +
      read-only metadata visibility) without granting any Agent authority.
    - _Requirements: 9.3, 9.4, 9.5, 9.6_

  - [x] 6.5 Implement Authority_Grant (assign skill to Agent)
    - Assign an installed, enabled Skill to an Agent (`Agent.assignedSkillIds`),
      permitting use within the Agent's Trust_Scope; block the grant if the Skill is
      disabled, and ensure disabled skills are never invoked during a Run.
    - _Requirements: 9.7, 9.8, 9.12_

  - [x] 6.6 Implement periodic re-scan with auto-disable
    - Add a periodic re-scan that runs `scanSkill` on installed Skills; on failure set
      `enabled=false` (`autoDisabledByScan`) and surface a corresponding item to the
      Aegis Queue.
    - _Requirements: 9.10, 9.11_

  - [x] 6.7 Build the Skills Library UI
    - Create `src/app/app/agents/skills/page.tsx` with Installed and Discover tabs and
      Skill cards showing what the Skill does, capability category, the `touches:`
      blast-radius line, and the scanned-status badge. Apply the glass recipe.
    - _Requirements: 9.1, 9.2, 11.7_

  - [x] 6.8 Add `/api/skills` routes
    - Extend `src/app/api/skills` with install (scan-gated), re-scan, and grant
      handlers (Clerk-authed). Reuse the catalog rather than a parallel registry.
    - _Requirements: 9.3, 9.4, 9.7, 9.10, 11.1_

  - [x]* 6.9 Write property test for disabled-skill enforcement
    - **Property 11: A disabled skill is never grantable and never invokable**
    - **Validates: Requirements 9.8, 9.12**

  - [x]* 6.10 Write property test for the security-scan install gate
    - **Property 12: Security scan gates installation and grants no authority**
    - **Validates: Requirements 9.3, 9.4, 9.5, 9.6, 9.9**

  - [x]* 6.11 Write property test for re-scan auto-disable
    - **Property 13: A failing re-scan auto-disables the skill and surfaces it**
    - **Validates: Requirements 9.11**

  - [x] 6.12 Checkpoint — Phase 6 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npm test`; confirm the existing 71 tests stay green plus
      new tests pass, and `/api/agent/*` and `/api/agent-instance/*` behavior is
      unchanged. STOP for user review before Phase 7.

- [x] 7. Phase 7 — Cost & Budget (three-level caps with teeth)
  - Lands Properties 9, 10, 18. Glass recipe mandatory.

  - [x] 7.1 Add the `SquadBudget` model and budget fields
    - In `src/lib/models.ts`, add a dedicated `SquadBudget`
      (`userId`, `monthlyTokenCap`, `tokensThisPeriod`, `periodStart`) so `UserPlan`
      stays untouched; ensure `Agent.budget` (per-Agent cap) and
      `AgentRun.perRunBudget` are populated. Additive only.
    - _Requirements: 10.4, 11.8_

  - [x] 7.2 Implement `canStartRun` and `budgetBarState`
    - Create `src/lib/agents/budget.ts` with the pure `canStartRun(b)` (returns
      `allowed=false` when Budget_Paused, per-Agent cap reached, or Squad cap reached;
      the returned `effective` per-Run budget never exceeds the smallest remaining cap)
      and `budgetBarState(used, cap)` (`ok` < 80%, `amber` in [80%,100%), `over` ≥ cap).
    - _Requirements: 10.4, 10.6, 10.7, 10.8, 10.9, 10.10_

  - [x] 7.3 Implement token attribution aggregation
    - Create an aggregation that breaks down token consumption by Agent and by Skill
      from `AgentRun.trace`, conserving the grand total (no loss/double-count), and
      exposes the plan allowance vs amount consumed this period.
    - _Requirements: 10.2, 10.3_

  - [x] 7.4 Enforce budget-paused / squad-cap and run carryover
    - Gate run starts with `canStartRun`; when an Agent reaches its per-Agent cap set
      `budgetPaused=true` and surface to the Aegis Queue; when the Squad cap is reached
      stop starting new Runs for all Agents; on any termination report it, retain the
      `Run_Trace`, and carry unfinished work to the next Run.
    - _Requirements: 10.5, 10.6, 10.7, 10.8, 10.11_

  - [x] 7.5 Build the Cost & Budget UI
    - Create `src/app/app/agents/cost/page.tsx` with the live Run_Trace (skills
      invoked, tokens consumed, per-Run Budget bar with ok/amber/over treatment), the
      usage breakdown by Agent and Skill, and the plan allowance vs consumed view.
      Apply the glass recipe.
    - _Requirements: 10.1, 10.2, 10.3, 10.9, 10.10, 11.7_

  - [x]* 7.6 Write property test for run-start budget enforcement
    - **Property 9: A run never starts that would exceed any budget cap**
    - **Validates: Requirements 10.4, 10.6, 10.7, 10.8**

  - [x]* 7.7 Write property test for the budget bar state
    - **Property 10: Per-run budget bar state is a total function of usage**
    - **Validates: Requirements 10.9, 10.10**

  - [x]* 7.8 Write property test for token attribution conservation
    - **Property 18: Token attribution is conserved**
    - **Validates: Requirements 10.2**

  - [x] 7.9 Checkpoint — Phase 7 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npm test`; confirm the existing 71 tests stay green plus
      new tests pass, and `/api/agent/*` and `/api/agent-instance/*` behavior is
      unchanged. STOP for user review before Phase 8.

- [x] 8. Phase 8 — Scheduler hardening + (later) Hermes container runner
  - Wires triggers to the interim cron endpoint and post-run chaining. The container
    runner is implemented behind the same Proposal interface and is marked LATER.

  - [x] 8.1 Implement `Scheduler.tick()` and trigger matching
    - Create `src/lib/agents/scheduler.ts` with a pure `tick()` that finds Agents whose
      cron is due AND are runnable (`isRunnable` from Phase 4 — not paused/retired/
      budget-paused) and matches reactive Agents to emitted domain events
      (`agent.run.completed`, `proposal.approved`, `vault.page.created`), chaining a
      reactive Run only after the source Agent's Run reaches a terminal state.
    - _Requirements: 1.4, 1.5, 1.6, 1.13_

  - [x] 8.2 Add the protected scheduler tick route and post-run chaining
    - Create `src/app/api/agents/scheduler/tick/route.ts` protected for an external
      cron caller, invoking `Scheduler.tick()`; also invoke `tick()` opportunistically
      after any Run completes to drive reactive chaining. No blocking in-process timer.
    - _Requirements: 1.4, 1.6, 7.11_

  - [x]* 8.3 Write tests for scheduler matching and chaining
    - Verify scheduled-due selection, reactive event chaining after terminal state, and
      that paused/retired/budget-paused Agents are excluded (reuses Property 14's
      `isRunnable`/matching logic).
    - _Requirements: 1.4, 1.5, 1.6, 1.13_

  - [x] 8.4 (LATER / OPTIONAL) Implement the `HermesContainerRunner` driver
    - Create `src/lib/agents/runner/hermes-container-runner.ts` implementing
      `AgentRunner` behind the same interface: delegate the run into the user's
      sandboxed Hermes container via `/api/agent/*` and collect emitted Proposals back,
      so the downstream Aegis path is identical. Reuse `agent-provisioner.ts` /
      `agent-service.ts`; keep containers non-root, resource-capped, network-isolated,
      with no host Docker socket in any environment; never log keys/tokens; the BYO key
      stays only in the container env. Selected via `AGENT_RUNNER=hermes`.
    - _Requirements: 2.11, 11.3, 11.4, 11.5_

  - [x]* 8.5 (LATER / OPTIONAL) Write the container security and driver-parity tests
    - Static/smoke-assert the provisioner `HostConfig` keeps `CapDrop:['ALL']`,
      `no-new-privileges`, and no socket mount in all envs; assert both runner drivers
      emit `Proposal[]` through the identical Aegis path.
    - _Requirements: 11.3, 2.11_

  - [x] 8.6 Checkpoint — Phase 8 review gate
    - Ensure all tests pass, ask the user if questions arise.
    - Run `npm run build` and `npm test`; confirm the existing 71 tests stay green plus
      new tests pass, and `/api/agent/*` and `/api/agent-instance/*` behavior is
      unchanged. STOP for user review.

## Notes

- Tasks marked with `*` are optional (property-based, unit, component, and
  integration tests) and can be skipped for a faster MVP; core implementation
  subtasks are never optional. Task 1.2 (the characterization test) is intentionally
  **not** optional because it is the safety guarantee for the non-breaking refactor.
- Each top-level task is one phase: self-contained, independently reviewable, and
  leaves the live app non-broken. The build order follows the design's composition
  order — the propose-never-write spine first; no phase depends on a later phase.
- Every phase ends with a checkpoint that runs `npm run build` + `npm test`,
  confirms the existing 71 tests stay green, and confirms `/api/agent/*` and
  `/api/agent-instance/*` behavior is unchanged — then STOPS for user review.
- Property tests use `fast-check` (v4.8.0), run `{ numRuns: 100 }` minimum, are
  tagged `// Feature: hermes-agents, Property N: ...`, and live in the phase that
  lands each property per the design's phase→property mapping. CSS/DOM/glass checks
  use jsdom component tests.
- All new UI surfaces follow the glass recipe in `.kiro/steering/glass-theme.md`.
  All existing infra (`vault-ops`, `agent-service`, `agent-provisioner`,
  `agent-auth`, `catalog.ts`, `AgentToken`, `UserAgent`) is reused, never recreated.
- Security is non-negotiable: containers stay non-root, resource-capped,
  network-isolated, with no host Docker socket in any environment; brain tokens are
  scoped to the Agent's Trust_Scope; BYO keys and tokens are never logged.
- **Deferred work is tracked in `docs/agent-stack/DEFERRED-WORK.md`.** ALL spec tasks
  across all 8 phases are now complete — including 8.4 (`HermesContainerRunner` driver,
  selected by `AGENT_RUNNER=hermes`, default unchanged) and 8.5 (its container-security +
  driver-parity tests). Verified: full unit/property suite green (569 tests / 58 files) +
  build clean. The remaining deferred items are infra-dependent or verification, NOT spec
  code: the live container wire-protocol round-trip (`TODO(hermes-live)` in the driver) +
  its scoped-token mint, the production scheduler worker + cron-evaluator swap, security
  follow-ups (`/cso` before exposing the control plane), and owed verification (Cost page
  screenshot review + `npm run test:integration`). See that file for each item's location,
  rationale, and completion path.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.2", "1.5", "1.6", "1.8"] },
    { "id": 2, "tasks": ["1.7"] },
    { "id": 3, "tasks": ["1.9", "1.10", "1.11", "1.12", "1.13", "1.14", "1.15"] },
    { "id": 4, "tasks": ["2.1", "2.3", "2.5", "2.6", "2.7"] },
    { "id": 5, "tasks": ["2.2", "2.4"] },
    { "id": 6, "tasks": ["2.8", "2.9", "2.10", "2.11", "2.12", "2.13"] },
    { "id": 7, "tasks": ["3.1", "3.4"] },
    { "id": 8, "tasks": ["3.2", "3.3"] },
    { "id": 9, "tasks": ["3.5", "3.6"] },
    { "id": 10, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 11, "tasks": ["4.4", "4.5", "4.6"] },
    { "id": 12, "tasks": ["4.7", "4.8", "4.9", "4.10"] },
    { "id": 13, "tasks": ["5.1", "5.3", "5.5"] },
    { "id": 14, "tasks": ["5.2", "5.4"] },
    { "id": 15, "tasks": ["5.6", "5.7"] },
    { "id": 16, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 17, "tasks": ["6.4", "6.7"] },
    { "id": 18, "tasks": ["6.5", "6.6", "6.8"] },
    { "id": 19, "tasks": ["6.9", "6.10", "6.11"] },
    { "id": 20, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 21, "tasks": ["7.4", "7.5"] },
    { "id": 22, "tasks": ["7.6", "7.7", "7.8"] },
    { "id": 23, "tasks": ["8.1", "8.4"] },
    { "id": 24, "tasks": ["8.2", "8.3", "8.5"] }
  ]
}
```
