'use client'

// ── Mission Console — create a Mission + the roster of the user's missions ──────
// The Mission_Orchestrator home: state ONE objective and a lead agent takes it from
// there (Req 1.1–1.4). Two sections, both REAL data:
//   1. CREATE — objective (required), optional context, and a Lead_Agent selector
//      populated from the user's squad (`GET /api/agents`). "Auto-select" is the
//      default since the create route auto-selects a lead by role fit when none is
//      supplied (Req 1.4). Submit → `POST /api/missions`; a 201 routes to the new
//      mission's plan page, a 400 surfaces the validation message inline (empty
//      objective, no eligible lead — Req 1.5, 1.6).
//   2. ROSTER — the user's missions (`GET /api/missions`), each showing its objective,
//      current lifecycle state, and per-status task counts derived from the mission's
//      REAL Mission_Tasks (Req 11.1). An honest zero state when there are no missions —
//      no fabricated rows, ever.
//
// Glass recipe is mandatory (.kiro/steering/glass-theme.md):
//   • shell  = `sb-dashboard` (paints the aurora + grid backdrop)
//   • panels = `dash-panel dash-grain dash-interactive`; the create hero adds
//              `dash-spotlight` + a `dash-spotlight-glow` child + `useSpotlight()`
//   • tokens = `--dash-*` only; inset wells use `--dash-card-solid` + `--dash-border`;
//              headings use `.dash-metallic-text`; the primary CTA uses `.dash-accent-grad`

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ChevronRight,
  Inbox,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react'
import { useSpotlight } from '@/lib/use-spotlight'
import {
  tallyTaskStatuses,
  TASK_STATUSES,
  type TaskStatus,
  type TaskStatusCounts,
} from '@/lib/agents/mission/timeline'
import { cn } from '@/lib/utils'

// ── Payload types (mirror the route responses we read) ────────────────────────

type MissionLifecycle =
  | 'planning'
  | 'awaiting-plan-approval'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'aborted'

/** A Mission as returned by `GET /api/missions` (lean doc, ids serialized to string). */
interface MissionRow {
  _id: string
  objective: string
  lifecycle: MissionLifecycle
  leadAutoSelected?: boolean
  createdAt?: string
}

/** An Agent as returned by `GET /api/agents` — only the fields the selector reads. */
interface AgentRow {
  _id: string
  name: string
  role: string
  customRoleDescription?: string | null
  lifecycle?: string
}

/** One task in a mission's plan (`GET /api/missions/[id]/plan`) — status only here. */
interface PlanTaskRow {
  status: TaskStatus
}

type LoadState = 'loading' | 'error' | 'ready'

