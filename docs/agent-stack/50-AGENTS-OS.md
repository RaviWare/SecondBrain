# Hermes Agents OS — the multi-agent orchestration layer (SHIPPED)

> **What it is:** the Pro-tier layer that turns the single per-user Hermes agent
> (see [`30-HERMES.md`](./30-HERMES.md)) into a **squad of configurable agents** that
> tend the user's brain — ingesting, synthesizing, connecting, monitoring, filling
> gaps — without ever writing to the vault unattended. Everything an agent wants to
> change is a **Proposal** the user signs off on (the Aegis gate).
>
> Built across 8 phases. Spec: `.kiro/specs/hermes-agents/{requirements,design,tasks}.md`.
> Status: all spec tasks complete; 579 unit/property tests green (59 files); build clean.

## The one invariant: propose-never-write

A runner can **plan** a vault write but can never **perform** one. The read-only
`VaultTools` handed to every runner expose `search` / `query` / `planIngest` /
`fetchSource` / `scan` — there is intentionally **no** `applyIngestPlan` binding. The
only path that mutates the vault is the Aegis choke point `applyProposal`, invoked
under the user's own Clerk auth on an approved/auto-applied Proposal. This holds for
both runner drivers and for spawned sub-agents (Property 1, property-tested).

## User-facing surfaces (`/app/agents/*`)

| Route | What it is |
|---|---|
| `/app/agents` | Squad dashboard — status strip, roster, Aegis queue + activity feed |
| `/app/agents/builder` | Two-pane conversational Agent builder + live preview |
| `/app/agents/board` | Work Board — Queued → Reading → Connecting → ⚑Review → Woven in |
| `/app/agents/skills` | Skills Library — Installed + Discover, scan-gated install |
| `/app/agents/cost` | Cost & Budget — live Run traces, usage by agent/skill, plan allowance |

Every surface follows the glass recipe in `.kiro/steering/glass-theme.md`.

## API routes (Clerk-authed, scoped to the signed-in user)

| Route | Purpose |
|---|---|
| `/api/agents` (GET/POST) | List / create agents |
| `/api/agents/[id]` (GET/PATCH/DELETE) | Get / edit + lifecycle action / retire |
| `/api/agents/[id]/run` (POST) | Manual or dry run; drives post-run reactive chaining |
| `/api/agents/[id]/spawn-sub-agent` (POST) | Bounded sub-agent through the same Aegis gate |
| `/api/agents/dashboard` · `/board` · `/cost` (GET) | Read models for the surfaces |
| `/api/agents/scheduler/tick` (POST) | **Secret-protected** system cron entry point |
| `/api/proposals` · `/api/proposals/[id]` | Aegis queue: approve / refine / dismiss / undo |
| `/api/skills` · `/skills/grant` · `/skills/rescan` | Skills install (scan-gated) / authority grant / re-scan |

The token-authed `/api/agent/*` (external MCP clients) and `/api/agent-instance/*`
(container control plane) are SEPARATE and unchanged — Agents OS is additive.

## Architecture map (pure, testable cores + thin async glue)

The design isolates all decision logic into PURE, total, deterministic functions
(no I/O, no clock, no models) so they are property-testable directly. Routes are
thin glue that fetch rows, call the pure core, and persist.

- **Runner engine** — `runner/types.ts` (the `AgentRunner` contract + read-only
  `VaultTools`), `runner/claude-vault-runner.ts` (default, in-process),
  `runner/hermes-container-runner.ts` (`AGENT_RUNNER=hermes`, delegates to the
  per-user container; read-only-scoped), `runner/index.ts` (`getRunner()` factory),
  `runner/vault-tools.ts` (the read-only binding builder).
- **The run spine** — `run-agent.ts` `runAgentOnce()`: the single audited path all
  triggers funnel through (manual / dry-run / scheduled / reactive). Budget gate →
  AgentRun → runner → persist proposals → budget/trust bookkeeping → carryover.
- **Aegis** — `aegis/classify.ts` (`classifyStakes`), `aegis/apply-proposal.ts`
  (the write choke point + refine / dismiss / undo), `aegis/queue-view.ts`
  (`toQueueItem`, the shared what/why/3-actions anatomy).
