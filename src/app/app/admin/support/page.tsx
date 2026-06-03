'use client'

// ── Admin → Support Desk ──────────────────────────────────────────────────────
// The "workforce" board: every auto-opened support ticket for failed agent runs,
// with its full documented timeline (opened → diagnosed → retried → resolved /
// escalated). Admin can comment, resolve, mark won't-fix, or reopen. Non-admins
// get a clear "access required" state (API returns 403; UI never fabricates).
//
// Glass recipe is MANDATORY (.kiro/steering/glass-theme.md): sb-dashboard shell,
// dash-panel dash-grain dash-interactive cards, --dash-* tokens, metallic heading.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LifeBuoy,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserCog,
} from 'lucide-react'

type TimelineEvent = { at: string | null; type: string; message: string; meta: Record<string, unknown> | null }
type Ticket = {
  id: string
  agentId: string
  agentName: string
  category: 'budget' | 'timeout' | 'transient' | 'scope' | 'injection' | 'unknown'
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'investigating' | 'in-progress' | 'awaiting-admin' | 'resolved' | 'wont-fix'
  title: string
  diagnosis: string
  recommendedAction: string
  retryCount: number
  autoRemediable: boolean
  resolutionNote: string | null
  createdAt: string | null
  updatedAt: string | null
  resolvedAt: string | null
  timeline: TimelineEvent[]
}

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden'

const STATUS_TONE: Record<Ticket['status'], { label: string; color: string; bg: string; border: string }> = {
  'open': { label: 'Open', color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.30)' },
  'investigating': { label: 'Investigating', color: '#38bdf8', bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.30)' },
  'in-progress': { label: 'Retrying', color: '#a78bfa', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.30)' },
  'awaiting-admin': { label: 'Needs you', color: '#fb7185', bg: 'rgba(251,113,133,0.10)', border: 'rgba(251,113,133,0.30)' },
  'resolved': { label: 'Resolved', color: '#34d399', bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.30)' },
  'wont-fix': { label: "Won't fix", color: 'var(--dash-subtle)', bg: 'var(--dash-soft)', border: 'var(--dash-border)' },
}

export default function SupportDeskPage() {
  const [state, setState] = useState<LoadState>('loading')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [awaitingAdmin, setAwaitingAdmin] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/support/tickets', { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) { setState('forbidden'); return }
      if (!res.ok) { setState('error'); return }
      const body = await res.json()
      setTickets(Array.isArray(body.tickets) ? body.tickets : [])
      setAwaitingAdmin(body.awaitingAdmin ?? 0)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) load() })
    return () => { cancelled = true }
  }, [load])

  async function act(id: string, action: 'resolve' | 'wont-fix' | 'reopen') {
    setBusy(id)
    try {
      await fetch('/api/admin/support/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const activeCount = useMemo(() => tickets.filter(t => !['resolved', 'wont-fix'].includes(t.status)).length, [tickets])

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6 lg:p-7">
        <header className="dash-rise">
          <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
            Admin · Support desk
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <LifeBuoy className="h-6 w-6 text-[var(--dash-accent)]" />
            <span className="dash-metallic-text">Agent Support</span>
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[var(--dash-muted)]">
            When an agent run fails, a ticket is opened automatically, a worker diagnoses it and retries
            recoverable issues, and everything is documented here. Issues needing a human are escalated to you.
          </p>
        </header>

        {state === 'ready' && (
          <div className="dash-rise flex flex-wrap gap-2">
            <Stat label="Active" value={activeCount} tone="#38bdf8" />
            <Stat label="Needs you" value={awaitingAdmin} tone="#fb7185" />
            <Stat label="Total" value={tickets.length} tone="var(--dash-subtle)" />
            <button
              onClick={load}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--dash-border)] px-3 text-xs font-medium text-[var(--dash-text)] transition hover:border-[var(--dash-border-glow)]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        )}

        {state === 'loading' && <SkeletonCard />}
        {state === 'error' && <Notice icon={ShieldAlert} title="Could not load support tickets" body="Something went wrong. Try again shortly." />}
        {state === 'forbidden' && <Notice icon={ShieldAlert} title="Admin access required" body="This desk is limited to administrators. Ask an admin to add your account to ADMIN_USER_IDS." />}

        {state === 'ready' &&
          (tickets.length === 0 ? (
            <Notice icon={CheckCircle2} title="No tickets — all clear" body="When an agent run fails, its ticket and full timeline will appear here. Nothing needs attention right now." />
          ) : (
            <div className="space-y-3">
              {tickets.map((t, i) => (
                <TicketCard
                  key={t.id}
                  t={t}
                  delay={`${0.05 * (i + 1)}s`}
                  expanded={expanded === t.id}
                  onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
                  busy={busy === t.id}
                  onAct={act}
                />
              ))}
            </div>
          ))}
      </div>
    </main>
  )
}