// Human-register labels + accent for each lifecycle state (no internal codenames).
const LIFECYCLE_META: Record<MissionLifecycle, { label: string; tone: 'neutral' | 'accent' | 'live' | 'good' | 'bad' }> = {
  planning: { label: 'Planning', tone: 'neutral' },
  'awaiting-plan-approval': { label: 'Awaiting your approval', tone: 'accent' },
  running: { label: 'Running', tone: 'live' },
  paused: { label: 'Paused', tone: 'neutral' },
  completed: { label: 'Completed', tone: 'good' },
  failed: { label: 'Failed', tone: 'bad' },
  aborted: { label: 'Aborted', tone: 'bad' },
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function MissionConsolePage() {
  const [state, setState] = useState<LoadState>('loading')
  const [missions, setMissions] = useState<MissionRow[]>([])
  const [agents, setAgents] = useState<AgentRow[]>([])
  // missionId → per-status task counts, tallied from each mission's REAL tasks.
  const [taskCounts, setTaskCounts] = useState<Record<string, TaskStatusCounts>>({})
  const [error, setError] = useState('')

  // Fetch per-mission task counts from each mission's plan (the real task source).
  // Resilient: a failed plan fetch yields no entry (honest absence), never a fake count.
  const loadTaskCounts = useCallback(async (rows: MissionRow[]) => {
    const entries = await Promise.all(
      rows.map(async (m) => {
        try {
          const res = await fetch(`/api/missions/${m._id}/plan`, { cache: 'no-store' })
          if (!res.ok) return null
          const body = await res.json().catch(() => null)
          const tasks: PlanTaskRow[] = Array.isArray(body?.plan?.tasks) ? body.plan.tasks : []
          return [m._id, tallyTaskStatuses(tasks)] as const
        } catch {
          return null
        }
      }),
    )
    const next: Record<string, TaskStatusCounts> = {}
    for (const entry of entries) {
      if (entry) next[entry[0]] = entry[1]
    }
    setTaskCounts(next)
  }, [])

  const load = useCallback(async () => {
    setState('loading')
    try {
      const [missionsRes, agentsRes] = await Promise.all([
        fetch('/api/missions', { cache: 'no-store' }),
        fetch('/api/agents', { cache: 'no-store' }),
      ])
      const missionsBody = await missionsRes.json().catch(() => ({}))
      const agentsBody = await agentsRes.json().catch(() => ({}))
      if (!missionsRes.ok) {
        setError(missionsBody?.error || 'Could not load your missions.')
        setState('error')
        return
      }
      const rows: MissionRow[] = Array.isArray(missionsBody?.missions) ? missionsBody.missions : []
      setMissions(rows)
      setAgents(Array.isArray(agentsBody?.agents) ? agentsBody.agents : [])
      setState('ready')
      // Counts stream in after the roster paints — the roster never blocks on them.
      if (rows.length > 0) void loadTaskCounts(rows)
    } catch {
      setError('Network error. Please try again.')
      setState('error')
    }
  }, [loadTaskCounts])

  useEffect(() => {
    load()
  }, [load])

  // Only non-retired agents can lead a mission — mirror the create route's eligibility
  // so the selector never offers a lead the server would reject.
  const eligibleAgents = useMemo(
    () => agents.filter((a) => a.lifecycle !== 'retire'),
    [agents],
  )

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-[1180px] p-4 sm:p-5 lg:p-6 2xl:p-7">
        <Header />

        {state === 'loading' && <LoadingView />}
        {state === 'error' && <ErrorView message={error} onRetry={load} />}
        {state === 'ready' && (
          <div className="mt-5 grid gap-4 min-[1080px]:grid-cols-[minmax(0,440px)_minmax(0,1fr)] 2xl:gap-5">
            <CreateMissionCard agents={eligibleAgents} onCreated={load} />
            <RosterPanel missions={missions} taskCounts={taskCounts} />
          </div>
        )}
      </div>
    </main>
  )
}

function Header() {
  return (
    <header className="dash-rise" style={{ animationDelay: '0s' }}>
      <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
        Mission Console · One ask, the squad runs
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        <span className="dash-metallic-text">Missions</span>
      </h1>
      <p className="mt-1 max-w-2xl text-[13px] text-[var(--dash-muted)]">
        State one objective and a lead agent breaks it into a plan for your squad. You review
        the plan before anything runs, and every deliverable still waits for your sign-off.
      </p>
    </header>
  )
}

// ── Create form (hero card — spotlight) ────────────────────────────────────────

