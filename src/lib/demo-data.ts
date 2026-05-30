// ── Demo data ─────────────────────────────────────────────────────────────────
// Powers the public, no-auth product tour at /demo. Everything here is static
// sample content so a prospect can experience SecondBrain OS (vault + agents)
// without signing up or hitting any backend. NOT used by the real app.

export const DEMO_PERSONA = {
  name: 'Jordan',
  vault: 'Acme Research Vault',
}

export const demoStats = [
  { label: 'Sources', value: 342, delta: '+18 this week', tone: 'violet', trend: [4, 7, 6, 9, 8, 11, 14, 18] },
  { label: 'Notes', value: 1280, delta: '+44 this week', tone: 'blue', trend: [10, 14, 12, 20, 24, 30, 38, 44] },
  { label: 'Topics', value: 96, delta: '+6 this week', tone: 'green', trend: [2, 3, 3, 4, 5, 5, 6, 6] },
  { label: 'Decisions', value: 51, delta: '+4 this week', tone: 'orange', trend: [1, 2, 2, 3, 3, 4, 4, 4] },
  { label: 'AI Answers', value: 214, delta: '+29 this week', tone: 'purple', trend: [8, 12, 15, 18, 22, 25, 27, 29] },
] as const

// ── Conversation turn primitives ──────────────────────────────────────────────
export type DemoTurn =
  | { role: 'user'; content: string }
  | { role: 'agent'; content: string; thinking?: string[] }
  | { role: 'tool'; tool: ToolKind; label: string }

export type ToolKind = 'search' | 'ingest' | 'cron' | 'web' | 'mail' | 'draft' | 'alert' | 'handoff'

// ── A "scene" = one specialized agent demonstrating a real workflow ───────────
export type DemoScene = {
  id: string
  name: string          // e.g. "Sales Copilot"
  tagline: string       // one-liner
  icon: DemoIcon
  accent: string        // hex for the scene accent
  agentName: string
  vaultLabel: string
  conversation: DemoTurn[]
}

export type DemoIcon =
  | 'brief' | 'search' | 'inbox' | 'pulse' | 'pen' | 'orchestrate'

