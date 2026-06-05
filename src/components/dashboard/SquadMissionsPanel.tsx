'use client'

// ── SquadMissionsPanel — surfaces the Agent Squad + Mission Orchestrator on the
//    main dashboard (which otherwise shows only the knowledge vault). ───────────
//
// Three honest, real-data sections:
//   1. STATUS STRIP — agents running / scheduled, and items awaiting YOUR sign-off
//      (the Aegis queue depth), from GET /api/agents/dashboard's tally.
//   2. NEEDS YOUR SIGN-OFF — a prominent count + link to the queue when proposals
//      are pending (the "what needs me" nudge). Hidden when zero (honest).
//   3. MISSIONS — the user's mission roster with lifecycle, from GET /api/missions,
//      with an honest empty state + a "New mission" CTA when there are none.
//
// Glass recipe (.kiro/steering/glass-theme.md): the panel is a feature card with the
// full texture stack `dash-panel dash-grain dash-spotlight dash-interactive` + a
// `.dash-spotlight-glow` child + `useSpotlight()`. Inset wells use `--dash-card-solid`
// + `--dash-border`; the heading uses `.dash-metallic-text`; the primary CTA uses
// `.dash-accent-grad`. `--dash-*` tokens only. No "Hermes"/"gstack"/"GBrain" wording.

import Link from 'next/link'
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Plus,
  Radar,
  Target,
} from 'lucide-react'
import { useSpotlight } from '@/lib/use-spotlight'
import {
  useSquadSnapshot,
  type MissionLifecycle,
  type MissionLite,
} from '@/lib/use-squad-snapshot'

// Human-register lifecycle labels + tone (no internal codenames). Warm accent is
// reserved for the sign-off moment, so only `awaiting-plan-approval` binds it.
const LIFECYCLE_META: Record<MissionLifecycle, { label: string; tone: 'neutral' | 'accent' | 'live' | 'good' | 'bad' }> = {
  planning: { label: 'Planning', tone: 'neutral' },
  'awaiting-plan-approval': { label: 'Needs approval', tone: 'accent' },
  running: { label: 'Running', tone: 'live' },
  paused: { label: 'Paused', tone: 'neutral' },
  completed: { label: 'Completed', tone: 'good' },
  failed: { label: 'Failed', tone: 'bad' },
  aborted: { label: 'Aborted', tone: 'bad' },
}

const WELL = { background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }

