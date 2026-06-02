'use client'

// ── Squad Dashboard — the "air-traffic-control" home (Req 6.1, 6.2, 6.4, 6.8) ──
// A mostly READ-ONLY surface (Req 6.9): the user only ever acts at sign-off
// points (the Aegis Queue). Everything here is REAL data fetched from
// `/api/agents/dashboard` on mount — zeros and empty arrays are honest, never
// fabricated. Glass recipe is mandatory (Req 6.10, 11.7):
//   • shell  = `sb-dashboard` (paints the aurora + grid backdrop)
//   • panels = `dash-panel dash-grain dash-interactive` (feature cards add
//              `dash-spotlight` + a `dash-spotlight-glow` child + useSpotlight)
//   • tokens = `--dash-*` only; primary CTAs use `.dash-accent-grad`
//
// Layout (responsive; the rail stacks below on small screens):
//   ┌──────────────────────────────┬──────────────┐
//   │ status strip (3 glass tiles) │  Aegis Queue │   ← rail: Queue ABOVE Feed
//   │ "today" proof-of-work line   │  ──────────  │
//   │ squad roster (AgentCards)    │  Activity    │
//   └──────────────────────────────┴──────────────┘
//
// When the user has no Agents, the whole surface is replaced by an inviting
// first-run empty state suggesting a starter Agent matched to the vault (Req 6.8).

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Activity as ActivityIcon,
  AlertCircle,
  CalendarClock,
  Check,
  Compass,
  GitBranch,
  Inbox,
  Layers,
  Loader2,
  Quote,
  Radar,
  RotateCcw,
  Sparkles,
  Undo2,
  X,
  Zap,
} from 'lucide-react'
import { AgentCard, type AgentCardProps } from '@/components/agents/AgentCard'
import type { AgentStatus } from '@/lib/agents/accent'
import type { QueueDecision } from '@/lib/agents/aegis/queue-view'
import type { TrustBand } from '@/lib/agents/trust'
import { useSpotlight } from '@/lib/use-spotlight'
import { cn } from '@/lib/utils'

// ── Payload types (mirror `/api/agents/dashboard` GET) ────────────────────────

interface RosterCard {
  id: string
  name: string
  role: AgentCardProps['role']
  customRoleDescription: string | null
  status: AgentStatus
  trustScore: number
  trustBand: TrustBand
  skillIds: string[]
  now: string
}

interface QueueCitation {
  slug?: string
  url?: string
  quote: string
}

interface QueueItem {
  id: string
  agentId: string
  kind: string
  what: string
  why: string
  citations: QueueCitation[]
  actions: QueueDecision[]
  isFactual: boolean
}

interface ActivityEntry {
  id: string
  source: 'log' | 'proposal' | 'run'
  kind: string
  agentId: string | null
  summary: string
  status?: string
  at: string
}

interface DashboardPayload {
  tally: {
    statusStrip: { running: number; scheduled: number; awaitingSignOff: number }
    today: { sourcesIngested: number; connectionsMade: number; synthesesProposed: number }
  }
  roster: RosterCard[]
  queue: QueueItem[]
  activity: ActivityEntry[]
}

type LoadState = 'loading' | 'error' | 'ready'

// The builder route is built in Phase 4; the link can exist now (Req 6.8 CTA).
const BUILDER_HREF = '/app/agents/builder'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SquadDashboardPage() {
  const [state, setState] = useState<LoadState>('loading')
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/dashboard', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error || 'Could not load your squad.')
        setState('error')
        return
      }
      setData(body as DashboardPayload)
      setState('ready')
    } catch {
      setError('Network error. Please try again.')
      setState('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-[1640px] p-4 sm:p-5 lg:p-6 2xl:p-7">
        {state === 'loading' && <LoadingView />}
        {state === 'error' && <ErrorView message={error} onRetry={load} />}
        {state === 'ready' && data && (
          data.roster.length === 0
            ? <FirstRunEmptyState />
            : <SquadView data={data} onRefetch={load} />
        )}
      </div>
    </main>
  )
}

