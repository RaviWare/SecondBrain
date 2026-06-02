# Hermes Agents OS — Deferred Work Tracker

> Honest register of everything intentionally left for later during the 8-phase
> Hermes Agents OS build. Nothing here is a bug or a regression — each item is a
> conscious scope decision that keeps the shipped slice correct, additive, and
> non-breaking. The live app works without any of these.
>
> Source of truth for "what's left." When you pick one up, implement it, verify
> (`npm run build` + `npx vitest run`), and delete its entry (or mark it done with
> the date + commit).
>
> Spec: `.kiro/specs/hermes-agents/{requirements,design,tasks}.md`.
> Last updated: after tasks 8.4 + 8.5 landed (the `HermesContainerRunner` driver and its
> security/parity tests). Full suite **569 tests / 58 files green**, build clean. A real
> totality bug in `resolveSubAgentScope` (caught by a property test during this work) was
> fixed in production. The ONLY remaining deferred items are infra-dependent (live container
> wire-protocol, scheduler worker) or owed verification — see below.

---

## 1. Spec tasks explicitly marked LATER / OPTIONAL

### 1.1 — `HermesContainerRunner` driver (tasks.md 8.4)  ·  STATUS: ✅ DONE (driver + wiring shipped; live wire-protocol still deferred)
- **What shipped:** `src/lib/agents/runner/hermes-container-runner.ts` — a fail-closed,
  write-free `AgentRunner` driver selected by `AGENT_RUNNER=hermes` (wired in
  `runner/index.ts`; default stays `ClaudeVaultRunner`, so existing runs are
  unaffected). It ensures the user's container is running (reuses
  `agent-service.ts` `getAgent`/`startAgent`), degrades safely under the
  `NullProvisioner` (dev/test), honors the budget guard, never logs the scoped
  token/BYO key, and returns an HONEST empty `RunOutput` (proposes nothing) rather
  than fabricating data. Propose-never-write holds: the container's brain token is
  read-only by construction, so it is structurally barred from the write-scoped
  `/api/agent/ingest`. Covered by `hermes-container-runner.test.ts` (13 tests) +
  the provisioner security tests (1.2 below).
- **STILL DEFERRED — the live container round-trip only:** the actual wire protocol
  (POST a Run objective into the container, stream back its emitted
  `DraftProposal[]` derived from its `/api/agent/{search,query}` planning calls,
  accumulate trace/tokens/outcome) is marked `TODO(hermes-live)` in the driver. It
  slots in there WITHOUT changing the `AgentRunner` contract or the Aegis path.
  Standing up + exercising it needs a real Docker host running the Hermes image —
  that's the genuinely infra-dependent piece.
- **Hard constraints (Req 11.3–11.5) still hold and are now test-pinned (1.2).**
- **Requirements:** 2.11, 11.3, 11.4, 11.5.

### 1.2 — Container security & driver-parity tests (tasks.md 8.5)  ·  STATUS: ✅ DONE
- **What shipped:** `src/lib/agent-provisioner.test.ts` (12 tests) statically pins
  the `HostConfig` guards — `CapDrop:['ALL']`, `no-new-privileges`, positive
  Memory/NanoCpus/PidsLimit caps, `RestartPolicy:'no'`, non-host network, and NO
  Docker-socket / bind mount anywhere — and proves they're byte-identical across
  `NODE_ENV` production/development/test. `hermes-container-runner.test.ts`
  asserts both drivers emit `RunOutput` with identical shared keys consumed the
  same way downstream (Req 2.11), the propose-never-write posture, and that no
  secret reaches a console sink.
- **Requirements:** 11.3, 2.11. Still pair with `/cso` before exposing the control plane.

---

## 2. In-code TODOs / phase-staged simplifications (agent stack)

### 2.1 — Scoped brain-token mint into the run context  ·  STATUS: deferred
- **Where:** `src/lib/agents/run-agent.ts` — `ctx.scopedToken = ''` with
  `TODO(Phase 2 · task 2.5)`.
- **What:** The runner currently receives an empty `scopedToken` placeholder. The
  scoped-token MINT logic already exists (`src/lib/agents/scope.ts`, built in Phase 2)
  and derives `AgentToken.scopes` from the Agent's `trustScope` (never broader). It
  just isn't wired into the in-process run context because `ClaudeVaultRunner` calls
  vault tools directly (in-process) and never presents a bearer token.