function CreateMissionCard({ agents, onCreated }: { agents: AgentRow[]; onCreated: () => void }) {
  const router = useRouter()
  const spotlight = useSpotlight<HTMLElement>()

  const [objective, setObjective] = useState('')
  const [context, setContext] = useState('')
  const [leadAgentId, setLeadAgentId] = useState('') // '' = auto-select (Req 1.4)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const objectiveEmpty = objective.trim().length === 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    // Client guard mirrors the server's Objective validation (Req 1.6) — the server
    // remains authoritative; this just avoids a pointless round-trip.
    if (objectiveEmpty) {
      setError('An objective is required.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const payload: Record<string, unknown> = { objective: objective.trim() }
      const trimmedContext = context.trim()
      if (trimmedContext.length > 0) payload.context = trimmedContext
      // Omit leadAgentId entirely when auto-selecting so the route runs its role-fit
      // auto-selection (Req 1.4).
      if (leadAgentId) payload.leadAgentId = leadAgentId

      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Surface the server's validation message inline (empty objective / no eligible
        // lead — Req 1.5, 1.6).
        setError(body?.error || 'Could not create the mission.')
        return
      }
      const newId = body?.mission?._id ? String(body.mission._id) : ''
      if (newId) {
        // On success, head to the new mission's plan page to decompose + review.
        router.push(`/app/missions/${newId}/plan`)
      } else {
        // No id came back — refresh the roster so the new mission still appears.
        onCreated()
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const wellStyle = { background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }

  return (
    <section
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      className="dash-panel dash-grain dash-spotlight dash-interactive dash-rise self-start p-5 sm:p-6"
      style={{ animationDelay: '0.08s' }}
    >
      <span className="dash-spotlight-glow" aria-hidden />

      <div className="flex items-center gap-2.5">
        <span
          className="grid h-9 w-9 place-items-center rounded-xl border bg-[var(--dash-soft)]"
          style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}
        >
          <Target className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-[var(--dash-text-strong)]">
            New mission
          </h2>
          <p className="text-[11px] text-[var(--dash-subtle)]">Start with a single objective.</p>
        </div>
      </div>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        {/* Objective (required) */}
        <div>
          <label
            htmlFor="mission-objective"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--dash-subtle)]"
          >
            Objective
          </label>
          <textarea
            id="mission-objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            placeholder="e.g. Grow our newsletter to 10,000 engaged subscribers"
            className="w-full resize-none rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-subtle)] focus:border-[var(--dash-border-glow)] focus:shadow-[0_0_0_3px_var(--dash-accent-soft)]"
            style={wellStyle}
          />
        </div>

        {/* Context (optional) */}
        <div>
          <label
            htmlFor="mission-context"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--dash-subtle)]"
          >
            Context <span className="font-normal normal-case text-[var(--dash-subtle)]">· optional</span>
          </label>
          <textarea
            id="mission-context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={2}
            placeholder="Anything the lead agent should know before planning."
            className="w-full resize-none rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-subtle)] focus:border-[var(--dash-border-glow)] focus:shadow-[0_0_0_3px_var(--dash-accent-soft)]"
            style={wellStyle}
          />
        </div>

        {/* Lead_Agent selector */}
        <div>
          <label
            htmlFor="mission-lead"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--dash-subtle)]"
          >
            Lead agent
          </label>
          <select
            id="mission-lead"
            value={leadAgentId}
            onChange={(e) => setLeadAgentId(e.target.value)}
            className="w-full appearance-none rounded-xl px-3.5 py-2.5 text-[13px] text-[var(--dash-text)] outline-none transition focus:border-[var(--dash-border-glow)] focus:shadow-[0_0_0_3px_var(--dash-accent-soft)]"
            style={wellStyle}
          >
            <option value="">Auto-select by role fit (recommended)</option>
            {agents.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name} · {roleLabel(a)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--dash-subtle)]">
            <Sparkles className="h-3 w-3 shrink-0" style={{ color: 'var(--dash-accent)' }} />
            {agents.length === 0
              ? 'No agents yet — auto-select needs at least one agent in your squad.'
              : 'Leave on auto-select to let the orchestrator pick the best-fit lead.'}
          </p>
        </div>

        {error && (
          <p
            className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]"
            style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-accent)' }}
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || objectiveEmpty}
          className={cn(
            'dash-accent-grad inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition',
            submitting || objectiveEmpty ? 'cursor-not-allowed opacity-50' : 'hover:-translate-y-0.5',
          )}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create mission
        </button>
      </form>
    </section>
  )
}

/** A readable role label for an Agent — a custom agent surfaces its description. */
function roleLabel(agent: AgentRow): string {
  if (
    agent.role === 'custom' &&
    typeof agent.customRoleDescription === 'string' &&
    agent.customRoleDescription.trim().length > 0
  ) {
    return agent.customRoleDescription.trim()
  }
  return agent.role || 'agent'
}

// ── Roster ──────────────────────────────────────────────────────────────────────