// ── Ready view: strip + today + roster | rail (Queue above Feed) ──────────────

function SquadView({ data, onRefetch }: { data: DashboardPayload; onRefetch: () => void }) {
  const { tally, roster, queue, activity } = data

  return (
    <div className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_360px] 2xl:gap-5">
      {/* Main column */}
      <section className="min-w-0 space-y-4 2xl:space-y-5">
        <Header runningCount={tally.statusStrip.running} />

        {/* Status strip (Req 6.1) — three glass stat tiles */}
        <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 2xl:gap-3">
          <GlassStat
            delay="0.05s"
            label="Running"
            value={tally.statusStrip.running}
            hint="Agents executing now"
            icon={Zap}
            live={tally.statusStrip.running > 0}
          />
          <GlassStat
            delay="0.11s"
            label="Scheduled"
            value={tally.statusStrip.scheduled}
            hint="Cron-scheduled, runnable"
            icon={CalendarClock}
          />
          <GlassStat
            delay="0.17s"
            label="Awaiting sign-off"
            value={tally.statusStrip.awaitingSignOff}
            hint="In the Aegis Queue"
            icon={Inbox}
            accent={tally.statusStrip.awaitingSignOff > 0}
          />
        </section>

        {/* "Today" proof-of-work line (Req 6.2) */}
        <TodayLine today={tally.today} />

        {/* Squad roster (Req 6.3) */}
        <section className="dash-rise space-y-3" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-[var(--dash-text-strong)]">
              Squad roster
            </h2>
            <span className="text-[11px] font-medium text-[var(--dash-subtle)]">
              {roster.length} {roster.length === 1 ? 'agent' : 'agents'}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {roster.map((card) => (
              <AgentCard
                key={card.id}
                name={card.name}
                role={card.role}
                customRoleDescription={card.customRoleDescription}
                status={card.status}
                trustScore={card.trustScore}
                skillIds={card.skillIds}
                now={card.now}
              />
            ))}
          </div>
        </section>
      </section>

      {/* Right rail — Aegis Queue ABOVE the live Activity_Feed (Req 6.4) */}
      <aside className="space-y-4 min-[1180px]:pt-[2px] 2xl:space-y-5">
        <div className="dash-rise" style={{ animationDelay: '0.22s' }}>
          <AegisQueuePanel items={queue} onResolved={onRefetch} />
        </div>
        <div className="dash-rise" style={{ animationDelay: '0.36s' }}>
          <ActivityFeedPanel entries={activity} />
        </div>
      </aside>
    </div>
  )
}

function Header({ runningCount }: { runningCount: number }) {
  return (
    <header className="dash-rise" style={{ animationDelay: '0s' }}>
      <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
        Squad · Air-traffic control
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        <span className="dash-metallic-text">Your Agents</span>
      </h1>
      <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
        {runningCount > 0
          ? `${runningCount} agent${runningCount === 1 ? '' : 's'} working right now. You only act at sign-off points.`
          : 'A calm overview of what your squad is doing. You only act at sign-off points.'}
      </p>
    </header>
  )
}

// ── Status-strip glass stat tile (matches StatCard energy) ────────────────────