- **Trust** — `trust.ts` (`band`, `adjustTrust`), `trust-events.ts` (run-outcome →
  trust events).
- **Safety** — `scanner.ts` (`scanContent`: injection / credential / PII /
  addressed-to-AI), `scope.ts` (`resolveSubScope` + read-only scoped token mint),
  `redact.ts` (the single redaction-guarded log sink — never leaks tokens/keys).
- **Lifecycle + builder** — `lifecycle.ts` (`transition` FSM + `isRunnable`),
  `role-defaults.ts`, `builder.ts` (preview merge + clarifying-question), `dry-run.ts`.
- **Cost & budget** — `budget.ts` (`canStartRun` three-level guard + `budgetBarState`),
  `token-attribution.ts` (`attributeTokens`, conserved by construction).
- **Scheduler** — `scheduler.ts` (`tick`, `dueScheduledAgents`, `matchReactiveAgents`,
  a minimal dependency-free `isCronDue`).
- **Skills** — `skills/catalog.ts` (Discover registry), `skills/security-scan.ts`
  (`scanSkill`), `skills/install.ts` (scan-gated install), `skills/grant.ts`
  (authority grant + `invocableSkillIds` run-time filter), `skills/rescan.ts`
  (periodic re-scan auto-disable → Aegis notice).
- **Sub-agents** — `sub-agent.ts` (`resolveSubAgentScope` ⊆ parent, spawn through Aegis).
- **Dashboard read models** — `dashboard-tally.ts`, `dashboard-feed.ts`,
  `board-view.ts`, `accent.ts` (warm accent reserved for the review state only).

## Data model (additive only — Req 11.8)

New collections in `src/lib/models.ts`: `Agent`, `Proposal`, `AgentRun`,
`InstalledSkill`, `SquadBudget`. Existing models extended additively (e.g. `Log`
gains optional `agentId` + an `'agent'` operation; `Proposal.agentId/runId` are
additively optional so a system-originated queue item — like a re-scan auto-disable
notice — can exist with no run). No existing required field was altered.

## The 22 properties (property-based tests, fast-check)

The design enumerates 22 invariants; each is tested with `fast-check` ({ numRuns:
100 }+). Highlights: propose-never-write (1), stakes classifier totality (2), trust
direction + bounds (3,4), scanner never drops content (5), apply/undo round-trip +
atomicity (6,7), scope subset (8), budget caps + bar + attribution conservation
(9,10,18), lifecycle totality + gated deploy (14), skills scan-gate + disabled-skill
enforcement + re-scan auto-disable (11,12,13), accent reservation (17), secret
redaction (20). Property tests have caught **4 real production bugs** during the
build (two lifecycle/role totality bugs, a scope privilege-escalation, and a
`resolveSubAgentScope` ToPrimitive throw) — all fixed in source, never by weakening
a test.

## Security

- **Scheduler tick** (`/api/agents/scheduler/tick`) executes runs across all users,
  so it is NOT Clerk-authed — it is protected by `SCHEDULER_CRON_SECRET` (fail-safe
  503 when unset, constant-time compare, header-only in production, per-IP rate
  limited). Set the secret + point an external cron at it to enable scheduling.
- **Containers** (when `AGENT_RUNNER=hermes`) stay non-root, resource-capped,
  network-isolated, no host Docker socket — test-pinned across all envs.
- **Secrets** (brain token, BYO LLM key) flow only into container env, never the DB,
  never logs. All agent-layer logging routes through `redact.ts`.
- A `/cso` audit ran against the control plane: no critical/high; two MEDIUM
  hardening items (query-param secret, missing rate limit) found and fixed. Report:
  `.gstack/security-reports/2025-agent-control-plane.json` (local-only).

## What's still deferred (infra / verification, not spec code)

See [`DEFERRED-WORK.md`](./DEFERRED-WORK.md) for the tracked list:
the live `HermesContainerRunner` wire-protocol (`TODO(hermes-live)`) + its scoped
brain-token mint, the always-on scheduler worker + production cron-evaluator,
stakes-scaled auto-apply enablement, source-level undo, a re-run of `/cso` after the
live container path lands, and the owed verification (`npm run test:integration` +
the `/app/agents/cost` visual pass).
