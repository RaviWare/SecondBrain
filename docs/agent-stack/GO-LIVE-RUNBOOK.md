# Go-Live Runbook — SecondBrain + Hermes Agents OS

> One-page checklist to take the app live. Items are ordered. Anything marked
> **[you]** needs a human (credentials, a browser login, or a merge button);
> everything else is already done in the codebase.
>
> Current state at time of writing: PR #1 (`feat/hermes-agents-os`) open, 645
> unit/property tests green, production build clean, lint clean, control plane
> hardened. Branch commit: `5377f7c`.

---

## 0. What "the scheduler" is (you asked)

The Scheduler makes agents run **on their own** — on a cron (`run my Scout daily
at 9am`) or **reactively** (when one agent finishes, trigger another). Without it,
agents still work — they just only run when a user clicks **Run** manually.

- It is **OPTIONAL for launch.** The app is fully functional without it.
- It is driven by an **external cron** that POSTs to a protected endpoint; there is
  no in-process timer (Next.js can't run reliable timers).
- Turn it on whenever you want by doing Step 4 below. Until then it's dormant and
  harmless.

---

## 1. Environment variables — STATUS

All required vars are already set in `.env.local` (local dev):

| Var | Required? | Local status |
|---|---|---|
| `MONGODB_URI` | yes | ✅ set |
| `ANTHROPIC_API_KEY` | yes | ✅ set |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | ✅ set |
| `CLERK_SECRET_KEY` | yes | ✅ set |
| `NEXT_PUBLIC_CLERK_*_URL` (4) | yes | ✅ set |
| `NEXT_PUBLIC_APP_URL` | yes | ✅ set |
| `FIRECRAWL_API_KEY` | optional (URL ingest; falls back to cheerio) | ✅ set |
| `STRIPE_*` | optional (billing) | ✅ set |
| `SCHEDULER_CRON_SECRET` | optional (scheduler) | ✅ set (auto-generated) |

**[you] In PRODUCTION**, set the SAME vars on your Docker host / hosting env. Two
critical swaps for prod:
1. Use **live** Clerk keys (`pk_live_…` / `sk_live_…`), not `pk_test_`/`sk_test_`.
2. Set `NEXT_PUBLIC_APP_URL` to the real public URL (used by Stripe redirects,
   webhooks, and the agent container's brain API base).
3. Copy `SCHEDULER_CRON_SECRET` from `.env.local` (or generate a fresh one for prod
   with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

`.env.local` is gitignored — production secrets must be set in your host's env /
secrets manager, never committed.

---

## 2. Merge the PR  **[you]**

PR #1: https://github.com/RaviWare/SecondBrain/pull/1
- Review the diff (153 files, the Hermes Agents OS + Quiet Instrument work).
- Merge to `main` when satisfied.

---

## 3. Integration tests against live services  **[you]**

The fast suite (645 tests) is green. The LIVE suite hits real MongoDB + Claude and
is NOT run automatically (needs creds):

```bash
npm run test:integration
```

Run it once against staging before cutover. Then a final smoke:

```bash
npm run build   # production build — must pass
npm start       # or your Docker run; then click through /app
```

---

## 4. (Optional) Enable the agent Scheduler

Only do this if you want unattended/scheduled agent runs at launch. Otherwise skip
— agents still run manually.

**4a.** Ensure `SCHEDULER_CRON_SECRET` is set in the PRODUCTION env (Step 1).

**4b.** Point an external cron at the tick endpoint once a minute. The caller MUST
send the secret as a Bearer header (in production the `?key=` query fallback is
rejected — query strings leak into logs).

On the Docker/Hetzner host, a host crontab line (every minute):

```
* * * * * curl -fsS -X POST https://YOUR_APP_URL/api/agents/scheduler/tick \
  -H "Authorization: Bearer $SCHEDULER_CRON_SECRET" >/dev/null 2>&1
```

(or any scheduler that can POST with a header — Vercel Cron, GitHub Actions cron,
Upstash QStash, etc.)

**Behavior / safety:**
- Secret unset ⇒ endpoint returns **503** (disabled, fail-safe). Never runs unprotected.
- Wrong/missing secret ⇒ **401**. Constant-time compare; secret never logged.
- Per-IP rate limit (default 12/min, tune via `SCHEDULER_TICK_RATE_LIMIT`).
- The three-level token Budget guard is the real cost ceiling regardless.

---

## 5. Authenticated UI verification  **[you — can't be automated]**

Sign in and click through (no agent can do this headlessly — it requires a Clerk
session):

- [ ] `/app/dashboard` renders, real counts
- [ ] `/app/agents` (squad dashboard) — empty state for a fresh account
- [ ] `/app/agents/builder` — create a test agent end-to-end
- [ ] Run a **dry-run** on it → a Proposal appears in the Aegis Queue
- [ ] **Approve** the proposal → it writes to the vault (the one write path)
- [ ] `/app/agents/board`, `/app/agents/skills`, `/app/agents/cost` render
- [ ] Confirm the glass look matches the dashboard on every `/app/agents/*` page
      (this is the visual review the agent flagged it can't do)

---

## 6. Security posture (already done, for reference)

- `/cso` audit run against the control plane: no critical/high; 2 MEDIUM findings
  (query-param secret, missing rate limit) fixed.
- Containers (if `AGENT_RUNNER=hermes`): non-root, CapDrop ALL, no-new-privileges,
  resource-capped, no host Docker socket — test-pinned across all envs.
- Every agent/skills/proposals route fails gracefully (clean JSON 500, no leaks).
- BYO keys + brain tokens never logged, never in the DB beyond the container env.

---

## 7. Deferred (post-launch, NOT blockers)

Tracked in `docs/agent-stack/DEFERRED-WORK.md`:
- The live `HermesContainerRunner` wire-protocol (`TODO(hermes-live)`) — the
  Claude in-process runner is the default and covers launch.
- A dedicated long-lived scheduler worker (the cron endpoint is the interim).
- The QI cool-flat skin is intentionally NOT applied (glass is the mandatory skin).

---

_Last updated alongside PR #1 (`feat/hermes-agents-os`)._