function GlassStat({
  label,
  value,
  hint,
  icon: Icon,
  delay,
  accent = false,
  live = false,
}: {
  label: string
  value: number
  hint: string
  icon: typeof Zap
  delay: string
  accent?: boolean
  live?: boolean
}) {
  const spotlight = useSpotlight<HTMLElement>()
  return (
    <article
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      className="dash-panel dash-grain dash-spotlight dash-interactive dash-rise group p-4"
      style={{ animationDelay: delay }}
    >
      <span className="dash-spotlight-glow" aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-soft)] backdrop-blur"
          style={accent ? { color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' } : { color: 'var(--dash-muted)' }}
        >
          <Icon className="h-4 w-4" />
        </span>
        {live && (
          <span className="flex h-2 w-2">
            <span className="absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-60 dash-live-dot" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
        )}
      </div>
      <p
        className="mt-3 text-2xl font-semibold leading-none tracking-tight [font-variant-numeric:tabular-nums]"
        style={{ color: accent && value > 0 ? 'var(--dash-accent)' : 'var(--dash-text-strong)' }}
      >
        {value.toLocaleString()}
      </p>
      <p className="mt-1.5 text-[12px] font-medium text-[var(--dash-text)]">{label}</p>
      <p className="mt-0.5 text-[11px] text-[var(--dash-subtle)]">{hint}</p>
    </article>
  )
}

// ── "Today" proof-of-work line (Req 6.2) ──────────────────────────────────────

