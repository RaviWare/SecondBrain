# SecondBrain Cloud — Project Handoff & Operating Manual

> **New IDE / new agent: read this file first.** It is the single source of truth for
> how this project is built, styled, tested, deployed, and operated. It consolidates
> rules that previously lived in IDE-specific tooling (Kiro `.kiro/` steering) so they
> travel with the repo. When a rule here conflicts with your training defaults, **this
> file wins.**

---

## 1. What this project is

SecondBrain Cloud is a **private AI operating system**: a knowledge vault ("the brain")
that turns sources into cited memory, plus always-on AI agents that work that knowledge.

- **Live in production:** https://secondbraincloud.com
- **Repo:** `RaviWare/SecondBrain` (GitHub), default branch `main`
- **Hosting:** Hetzner server + **Coolify** (Build Pack: Dockerfile). Auto-deploys from
  GitHub `main` on push/merge.
- **Local path:** `/Users/raviteja/Documents/New project/SecondBrain`

### Stack
- **Next.js 16.2.4** (App Router, Turbopack), **React 19**, **Tailwind v4**
- **MongoDB Atlas** via Mongoose
- **Clerk** for auth
- **Anthropic Claude** (`@anthropic-ai/sdk`) for synthesis/query; Google GenAI also present
- **Radix UI** primitives, **framer-motion**, **lucide-react** icons
- **fast-check** for property-based testing, **vitest** for unit tests
- **dockerode** (agent containers), **Stripe** (billing), **Firecrawl** (ingest)

> ⚠️ **This is NOT the Next.js in your training data.** Next 16 has breaking changes to
> APIs, conventions, and file structure. Before writing Next-specific code, check the
> bundled docs in `node_modules/next/dist/docs/` and heed deprecation notices.

---

## 2. The three product layers (see `docs/agent-stack/`)

1. **gstack** (`docs/agent-stack/10-GSTACK.md`) — dev workflow skills, NOT a product
   feature. They build the app.
2. **GBrain** (`docs/agent-stack/20-GBRAIN.md`) — the knowledge layer. Core patterns are
   already implemented natively; **prefer them when touching query/ingest**:
   - synthesis + gap analysis → `src/lib/claude.ts` (`queryWiki`)
   - self-wiring graph → `src/lib/auto-link.ts`
   - shared vault ops → `src/lib/vault-ops.ts`
3. **Hermes** (`docs/agent-stack/30-HERMES.md`) — per-user autonomous agent, one Docker
   container per user, single-tenant by design, BYO LLM keys.

> **Naming rule (user-facing copy):** never use the words **"Hermes", "gstack", or
> "GBrain"** in anything a user sees. They're internal code identifiers only.

### Agent API (already built, token-authed for external agents)
`/api/agent/manifest` (public), `/api/agent/query` (synthesis+gap), `/api/agent/search`
(raw retrieval), `/api/agent/ingest` (write). Auth: `Bearer sb_...` tokens minted in
Settings → Agent Access. Logic in `src/lib/agent-auth.ts`.

### Major features shipped
- **Mission Orchestrator** — `src/lib/agents/mission/*`, `src/app/api/missions/**`,
  `src/app/app/missions/**`, `src/components/missions/*`. One objective → lead agent
  decomposes into a task graph → squad executes with plan-approval, budget/concurrency/
  wall-clock ceilings, and a kill-switch. All pure cores are DB-free with fast-check
  correctness properties.
- **Dashboard + UX** — `src/components/dashboard/*`: real-data dashboard, global ⌘K
  command palette, Action Center, toast system, shortcuts cheatsheet, honest empty states.

---

## 3. 🎨 GLASS THEME — MANDATORY on every `/app/*` page (always applies)

Every in-app page must match the dashboard's warm Apple-silicon **glass** look exactly —
same background, tones, texture. **Do NOT ship a flat/dull page.** Surface skin decision
= **hybrid** (glass everywhere; the cool-flat "Quiet Instrument" tokens are NOT the
visible skin).