function TicketCard({ t, delay, expanded, onToggle, busy, onAct }: {
  t: Ticket
  delay: string
  expanded: boolean
  onToggle: () => void
  busy: boolean
  onAct: (id: string, action: 'resolve' | 'wont-fix' | 'reopen') => void
}) {
  const tone = STATUS_TONE[t.status]
  const terminal = t.status === 'resolved' || t.status === 'wont-fix'
  return (
    <article className="dash-panel dash-grain dash-interactive dash-rise p-4" style={{ animationDelay: delay }}>
      <div className="flex items-start gap-3">
        <button onClick={onToggle} className="mt-0.5 shrink-0 text-[var(--dash-subtle)] transition hover:text-[var(--dash-text)]" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--dash-text-strong)]">{t.title}</p>
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ color: tone.color, background: tone.bg, borderColor: tone.border }}>
              {tone.label}
            </span>
            {t.severity === 'high' && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ color: '#fb7185', background: 'rgba(251,113,133,0.10)', borderColor: 'rgba(251,113,133,0.30)' }}>
                <AlertTriangle className="h-3 w-3" /> High
              </span>
            )}
          </div>
          <p className="mono mt-1 text-[10px] uppercase tracking-wide text-[var(--dash-subtle)]">
            {t.agentName} · {t.category} · {t.autoRemediable ? `auto-retry ${t.retryCount}` : 'human review'}
            {t.updatedAt ? ` · updated ${new Date(t.updatedAt).toLocaleString()}` : ''}
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--dash-muted)]">{t.diagnosis}</p>

          {expanded && (
            <>
              <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
                <p className="mono text-[9px] uppercase tracking-widest text-[var(--dash-subtle)]">Recommended action</p>
                <p className="mt-1 text-[12px] text-[var(--dash-text)]">{t.recommendedAction}</p>
              </div>

              <div className="mt-3">
                <p className="mono mb-2 text-[9px] uppercase tracking-widest text-[var(--dash-subtle)]">Documented timeline</p>
                <ol className="relative space-y-2.5 border-l pl-4" style={{ borderColor: 'var(--dash-border)' }}>
                  {t.timeline.map((e, idx) => (
                    <li key={idx} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full" style={{ background: 'var(--dash-accent)' }} />
                      <p className="text-[12px] text-[var(--dash-text)]">{e.message}</p>
                      <p className="mono text-[9px] uppercase tracking-wide text-[var(--dash-subtle)]">
                        {e.type}{e.at ? ` · ${new Date(e.at).toLocaleString()}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              {!terminal && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => onAct(t.id, 'resolve')} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-50" style={{ background: '#1f9d6b' }}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Resolve
                  </button>
                  <button onClick={() => onAct(t.id, 'wont-fix')} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--dash-border)] px-3 text-xs font-medium text-[var(--dash-text)] transition hover:border-[var(--dash-border-glow)] disabled:opacity-50">
                    <UserCog className="h-3.5 w-3.5" /> Won&apos;t fix
                  </button>
                </div>
              )}
              {terminal && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {t.resolutionNote && <p className="text-[11px] text-[var(--dash-subtle)]">{t.resolutionNote}</p>}
                  <button onClick={() => onAct(t.id, 'reopen')} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--dash-border)] px-3 text-xs font-medium text-[var(--dash-text)] transition hover:border-[var(--dash-border-glow)] disabled:opacity-50">
                    <RefreshCw className="h-3.5 w-3.5" /> Reopen
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="dash-inset inline-flex items-center gap-2 rounded-xl px-3 py-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
      <span className="text-sm font-semibold text-[var(--dash-text)]">{value}</span>
      <span className="mono text-[9px] uppercase tracking-widest text-[var(--dash-subtle)]">{label}</span>
    </div>
  )
}

function Notice({ icon: Icon, title, body }: { icon: typeof LifeBuoy; title: string; body: string }) {
  return (
    <section className="dash-panel dash-grain dash-interactive dash-rise p-8 text-center">
      <span className="mx-auto inline-grid h-12 w-12 place-items-center rounded-2xl border bg-[var(--dash-soft)]" style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}>
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight"><span className="dash-metallic-text">{title}</span></h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--dash-muted)]">{body}</p>
    </section>
  )
}

function SkeletonCard() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="dash-panel dash-grain h-[110px] animate-pulse rounded-2xl p-4" style={{ animationDelay: `${i * 0.05}s` }}>
          <div className="h-3 w-1/2 rounded" style={{ background: 'var(--dash-soft)' }} />
          <div className="mt-3 h-3 w-3/4 rounded" style={{ background: 'var(--dash-soft)' }} />
          <div className="mt-2 h-3 w-2/3 rounded" style={{ background: 'var(--dash-soft)' }} />
        </div>
      ))}
    </div>
  )
}
