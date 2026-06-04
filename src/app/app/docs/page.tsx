'use client'

// ── Docs ──────────────────────────────────────────────────────────────────────
// In-app documentation hub: concept guides + the Agent API reference, with a
// left rail and anchored sections. Real content, glass-themed.

import { useState } from 'react'
import {
  Bot,
  BookMarked,
  Code2,
  KeyRound,
  Layers,
  Rocket,
  Shield,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

interface DocSection {
  id: string
  title: string
  icon: LucideIcon
  body: React.ReactNode
}

const ENDPOINTS = [
  { method: 'GET', path: '/api/agent/manifest', desc: 'Public descriptor of your vault\'s agent surface.' },
  { method: 'POST', path: '/api/agent/query', desc: 'Synthesized answer + gap analysis over your vault.' },
  { method: 'POST', path: '/api/agent/search', desc: 'Raw retrieval across your knowledge.' },
  { method: 'POST', path: '/api/agent/ingest', desc: 'Write new knowledge (requires write scope).' },
]

const SECTIONS: DocSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: Rocket,
    body: (
      <>
        <p>
          SecondBrain is a personal AI operating system. A <strong>knowledge vault</strong> synthesizes everything you
          capture into a self-wiring wiki, and a <strong>squad of autonomous agents</strong> works from that vault to
          research, draft, monitor, and organize — proposing changes you approve.
        </p>
        <p>
          The core guarantee is <strong>propose-never-write</strong>: agents read and plan, but every change to your
          vault flows through your explicit sign-off (or a bounded, reversible auto-apply you opt into). You stay in
          control while the work happens in the background.
        </p>
      </>
    ),
  },
  {
    id: 'vault',
    title: 'The knowledge vault',
    icon: Layers,
    body: (
      <>
        <p>
          Capture anything — notes, links, PDFs, transcripts — and the vault distills it into wiki pages using a
          Compiled-Truth + Timeline structure: a current synthesized understanding on top, the evidence trail below.
          Pages auto-link into a knowledge graph, and queries return a synthesized answer plus an explicit list of
          what the brain does <em>not</em> yet know.
        </p>
        <p>Capture from the Inbox; explore in Memory, Topics, People, Decisions, and the Graph.</p>
      </>
    ),
  },
  {
    id: 'agents',
    title: 'Agents & squads',
    icon: Bot,
    body: (
      <>
        <p>
          An agent has a <strong>role</strong> (scout, synthesist, connector, critic, librarian, researcher, or
          custom), a <strong>schedule</strong> (manual, scheduled, or reactive), a <strong>trust scope</strong> (what
          it may read), and a <strong>sign-off policy</strong>. Build one conversationally or by editing the live
          preview, run a dry-run, then deploy.
        </p>
        <p>
          Agents emit <strong>Proposals</strong> to your Aegis Queue. You approve, refine, or dismiss each. Trust is
          earned over time and scales how much an agent may auto-apply. Enable <strong>Auto-fix</strong> to let an
          agent recover from its own failures within safe, reversible limits.
        </p>
      </>
    ),
  },
  {
    id: 'budget',
    title: 'Budget & cost',
    icon: Wallet,
    body: (
      <>
        <p>
          Token spend is capped at three levels: per-run, per-agent, and squad-wide. The Cost page shows real
          consumption by agent and skill. Reaching a cap pauses the agent until you raise it or the period resets —
          no surprise overruns.
        </p>
        <p>Bring your own model key (OpenRouter / Anthropic / OpenAI); you pay your provider directly for tokens.</p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security model',
    icon: Shield,
    body: (
      <>
        <p>
          Agent runtimes are sandboxed, non-root, resource-capped, and network-isolated. Every source an agent reads
          is scanned for prompt-injection, credentials, and PII before it can become a proposal. Bearer tokens for
          external access are stored only as hashes and shown once.
        </p>
        <p>Your data is encrypted in transit and at rest, never sold, and never used to train models.</p>
      </>
    ),
  },
  {
    id: 'agent-api',
    title: 'Agent API reference',
    icon: Code2,
    body: (
      <>
        <p>
          Connect any MCP-compatible client to your vault with a bearer token minted in Settings → Agent access. All
          requests use <code>Authorization: Bearer sb_...</code>.
        </p>
        <div className="mt-3 space-y-2">
          {ENDPOINTS.map((e) => (
            <div
              key={e.path}
              className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
            >
              <span
                className="mono rounded px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  color: e.method === 'GET' ? '#34d399' : 'var(--dash-accent)',
                  background: e.method === 'GET' ? 'rgba(52,211,153,0.10)' : 'var(--dash-accent-soft)',
                  border: `1px solid ${e.method === 'GET' ? 'rgba(52,211,153,0.30)' : 'var(--dash-border-glow)'}`,
                }}
              >
                {e.method}
              </span>
              <code className="mono text-[11px] text-[var(--dash-text)]">{e.path}</code>
              <span className="w-full text-[11px] text-[var(--dash-subtle)] sm:w-auto sm:flex-1">{e.desc}</span>
            </div>
          ))}
        </div>
        <p className="mt-3">
          Example:&nbsp;
          <code className="mono text-[11px]">curl -H &quot;Authorization: Bearer sb_...&quot; https://secondbraincloud.com/api/agent/manifest</code>
        </p>
      </>
    ),
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: KeyRound,
    body: (
      <>
        <p>
          Manage how external tools reach your vault on the <a href="/app/integrations" style={{ color: 'var(--dash-accent)' }}>Integrations</a> page:
          mint and revoke agent tokens, copy the MCP endpoints, and export your full dataset. More provider connectors
          are rolling out.
        </p>
      </>
    ),
  },
]

export default function DocsPage() {
  const [active, setActive] = useState(SECTIONS[0].id)

  function go(id: string) {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <header className="dash-rise mb-6">
          <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
            Reference · Documentation
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <BookMarked className="h-6 w-6 text-[var(--dash-accent)]" />
            <span className="dash-metallic-text">Docs</span>
          </h1>
          <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
            Everything you need to understand and operate your second brain and its squad.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
          {/* Left rail */}
          <nav className="dash-rise hidden lg:block">
            <div className="sticky top-6 space-y-1">
              {SECTIONS.map((s) => {
                const on = active === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => go(s.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition"
                    style={on
                      ? { background: 'var(--dash-accent-soft)', color: 'var(--dash-accent)', border: '1px solid var(--dash-border-glow)' }
                      : { color: 'var(--dash-muted)', border: '1px solid transparent' }}
                  >
                    <s.icon className="h-3.5 w-3.5 shrink-0" />
                    {s.title}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Content */}
          <div className="space-y-5">
            {SECTIONS.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                className="dash-panel dash-grain dash-interactive dash-rise scroll-mt-6 p-6"
                style={{ animationDelay: `${0.05 * (i + 1)}s` }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="grid h-8 w-8 place-items-center rounded-lg border bg-[var(--dash-soft)]"
                    style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}
                  >
                    <s.icon className="h-4 w-4" />
                  </span>
                  <h2 className="text-base font-semibold tracking-tight text-[var(--dash-text-strong)]">{s.title}</h2>
                </div>
                <div className="space-y-3 text-[13px] leading-relaxed text-[var(--dash-muted)] [&_strong]:text-[var(--dash-text)] [&_code]:rounded [&_code]:bg-[var(--dash-card-solid)] [&_code]:px-1 [&_code]:py-0.5">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