function RosterPanel({
  missions,
  taskCounts,
}: {
  missions: MissionRow[]
  taskCounts: Record<string, TaskStatusCounts>
}) {
  return (
    <section
      className="dash-panel dash-grain dash-interactive dash-rise p-5 sm:p-6"
      style={{ animationDelay: '0.16s' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-soft)] text-[var(--dash-muted)]">
            <Inbox className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-[var(--dash-text-strong)]">
            Your missions
          </h2>
        </div>
        <span className="text-[11px] font-medium text-[var(--dash-subtle)] [font-variant-numeric:tabular-nums]">
          {missions.length} {missions.length === 1 ? 'mission' : 'missions'}
        </span>
      </div>

      {missions.length === 0 ? (
        <RosterEmptyState />
      ) : (
        <ul className="mt-4 space-y-2.5">
          {missions.map((m) => (
            <li key={m._id}>
              <MissionRowCard mission={m} counts={taskCounts[m._id]} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function MissionRowCard({ mission, counts }: { mission: MissionRow; counts?: TaskStatusCounts }) {
  const meta = LIFECYCLE_META[mission.lifecycle] ?? { label: mission.lifecycle, tone: 'neutral' as const }
  const totalTasks = counts ? TASK_STATUSES.reduce((sum, s) => sum + counts[s], 0) : 0

  return (
    <Link
      href={`/app/missions/${mission._id}/plan`}
      className="group block rounded-xl p-3.5 transition hover:border-[var(--dash-border-glow)]"
      style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--dash-text-strong)]">
          {mission.objective}
        </p>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dash-subtle)] transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <LifecycleBadge label={meta.label} tone={meta.tone} />

        {/* Per-status task counts derived from the mission's REAL tasks (Req 11.1). */}
        {totalTasks > 0 && counts ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {TASK_STATUSES.map((status) =>
              counts[status] > 0 ? (
                <TaskCountChip key={status} status={status} count={counts[status]} />
              ) : null,
            )}
          </div>
        ) : (
          // Honest zero: a mission with no tasks yet shows the truth, not a fake count.
          <span className="text-[11px] text-[var(--dash-subtle)]">
            {mission.lifecycle === 'planning' ? 'Plan not generated yet' : 'No tasks yet'}
          </span>
        )}
      </div>
    </Link>
  )
}

function LifecycleBadge({ label, tone }: { label: string; tone: 'neutral' | 'accent' | 'live' | 'good' | 'bad' }) {
  const style: React.CSSProperties =
    tone === 'accent'
      ? { color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)', background: 'var(--dash-accent-soft)' }
      : tone === 'good'
        ? { color: '#34d399', borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }
        : tone === 'bad'
          ? { color: '#f43f5e', borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }
          : { color: 'var(--dash-muted)', borderColor: 'var(--dash-border)', background: 'var(--dash-soft)' }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
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

// Subtle per-status accents so completed/failed read at a glance without shouting.
const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: 'pending', color: 'var(--dash-subtle)' },
  running: { label: 'running', color: 'var(--dash-accent)' },
  completed: { label: 'done', color: '#34d399' },
  failed: { label: 'failed', color: '#f43f5e' },
  blocked: { label: 'blocked', color: '#fbbf24' },
}

function TaskCountChip({ status, count }: { status: TaskStatus; count: number }) {
  const meta = STATUS_META[status]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium [font-variant-numeric:tabular-nums]"
      style={{ background: 'var(--dash-soft)', borderColor: 'var(--dash-border)', color: 'var(--dash-muted)' }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} aria-hidden />
      {count} {meta.label}
    </span>
  )
}

function RosterEmptyState() {
  return (
    <div
      className="mt-4 rounded-xl border border-dashed px-4 py-10 text-center"
      style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }}
    >
      <span
        className="mx-auto grid h-10 w-10 place-items-center rounded-2xl border bg-[var(--dash-soft)]"
        style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}
      >
        <Target className="h-5 w-5" />
      </span>
      <p className="mt-3 text-[13px] font-medium text-[var(--dash-text)]">No missions yet</p>
      <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-[var(--dash-subtle)]">
        State your first objective on the left. Your lead agent will draft a plan you can review
        before any work begins.
      </p>
    </div>
  )
}

// ── Loading / error views ─────────────────────────────────────────────────────

function LoadingView() {
  return (
    <div className="mt-5 grid gap-4 min-[1080px]:grid-cols-[minmax(0,440px)_minmax(0,1fr)] 2xl:gap-5">
      <div className="dash-panel h-[420px] animate-pulse" />
      <div className="dash-panel h-[420px] animate-pulse" />
    </div>
  )
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto mt-8 max-w-md">
      <section className="dash-panel dash-grain dash-interactive p-6 text-center">
        <AlertCircle className="mx-auto h-6 w-6" style={{ color: 'var(--dash-accent)' }} />
        <p className="mono mt-3 text-[10px] uppercase tracking-widest" style={{ color: 'var(--dash-accent)' }}>
          Could not load missions
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
