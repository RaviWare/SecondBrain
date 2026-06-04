'use client'

// ── Help Center ───────────────────────────────────────────────────────────────
// Searchable FAQ + how-to answers covering the whole product, so users coming
// from other platforms can self-serve. Real, accurate content (no placeholders).
// Glass recipe (.kiro/steering/glass-theme.md): sb-dashboard shell + dash-panel
// dash-grain dash-interactive cards + --dash-* tokens + metallic heading.

import { useMemo, useState } from 'react'
import {
  Bot,
  ChevronDown,
  KeyRound,
  LifeBuoy,
  Search,
  Shield,
  Sparkles,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

interface FaqItem {
  q: string
  a: string
  tags: string[]
}

interface FaqGroup {
  id: string
  title: string
  icon: LucideIcon
  items: FaqItem[]
}

const FAQ: FaqGroup[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    icon: Sparkles,
    items: [
      {
        q: 'What is SecondBrain?',
        a: 'A personal AI operating system: a knowledge vault that synthesizes everything you capture, plus a squad of autonomous agents that work from that vault. Agents propose work; you approve. Nothing is written to your vault without your sign-off.',
        tags: ['overview', 'what'],
      },
      {
        q: 'How do I create my first agent?',
        a: 'Open Squad → "Create your first agent" (or the Builder). Describe what you want in plain language, or fill the preview directly. Pick a role, give it a name (tap "Need a name?" for ideas), set its schedule and trust scope, run a dry-run, then deploy.',
        tags: ['agent', 'builder', 'create'],
      },
      {
        q: 'What is a dry run and why is it required before deploy?',
        a: 'A dry run executes the agent once in propose-only mode against your real vault — it writes nothing. It proves the agent behaves as expected and unlocks deploy. This is a safety gate: an agent can never go live without a clean dry run first.',
        tags: ['dry run', 'deploy', 'safety'],
      },
    ],
  },
  {
    id: 'agents',
    title: 'Agents & squads',
    icon: Bot,
    items: [
      {
        q: 'How do agents work without writing to my vault?',
        a: 'Every agent is "propose-never-write" by design. It can read and search your vault and plan changes, but it emits Proposals to your Aegis Queue instead of writing. You approve, refine, or dismiss each one. Approved proposals are applied through a single audited write path with an undo window.',
        tags: ['propose', 'write', 'aegis', 'safety'],
      },
      {
        q: 'What is the Trust Score?',
        a: 'Trust is earned, not set. Clean dry-runs and approved-without-edit proposals raise it; dismissals, heavy refinements, scope violations, and injection detections lower it. Low-trust ("Watch band") agents always require sign-off regardless of policy.',
        tags: ['trust', 'score'],
      },
      {
        q: 'Can agents fix their own failures?',
        a: 'If you enable Auto-fix on an agent (in the Builder), it can retry transient/timeout failures, raise its budget up to a ceiling you set, auto-apply only low-stakes reversible work, and propose scope changes for your one-click approval. Security issues (possible injection) and anything ambiguous always escalate to you. It never edits code or widens its own access.',
        tags: ['auto-fix', 'self-heal', 'troubleshoot'],
      },
      {
        q: 'How do I name an agent or squad?',
        a: 'In the Builder, the name field has a "Need a name?" button with curated, role-themed suggestions (a Critic might be "Sentinel", a Researcher "Sherlock"). Pick one or type your own.',
        tags: ['name', 'squad'],
      },
    ],
  },
  {
    id: 'billing',
    title: 'Plans, credits & budget',
    icon: Wallet,
    items: [
      {
        q: 'What do credits / token budgets mean?',
        a: 'Agents consume model tokens when they run. You set per-run, per-agent, and squad-wide token caps. The Cost page shows real consumption by agent and skill. When a cap is reached, the agent pauses until you raise it or the period resets.',
        tags: ['credits', 'tokens', 'budget'],
      },
      {
        q: 'Do I bring my own model key?',
        a: 'Yes. On the AI Agent page you provide your own provider key (OpenRouter, Anthropic, or OpenAI). It is passed straight to your private agent runtime and never stored on our servers — you pay your provider directly for tokens.',
        tags: ['byo', 'key', 'model'],
      },
      {
        q: 'How do I upgrade to Pro?',
        a: 'Settings → Plan → Upgrade to Pro. Pro unlocks unlimited ingests and queries, multiple vaults, and AI agents.',
        tags: ['pro', 'upgrade', 'plan'],
      },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations & access',
    icon: KeyRound,
    items: [
      {
        q: 'How does an external agent connect to my vault?',
        a: 'Settings → Agent access (or the Integrations page) mints a bearer token (sb_...). Point any MCP-compatible client at the Agent API endpoints (manifest, query, search, ingest). Tokens are shown once and can be read-only or read+write.',
        tags: ['mcp', 'token', 'api', 'integrations'],
      },
      {
        q: 'Can I export all my data?',
        a: 'Yes — Settings → Data & privacy → Export all data (JSON). It includes every wiki page, source, and log entry in a single portable file. You own your data and can export any time.',
        tags: ['export', 'data', 'privacy'],
      },
    ],
  },
  {
    id: 'security',
    title: 'Security & privacy',
    icon: Shield,
    items: [
      {
        q: 'Is my data private?',
        a: 'Yes. Your content is encrypted in transit and at rest, processed only to power your brain\'s features, and never sold or used to train AI models. Agent runtimes are sandboxed, non-root, and network-isolated.',
        tags: ['privacy', 'security', 'encryption'],
      },
      {
        q: 'What stops an agent from being tricked by malicious content?',
        a: 'Every source an agent reads passes through a content scanner that flags prompt-injection, leaked credentials, and PII before it can become a proposal. Flagged content is held for your review and never auto-applied.',
        tags: ['injection', 'scanner', 'safety'],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    icon: Wrench,
    items: [
      {
        q: 'My agent run failed — what happens?',
        a: 'A support ticket is opened automatically with a diagnosis and a documented timeline. If the agent has Auto-fix on, recoverable failures are retried; otherwise it escalates to you (Admin → Support, if you are an admin). Nothing is silently dropped.',
        tags: ['failure', 'support', 'ticket'],
      },
      {
        q: 'An agent is stuck "Awaiting sign-off".',
        a: 'It has proposals waiting for you. Open the Aegis Queue on the Squad dashboard (or the Inbox) and approve, refine, or dismiss them. The agent resumes once the queue is clear.',
        tags: ['sign-off', 'stuck', 'queue'],
      },
    ],
  },
]

export default function HelpPage() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return FAQ
    return FAQ.map((g) => ({
      ...g,
      items: g.items.filter(
        (it) =>
          it.q.toLowerCase().includes(q) ||
          it.a.toLowerCase().includes(q) ||
          it.tags.some((t) => t.includes(q)),
      ),
    })).filter((g) => g.items.length > 0)
  }, [query])

  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups])

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-7">
        <header className="dash-rise">
          <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
            Support · Help center
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <LifeBuoy className="h-6 w-6 text-[var(--dash-accent)]" />
            <span className="dash-metallic-text">How can we help?</span>
          </h1>
          <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
            Answers to common questions. Search below, or browse by topic.
          </p>
        </header>

        {/* Search */}
        <div className="dash-rise" style={{ animationDelay: '0.05s' }}>
          <div
            className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
            style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
          >
            <Search className="h-4 w-4 text-[var(--dash-subtle)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help — e.g. trust, budget, export, injection"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-subtle)]"
            />
            {query && (
              <span className="mono text-[10px] text-[var(--dash-subtle)]">{total} result{total === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>

        {groups.length === 0 ? (
          <p className="dash-panel dash-grain p-8 text-center text-[13px] text-[var(--dash-muted)]">
            No answers matched “{query}”. Try a different term, or contact support below.
          </p>
        ) : (
          groups.map((g, gi) => (
            <section key={g.id} className="dash-rise space-y-2.5" style={{ animationDelay: `${0.08 * (gi + 1)}s` }}>
              <div className="flex items-center gap-2">
                <g.icon className="h-4 w-4 text-[var(--dash-accent)]" />
                <h2 className="text-sm font-semibold tracking-tight text-[var(--dash-text-strong)]">{g.title}</h2>
              </div>
              <div className="space-y-2">
                {g.items.map((it) => {
                  const key = `${g.id}:${it.q}`
                  const isOpen = open === key
                  return (
                    <article
                      key={key}
                      className="dash-panel dash-grain dash-interactive overflow-hidden p-0"
                    >
                      <button
                        onClick={() => setOpen(isOpen ? null : key)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <span className="text-[13px] font-medium text-[var(--dash-text-strong)]">{it.q}</span>
                        <ChevronDown
                          className="h-4 w-4 shrink-0 text-[var(--dash-subtle)] transition-transform"
                          style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
                        />
                      </button>
                      {isOpen && (
                        <p className="border-t px-4 py-3 text-[12.5px] leading-relaxed text-[var(--dash-muted)]" style={{ borderColor: 'var(--dash-border)' }}>
                          {it.a}
                        </p>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ))
        )}

        {/* Contact */}
        <section className="dash-panel dash-grain dash-interactive dash-rise p-5 text-center" style={{ animationDelay: '0.4s' }}>
          <h2 className="text-sm font-semibold text-[var(--dash-text-strong)]">Still stuck?</h2>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] text-[var(--dash-muted)]">
            Browse the full documentation, or reach out and we&apos;ll help you get unblocked.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <a href="/app/docs" className="dash-accent-grad inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white">
              Read the docs
            </a>
            <a
              href="mailto:support@secondbraincloud.com"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-4 text-xs font-medium text-[var(--dash-text)] transition hover:border-[var(--dash-border-glow)]"
              style={{ borderColor: 'var(--dash-border)' }}
            >
              Contact support
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}
