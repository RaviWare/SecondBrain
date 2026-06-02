# Hermes Agents OS — Design Spec Notes

> Running capture of the design phases the user is sharing. **Analysis only — no
> code until the user finishes sharing and confirms understanding.** The build
> must be additive: enhance the existing system (brain, agent API, control plane,
> skill catalog, live deploy) without breaking anything that already works.

Status: **CAPTURING** (user is pasting ~20+ phases). Do not start building.

---

## Core principles extracted so far

1. **Trust is rendered, not asserted.** Security layer is invisible when healthy,
   surfaces only when something needs the user. Calm is the signal; a wall of
   green "SECURE!" badges is the anti-pattern.
2. **Loud-by-exception.** Normal agent work = calm background hum. The warm accent
   ("Ember") is reserved ONLY for "needs your sign-off." Scarcity of the accent
   is the whole UX.
3. **Aegis gate (the spine):** nothing an agent does that alters or exits the
   brain happens without the user's sign-off. Agents are **proposers, not editors.**
   Every sign-off shows complete evidence (the "why").
4. **Stakes-scaled gating.** Reversible low-stakes actions (auto-ingest allowlisted
   source) just happen + post an undo toast. Aegis is reserved for writes to
   knowledge structure + anything flagged. Gating everything trains blind approval.
5. **Least privilege + legible scope.** Each agent has a plain-language permission
   statement incl. an explicit "cannot" list (reassurance by negation).
6. **Trust has teeth.** Per-agent 0-100 score earned through behavior; it drives
   the default sign-off policy (high trust → more auto; watch-band → forced ask-first).
7. **Dry-run before deploy.** Agent runs once in propose-only mode against real
   data so the user sees its judgment before granting autonomy.
8. **Decisions teach / calibrate over time.** Approvals raise trust + loosen
   defaults; rejections tighten.
9. **Content scanner is the real threat model:** agents read untrusted web pages →
   prompt-injection + data-pollution surface. Scan ingested content (not just
   skills); hold flagged content for review with the suspicious passage shown.

## Domain translation (Mission Control → SecondBrain)

Mission Control = "air traffic control for code-shipping agents." SecondBrain =
agents that **tend a brain** (ingest, synthesize, connect, monitor, fill gaps).
Every Mission Control surface has a knowledge-domain twin; ~half already exists
under other names (Activity Log, the brain graph, sign-off patterns).

Agent roles (map to knowledge workflows):
- **Scout** — watches a source/topic, auto-ingests new material
- **Synthesist** — proactively generates syntheses across sources
- **Connector** — links new ingests to existing knowledge
- **Critic** — flags contradictions between sources
- **Librarian** — maintenance: dedupe, re-link, prune (graph health)
- **Researcher** — given a topic, goes out and brings findings back

Stack naming:
- **Hermes Agents OS** = orchestration layer (squad, board, feed, lifecycle, trust)
- **GBrain / gstack** = skills layer underneath (registry + runtime)
- **Hermes skills** = the installable capabilities (e.g. beast-mode, humanizer)

---

## Phases captured

### Phase 20 — Squad Dashboard ("air traffic control" home)
- Mostly **read-only**; user observes, only acts at sign-off points.
- Status color language keeps Ember scarce: live=green pulse, review=Ember (the
  one exception), idle=grey, paused=disabled, error=red.
- **Status strip** (top, machine register): agent counts (running/scheduled/awaits
  you) + a "Today" proof-of-work line (real counts: sources ingested, connections
  made, syntheses proposed) drawn from the activity log.
- **Squad roster:** agent cards in minmax(320px,1fr) grid. Card = status dot +
  name + role + "now" line (what it's doing) + skill chips + trust score (mono,
  green when high, only noticed when it drops). Review-state card gets warm
  left-edge + Ember.
- **Right rail, ordered by priority:** (1) "Awaiting your sign-off" (Aegis queue) on
  top — what/why/Approve/Dismiss; approve creates node + draws graph edges,
  dismiss teaches agent to stay quieter. (2) Live feed below — agent-scoped
  activity log (timeline w/ colored spine), @mentions, "View all →".
- **Guardrails:** nothing enters brain without sign-off; dashboard observes, never
  interrupts (no push notifications — queue in rail/Inbox); every proposal shows
  evidence.
- **Empty/first-run:** constellation empty state → builder. Suggest a starter agent
  matched to user's data ("You added 4 AI-news sources — want a Scout?").

### Phase 21 — Agent Builder (design-by-conversation)
- **Two-pane:** conversation on left, live agent preview on right that fills in as
  you talk (fields glow Ember as they land — earned motion).
- Type plain description → Hermes parses intent, fills preview, confirms in human
  register, asks ONE clarifying question only if genuinely ambiguous. Refine by
  talking ("actually daily not weekly"). Preview = the spec; conversation = fastest
  way to write it. Every field also directly editable (progressive disclosure).