- **Why deferred / why it's safe:** The in-process Claude runner doesn't need a
  brain token — it uses the read-only `VaultTools` bound to the user. The scoped
  token becomes load-bearing only when the **HermesContainerRunner (1.1)** performs
  its live container round-trip (`TODO(hermes-live)`) and the container authenticates
  to `/api/agent/*` over the wire. Mint + inject it as part of wiring that live
  protocol. Never logged (Req 11.4).
- **Requirements:** 11.6, 2.5.

### 2.2 — Auto-apply of low-stakes reversible proposals  ·  STATUS: deferred (policy)
- **Where:** `src/lib/agents/run-agent.ts` — every emitted Proposal is persisted as
  `status: 'pending'` regardless of classified stakes ("Phase-1 policy").
- **What:** The design allows stakes-scaled gating: a `low-reversible` action by a
  trusted-band Agent could auto-apply + post an Undo_Toast instead of waiting in the
  Aegis Queue. `classifyStakes` already computes the stakes and is persisted on each
  Proposal; the auto-apply path is simply not enabled yet.
- **Why deferred / why it's safe:** Defaulting EVERYTHING to `pending` is the safe
  posture (nothing writes unattended). Enabling auto-apply is a deliberate trust
  decision that should ship with its own review. The data needed to route on it is
  already recorded, so this is additive when you choose to enable it.
- **Requirements:** 3.4, 3.5 (classification done); auto-apply enablement is the
  remaining policy wiring.

### 2.3 — Source-level reversal in `undoProposal`  ·  STATUS: deferred (refinement)
- **Where:** `src/lib/agents/aegis/apply-proposal.ts` `undoProposal`.
- **What:** Undo currently reverses the knowledge surface by removing the pages an
  apply created; the `Source` doc written during apply is not deleted (its id isn't
  carried on the Proposal). Documented in-code as "a fuller source-level reversal is
  a later refinement."
- **Why deferred / why it's safe:** Page removal is the meaningful reversal (it
  restores the queryable knowledge surface and `Vault.pageCount`); a dangling Source
  row is inert. The apply-then-undo round-trip property (Property 6) is green for the
  page surface. Carry the Source id on the Proposal to extend this later.
- **Requirements:** 3.7, 3.8.

### 2.4 — Richer LLM tool-use loop in `ClaudeVaultRunner`  ·  STATUS: deferred (enhancement)
- **Where:** `src/lib/agents/runner/claude-vault-runner.ts`.
- **What:** The runner does the deterministic `fetchSource → scan → (planIngest |
  flag)` pipeline and turns the result into proposals. The richer loop — Claude
  autonomously choosing which tools to call, search/query-driven synthesis
  proposals — is the documented next enhancement.
- **Why deferred / why it's safe:** It slots in behind the SAME `AgentRunner`
  contract; the propose-never-write invariant and the `Proposal` shape do not change,
  so Property 1 stays intact. Pure capability upside, no interface churn.
- **Requirements:** 2.1, 2.2, 2.10.

---

## 3. Production-grade scheduling infrastructure  ·  STATUS: deferred (infra)

- **What's shipped (Phase 8):** A PURE, testable `Scheduler.tick()` core
  (`src/lib/agents/scheduler.ts`) + a protected `/api/agents/scheduler/tick` route
  driven by an external cron, plus opportunistic post-run reactive chaining. No
  blocking in-process timer.
- **What's deferred:**
  1. **A dedicated long-lived worker.** The design is explicit: always-on scheduling
     needs a real worker/cron — Next.js route handlers are request-scoped. Interim is
     an external cron (Vercel Cron / host cron) hitting the tick endpoint. Standing up
     that worker is later infra, NOT a code change to the orchestration layer.
  2. **A production cron evaluator.** `isCronDue` is a deliberately MINIMAL,
     dependency-free 5-field evaluator (`*`, int, comma lists, `*/step`, ranges, dow
     alias 7→0). It conservatively returns `false` for anything outside that subset
     (names like `MON`, `@hourly` macros, `?`/`L`/`#` qualifiers) and does NOT model
     standard cron's dom/dow OR-quirk. Swap in a vetted cron library when the worker
     lands if richer syntax is needed.
- **Operational requirement to actually enable scheduling:** set a strong
  `SCHEDULER_CRON_SECRET` (documented in `.env.example`) and point an external cron
  at `POST /api/agents/scheduler/tick` with `Authorization: Bearer <secret>`. Unset
  ⇒ the endpoint fails safe with 503.