**The non-negotiable recipe (copy the dashboard, do not approximate):**

1. **Page wrapper:** `<main className="sb-dashboard min-h-full text-[var(--dash-text)]">`
   — paints the ambient aurora (`::before`) + grid texture (`::after`). Without
   `.sb-dashboard` the page sits on a flat void.

2. **Every card/panel carries the full texture stack:**
   `className="dash-panel dash-grain dash-interactive ..."`
   - `dash-panel` = frosted glass (blur, sheen, ring, border)
   - `dash-grain` = micro-noise texture (what makes it feel rich, not dull)
   - `dash-interactive` = hover lift + edge glow
   - Hero/feature cards ALSO add `dash-spotlight` + `<span className="dash-spotlight-glow" aria-hidden />`
     as the first child, and wire `useSpotlight()` (`ref` + `onMouseMove`)
   - A plain `dash-panel` alone reads DULL. Default to `dash-panel dash-grain dash-interactive`.

3. **Tokens — use `--dash-*` ONLY for in-scope page content:**
   surfaces `--dash-card-solid` (dark wells) / `--dash-glass`; text `--dash-text` /
   `--dash-muted` / `--dash-subtle`; accent `--dash-accent` / `--dash-accent-2` /
   `--dash-accent-soft`; borders `--dash-border` / `--dash-border-bright` /
   `--dash-border-glow`. Headings: `.dash-metallic-text`. Primary buttons: `.dash-accent-grad`.
   **NEVER** use the flat `--surface` / `--border` / `--accent` / `--text-*` tokens for
   in-app content (they read dull/disconnected).

4. **Inset wells** (inputs, list rows, stat tiles): `background: var(--dash-card-solid)` +
   `border: 1px solid var(--dash-border)`. NOT `--dash-soft` for large surfaces
   (`--dash-soft` is only for tiny hover washes / icon chips).

5. **Portalled overlays** (Radix menus/tooltips/popovers, `createPortal` dialogs) render
   at `<body>`, OUTSIDE `.sb-dashboard`, so `--dash-*` do NOT resolve there → transparent
   menu / text bleed-through. Use **ROOT tokens** for those: `--bg-elev-3` (solid bg),
   `--surface-2`, `--border-bright`, `--text-primary`, `--accent`, `--shadow-3`. Panel
   background must ALWAYS be opaque.

**Reference implementation:** `src/components/dashboard/StatCard.tsx`
(`dash-panel dash-grain dash-spotlight dash-interactive`). When in doubt, open the
dashboard and compare side by side.

**Already-synced pages (keep them this way):** dashboard, ingest, sidebar, wiki/memory,
query/search, log, settings, missions, agents. All new pages must follow this recipe.

The full token system lives in `src/app/globals.css` (`.sb-dashboard { --dash-* }` blocks,
dark + light variants).

---

## 4. 🚫 NO DUMMY DATA (core product principle)

Honest empty/zero states, real data only. **Never** fabricate numbers, curves, counts,
or always-on indicator dots. Specifics learned the hard way:
- Sparklines/trends must be REAL history (see `src/lib/dashboard-derive.ts`
  `deriveDailyTrend`); a flat all-zero baseline is the honest fallback, never a synthesized curve.