- **5 config fields define an agent:**
  1. **Role** — one sentence; maps to an archetype or custom blend.
  2. **Schedule** — natural language → real trigger. Two flavors:
     **Scheduled** (time-based cron) and **Reactive** (event-based, e.g. "when a
     Scout ingests about pricing, run the Critic"). Reactive triggers let agents
     **chain** — one agent's output triggers another (squad > list of cron jobs).
  3. **Skills** — assignable gstack/GBrain capability chips; Hermes suggests what
     the role needs; clicking previews what it does + trust-scan status.
  4. **Sign-off policy** — the Aegis scope / trust dial. Per action type: auto vs
     ask-first. Default conservative (ask-first for anything writing to brain).
     e.g. auto-ingest sources = auto-ok; create synthesis = ask; flag contradiction
     = notify only.
  5. **Trust scope** — least privilege: which sources/collections, web access,
     token budget per run. Tight by default, visible.
- **Dry run before deploy:** runs once in propose-only mode against real data;
  nothing written, everything routes to sign-off queue. Shows "would ingest 4,
  filtered 2, would propose 2 connections." Refine description + rerun if wrong.
  Deploy only when satisfied.
- **Lifecycle:** Hermes proposes name; rename allowed. Edit live agent reuses same
  two-pane builder. Retire = reversible pause (history stays, reactivatable; never
  hard delete). Full arc: describe → preview → dry run → deploy → monitor → pause
  → retire.

### Phase 22 — Work Board + Activity Feed
- **Board = the knowledge pipeline made visible** (NOT a generic Kanban). Five
  columns mapped to the real lifecycle:
  **Queued → Reading → Connecting → ⚑ Review (the Aegis gate) → Woven in.**
  Reuses the ingest pipeline stages; board is a live X-ray of that process with
  agents as workers moving cards.
- **Calm rules:** only the Review column runs warm (Ember); "Woven in" collapses to
  a count (e.g. "142 woven in") with recents expandable; cards slide between
  columns (brief motion, no flourish).
- **Limited drag-and-drop:** you don't shuffle an agent's reading task. You CAN drag
  a Review card to approve/reject (drop into "Woven in" or off the board). Direct
  manipulation only where the user has authority (sign-off).
- **Task detail = side sheet** (not modal, stay in board context). For a Review
  task it's the sign-off surface w/ full evidence. **"Why" block mandatory on every
  task** (citation discipline) — no task is a black box.
- **Discussion thread per task:** instead of binary approve/reject, you can reply to
  the agent ("only if it cites the conversion threshold") → it refines & re-proposes.
  Sign-off becomes a conversation about your own thinking.
- **Agent-to-agent threads:** e.g. Critic → Scout "this conflicts with last week's
  pricing note." User is CC'd, not required; surfaces in feed only when it matters
  (@mention, contradiction, decision needed).
- **Sub-agent spawning (bounded):** a Researcher can spawn a focused sub-task as a
  nested card. Sub-agents **inherit parent's trust scope and never exceed it**;
  any write still hits the one Review gate.
- **Unified activity feed** (extends existing Activity Log, Phase 15): agent
  check-ins, completions, contradictions, @mentions. **@mentions are the ONLY feed
  events that push to Inbox.** Feed = "what's happening" (ambient); Inbox = "what
  needs me." Two surfaces, no noise bleed.

### Phase 23 — Trust, Security & the Aegis Gate
- **Per-agent trust score (0-100): a track record earned, not a setting.** New
  agents start low, climb as proposals get approved + dry runs prove sound.
  - Up: proposals approved without edits, clean dry runs, sources pass content
    scan, staying in scope.
  - Down: rejected/heavily-refined proposals, scope-boundary attempts, ingesting
    content that later triggers a contradiction flag, any detected injection attempt.
  - Bands: trusted 80-100 (green), proving 40-79 (neutral), watch <40 (amber).
  - **Teeth:** score drives default sign-off policy — high trust → more auto-actions
    granted; watch-band → forced back to ask-first regardless of config. System
    tightens itself when trust drops.
- **Content scanner (the real threat model):** runs on **ingested content, not just
  skills.** Every source an agent reads is checked before becoming a node:
  embedded instructions ("ignore your task..."), credential/PII patterns, text
  addressed to "the AI." Flagged content is **held for review with the suspicious
  passage shown** — never blocked silently, never ingested silently. The gate is
  the user; they see exactly why it stopped.
- **Scope as a visible boundary:** plain-language permission statement per agent,
  incl. explicit **"cannot" list** (touch other collections, delete anything ever,
  share outside brain). Reassurance by negation.
- **Aegis = one coherent trust layer**, not scattered gates. Unified queue (rail +
  Inbox) where every approval type lands with consistent anatomy: **what · why ·
  your decision.** Three rules: (1) one queue, one anatomy; (2) stakes-scaled, not
  everything-gated; (3) decisions teach (calibrate trust over time).
- **Security posture present but never loud:** squad-level posture view (0-100,
  tool-call audit, injection log) lives one click in (agent detail / "Security"
  tab), NOT on the main dashboard. Home shows green dots + gets out of the way;
  posture detail is there for when you actually want to audit.

### Phase 24 (announced, not yet detailed) — GBrain/gstack Skills Library
- Browse, install, manage capabilities agents draw from. Mission Control's skill
  registries (ClawdHub/skills.sh) reimagined as the GBrain registry. Pre-install
  security scan. Skill representation: what it does, what it can touch, trust
  status. Skills relate to agents (assigned in the builder). beast-mode / humanizer
  are examples of this model.

### Phases 25-28 (announced)
- 25 — Skills execution UI + skill-in-context + cost/budget tracking
- 26 — Conversion & retention
- 27 — Accessibility & responsive / mobile
- 28 — Final roadmap + design-system.css compile

---

## How this maps to what we ALREADY have (additive build plan — DRAFT)

| Spec concept | Existing asset | Action |
|---|---|---|
| Skill catalog | `src/lib/skills/catalog.ts` (Phase 1 ✅) | extend (add scope, trust-scan fields) |
| Agent run engine | `vault-ops.ts` (search/query/ingest) | runner calls these as tools |
| Aegis proposals | — (new) | new `Proposal` model; runner emits proposals not writes |
| Activity feed | `Log` model + Activity Log UI | extend with agent events + @mentions |
| Per-agent agent record | `UserAgent` model | extend with trust score, scope, sign-off policy |
| Agent tokens / API | `agent-auth.ts`, `/api/agent/*` | reuse for Hermes-container execution later |
| Control plane | `agent-service.ts`, provisioner | reuse for deploy/lifecycle |
| Knowledge graph | `auto-link.ts` + graph in dashboard | approve-proposal draws edges |
| Content scanner | — (new) | new module; runs in ingest path before write |

## Open questions to confirm with user (after full capture)
- Execution model: confirm **(B) Claude+vault runner now**, Hermes containers behind
  same UI later. (User leaning yes.)
- Confirm runner is **propose-never-write (Aegis baked in)** from the start.
- Visual/design system: spec references a rich token system (Geist font, Ember
  accent, surface tiers, var(--t-*) timings). Need to reconcile with our existing
  `.sb-dashboard` glass tokens — likely the spec's "Ember" = our `--dash-accent`.

---
_Last updated: capturing Phases 20-24 announced; awaiting the rest from the user._


---
---

# SECOND TRACK — Design System Spec ("Quiet Instrument")

> This is a SEPARATE 22-phase arc from the Hermes Agents OS track above. It's a
> full design-system overhaul. Phases 1-7 captured below; 8-22 announced.
> ⚠️ IMPORTANT RECONCILIATION FLAG — see bottom of this section.

## Design language: "Quiet Instrument"
A precision instrument (control surface / telescope / synth) earns trust through
restraint + exactness, not shouting. Technical because serious; calm because
confident. Benchmarks: Raycast, Linear, Vercel/Geist, Stripe, Superhuman.
Decision test: "does this feel like a precise quiet instrument, or a startup
trying to get noticed?"

## Phase 1 — Holistic Design Audit (issues ranked by cost)
1. **Active-state broken (Critical):** sidebar renders 6 orange pills at once on
   Wiki, 2 on Assistant. Active state must answer "where am I?" → exactly ONE
   active item. (We already partly fixed this in our sidebar, but spec wants a
   formal default/hover/active system.)
2. **Dark & light are two brands (High):** dark=cool near-black+hot orange;
   light=warm cream+muddy orange. Temperature flips. Fix: one cool-neutral
   foundation; light = a true tint of dark, not a separate world.
   ⚠️ NOTE: we currently have warm metallic-black glass + YC cream light. This
   spec rejects the cream.
3. **Core work pages feel abandoned (High):** Assistant/Ingest float in black
   voids; light Activity Log is a narrow column w/ 60% empty. Fix: intentional
   max-widths + ambient context + real empty states.
4. **Orange does everything → means nothing (High):** one accent on nav, buttons,
   HIGH badges, glow, filters, links, brand. No neutral ramp. Fix: orange scarce;
   full neutral scale does heavy lifting.
5. **Dashboard fakes data (Medium):** rising sparklines over "+0 this week";
   Decisions/AI Answers = 0. Fix: real sparklines or none; zeros → empty states.
6. **Primary CTA looks disabled (Medium):** "Initialize Ingest" = muddy brown,
   reads greyed-out. Fix: true primary button states.
7. **Terminal voice mostly an asset, 2 leaks (Medium):** keep mono labels
   (Raycast energy). Leaks: (a) soften system verbs in core loops; (b) stop
   surfacing "CLAUDE HAIKU" (advertises cheapest tier → infer cheap output).
8. **Wiki grid flat — 26 identical cards, zero hierarchy (Medium):** fix w/
   typographic hierarchy, confidence as quiet left-edge, grouping, density.
- **KEEP & elevate:** brain mark + "SecondBrain/Cloud" lockup; the knowledge-graph
  viz (biggest differentiator); mono uppercase label system; "encrypted, never
  used to train AI" trust signal; the IA (Entity/Concept/Pattern/Synthesis typing).
- Throughline: almost everything is a **hierarchy + consistency** problem, not taste.

## Phase 2 — Design Principles & Brand Voice (6 principles)
1. **Trust is rendered, not claimed.** Forbids decorative data, fake trends,
   placeholder that looks real. Test: would this survive a literal reader?
2. **Quiet by default, loud by exception.** Exactly ONE loudest thing per view.
   Hierarchy via removing emphasis. Test: squint — does the one right thing pop?
3. **Built for the return trip.** Optimize for retrieval not capture. Confidence/
   recency/type = the scan path. Test: find the one item in <3s without reading
   every card?
4. **Structure is the feature.** Connections/graph/typing are the differentiator;
   make structure visible + central, not a corner link.
5. **One system, two lights.** Dark & light share one cool-neutral foundation,
   identical hierarchy. Light = a tint, not a separate pass.
6. **Earn motion, never decorate with it.** Every animation does a job. Test:
   remove it — lose info or just flourish? Flourish = cut.
- **Voice = competent colleague.** Two registers: **Terminal** (mono/uppercase/
  clipped — machine reporting on ITSELF: status, metadata, badges, ⌘K, IDs) vs
  **Human** (sentence case, warm — anywhere addressing the USER: titles, empty
  states, onboarding, errors, AI answers). Rule: machine talks terminal; user is
  spoken to in human.
- Voice fixes: stop printing CLAUDE HAIKU (say "AI MEMORY"/"QUERY ENGINE"); soften
  "Initialize Ingest" → "Add to memory"/"Add source"; empty states point to next
  action never apologize. **Ban "powerful" and "seamless."**

## Phase 3 — Color System
- **Cool neutral spine** (near-black, faint blue undertone — NOT warm, NOT cream).
  12-step neutral ramp does 90% of surface area.
- **Ember scarcity rule (THE point):** orange appears in exactly 3 roles per
  screen max — (1) single primary action, (2) one active nav item, (3) graph glow.
  - Ember 500 = **#F26F28** (deeper/less candied than old #FF6B00).
  - Hover = Ember 300 (lighter), Pressed = Ember 600 (deeper).
  - Ember tint = **rgba(242,111,40,0.14)** — replaces full pills for selected nav /
    active filter chip (whisper of tinted bg, not full fill).
  - Old yellow #FFD600 retired to rare data-highlight only.
- **Type → color triplet (formalized from graph legend):**
  Source=Blue #3B8FE0, Concept=Purple #8A7CF0, Pattern=Teal #2FB39C,
  Synthesis=Pink #E368A6, Entity=Slate #7C8694 (muted, most common), Person=Green
  #35C07A, Topic=Ember #F26F28, Decision=Amber #F5B341, Collection=Neutral.
- **3 rules:** (1) category colors worn lightly — badge = type color @~14% fill +
  full-strength text + hairline border; (2) **confidence stops being a color** —
  it's a 3px LEFT EDGE: Ember=HIGH, #3D424A=MEDIUM, nothing=LOW; (3) light mode =
  cool greys (#F6F7F9, #F1F3F6, blue undertone) not cream; Ember fails small-text
  contrast on white so light uses **Accent text #DC5C18** (Ember 600) for orange-
  as-type.

## Phase 4 — Typography System
- **Sans = Geist** (fallback Inter); **Mono = Geist Mono** (fallback JetBrains
  Mono). Both free, Google Fonts, variable. **Only 3 weights: 400/500/600.**
- Scale: Stat numeral 30/600/-0.02em (tnum); Page title 28/600/-0.02em; Section
  18/600/-0.01em; Card title 15/600/-0.005em; Body 14/400; Body-sm 13/400;
  Label/meta MONO 12/500/+0.08em; Badge/tag MONO 11/500; Button 14/500/+0.01em.
- **Mono rule:** mono allowed in EXACTLY 5 places (machine reporting on itself):
  status lines, metadata (timestamps/counts), badges & #tags, keyboard shortcuts,
  IDs/code. NEVER for: page titles, body, button labels, AI answers.
- **Tracking rule:** large type negative (-0.02em); small mono uppercase positive
  (+0.08em); body 0. (Cheapest premium upgrade.)

## Phase 5 — Spacing, Grid, Radius & Elevation
- **4px rhythm, 8 steps:** space-1=4, 2=8, 3=12, 4=16, 5=24, 6=32, 7=48, 8=64.
  Vertical rhythm uses big steps (24/32/48); component-internal uses small (4/8/12).
- **Max-widths (fixes abandoned pages):** sidebar 240px (64 collapsed); dashboard
  ~1400 centered; Wiki ~1400 3-col auto-fill minmax(320,1fr); single wiki page 720
  centered (reading); **ingest form 600 centered both axes (not top-right)**;
  AI Assistant 760 centered; Activity Log 760 timeline + 280 rail (kills void).
  Page gutters ≥ space-6 (32px).
- **Radius (tracks size):** sm=6 (tags/badges/chips), md=8 (buttons/inputs/search/
  small cards), lg=12 (cards/panels/popovers), xl=16 (hero/modals), full=9999
  (avatars/toggles ONLY). **Buttons drop from full pills to 8px** (precise, Linear
  register). Rules: no rounded corner on a single-sided border (confidence edge
  card = radius 0 12 12 0); radius is always a token never a literal.
- **Elevation = surface lightness + border, NOT shadows:** L0 canvas #0A0B0D none;
  L1 resting #16181C / border #23262B; L2 raised #1D2024 / #2F3338; L3 overlay
  #262A2F / #3D424A. **Hover = step up one surface level** (tactile, no shadow).
  Only permitted shadow: L3 overlays above a scrim = 0 16px 40px -12px
  rgba(0,0,0,0.7) (light: rgba(0,0,0,0.12)). Shadow banned everywhere else.

## Phase 6 — Iconography & Visual Language
- **Icons = Lucide, one family, outline, monochrome.** Stroke **1.5px** (not 2).
  Sizes 16/18/20/24. Icons inherit text color (secondary rest, primary hover,
  Ember active); only the brand mark is colored. State via color not fill.
- **type→color→icon triplet** (icon set): Source=file-text, Concept=lightbulb,
  Pattern=git-branch, Synthesis=sparkles, Entity=box, Person=user, Topic=hash,
  Decision=circle-check, Collection=folder.
- **Elevate the knowledge graph (biggest asset, currently a corner widget):**
  (1) node color=type, node size=connection count, edge opacity=strength, selected
  node=Ember halo; (2) dashboard mini-graph LIVE (hover preview, click navigate,
  nodes light up as AI answer assembles); (3) constellation as app-wide visual
  motif (loaders, empty states = node-and-edge motifs in type colors).
- Brand mark doubles as thinking indicator (slow pulse when AI processes). Trust
  signal: muted shield-check (text-secondary, not orange), stated as quiet fact.

## Phase 7 — Buttons, Inputs & Search (real CSS provided)
- Token subset defined (--canvas #0A0B0D, --surface-1/2/3, --border-*, --text-*,
  --ember #F26F28 / hover #FB8138 / press #DC5C18 / ink #1B1205 / ring rgba .40 /
  tint rgba .14, --error #F0524B, radii).
- **Buttons:** height 38 (sm 32/lg 44), radius md(8). Primary = Ember bg + **dark
  ink #1B1205** (NOT white — white-on-ember fails contrast). hover lighter, press
  deeper, active scale(0.98), focus ring 3px ember-ring. Disabled = surface-2 +
  text-disabled (unmistakably dim). Secondary/ghost/danger variants. **Exactly one
  .btn-primary per view.** Ingest loading = fixed width + constellation spinner +
  aria-busy.
- **Inputs:** field-label mono-uppercase 11/500/+0.08em. Input height 38, surface-1,
  0.5px border, focus = ember border + 3px ring (only place ember on input).
  aria-invalid = error border+ring.
- **Search = the product's spine.** (A) Inline: leading icon, instant client filter,
  type filter chips (active chip = ember TINT not full fill), ⌘K hint chip.
  (B) **Command palette ⌘K (global):** L3 overlay, fuzzy search everything + actions,
  results grouped by type w/ triplet, keyboard-driven, **no-results routes to AI**
  ("Ask your brain: '<query>' →") — search never fails, it escalates. Debounce
  ~120ms, client filter + server query, arrows/Enter/Esc.

## Phases 8-22 (announced, design-system track)
- 8 Cards, badges, tags, tables (confidence left-edge + triplet; fix flat Wiki grid)
- 9 Modals, dropdowns, toasts, tooltips
- 10 Sidebar & navigation (fix broken active-state: one active, 3 states)
- 11 Dashboard (real data per Principle 1)
- 12 Wiki/Knowledge Base (hierarchy, grouping, density)
- 13 AI Assistant (hide model tier)
- 14 Ingest flow (centered, "Add source")
- 15 Activity Log + light theme
- 16 Empty/loading/skeleton states
- 17 Motion & micro-interactions
- 18 Onboarding/activation
- 19 AI-native second-brain differentiation
- 20 Conversion & retention
- 21 Accessibility & responsive
- 22 Final implementation roadmap + compiled design-system.css

---

## ⚠️ CRITICAL RECONCILIATION FLAG (must resolve before building either track)

This design-system spec **conflicts with the current build's aesthetic** in
specific, deliberate ways. Both can't be true; we must pick:

| Dimension | CURRENT build (.sb-dashboard) | THIS spec ("Quiet Instrument") |
|---|---|---|
| Base | warm metallic black, glass panels | cool near-black #0A0B0D, flat |
| Elevation | frosted glass + blur + grain + shadows | surface-lightness + border, NO glass/shadow |
| Accent | #ff7a1f (warm) | #F26F28 Ember (deeper) |
| Light theme | YC cream (#f6f1e7) | cool grey tint (#F6F7F9) — rejects cream |
| Buttons | rounded-2xl pills, white text on accent | 8px radius, DARK ink on ember |
| Font | Inter + JetBrains Mono | Geist + Geist Mono |
| Spotlight/grain FX | yes (premium glass) | no (calm, restraint) |

**The user previously said they LOVED the demo's colors/glass tones** and wanted
the whole site synced to that. This spec proposes the opposite direction (kill
glass, go cool-flat-Linear). These are genuinely different aesthetics.

**→ Do NOT start building until the user resolves:** keep the glass/Apple-silicon
look they loved, OR pivot to this "Quiet Instrument" cool-flat system? Or a hybrid
(e.g. keep glass surfaces but adopt the scarcity/hierarchy/typography/voice rules,
which are aesthetic-agnostic and almost all GOOD regardless)?

My recommendation to raise with user: **adopt the PRINCIPLES + structure from this
spec (scarcity of accent, one active state, confidence-as-edge, type triplet,
typography scale, voice registers, real-not-fake data, command palette, retrieval-
first) — these are pure upgrades and aesthetic-neutral — while letting them choose
the surface skin (glass vs flat).** Most of this spec's value is in the discipline,
not the specific flat-vs-glass choice.

---
_Last updated: captured Design-System track Phases 1-7 + announced 8-22. Still awaiting more from user. NO BUILD YET._


---

## Design-System track — Phases 8-15 (captured)

### Phase 8 — Cards, Badges, Tags & Tables
- Type tokens added: --type-source #3B8FE0, concept #8A7CF0, pattern #2FB39C,
  synthesis #E368A6, entity #7C8694, person #35C07A, topic #F26F28, decision #F5B341.
- **Knowledge card (.kcard)** = 3 encoding channels: (1) confidence LEFT EDGE (3px;
  HIGH=ember, MEDIUM=border-strong, LOW=none + full radius); (2) type BADGE
  (color+icon triplet); (3) recency in MONO metadata. Title 15/600/-0.005em
  out-weighs desc; hover lifts via surface step (no shadow). HIGH card =
  radius 0 lg lg 0.
- **Badge** = one class driven by `--c` var; `color-mix(in srgb, var(--c) 14%,
  transparent)` fill + 35% border + full-strength text. Low saturation, never loud.
- **Tags** = quieter tier than badges: no fill, mono, text-3, hover brighten
  (filter handles, not status).
- **Density toggle** comfortable(cards) ↔ compact(.krow one-line rows w/ type dot).
  + optional **grouping** (by type / recency Today-Week-Older / collection) via
  mono-label dividers. Structured .ktable for Sources/People.
- **Metric card honest-by-construction:** trend logic in render not CSS — if
  delta==0 show NO sparkline + muted "no change"; sparkline only renders on real
  movement; value 0 → em-dash "—". Chart & number can't disagree.

### Phase 9 — Modals, Dropdowns, Toasts & Tooltips (transient layer)
- Tokens: --scrim rgba(10,11,13,.6), --shadow-overlay 0 16px 40px -12px
  rgba(0,0,0,.7), --ease-out cubic-bezier(.16,1,.3,1) (decisive, no bounce).
- **Modals** = L3 overlay, the ONE place shadow lives. min(480px), radius-xl, fade
  + 8px rise (.18s). Focus trap, Esc + scrim dismiss, one .btn-primary. Modals for
  focused decision/short form only — if it can be a page/panel, it should be.
  Destructive actions skip modal → use undo toast; confirmation dialogs reserved
  for truly irreversible (confirm=.btn-danger).
- **Dropdowns/menus** L2/3, ember-TINT highlight for hover/keyboard select (same
  "selected" language everywhere).
- **Toasts = forgiveness layer (most important):** every destructive/significant
  action → **undo toast not confirmation dialog**. "Source removed · Undo", ~6s
  window w/ draining timer bar, pause-on-hover, stack max 3, role=status
  aria-live=polite (errors assertive). Ingest uses persistent variant.
- **Tooltips** calm: ~500ms delay before first; siblings instant once open. Labels
  + shortcuts only, never essential info/paragraphs. prefers-reduced-motion respected.

### Phase 10 — Sidebar & Navigation (fixes the critical active-state bug)
- Tokens: --nav-w 240px, --nav-w-rail 64px.
- **Active-state law:** exactly ONE active item; active = quietest confident signal.
  3 states: rest (text-2, recedes), hover (surface-1 lift + text-1, NO orange),
  active ([aria-current=page] = ember-TINT bg + text-1 + ember icon + 3px left bar
  ::before). Tint-not-fill spends zero scarce orange on mere location.
- **Hierarchy:** group 10 flat items w/ mono-label dividers — top ungrouped
  (Dashboard, Search ⌘K, Inbox) / "KNOWLEDGE" (Sources, Memory, Topics, People,
  Decisions, Collections) / "INTELLIGENCE" (Graph, AI Assistant). Framing Graph+AI
  as Intelligence reinforces "structure is the feature."
- **Inbox badge:** real count, ember dot-with-number (the one extra accent allowed,
  it's actionable); renders nothing if 0.
- **Collapsed rail** 64px: tint+bar active, tooltips supply labels, brand alone,
  trust → shield only. Toggle persists per user.
- **Footer:** trust block (muted shield-check, states fact not sells) + account row
  (avatar/name/plan + theme toggle pill); "Pro Plan" → billing entry. Never
  mid-word truncate name ("Alex T." not "Alex Th…").

### Phase 11 — Dashboard (full rebuild)
- 2-zone grid: main (~1400 cap) + sticky right rail (320px); gutters 32, section
  breaks 48. Collapses <1100px.
- **Greeting honest + useful:** "Your brain has 26 notes across 4 sources" (real
  data) not "up to date". Search + Add top-right; bell only if non-empty.
- **Metric row honest-by-construction** (Phase 8 logic): em-dash for 0, conditional
  sparkline, populated metrics lead / empty ones last.
- **AI hero = compact centered invitation** (NOT a tall void): drop height,
  vertically center, ember constellation behind input @ low opacity, "✦ Ask your
  brain" human register, submit expands inline (no navigate).
- **Right rail:** recent activity (real ingest events) + **live interactive
  mini-graph** (type-colored nodes, sized by connections, hover preview / click
  nav, lights up when AI hero queried — the cross-panel "feels like a brain" moment).
- "Memory at a glance" keeps 4-up but empty cards (Decisions/Answers) get inviting
  empty states not dead ends; "This week" → segmented control; recent sources = 
  .kcard row w/ badges + confidence edge.

### Phase 12 — Wiki / Knowledge Base (densest screen, heart of retrieval)
- Control bar: search (flex-1, ⌘K) + **type filters using triplet colors** (active
  = ember tint) + count line "26 pages · 8 high-confidence" + density toggle + sort
  (Recent/Confidence/Type/A-Z).
- Grid: auto-fill minmax(320,1fr) .kcards w/ all 3 channels live.
- **Grouping** (mono-label dividers): by recency (default mental model) / type /
  confidence. Compact view = .krow list (scan 40 in time for 9 cards).
- **Reading view (card opens into):** 720px centered (~70-char measure), H1 28/600,
  body **16px/1.7**, type+confidence header, tags. **"Connected" block** (cross-links,
  triplet-colored) + **local graph slice** (node + neighbors) = navigate by
  relationship not just search. Provenance footer (tokens, ingest date) in mono.
- Empty = dim constellation node + "add your first source"; loading = skeleton
  .kcards w/ shimmer not spinner.

### Phase 13 — AI Assistant (the trust artifact)
- Empty state: 760px centered column, brain mark slow pulse, "Ask your brain"
  (human register, not "Query Your Wiki"), subtitle states value ("answers cite
  exact sources"), suggestion cards reference real data ("across your 26 pages").
- **STOP advertising "CLAUDE HAIKU"** (3 places) → "CITED RESPONSES" / "QUERY
  ENGINE". Model names read as quality signals; surfacing Haiku → infer cheap.
- **Thinking state:** brain-mark pulse + machine register "SEARCHING 26 PAGES →
  found 4 sources / SYNTHESIZING…"; relevant graph nodes light up during.
- **Answer = trust artifact (heart):** human register, 16px/1.7. Every claim has
  inline citation chip (ember-tint, super, numbered) → hover highlights matching
  source + pulses its graph node → click opens reading view. Unbroken chain:
  answer→claim→citation→source→graph→page. Source list below w/ triplet badges.
- Follow-up chips after answer; composer sticky-docked at bottom (never floating).
- **Failure honesty:** no sources → don't hallucinate, offer web/add-source; low
  confidence → say so plainly + show thin evidence.

### Phase 14 — Ingest Flow (front door / activation)
- Form 600px centered (not top-right). Keep "INGEST ENGINE · READY" mono breadcrumb.
- 3 modes = segmented control (active = ember TINT not fill): URL / Paste text /
  Upload (real dropzone w/ dashed border, ember on drag).
- **Button: "Initialize Ingest" → "Add to memory"** (terminal voice in label above,
  not the button). Bright .btn-primary, dim disabled — bug dead by construction.
- **Processing experience = the aha (phase's whole point):** form transforms in
  place into live pipeline (no navigate), machine register, steps resolve:
  Reading ✓ 2400 words / Extracting ✓ 4 pages / Identifying ✓ 6 entities /
  Cross-linking ✓ 11 connections. **During cross-link, graph shows new nodes +
  edges drawing to existing knowledge** — user watches source woven into brain.
  Not a loading state, a demonstration (Principle 4).
- Success: "Added · 4 pages + 6 entities · 11 links" + View/Add another + persistent
  toast. First ingest → expand to onboarding handoff.
- Friction-killers: global `C` opens ingest; ⌘V auto-detects url/text; drag file
  anywhere opens ingest preloaded; browser-extension/share-sheet capture path.
- **NOTE: ingest pipeline is the natural hook for agent auto-ingestion** (agent
  watching a source runs this flow unattended, reports via activity log) — bridge
  to Hermes track.

### Phase 15 — Activity Log + Light-Theme Reconciliation
- **Light theme = cool tint of dark, NOT cream** (full token override only;
  components re-tinted not restyled): canvas #F6F7F9, surface-1 #FFFFFF, surface-2
  #F1F3F6, surface-3 #E8EBEF; borders #E9ECF0/#DCE0E6/#C8CDD6; text
  #14161A/#565C66/#878D97; **--ember-text #DC5C18** (500 fails AA on white — orange-
  as-text forks to 600, orange-as-fill stays 500); ember-ink flips to #FFFFFF on
  light; overlay shadow softens to rgba(20,22,26,.14). Side-by-side test = parity.
- **Activity Log layout:** 760 timeline + 280 sticky rail (kills void). Timeline =
  vertical spine + operation-colored nodes. Op color language: ingest=ember,
  query=type-source(blue), lint=type-pattern(teal).
- Keep honest summary lines + real token counts + tag chips. Rail = TODAY totals
  (events/tokens/connections) + FILTER segmented w/ live counts + THIS WEEK
  sparkline (only if real). Soften "Every operation..." → "Recent operations" (3
  rows undercuts completeness claim).

### Phases 16-26 (announced — revised roadmap that FOLDS IN the Hermes track)
- 16 Empty/loading/skeleton states (constellation motif, no "No X yet" dead ends)
- 17 Motion & micro-interactions
- 18 Onboarding & activation
- 19 AI-native second-brain differentiation
- 20 Hermes Agents OS · agent surface (dashboard, runs, monitoring)
- 21 Hermes Agents OS · agent builder & config
- 22 GBrain/gstack skills · library & install flow
- 23 Skills · execution UI + skill-in-context
- 24 Conversion & retention
- 25 Accessibility & responsive / mobile
- 26 Final implementation roadmap + design-system.css compile
> NOTE: This design track's Phases 20-23 cover the SAME Hermes/GBrain surfaces as
> the first track's Phases 20-24. They're two passes at the same thing — reconcile
> into one build plan. The spec author explicitly asked the user for a brief on
> what Hermes/GBrain/gstack/skills actually are (the user has since been answering
> that via the first track's detailed Phase 20-23 notes).

---
_Last updated: captured Design-System Phases 8-15 + announced 16-26. NO BUILD YET. Awaiting "that's all"._


---

## Design-System track — Phases 16-19 (captured)

### Phase 16 — Empty, Loading & Skeleton states
- **Empty = name the value + point at the one action.** Anatomy: dim
  constellation glyph (sparse unconnected nodes in type colors) + title + body +
  action. Copy map: Decisions "Decisions you save will surface here. Capture your
  first →"; AI answers "Ask your brain anything — answers cite their sources →";
  Wiki "Add your first source →"; search no-results "Nothing matches '{q}'. Ask
  your brain instead →" (escalates never fails); cleared inbox = reward not void.
  First-ever-use = warmer/bigger, single bright pulsing node, "Let's build your
  second brain."
- **Skeletons mirror real component geometry** (loading .kcard = .kcard-shaped),
  slow low-contrast shimmer (1.4s surface-1↔2), **~200ms delay before showing**
  (fast loads never flash). AI answer streams (no skeleton); ingest = live
  pipeline; graph assembles node-by-node.
- **Errors calm + forgiving:** field-level inline factual; action-level → toast w/
  Retry not dialog; page-level = constellation w/ one broken edge. AI "no results"
  = empty state not error.

### Phase 17 — Motion & Micro-interactions
- **Only 2 easing curves:** --ease-out cubic-bezier(.16,1,.3,1) (enters/moves),
  --ease-in-out cubic-bezier(.45,0,.2,1) (in-view state changes). Durations:
  --t-instant 80ms (press), --t-fast 120ms (hover/focus, workhorse), --t-base
  180ms (modals/dropdowns/toasts), --t-slow 240ms (view transitions). **Nothing
  over 240ms.** Smaller change = faster.
- Hover = lift one surface level (t-fast). Press = scale(0.98) (t-instant) — the
  key satisfying micro-interaction. Focus = ember ring INSTANT (no transition).
- View transitions = content cross-fade + 8px rise (t-slow), chrome stays still.
  Shared-element where possible; list stagger ~20ms capped at first ~8 items.
- **Graph = the ONE place motion is alive:** rest = imperceptible drift; ingest =
  new nodes fade + edges draw ~600ms (longest sanctioned anim, demonstrating core
  value); query = relevant nodes pulse ember; selected = ember halo 2s pulse.
- Non-negotiables: prefers-reduced-motion everywhere; never animate per
  keystroke/scroll; 2 curves period. Test: remove it — lose info or flourish?

### Phase 18 — Onboarding & Activation
- **Activation aha = watching your own knowledge get cross-linked** (the moment an
  edge draws between 2 sources). Whole first-run drives to the SECOND ingest.
- **Cold-start choice (first screen):** "Add my first source" (→ ingest) OR
  "Explore with a sample" (loads small real pre-connected brain). **Sample
  unmistakably labeled + one-tap clearable** (never mistake demo for own data).
- First ingest staged: "Here's your first memory" → node appears spotlit → "Add
  one more and watch them connect." Second ingest = first edge = aha → "Your brain
  is connected."
- **Progressive nav disclosure:** 0 sources → only Dashboard/Add + dimmed rest;
  first source → Sources/Memory/Graph activate; few sources → Topics/People/
  Decisions/Collections. Matches interface to what's real.
- Quiet dismissible activation checklist (pill near account, not modal): add source
  → add second/link → ask question → save decision. Auto-hides when done. No
  coach-mark tour (Phase 16 empty states onboard continuously).

### Phase 19 — AI-Native Differentiation (the "why switch from Notion")
- Posture: **a true second brain does work you didn't ask for.** 5 workflows:
  1. **Proactive synthesis** — AI watches for recurring themes across sources,
     auto-generates a Synthesis node (pink type), appears as gentle Inbox item,
     review/keep/dismiss; kept ones become first-class nodes. Notion can't (no
     typed structure). Always shows source chain.
  2. **Connection engine** — on ingest, suggests links to existing knowledge;
     confirm/reject; removes the manual-linking pain of Obsidian/Roam.
  3. **Contradiction detection** — new source disagrees w/ stored note → flag both
     side by side (amber, sparingly).
  4. **"How my thinking changed"** — temporal view over a topic ("3 weeks ago you
     believed X; recent sources point to Y").
  5. **Graph as active reasoning surface** — query-reactive (subgraph lights up),
     explorable (click node → explain edges), gap detection ("lots on X, nothing
     on retention — explore?").
- **Honesty architecture (keeps proactive from becoming noise):** (1) suggestions
  live in Inbox never interrupt; (2) everything shows evidence; (3) dismissal
  teaches (system gets quieter/sharper). **Inbox reframed from "notifications" to
  "things your brain noticed."**
- **This is the explicit bridge to agents:** each workflow = a thing done
  automatically = an agent. Agents are the engine that runs these autonomously.

---

## Hermes Agents OS track — Phases 23-25 (captured, from BOTH tracks' detailed passes)

### Phase 23 — Trust, Security & the Aegis Gate
- **Per-agent trust = a track record earned, not a setting.** 0-100. New agents
  start low, climb w/ approvals + clean dry runs. Bands: trusted 80-100 (green),
  proving 40-79 (neutral), watch <40 (amber). Score color is the whole UX — only
  noticed when NOT green. **Teeth:** drives default sign-off policy (high → more
  auto; watch → forced ask-first regardless of config). Self-tightening.
  - Up: approved-without-edits, clean dry runs, sources pass scan, in-scope.
  - Down: rejected/refined proposals, scope-boundary attempts, ingesting content
    that later contradicts, any detected injection.
- **Content scanner = the REAL threat model (runtime, not just skills):** every
  source an agent reads is scanned BEFORE becoming a node — embedded instructions
  ("ignore your task..."), credential/PII patterns, text addressed to "the AI."
  Flagged content **held for review with the suspicious passage shown** — never
  blocked silently, never ingested silently. The gate is the user.
- **Scope legible:** plain-language per-agent permission statement incl. explicit
  **"cannot" list** (touch other collections / delete ever / share outside brain)
  — reassurance by negation.
- **Aegis = one coherent layer** (not scattered gates). Unified queue (rail+Inbox),
  consistent anatomy **what · why · your decision**. 3 rules: one queue/one
  anatomy; stakes-scaled (reversible low-stakes → undo toast, not Aegis); decisions
  teach. Approve options: Approve / Refine / Dismiss.
- **Security posture present but never loud:** squad posture (0-100, tool-call
  audit, injection log) lives ONE CLICK IN (agent detail / Security tab), NOT on
  home. Home = green dots + get out of the way.

### Phase 24 — GBrain/gstack Skills Library
- **Mental model: a skill = capability w/ defined input + output + blast radius**
  (does-what / needs-what / can-touch-what). GBrain = browsable registry; gstack =
  installed runtime. User already authors this model (beast-mode, humanizer = SKILL.md).
- **Library** = 2 tabs: Installed (your gstack) / Discover (GBrain registry). Wiki
  grid rhythm + search + capability filters (Ingest/Synthesize/Filter/Research).
  Skill card: diamond mark (NOT type colors), name, capability category, desc,
  **"touches:" line on card face** (blast radius first — touches:nothing trivially
  safe, touches:web warrants a look), ✓ scanned badge, used×N.
- **Install flow = visible security scan, blocks on failure:** ✓ no injection / no
  credential access / no exfiltration / **declared capabilities match behavior**
  (a skill claiming touches:nothing that reaches network = flagged for the lie).
  **Install grants skill to gstack but NOT authority to an agent** — capability +
  authority are separate grants (two-step least-privilege; web-watch can't reach
  web until assigned to an agent + domains allowlisted).
- Skill detail = readable SKILL.md (720px reading view): what/needs/returns/can-
  touch + "used by" (links to agents). Custom skill builder = same fields.
- **Management reversible:** Update (re-scan before apply), Disable (pause),
  Remove (dependency-aware warning — "removing summarize leaves Synthesist without
  its core capability"). **Periodic re-scan** of installed skills; failed re-scan →
  auto-disable + surface to Aegis. Trust is continuous not one-time.

### Phase 25 — Skill Execution, Cost & Budget Tracking
- **Cost is a trust dimension** (Principle 1) — invisible spend loses users. Always
  visible, always bounded.
- **Live trace** (deeper look at a board task card): machine-register pipeline at
  skill level — each skill invoked = a step resolving in real time w/ token cost
  ticking + per-run budget bar (>80% amber, over=red). Makes black box glass →
  debuggable + honest about cost. Doubles as the run record.
- **Token economy (Usage surface):** elevates activity-log tokens to a view —
  this-week sparkline (only if real), BY AGENT breakdown, BY SKILL breakdown (real
  attribution from traces). Plan allowance shown plainly ("24K of 100K").
- **Budgets with teeth:** per-run cap (agent stops + reports, unfinished work
  carries to next run); per-agent weekly/monthly cap (→ "budget-paused" state →
  Aegis); **squad-level master cap** (one number caps total monthly spend). Default
  conservative; raise as trust grows (same earn-it arc).
- **Run history** = saved trace + outcome + Aegis result. Failed/odd runs keep
  trace (debuggable after the fact). **Feeds the trust score.** The loop: trace →
  cost data → budget enforcement → run outcomes → trust score → autonomy + budget
  defaults. Self-consistent.

---

## Design-System track — Phases 26-27 (captured)

### Phase 26 — Conversion & Retention
- **Free/Pro line = a real value jump:** Free = "a brain that stores + answers"
  (manual ingest, full Wiki, search, graph, AI Assistant w/ citations — generous,
  builds real knowledge = retention hook). Pro = "a brain that works for you" (the
  Hermes agent layer + higher token budgets + more agents + advanced skills).
  Pitch: **"Your free brain remembers. Pro makes it think."**
- **CRITICAL honesty rule: never gate something the user already created.** Hit a
  free limit → existing knowledge stays fully accessible; cap NEW capability, never
  hold memory hostage.
- **Upgrade prompts at moments of demonstrated value, dismissible, never repeated,
  never modal-blocking, CTA = the one ember action.** After great cited answer ("an
  agent could keep this updated"); empty agent dashboard for free user (shows what a
  squad would do for THEIR real data); at a limit (frame as evidence of value).
- **Trial delivers the agent aha on real data:** spins up one real agent (Scout on
  most-active source) → real proposals in Aegis within a day. Dry-run makes it safe.
  Trial ends → agent pauses (doesn't delete work) → "Reactivate your squad → Pro."
- **Retention = squad doing genuine overnight work** (Aegis queue is the daily hook;
  "today" proof-of-work; proactive synthesis; growing-brain investment/switching
  cost). **REFUSE: no engagement-bait notifications, no streaks, no guilt** (corrode
  calm).
- North-star metrics: free activation = first edge drawn; Pro activation = first
  approved agent proposal. Pricing page honest (no asterisk traps, transparent
  token allowances, easy cancel).

### Phase 27 — Accessibility & Responsive / Mobile
- **Color never the only signal:** type triplet is ALWAYS color + icon + label;
  agent states color + label; confidence = edge + stated. Test: remove all color —
  every distinction still readable.
- Contrast WCAG AA by construction (text-1 on surface-1 clears; text-3 only for
  non-essential metadata; ember-as-text = #DC5C18 in light).
- **Keyboard nav complete:** visible ember focus (instant), logical tab order,
  skip-to-content link, focus trap in modals/palette, arrow-key nav in lists/board/
  Aegis queue, `?` shortcut sheet.
- **Screen readers:** semantic HTML first; aria-current/role=status/aria-live/
  aria-busy/aria-invalid. **Graph needs a text alternative** (parallel relationship
  list — "connects to: X,Y,Z"); agent activity announces politely; citations
  properly associated.
- Motion: prefers-reduced-motion = **replace not remove** (still shows state, no
  transition). No bolt-on accessibility-overlay widgets (theater).
- **Responsive breakpoints:** >1100 full 3-zone; 700-1100 = collapsed rail + rail
  drops below + metrics wrap + board scrolls horizontally; <700 mobile = off-canvas
  drawer + bottom tab bar (Dashboard/Search/Add/Inbox) + everything stacks + Wiki
  compact-default + AI Assistant shines (chat) + board one-col swipe + graph
  simplified/text-list.
- **Mobile superpower = frictionless CAPTURE** (bottom Add + share-sheet extension);
  the squad structures later; mobile capture + desktop review = real division of
  labor. Mobile = capture & check, not deep work.

### Phase 28 (finale, CAPTURED) — Implementation Roadmap + design-system.css compile
Two deliverables: a 5-wave impact-ordered build plan + a compiled foundation CSS
(all tokens Phases 3-5 + core components Phases 7-10 + motion + agent states +
skeleton/empty + reduced-motion block). Sequencing logic = ship credibility first,
then the component system everything composes from, then pages, then polish, then
the agent layer last (biggest build, depends on all of it, IS the Pro tier).

**The 5 waves (impact-ordered, nothing blocks on something unbuilt):**
- **Wave 1 — Critical UI (days).** Credibility fixes that stop the app looking
  broken. Drop in token file; swap to Geist/Geist Mono; fix active-nav (6 pills →
  one tint+bar, P10); fix "Initialize Ingest" (muddy → bright primary, P7);
  reconcile light mode (cream → cool tint, P15). Highest impact-per-hour.
- **Wave 2 — The component system.** buttons, inputs, search, cards, badges,
  modals, toasts, tooltips, nav (P7-10). The multiplier — after this, pages are
  composition not design.
- **Wave 3 — Core page rebuilds.** Dashboard (honest metrics P11), Wiki (3-channel
  cards + density + reading view P12), AI Assistant (citation trust chain P13),
  Ingest (live pipeline P14), Activity Log (P15).
- **Wave 4 — Premium polish + UX depth.** Command palette (P7), motion system
  (P17), empty/loading/skeleton (P16), onboarding/activation (P18).
- **Wave 5 — AI-native + Hermes Agents (= the Pro tier).** Proactive synthesis +
  graph-as-reasoning (P19), then full agent system: squad dashboard, conversational
  builder, work board, Aegis trust layer, GBrain skills, cost/budget (P20-25),
  wired to conversion model (P26). Last because largest + depends on everything.
- **Cross-cutting every wave (never a final pass):** accessibility (P27) +
  responsive (P27). Baked per-component; retrofitting is the expensive way.

**Foundation CSS notes:** file = tokens + primitives only; composed surfaces (live
ingest pipeline, citation trust-chain, agent board, Aegis queue) build ON TOP using
their phase specs (deliberately kept out so the base stays clean). Honesty rules
live in RENDER LOGIC not CSS (conditional sparklines, em-dash-not-zero, scan-before-
ingest, one-primary-per-view) — noted in comments, enforced in component code. Set
`data-theme` on root → components inherit the whole system. Watch-out: badge
`color-mix()` is well-supported but precompute per-type values if older-browser
support needed.

> NOTE: user has NOT pasted the literal compiled CSS block — they described it.
> When we build Wave 1 we author the token file ourselves from the Phase 3-5 + 7-10
> specs already captured above (we have every value). Nothing is missing to start.

---
## ✅ CAPTURE COMPLETE — all 28 design phases + Hermes track captured.

The throughline (spec author's one-sentence summary): *a memory tool earns the
right to be premium by being trustworthy first — and trust is rendered, not claimed.*

**Single blocking decision before ANY build = the aesthetic reconciliation**
(see "⚠️ CRITICAL RECONCILIATION FLAG" above): keep the warm Apple-silicon GLASS
look the user loved, OR pivot to the cool-flat "Quiet Instrument" system the spec
describes, OR HYBRID (keep glass skin + adopt all the aesthetic-neutral discipline:
accent scarcity, one-active-state, confidence-edge, type triplet, typography scale,
voice registers, honest data, command palette, retrieval hierarchy). Agent
recommendation = HYBRID. Once resolved → formalize into a spec (Requirements →
Design → Tasks) and build Wave 1.

_Last updated: ALL 28 phases captured. Awaiting aesthetic decision → then spec._


---

## DEFERRED — Ingest page (Phase 14) feature-wave items
_Logged after the Wave-1 visual sync of /app/ingest. Page now matches the glass
dashboard (sb-dashboard shell + dash-panel + dash-card-solid wells + grain/
spotlight/aura). The following are NOT design-system work — they are feature-wave
or Hermes-agent items. Revisit when we build those waves; do NOT block Wave 1._

1. **Real-counts processing pipeline (honesty gap).** The 5-step pipeline
   (Fetch→Analyze→Write→Link→Index) currently advances on a ~2.2s timer, not from
   real backend events. Spec wanted real numbers ("Reading ✓ 2,400 words /
   Extracting ✓ 4 pages / Identifying ✓ 6 entities / Cross-linking ✓ 11 links").
   Needs `/api/ingest` to STREAM progress (SSE/chunked). Touches the "trust is
   rendered, not claimed" principle — the success card IS honest (real page +
   token counts); only the in-progress stepper is cosmetic.
2. **"Watch it weave into the graph" moment.** New nodes/edges drawing into the
   knowledge graph during cross-linking. Not built. Feature-wave.
3. **Friction-killers (Phase 14):** global `C` opens ingest; ⌘V auto-detect
   url/text; drag-a-file-anywhere opens ingest preloaded; browser-extension /
   share-sheet capture. Low-to-med effort; not built.
4. **"Import transcript"** appears in the dashboard Add menu but has no dedicated
   handling (opens the text tab). Needs a real transcript path (YouTube/audio →
   transcript). Overlaps Hermes.
5. **Persistent success toast** instead of the inline success card (toast/
   forgiveness layer is a later design phase).
6. **More ingest source types (later):** paste-multiple-URLs, RSS/URL source to
   WATCH (= the Hermes **Scout** agent — auto-ingest belongs in the agent layer,
   not the ingest form), email-in capture.

→ Decision (user): note these and keep moving with the app-wide glass consistency
   pass. Ingest is functionally complete + on-brand for now.


---

## BUILD PROGRESS LOG — "sync every page to the glass dashboard" (the real direction)
_The written Wave-1 spec (cool-flat Quiet Instrument) was superseded in practice
by the user's clear, repeated direction: KEEP the warm Apple-silicon glass look
and sync every page to it, enhancing additively. Logging actual shipped state so
the spec stays honest. Surface_Skin = hybrid; glass is the visible skin everywhere._

DONE + user-approved:
- **Phase 1 — QI foundation tokens** (namespaced `--qi-*`, opt-in `.qi`, collision-safe). Invisible. 40 tests.
- **Phase 2 — Geist/Geist Mono** via next/font, bound to `.qi` tokens. Invisible.
- **Ingest page (`/app/ingest`)** — fully synced to glass: `.sb-dashboard` shell, `.dash-panel`,
  `--dash-card-solid` dark wells, grain + cursor spotlight + warm aura, glowing primary CTA.
  (Superseded the spec's cool-flat `.qi-btn-primary` plan for this page.)
- **Sidebar active-nav** — fixed the 6-orange-pills bug via pure `resolveActiveIndex`
  (pathname + query, single winner) in `src/components/sidebar-nav.ts`; `aria-current="page"`;
  removed the fake "12" Inbox badge (real count, 0 → none, 99+ cap). Property tests added.
- **Wiki/Memory (`/app/wiki`)** — full enhancement:
  - Glass sync (shell, panels, dark wells, metallic heading, glowing "Add source").
  - **Star/Pin** (new `pinned` field on Page model + PATCH toggle) — single star, pinned cards
    glow, "Pinned" section groups above "All pages".
  - **Delete** with **undo toast** (forgiveness layer) — new DELETE route, cleans dangling
    relatedSlugs.
  - Sort (Recent/Pinned/A–Z/Confidence), all 7 type filters, density toggle (cards↔rows),
    confidence-as-left-edge, type icons (triplet), honest count summary.
  - **Actions menu** rebuilt with Radix DropdownMenu (portal) — KEY LEARNING below.

⚠️ KEY LEARNING (portals + scoped tokens): Radix portals render at `<body>`, OUTSIDE the
`.sb-dashboard` scope, so `--dash-*` tokens DO NOT resolve there → a transparent menu that
let card text bleed through. FIX: portal-rendered overlays (menus/tooltips/popovers) must
use ROOT-level tokens (`--bg-elev-3`, `--surface-2`, `--border-bright`, `--text-primary`,
`--accent`, `--shadow-3`) + a solid opaque background, never `--dash-*`. Apply this to ALL
future portalled overlays. TODO: give the dashboard's own "+ Add" menu the same portal-safe
treatment (latent same-bug risk).

Tests currently green: 71 (3 original suites + QI foundation PBTs + sidebar resolver PBTs +
ingest button contract). Build passing.

NEXT PAGES to sync to glass (one per phase, stop-and-review): Search (`/app/query`),
AI Assistant, Activity Log (`/app/log`), Settings. Apply the recipe: `.sb-dashboard` shell +
`.dash-panel` + `--dash-card-solid` wells + grain/spotlight where it's a hero + portal-safe
overlays + validate per-page actions (no dummy data, add the obvious user actions).


---

## AGENT LAYER — honest status + sequencing decision (locked)

**User decision:** Finish the design-consistency pass FIRST, then build the full
Hermes agent orchestration layer. Matches Phase 28 roadmap (agents = Wave 5, last,
because biggest build + depends on everything + it's the Pro tier).

### What EXISTS today (~15% of the agent vision):
- Backend plumbing: `/api/agent/{query,search,ingest,manifest,tokens}` + token auth
  (`agent-auth.ts`) + `vault-ops.ts`.
- Control plane: `agent-service.ts`, `agent-provisioner.ts` (Docker + Null drivers),
  `/api/agent-instance/{provision,start,stop,status}`.
- Skill catalog: `src/lib/skills/catalog.ts` (5 skills) + `/api/skills`.
- Models: `AgentToken`, `UserAgent`.
- UI `/app/agent`: single-agent BYO-key setup + status + start/stop + chat —
  **chat is a PLACEHOLDER (not wired to a running agent loop).** Already glass-styled.

### What's NOT built (the orchestration vision — Phases 20-25):
- ❌ Squad dashboard (multi-agent: Scout/Synthesist/Connector/Critic/Librarian/Researcher)
- ❌ Conversational agent builder (design-by-conversation, 5 config fields, dry-run)
- ❌ Work board (Queued→Reading→Connecting→⚑Review→Woven in)
- ❌ Aegis trust gate (propose-never-write sign-off queue, evidence, refine/approve/dismiss)
- ❌ Per-agent trust scores + content scanner + least-privilege scope
- ❌ Skills library UI (browse/install GBrain·gstack, security scan, two-step grant)
- ❌ Skill execution traces + cost/budget tracking
- ❌ Real agent run engine (propose-never-write runner calling vault-ops as tools)

### Agreed sequence:
1. FINISH design-consistency pass: Activity Log (`/app/log`), Settings, + light polish
   of the existing agent page. (one page per phase, stop-and-review)
2. THEN build the Hermes agent layer in its own wave, in this order (each reviewable):
   skill catalog extend → propose-never-write runner + Proposal model → Aegis sign-off
   queue → Squad dashboard → conversational builder → work board → skills library →
   cost/budget. New models needed: Proposal, AgentRun, Report, Suggestion + content scanner.


---

## SECURITY / PRIVACY — encryption reality + roadmap (IMPORTANT, do not overclaim)

User asked: what proof/system encrypts user data, and can the OWNER be made unable
to access it (for trust)?

**Honest current state:**
- In transit: TLS/HTTPS (Let's Encrypt). ✓
- At rest: MongoDB Atlas AES-256 default. ✓
- AI training: Anthropic API does NOT train on API data (policy, not cryptographic proof). ✓
- BUT content is stored as PLAINTEXT fields; owner/app-server CAN read it. So
  "even the owner can't see your data" is currently FALSE. Do NOT claim it until real.

**Hard tradeoff:** true zero-knowledge E2EE (browser-side key from user password,
server stores only ciphertext) is FUNDAMENTALLY INCOMPATIBLE with the core product —
Claude/search/auto-link must see plaintext server-side to work. Every AI-notes
product has this constraint.

**Recommended honest trust model (roadmap, not built):**
1. Per-user envelope encryption via KMS/HSM (per-user data key wrapped by master key);
   data never raw-plaintext at rest; decryption keyed + AUDIT-LOGGED.
2. Strict access controls + audit logs on any admin/DB access.
3. Optional "private notes" subset that the AI never processes → those CAN be true
   client-side E2EE (a zero-knowledge tier).
4. Accurate privacy policy stating the above.

**Action taken now:** softened the Settings → Data & Privacy copy to be ACCURATE
(encrypted in transit + at rest; processed only to power features; never sold; not
used to train AI). Removed any "owner cannot access" implication. Envelope
encryption + audit logging = a dedicated future SECURITY task (pair with gstack /cso).


**DECISION (user):** Keep the corrected, accurate privacy copy now. Do NOT build
envelope-encryption yet — it's a SCHEDULED future security task (per-user KMS
envelope encryption + audit logging + optional E2EE private-notes tier, paired with
gstack /cso). Settings page considered complete for the consistency pass. Proceed
toward the Hermes agent build next.