export function SquadMissionsPanel() {
  const spotlight = useSpotlight<HTMLElement>()
  const snap = useSquadSnapshot()

  // Missions that are "active" (not terminal) float to the top; show up to 4.
  const activeFirst = [...snap.missions].sort((a, b) => rank(a) - rank(b)).slice(0, 4)
  const running = snap.tally?.statusStrip.running ?? 0
  const scheduled = snap.tally?.statusStrip.scheduled ?? 0

  return (
    <section
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      className="dash-panel dash-grain dash-spotlight dash-interactive group p-4 2xl:p-5"
      aria-label="Squad and missions"
    >
      <span className="dash-spotlight-glow" aria-hidden />

      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded-lg border bg-[var(--dash-soft)]"
            style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}
          >
            <Radar className="h-3.5 w-3.5" />
          </span>
          <h2 className="dash-metallic-text text-sm font-semibold tracking-tight 2xl:text-[15px]">
            Squad &amp; Missions
          </h2>
        </div>
        <Link
          href="/app/agents"
          className="group/link inline-flex items-center gap-0.5 text-[13px] font-medium text-[var(--dash-accent)] transition hover:opacity-80"
        >
          Open squad
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
        </Link>
      </div>

      {snap.loading ? (
        <LoadingState />
      ) : (
        <div className="space-y-3">
          {/* ── Status strip (real tallies) ── */}
          <div className="grid grid-cols-3 gap-2">
            <StripStat icon={Activity} label="Running" value={running} live={running > 0} />
            <StripStat icon={ClipboardCheck} label="Scheduled" value={scheduled} />
            <StripStat icon={CheckCircle2} label="Agents" value={snap.agentCount} />
          </div>

          {/* ── Needs your sign-off (only when there's something) ── */}
          {snap.pendingSignOff > 0 && (
            <Link
              href="/app/agents"
              className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 transition hover:border-[var(--dash-border-glow)]"
              style={{ background: 'var(--dash-accent-soft)', border: '1px solid var(--dash-border-glow)' }}
            >
              <span className="flex items-center gap-2">
                <span
                  className="grid h-7 w-7 place-items-center rounded-lg"
                  style={{ background: 'var(--dash-card-solid)', color: 'var(--dash-accent)' }}
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                </span>
                <span className="text-[13px] font-medium text-[var(--dash-text-strong)]">
                  {snap.pendingSignOff} {snap.pendingSignOff === 1 ? 'item' : 'items'} need your sign-off
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--dash-accent)]" />
            </Link>
          )}

          {/* ── Missions ── */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--dash-subtle)]">
                Missions
              </span>
              <Link
                href="/app/missions"
                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--dash-subtle)] transition hover:text-[var(--dash-text)]"
              >
                View all
              </Link>
            </div>

            {activeFirst.length === 0 ? (
              <MissionEmptyState />
            ) : (
              <ul className="space-y-1.5">
                {activeFirst.map((m) => (
                  <li key={m._id}>
                    <MissionRow mission={m} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

// ── Status-strip stat tile ──────────────────────────────────────────────────────

function StripStat({
  icon: Icon,
  label,
  value,
  live = false,
}: {
  icon: typeof Activity
  label: string
  value: number
  live?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl px-3 py-2.5" style={WELL}>
      <span className="flex items-center gap-1.5 text-[var(--dash-subtle)]">
        <Icon className="h-3.5 w-3.5" />
        {live && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 opacity-60 dash-live-dot" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
        )}
      </span>
      <span className="text-xl font-semibold leading-none tracking-tight text-[var(--dash-text-strong)] [font-variant-numeric:tabular-nums]">
        {value}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--dash-subtle)]">
        {label}
      </span>
    </div>
  )
}

// ── One mission row ──────────────────────────────────────────────────────────────

function MissionRow({ mission }: { mission: MissionLite }) {
  const meta = LIFECYCLE_META[mission.lifecycle] ?? { label: mission.lifecycle, tone: 'neutral' as const }
  return (
    <Link
      href={`/app/missions/${mission._id}`}
      className="group/row flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 transition hover:border-[var(--dash-border-glow)]"
      style={WELL}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Target className="h-3.5 w-3.5 shrink-0 text-[var(--dash-subtle)]" />
        <span className="truncate text-[13px] font-medium text-[var(--dash-text)] group-hover/row:text-[var(--dash-text-strong)]">
          {mission.objective}
        </span>
      </span>
      <LifecycleBadge label={meta.label} tone={meta.tone} />
    </Link>
  )
}

function LifecycleBadge({
  label,
  tone,
}: {
  label: string
  tone: 'neutral' | 'accent' | 'live' | 'good' | 'bad'
}) {
  const style: React.CSSProperties =
    tone === 'accent'
      ? { color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)', background: 'var(--dash-accent-soft)' }
      : tone === 'good'
        ? { color: '#34d399', borderColor: 'var(--dash-border)', background: 'var(--dash-soft)' }
        : tone === 'bad'
          ? { color: '#fb7185', borderColor: 'var(--dash-border)', background: 'var(--dash-soft)' }
          : { color: 'var(--dash-muted)', borderColor: 'var(--dash-border)', background: 'var(--dash-soft)' }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={style}
    >
      {tone === 'live' && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 opacity-60 dash-live-dot" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
      )}
      {label}
    </span>
  )
}

// ── Empty + loading states ────────────────────────────────────────────────────────

function MissionEmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center"
      style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }}
    >
      <p className="text-[12px] text-[var(--dash-muted)]">
        No missions yet. State one objective and your squad runs it.
      </p>
      <Link
        href="/app/missions"
        className="dash-accent-grad inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-white transition hover:-translate-y-0.5"
      >
        <Plus className="h-3.5 w-3.5" />
        New mission
      </Link>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-xl bg-[var(--dash-soft)]" />
        ))}
      </div>
      <div className="space-y-1.5">
        {[0, 1].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-xl bg-[var(--dash-soft)]" />
        ))}
      </div>
    </div>
  )
}

// Sort key: active (non-terminal) missions first, then by recency is handled by the
// API's newest-first order. Lower rank = higher in the list.
function rank(m: MissionLite): number {
  switch (m.lifecycle) {
    case 'awaiting-plan-approval':
      return 0 // needs the user — surface first
    case 'running':
      return 1
    case 'paused':
      return 2
    case 'planning':
      return 3
    default:
      return 4 // completed / failed / aborted (terminal)
  }
}