- Badges/notification dots bind to real pending state; show nothing when count is 0.
- Suggestion chips seed from the user's real data when present, generic starters only as
  an empty-vault fallback (and never presented as if they were the user's own data).
- If a value isn't available yet, render an honest empty state with a CTA — not a placeholder number.

---

## 5. Build, test & verify

Commands (run from repo root):
- `npm install` — install deps
- `npm test` / `npx vitest run` — fast unit suite (must stay green; ~958+ tests)
- `npm run test:integration` — live tests against real MongoDB + Claude (needs env)
- `npm run build` — production build; **must pass before shipping**
- `npx eslint <files>` — lint specific files

**Verification discipline (do this after every change):**
1. Run the build before claiming done.
2. Run relevant tests; add tests for new features/bugfixes (vitest + fast-check for pure cores).
3. Clean up temporary files.

**Known noise to ignore (NOT your bug):**
- `react-hooks/refs` lint fires on the `useSpotlight` ref pattern across all dashboard
  pages — pre-existing, `npm run build`'s own lint passes clean.
- "setState synchronously within an effect" fires on the standard
  `useEffect(()=>{load()},[load])` data-fetch pattern across agent pages.
- `src/lib/agents/runner/hermes-container-runner.test.ts` ("at capacity") can flake in a
  full-suite run due to cross-file shared state; passes in isolation.

---

## 6. Architecture conventions

- **In-app API routes** (`src/app/api/*`, Clerk session): pattern is
  `const { userId } = await auth(); if (!userId) → 401; then connectDB()`.
- **System cron routes** (run across all users, NOT Clerk-authed): protected by the
  `SCHEDULER_CRON_SECRET` shared secret with a constant-time compare + per-IP rate limit.
  Secret unset → `503` (fail-safe). Wrong/absent secret → `401`. Authorized → `200`.
  Must be presented via `Authorization: Bearer <secret>` header (a `?key=` query param is
  DEV-ONLY and rejected in production).
- **Mission cores** live in `src/lib/agents/mission/` and are **pure / DB-free** (FSM,
  planner, executor, limits, handoffs, timeline, etc.) with fast-check correctness
  properties. Keep new core logic pure and testable; do I/O in the route/driver layer.
- **Reuse the single choke points** — `runAgentOnce` (audited Run path), `applyProposal`
  (single write path), `canStartRun` (budget guard), `vault-ops.ts` (vault writes).
  Be strictly additive; don't fork these.
- **Models** are in `src/lib/models.ts`; add new collections additively.

---

## 7. Deployment & operations

### Deploy flow
1. Work on a feature branch, commit, push.
2. Open a PR into `main` (GitHub UI or `gh pr create`).
3. Merge the PR → **Coolify auto-deploys from `main`** (Dockerfile build).
4. Verify production after the deploy finishes (probe key routes; see below).

### Updating the Hermes Agent Base Image
Because Coolify only auto-builds the main Next.js app, the underlying Hermes sandbox image (`secondbrain/hermes-agent:latest`) must be updated manually when NousResearch releases a new version.

**Step-by-step update process:**
1. **SSH into the Hetzner server:**
   ```bash
   ssh root@<your-hetzner-ip>
   ```
2. **Navigate to the repo directory:** (Adjust path if needed)
   ```bash
   cd /var/www/SecondBrain
   ```
3. **Pull latest changes and rebuild:**
   ```bash
   git pull origin main
   docker build -t secondbrain/hermes-agent:latest -f docker/hermes/Dockerfile .
   ```
*The `Dockerfile` automatically downloads the latest Hermes installer script, so this rebuild guarantees you have the newest features. Once built, any new agent session will use this fresh image automatically.*

### Production env vars (set in Coolify → Environment Variables)
All must be **"Available at Runtime" ✓**. Keys (values live in `.env.local` locally and
in Coolify in prod — never commit them):
`MONGODB_URI`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`,
`NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`,
`NEXT_PUBLIC_APP_URL`, `FIRECRAWL_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRO_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `SCHEDULER_CRON_SECRET`.

> ⚠️ `NEXT_PUBLIC_*` vars are baked in at **build time** — after changing them you must do
> a full **Redeploy (rebuild)**, not just a restart.
> ⚠️ Coolify gotcha learned: a corrupted env entry can silently fail to inject. If a var
> is missing at runtime, **delete and re-create it**, ensure "Available at Runtime" is ON,
> then Redeploy. Confirm via Coolify Terminal: `printenv | grep VAR_NAME`.

### Scheduled tasks (cron) — already configured in Coolify
The container is **`node:20-alpine`, which has NO `curl`** — use **`wget`**:
```
wget -qO- --header="Authorization: Bearer $SCHEDULER_CRON_SECRET" --post-data='' https://secondbraincloud.com/api/agents/scheduler/tick
wget -qO- --header="Authorization: Bearer $SCHEDULER_CRON_SECRET" --post-data='' https://secondbraincloud.com/api/missions/executor/tick
```
Both at frequency `* * * * *` (every minute). The agents scheduler drives autonomous
agents; the missions executor advances running missions. Both use the same
`SCHEDULER_CRON_SECRET`.

### Post-deploy verification (probe from a terminal)
```
curl -s -o /dev/null -w "%{http_code}\n" https://secondbraincloud.com/                       # 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://secondbraincloud.com/api/agents/scheduler/tick   # 401 (no secret) — route is secured
```
With the secret in an `Authorization: Bearer` header these tick routes return
`200 {"ok":true,...}`.

---

## 8. Git & safety rules

- **Never commit secrets.** `.env.local` is gitignored; keep it that way.
- **Always exclude `.vscode/settings.json` from commits** (it perpetually shows modified).
  Stage specific files; never `git add .`.
- Prefer **feature branches + PRs**; don't push directly to `main` unless explicitly asked.
- Use non-destructive git by default; destructive ops (force-push, reset --hard) need
  explicit go-ahead.
- For high-risk/destructive or production-affecting actions, explain and confirm first.

---

## 9. Local environment quirks (this machine)

- **macOS** + **zsh**. Node via nvm at `v24.14.1`.
- A prior shell accident clobbered `$PATH` in some sessions. If `node`/`npm`/`npx`/`git`
  don't resolve in a terminal, prefix commands with:
  ```
  export PATH="/Users/raviteja/.nvm/versions/node/v24.14.1/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
  ```
  A fresh terminal in a new IDE usually has a normal PATH — only use this workaround if
  the bare commands fail.
- `output: standalone` build → locally you can boot the prod build with
  `PORT=<port> node --env-file=.env.local .next/standalone/server.js` for probing.

---

## 10. What is Kiro-specific and does NOT carry to another IDE

- **`.kiro/` folder** — specs (`mission-orchestrator`, `hermes-agents`) and steering rules
  remain as plain markdown you can read, but Kiro's spec-task execution tooling won't run
  elsewhere. The important steering rules have been consolidated INTO this file (sections
  3, 4, 6, 8) so they travel with the repo.
- **`AGENTS.md`** at the repo root is a widely-supported convention; many IDEs/agents
  (incl. Antigravity) read it. `CLAUDE.md` just imports it (`@AGENTS.md`). Keep critical
  rules in `AGENTS.md` and this `HANDOFF.md` so they're portable.
- **`.vscode/settings.json`** — editor settings; ignore.

---

## 11. Outstanding / nice-to-have follow-ups

- **Rotate any credentials that were ever shown on screen** (e.g. during ops/debug
  screenshares): Clerk secret key, MongoDB Atlas password. Update both `.env.local` and
  Coolify, then redeploy.
- **Pricing — consolidate to one ladder.** See [`docs/PRICING.md`](./docs/PRICING.md) for
  the agreed strategy: a single Free → Pro ($18) → Squad ($99 early access) ladder on ONE
  checkout (Stripe), not two separate offerings. Build/repoint the public pricing page to
  match it (glass theme per §3). Q1 goal is confirmed as **1,000 users** (free-led motion).
- Wire toasts into more flows (ingest/query) for consistent feedback.
- Consider onboarding empty-states on the remaining pages.

---

_Keep this file current. When you change build/deploy/style conventions, update the
relevant section here so the next IDE or agent inherits the truth._