- **Requirements:** 1.4, 1.6, 7.11.

---

## 4. Security follow-ups to run before exposing the control plane

- **`/cso` review — DONE (this pass).** A focused Chief Security Officer audit ran
  against the agent control plane (run-executing endpoints, container provisioning,
  scoped tokens, secret handling). Report: `.gstack/security-reports/2025-agent-control-plane.json`.
  Verdict: no CRITICAL/HIGH; the propose-never-write spine, per-`{_id,userId}` scoping
  (no IDOR), system-cron-runs-as-agent-owner posture, container hardening (CapDrop ALL /
  no-new-privileges / no socket, test-pinned), and redaction-guarded logging all
  verified. Two MEDIUM hardening items were found AND fixed:
  - **`?key=` query secret → header-only in production.** `presentedSecret()` now
    rejects the URL-borne secret when `NODE_ENV==='production'` (query strings leak to
    proxy/CDN logs). Test-verified in `scheduler/tick/route.test.ts`.
  - **Per-IP rate limit on the tick endpoint.** Fixed-window limiter
    (`SCHEDULER_TICK_RATE_LIMIT`, default 12/60s) checked BEFORE the secret compare, so
    brute-force attempts are throttled too (429). The three-level Budget guard remains
    the real cost ceiling. Test-verified.
- **STILL OWED — re-run `/cso` after the live container path lands.** When the
  HermesContainerRunner's live wire-protocol (1.1, `TODO(hermes-live)`) + the scoped
  brain-token mint (2.1) ship, re-audit: that's when untrusted LLM output starts
  driving real container behavior over the network. Also engage a professional
  pen-test before a production launch handling user data — `/cso` is an AI-assisted
  first pass, not a substitute.
- **Distributed rate limiting (later infra).** The current tick limiter is
  per-instance (in-memory) — fine as a backstop, but a multi-instance deployment wants
  a shared store (Redis/Upstash) for a true global cap.

---

## 5. Cross-cutting verification still owed

- **Cost & Budget page visual review (Phase 7).** `/app/app/agents/cost/page.tsx` is
  a new visual surface; the agent cannot see rendered pixels. Needs a user screenshot
  review to confirm the glass recipe, the ok/amber/over budget-bar treatments, and
  the section layout match the dashboard. (All other agent pages were synced per
  `.kiro/steering/glass-theme.md`.)
- **`npm run test:integration`** (live MongoDB + Claude) was not run as part of the
  phase checkpoints — only the fast `npx vitest run` unit/property suite (544 tests /
  56 files green) and `npm run build`. Run the integration suite before a production
  cutover.

---

_When an item here is completed: verify with `npm run build` + `npx vitest run`,
confirm `/api/agent/*` and `/api/agent-instance/*` behavior is unchanged (additive-only
guarantee, Req 11.8), then remove its entry from this file._

---

## 6. Quiet Instrument design system (Wave 1) — COMPLETE (contrast findings fixed)

The second spec (`quiet-instrument-design-system`) is reconciled and complete (all
functional tasks done; optional tests written; final gate green). Two WCAG findings
surfaced while writing the Phase 5 contrast tests
(`src/styles/quiet-instrument.contrast.test.ts`) — both have since been **FIXED**
(user-authorized brand-color change), verified by the now-passing AA assertions:

- **`--qi-ember-text` on light: #DC5C18 (3.76:1) → #A8430F (ember-700, 6.04:1 on
  white / 5.64:1 on canvas).** Now clears AA normal text, so it is safe for
  body-size accent text, not just large/non-text.
- **Light primary-button ink: white #FFFFFF (2.97:1) → dark #1B1205 (6.24:1).** The
  light button now keeps dark ink on ember, matching the dark theme and the design's
  own "dark ink on ember" rule; clears even the 4.5 label-text bar.

Both fixes are in `src/styles/quiet-instrument.css` (`[data-theme="light"] .qi`
block) and pinned by `≥ 4.5:1` assertions in the contrast test, so any future
regression in those values fails the suite.

**Reconciliation note:** the spec's Phase 4 wording described a cool-flat
`.qi-nav-item` sidebar repaint, but the mandatory `glass-theme.md` rule keeps the
sidebar on glass (Surface_Skin = hybrid). The functional half (single-active
resolver, real badge, a11y) shipped on the glass sidebar; the cool-flat repaint was
intentionally NOT applied. Tasks 4.2/5.1 are marked complete on that basis.