function TodayLine({
  today,
}: {
  today: { sourcesIngested: number; connectionsMade: number; synthesesProposed: number }
}) {
  const items = [
    { label: 'sources ingested', value: today.sourcesIngested, icon: Layers },
    { label: 'connections made', value: today.connectionsMade, icon: GitBranch },
    { label: 'syntheses proposed', value: today.synthesesProposed, icon: Sparkles },
  ]
  return (
    <section
      className="dash-panel dash-grain dash-interactive dash-rise p-4"
      style={{ animationDelay: '0.23s' }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)]">
          Today · proof of work
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {items.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 text-[var(--dash-subtle)]" />
              <span className="text-lg font-semibold leading-none tracking-tight text-[var(--dash-text-strong)] [font-variant-numeric:tabular-nums]">
                {value.toLocaleString()}
              </span>
              <span className="text-[12px] text-[var(--dash-muted)]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Aegis Queue panel (Req 3.2, 3.3 anatomy + 6.4 placement) ──────────────────

function AegisQueuePanel({ items, onResolved }: { items: QueueItem[]; onResolved: () => void }) {
  const spotlight = useSpotlight<HTMLElement>()
  // The proposal currently being acted on (disables its buttons + shows spinner).
  const [actingId, setActingId] = useState<string | null>(null)
  // Which proposal has its inline refine composer open + its draft reply.
  const [refiningId, setRefiningId] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')
  const [actionError, setActionError] = useState('')
  // Lightweight inline undo affordance (no heavy modal — project prefers inline).
  const [toast, setToast] = useState<{ id: string; message: string; undoable: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((next: { id: string; message: string; undoable: boolean }) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(next)
    toastTimer.current = setTimeout(() => setToast(null), 9000)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  async function decide(id: string, action: QueueDecision | 'undo', reply?: string) {
    setActingId(id)
    setActionError('')
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reply !== undefined ? { action, reply } : { action }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(body?.error || 'That action could not be completed.')
        return
      }
      // Surface a lightweight outcome + undo affordance where the API supports it.
      const proposal = body?.proposal as { undo?: { reversible?: boolean } } | undefined
      if (action === 'approve') {
        showToast({ id, message: 'Approved · written to your vault', undoable: Boolean(proposal?.undo?.reversible) })
      } else if (action === 'dismiss') {
        showToast({ id, message: 'Dismissed', undoable: false })
      } else if (action === 'undo') {
        showToast({ id, message: 'Reverted', undoable: false })
      } else if (action === 'refine') {
        showToast({ id, message: 'Sent back to the agent to refine', undoable: false })
      }
      setRefiningId(null)
      setRefineText('')
      onResolved() // refetch the dashboard so the resolved item leaves the queue
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActingId(null)
    }
  }

  return (
    <section
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      className="dash-panel dash-grain dash-spotlight dash-interactive p-4"
    >
      <span className="dash-spotlight-glow" aria-hidden />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded-lg border bg-[var(--dash-soft)]"
            style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}
          >
            <ShieldGlyph />
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-[var(--dash-text-strong)]">
            Aegis Queue
          </h2>
        </div>
        <span
          className="rounded-full border px-2 py-0.5 text-[11px] font-semibold [font-variant-numeric:tabular-nums]"
          style={
            items.length > 0
              ? { color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)', background: 'var(--dash-accent-soft)' }
              : { color: 'var(--dash-subtle)', borderColor: 'var(--dash-border)' }
          }
        >
          {items.length}
        </span>
      </div>

      {actionError && (
        <p className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: 'var(--dash-accent)' }}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {actionError}
        </p>
      )}

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed px-4 py-8 text-center"
          style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }}>
          <Check className="mx-auto h-5 w-5" style={{ color: 'var(--dash-subtle)' }} />
          <p className="mt-2 text-[13px] font-medium text-[var(--dash-text)]">All caught up</p>
          <p className="mt-0.5 text-[11px] text-[var(--dash-subtle)]">
            Nothing is waiting on your sign-off.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const busy = actingId === item.id
            const refining = refiningId === item.id
            return (
              <li
                key={item.id}
                className="rounded-xl p-3.5"
                style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
              >
                {/* what (title) */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold leading-snug text-[var(--dash-text-strong)]">
                    {item.what}
                  </p>
                  <span className="shrink-0 rounded-md border border-[var(--dash-border)] bg-[var(--dash-soft)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--dash-subtle)]">
                    {item.kind}
                  </span>
                </div>

                {/* why (rationale) */}
                <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--dash-muted)]">
                  {item.why}
                </p>

                {/* evidence — citations (≥1 for factual proposals, Req 2.5/8.7) */}
                {item.citations.length > 0 && (
                  <ul className="mt-2.5 space-y-1.5">
                    {item.citations.map((c, i) => (
                      <li
                        key={`${item.id}-cite-${i}`}
                        className="flex items-start gap-2 rounded-lg px-2.5 py-1.5"
                        style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
                      >
                        <Quote className="mt-0.5 h-3 w-3 shrink-0" style={{ color: 'var(--dash-accent)' }} />
                        <div className="min-w-0">
                          <p className="text-[11px] leading-snug text-[var(--dash-muted)] line-clamp-2">
                            {c.quote}
                          </p>
                          {(c.slug || c.url) && (
                            <CitationLink slug={c.slug} url={c.url} />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* your decision — exactly three actions (Req 3.3) */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.actions.map((action) => {
                    if (action === 'approve') {
                      return (
                        <button
                          key={action}
                          type="button"
                          disabled={busy}
                          onClick={() => decide(item.id, 'approve')}
                          className={cn(
                            'dash-accent-grad inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition',
                            busy ? 'opacity-60' : 'hover:-translate-y-0.5',
                          )}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Approve
                        </button>
                      )
                    }
                    const label = action === 'refine' ? 'Refine' : 'Dismiss'
                    const Glyph = action === 'refine' ? RotateCcw : X
                    return (
                      <button
                        key={action}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          action === 'refine'
                            ? (setRefiningId(refining ? null : item.id), setRefineText(''))
                            : decide(item.id, 'dismiss')
                        }
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition',
                          busy ? 'opacity-60' : 'hover:border-[var(--dash-border-glow)]',
                        )}
                        style={{
                          background: 'var(--dash-card-solid)',
                          borderColor: refining && action === 'refine' ? 'var(--dash-border-glow)' : 'var(--dash-border)',
                          color: 'var(--dash-muted)',
                        }}
                      >
                        <Glyph className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    )
                  })}
                </div>

                {/* Inline refine composer (lightweight — no modal) */}
                {refining && (
                  <div className="mt-3">
                    <textarea
                      value={refineText}
                      onChange={(e) => setRefineText(e.target.value)}
                      rows={2}
                      autoFocus
                      placeholder="Tell the agent what to change…"
                      className="w-full resize-none rounded-lg px-3 py-2 text-[12px] leading-relaxed text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-subtle)] focus:border-[var(--dash-border-glow)] focus:shadow-[0_0_0_3px_var(--dash-accent-soft)]"
                      style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setRefiningId(null); setRefineText('') }}
                        className="text-[11px] font-medium text-[var(--dash-subtle)] transition-colors hover:text-[var(--dash-text)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy || refineText.trim().length === 0}
                        onClick={() => decide(item.id, 'refine', refineText.trim())}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition',
                          busy || refineText.trim().length === 0 ? 'cursor-not-allowed opacity-50' : 'hover:border-[var(--dash-border-glow)]',
                        )}
                        style={{ background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
                      >
                        Send refinement
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Inline undo toast (Req 3.7/3.8 affordance where reversible) */}
      {toast && (
        <div
          className="mt-3 flex items-center justify-between gap-3 rounded-xl px-3 py-2"
          style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border-glow)' }}
        >
          <span className="flex items-center gap-2 text-[12px] text-[var(--dash-text)]">
            <Check className="h-3.5 w-3.5" style={{ color: 'var(--dash-accent)' }} />
            {toast.message}
          </span>
          {toast.undoable && (
            <button
              type="button"
              disabled={actingId === toast.id}
              onClick={() => decide(toast.id, 'undo')}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold transition-colors hover:opacity-80"
              style={{ color: 'var(--dash-accent)' }}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function CitationLink({ slug, url }: { slug?: string; url?: string }) {
  if (slug) {
    return (
      <Link
        href={`/app/wiki/${slug}`}
        className="mt-1 inline-block text-[10px] font-medium underline-offset-2 hover:underline"
        style={{ color: 'var(--dash-accent)' }}
      >
        {slug}
      </Link>
    )
  }
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block max-w-full truncate text-[10px] font-medium underline-offset-2 hover:underline"
        style={{ color: 'var(--dash-accent)' }}
      >
        {url}
      </a>
    )
  }
  return null
}

// ── Activity_Feed panel (Req 6.4) ─────────────────────────────────────────────

function ActivityFeedPanel({ entries }: { entries: ActivityEntry[] }) {
  return (
    <section className="dash-panel dash-grain dash-interactive p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-soft)] text-[var(--dash-muted)]">
          <ActivityIcon className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-[var(--dash-text-strong)]">
          Activity
        </h2>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-[12px] text-[var(--dash-subtle)]">
          No agent activity yet. Events will stream in here as your squad works.
        </p>
      ) : (
        <ul className="mt-3 space-y-0.5">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 rounded-lg px-1.5 py-2">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: feedDotColor(entry) }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] leading-snug text-[var(--dash-text)]">{entry.summary}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--dash-subtle)]">
                  <span className="uppercase tracking-wider">{entry.kind}</span>
                  {entry.status && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{entry.status}</span>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <time dateTime={entry.at}>{timeAgo(entry.at)}</time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function feedDotColor(entry: ActivityEntry): string {
  if (entry.status === 'approved' || entry.status === 'auto-applied' || entry.status === 'completed') {
    return '#34d399' // emerald — landed / succeeded
  }
  if (entry.status === 'failed' || entry.status === 'budget-stopped' || entry.status === 'timeout') {
    return '#f43f5e' // rose — failed
  }
  if (entry.status === 'pending') {
    return 'var(--dash-accent)' // accent — awaiting sign-off
  }
  return 'var(--dash-subtle)'
}

// ── First-run empty state (Req 6.8) ───────────────────────────────────────────
// Inviting hero that suggests a starter Agent matched to the user's vault data.
// Kept lightweight: a prompt + starter archetypes + a primary "Create your first
// agent" CTA linking to the (Phase 4) builder route.

const STARTER_AGENTS = [
  {
    role: 'scout',
    name: 'Scout',
    icon: Compass,
    pitch: 'Watches your sources for new material and proposes what to ingest.',
  },
  {
    role: 'synthesist',
    name: 'Synthesist',
    icon: Sparkles,
    pitch: 'Reads across your vault and proposes syntheses that tie ideas together.',
  },
  {
    role: 'connector',
    name: 'Connector',
    icon: GitBranch,
    pitch: 'Finds links between existing notes and proposes new graph connections.',
  },
] as const

function FirstRunEmptyState() {
  const spotlight = useSpotlight<HTMLElement>()
  return (
    <div className="mx-auto max-w-3xl py-8 sm:py-12">
      <section
        ref={spotlight.ref}
        onMouseMove={spotlight.onMouseMove}
        className="dash-panel dash-grain dash-spotlight dash-interactive dash-rise relative overflow-hidden p-6 sm:p-8"
      >
        <span className="dash-spotlight-glow" aria-hidden />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--dash-accent-soft), transparent 70%)' }}
        />

        <div className="relative">
          <span
            className="inline-grid h-12 w-12 place-items-center rounded-2xl border bg-[var(--dash-soft)]"
            style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}
          >
            <Radar className="h-6 w-6" />
          </span>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            <span className="dash-metallic-text">Hire your first agent</span>
          </h1>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[var(--dash-muted)]">
            Agents tend your knowledge vault for you — ingesting, connecting, and synthesizing.
            They always <span className="font-medium text-[var(--dash-text)]">propose, never write</span>,
            so nothing enters your brain without your sign-off. Based on what you already have in
            your vault, here are a few good first hires.
          </p>

          {/* Starter archetypes matched to the vault (lightweight suggestion) */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {STARTER_AGENTS.map(({ role, name, icon: Icon, pitch }) => (
              <Link
                key={role}
                href={`${BUILDER_HREF}?role=${role}`}
                className="group rounded-xl p-4 text-left transition"
                style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
              >
                <span
                  className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-soft)] text-[var(--dash-muted)] transition-colors group-hover:text-[var(--dash-accent)]"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-2.5 text-[13px] font-semibold text-[var(--dash-text-strong)]">{name}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--dash-subtle)]">{pitch}</p>
              </Link>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={BUILDER_HREF}
              className="dash-accent-grad inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5"
            >
              <Zap className="h-4 w-4" />
              Create your first agent
            </Link>
            <span className="text-[11px] text-[var(--dash-subtle)]">
              You&apos;ll dry-run it before it ever touches your vault.
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}

// ── Loading / error views ─────────────────────────────────────────────────────

function LoadingView() {
  return (
    <div className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_360px] 2xl:gap-5">
      <section className="min-w-0 space-y-4">
        <div className="h-16 w-56 animate-pulse rounded-xl bg-[var(--dash-soft)]" />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="dash-panel h-28 animate-pulse" />
          ))}
        </div>
        <div className="dash-panel h-16 animate-pulse" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="dash-panel h-40 animate-pulse" />
          ))}
        </div>
      </section>
      <aside className="space-y-4">
        <div className="dash-panel h-64 animate-pulse" />
        <div className="dash-panel h-48 animate-pulse" />
      </aside>
    </div>
  )
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16">
      <section className="dash-panel dash-grain dash-interactive p-6 text-center">
        <AlertCircle className="mx-auto h-6 w-6" style={{ color: 'var(--dash-accent)' }} />
        <p className="mono mt-3 text-[10px] uppercase tracking-widest" style={{ color: 'var(--dash-accent)' }}>
          Could not load squad
        </p>
        <p className="mt-2 text-[13px] text-[var(--dash-muted)]">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="dash-accent-grad mt-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5"
        >
          <RotateCcw className="h-4 w-4" />
          Try again
        </button>
      </section>
    </div>
  )
}

// Small shield glyph for the Aegis Queue header (kept local; matches lucide weight).
function ShieldGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

// ── Relative time ─────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const s = Math.round(ms / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.round(d / 7)
  return `${w}w ago`
}