// ─────────────────────────────────────────────────────────────────────────────
// SCENE 1 — Sales Copilot (meeting prep + follow-through)
// ─────────────────────────────────────────────────────────────────────────────
const sceneSales: DemoScene = {
  id: 'sales',
  name: 'Sales Copilot',
  tagline: 'Walks into every call fully briefed — and never drops a follow-up.',
  icon: 'brief',
  accent: '#ff7a1f',
  agentName: 'Sales Copilot',
  vaultLabel: 'CRM + call transcripts',
  conversation: [
    { role: 'user', content: 'Prep me for tomorrow’s Northwind renewal call.' },
    { role: 'agent', thinking: ['Searching vault for "Northwind"…', 'Found 6 related pages', 'Checking what’s missing…'], content: '' },
    { role: 'tool', tool: 'search', label: 'searched vault · 6 pages found' },
    {
      role: 'agent',
      content:
        'Here’s your Northwind prep. You last spoke **38 days ago**. Three things are open:\n\n1. They asked for **SSO + audit logs** before renewal — eng committed to Q3 (no update logged).\n2. You promised a **volume discount for 250+ seats** — sent Apr 12, no reply tracked.\n3. Their champion mentioned a **competing eval**.\n\n**Confidence: 72%** — from [[northwind-discovery-call]] and [[q3-roadmap]].',
    },
    {
      role: 'agent',
      content:
        '⚠️ **What I don’t know yet:** nothing added about Northwind in 38 days. They may have replied by email — a channel the brain doesn’t see. Want me to watch their domain nightly?',
    },
    { role: 'user', content: 'Yes — and save this prep to the vault.' },
    { role: 'tool', tool: 'ingest', label: 'wrote "Northwind renewal prep" → vault' },
    { role: 'tool', tool: 'cron', label: 'scheduled nightly Northwind watch · 7:00 AM' },
    { role: 'agent', content: 'Done. Saved **[[northwind-renewal-prep]]** and wired it to your account graph. I’ll drop a digest every morning at 7.' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE 2 — Research Analyst (deep web research → synthesized brief)
// ─────────────────────────────────────────────────────────────────────────────
const sceneResearch: DemoScene = {
  id: 'research',
  name: 'Research Analyst',
  tagline: 'Reads the whole internet on a topic, then writes you the brief.',
  icon: 'search',
  accent: '#38bdf8',
  agentName: 'Research Analyst',
  vaultLabel: 'web + papers + notes',
  conversation: [
    { role: 'user', content: 'What changed in AI agent pricing models this quarter? Brief me.' },
    { role: 'agent', thinking: ['Expanding into 4 sub-queries…', 'Searching the web…', 'Cross-checking against vault…'], content: '' },
    { role: 'tool', tool: 'web', label: 'read 14 sources · 3 vault pages' },
    {
      role: 'agent',
      content:
        '**AI agent pricing — Q3 shift:**\n\n• Per-session-hour runtime fees are emerging (e.g. $0.08/hr) on top of token costs.\n• BYO-key + flat hosting is winning the prosumer tier ($29–99/mo).\n• Usage-based "per-action" is fading — too unpredictable for buyers.\n\nSynthesis saved to **[[ai-agent-pricing-q3]]**, cited to 14 sources.',
    },
    { role: 'tool', tool: 'ingest', label: 'wrote synthesis + 9 new entity pages' },
    {
      role: 'agent',
      content:
        '⚠️ **Gap:** I couldn’t find primary pricing for 2 private vendors — only secondhand blog claims. I flagged those as **low-confidence**. Want me to set a watch and upgrade the page when official numbers appear?',
    },
    { role: 'user', content: 'Yes, watch it weekly.' },
    { role: 'tool', tool: 'cron', label: 'weekly pricing-watch scheduled · Mondays' },
    { role: 'agent', content: 'Watching. The page will self-update and ping you when confidence improves.' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE 3 — Inbox Triage (always-on signal processing)
// ─────────────────────────────────────────────────────────────────────────────
const sceneInbox: DemoScene = {
  id: 'inbox',
  name: 'Inbox Triage',
  tagline: 'Reads every incoming signal, files what matters, surfaces what’s urgent.',
  icon: 'inbox',
  accent: '#34d399',
  agentName: 'Inbox Triage',
  vaultLabel: 'email · Slack · transcripts',
  conversation: [
    { role: 'agent', content: '🌅 **Morning, Jordan.** While you slept I processed **23 signals** across email, Slack, and 1 voice memo.' },
    { role: 'tool', tool: 'mail', label: 'triaged 23 items · 4 need you' },
    {
      role: 'agent',
      content:
        '**Needs you (4):**\n1. Northwind legal sent the redlined MSA — 2 clauses changed.\n2. Investor intro from Dana — reply window closing.\n3. Churn risk: Beta Co. usage down 40% this week.\n4. Your 2pm moved to 3:30.\n\n**Auto-filed (19):** newsletters, receipts, FYIs → vault, no action.',
    },
    { role: 'user', content: 'Draft a reply to the investor intro and log the churn risk as a decision.' },
    { role: 'tool', tool: 'draft', label: 'drafted reply to Dana (in your voice)' },
    { role: 'tool', tool: 'ingest', label: 'logged "Beta Co. churn risk" → decisions' },
    { role: 'agent', content: 'Draft’s in your inbox for one-tap send. Churn risk is now a tracked **[[decision]]** with a follow-up in 3 days. Want me to prep a save play for Beta Co.?' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE 4 — Ops Monitor (watches, alerts, acts)
// ─────────────────────────────────────────────────────────────────────────────
const sceneOps: DemoScene = {
  id: 'ops',
  name: 'Ops Monitor',
  tagline: 'Keeps an eye on your numbers and pings you before things break.',
  icon: 'pulse',
  accent: '#a78bfa',
  agentName: 'Ops Monitor',
  vaultLabel: 'metrics · logs · status',
  conversation: [
    { role: 'tool', tool: 'alert', label: 'anomaly detected · signups −32% vs 7-day avg' },
    {
      role: 'agent',
      content:
        '🔔 **Heads up:** signups dropped **32%** today vs your 7-day average. I correlated it against recent changes in your vault.',
    },
    { role: 'agent', thinking: ['Cross-referencing deploy log…', 'Checking decision history…'], content: '' },
    { role: 'tool', tool: 'search', label: 'searched vault · deploys + decisions' },
    {
      role: 'agent',
      content:
        'Likely cause: the **pricing-page change** you shipped yesterday ([[decision-pricing-v2]]) removed the free trial CTA. Conversion fell right after deploy.\n\n**Confidence: 68%** — correlation, not proof. Worth a 5-minute check.',
    },
    { role: 'user', content: 'Good catch. Remind me to A/B test the CTA.' },
    { role: 'tool', tool: 'ingest', label: 'created task "A/B test trial CTA"' },
    { role: 'agent', content: 'Task logged and linked to the pricing decision so the context travels with it. I’ll keep watching signups and re-alert if it worsens.' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENE 5 — Content Engine (drafts grounded in your brain)
// ─────────────────────────────────────────────────────────────────────────────
const sceneContent: DemoScene = {
  id: 'content',
  name: 'Content Engine',
  tagline: 'Writes in your voice, grounded only in what you actually know.',
  icon: 'pen',
  accent: '#fb923c',
  agentName: 'Content Engine',
  vaultLabel: 'your notes · past posts',
  conversation: [
    { role: 'user', content: 'Draft a LinkedIn post about what we learned from 50 customer calls.' },
    { role: 'agent', thinking: ['Pulling call summaries…', 'Finding the 3 strongest patterns…', 'Matching your past writing voice…'], content: '' },
    { role: 'tool', tool: 'search', label: 'read 50 call summaries · 12 past posts' },
    {
      role: 'agent',
      content:
        'Draft (your voice, no fluff):\n\n> *We did 50 customer calls. Three things surprised us:*\n> *1. Nobody asked for more features. They asked for fewer decisions.*\n> *2. The "aha" wasn’t the product — it was the first cited answer.*\n> *3. Price was never the objection. Trust was.*\n\nEvery claim traces to a real call in your vault. Want it punchier or longer?',
    },
    {
      role: 'agent',
      content: '⚠️ **Note:** I avoided 2 tempting stats — they came from a single call, not a pattern. I won’t put numbers in your mouth that the brain can’t back.',
    },
    { role: 'user', content: 'Perfect. Save it as a draft.' },
    { role: 'tool', tool: 'ingest', label: 'saved draft → content pipeline' },
    { role: 'agent', content: 'Saved. It’s in your drafts with source links attached for fact-checking before you post.' },
  ],
}

export const DEMO_SCENES: DemoScene[] = [
  sceneSales, sceneResearch, sceneInbox, sceneOps, sceneContent,
]

// ── Multi-agent orchestration scene (the showpiece) ───────────────────────────
// Several specialized agents coordinated by an orchestrator on one objective.
export type OrchestratorAgent = {
  name: string
  role: string
  icon: DemoIcon
  accent: string
  steps: string[]   // progressive status lines the agent reports
}

export const ORCHESTRATION = {
  objective: 'Build a go-to-market brief for launching in the EU market.',
  orchestratorLine:
    'Breaking this into 4 parallel workstreams and dispatching specialist agents. I’ll merge their findings into one cited brief.',
  agents: [
    {
      name: 'Research Analyst', role: 'Market + competitor scan', icon: 'search', accent: '#38bdf8',
      steps: ['Reading 22 EU market sources…', 'Mapping 6 competitors…', 'Synthesized → [[eu-market-scan]]'],
    },
    {
      name: 'Compliance Agent', role: 'GDPR + VAT requirements', icon: 'pulse', accent: '#a78bfa',
      steps: ['Checking GDPR data rules…', 'Mapping VAT/MoR options…', 'Flagged 3 must-dos → [[eu-compliance]]'],
    },
    {
      name: 'Sales Copilot', role: 'Pricing + positioning', icon: 'brief', accent: '#ff7a1f',
      steps: ['Pulling pricing from vault…', 'Localizing to EUR…', 'Draft pricing → [[eu-pricing]]'],
    },
    {
      name: 'Content Engine', role: 'Launch messaging', icon: 'pen', accent: '#fb923c',
      steps: ['Drafting positioning…', 'Writing 3 headlines…', 'Saved → [[eu-launch-copy]]'],
    },
  ] as OrchestratorAgent[],
  result:
    'All four agents finished. Merged into **[[eu-gtm-brief]]** — 1 cited brief, 14 sources, 3 compliance flags, and a localized pricing draft. Total time: **under 2 minutes**, zero context-switching for you.',
}

// ── Side-rail previews ────────────────────────────────────────────────────────
export const demoActivity = [
  { title: 'Customer Call — Northwind Inc.', meta: 'Sales Copilot · transcript · 4m ago', tone: 'green' },
  { title: 'EU market scan completed', meta: 'Research Analyst · synthesis · 1h ago', tone: 'blue' },
  { title: 'Churn risk: Beta Co.', meta: 'Inbox Triage · decision · 3h ago', tone: 'orange' },
  { title: 'Signups anomaly resolved', meta: 'Ops Monitor · alert · 5h ago', tone: 'amber' },
  { title: 'Weekly digest → Telegram', meta: 'cron · delivered · yesterday', tone: 'green' },
] as const

export const demoCapabilities = [
  { title: 'Always-on', desc: 'Runs 24/7 on our servers. Works while you sleep.', icon: 'clock' },
  { title: 'Grounded in your brain', desc: 'Every answer cites your private vault — no hallucinated facts.', icon: 'brain' },
  { title: 'Knows its limits', desc: 'Flags stale info and gaps instead of bluffing.', icon: 'alert' },
  { title: 'A whole team', desc: 'Specialized agents that coordinate on big objectives.', icon: 'zap' },
] as const
