'use client'

// ── Mission Timeline — the task-by-task, agent-by-agent watch surface (Req 8) ──
// The mission DETAIL page (the `[id]` index, distinct from the sibling `[id]/plan`
// Plan-Review screen). It answers "watch progress unfold and understand who did what
// when": a chronological Mission_Timeline from the Mission's start at T+0, the live
// Observability / Cost panel, and the Kill_Switch — all on one glass surface.
//
// HONEST DATA, NO FABRICATION (Req 8.4, 8.5, 11.5, 11.6):
//   • The timeline is built by the PURE `buildMissionTimeline` core — it returns `[]`
//     when no Mission_Task Run has started, so this page shows a real "nothing has run
//     yet" empty state rather than placeholder activity.
//   • Every metric is derived (via the pure tally helpers, through `deriveObservability`)
//     from the REAL Mission_Task statuses + the Mission's persisted, run-derived usage.
//
// COMPOSED, NOT REIMPLEMENTED: the Observability / Cost panel and the Kill_Switch are
// the existing components from `src/components/missions/*`; this page only fetches the
// real, user-scoped records and shapes them into those components' props.
//
// DATA SOURCES (existing routes, read-only):
//   GET /api/missions/[id]        → { mission }  — the lean Mission doc: `lifecycle`,
//       `limits`, `usage`, embedded `handoffs[]` + `mentions[]`, `startedAt`, objective.
//   GET /api/missions/[id]/plan   → { plan: { tasks: [{ key, status, assignedAgent }] } }
//       — the Task_Graph with each task's CURRENT status + assigned Agent (name/role).
//
// FIELDS NOT SOURCEABLE FROM THE READ API (documented honestly, never fabricated):
//   • Per-run `AgentRun` rows are not exposed by either GET. So `runs` is passed empty
//     to `deriveObservability`; the aggregate token/cost totals + the budget bars use
//     the Mission's PERSISTED `usage` (itself accumulated from real Run records by the
//     executor). Per-Agent contribution therefore shows real completed-task counts with
//     a 0-token attribution (we lack per-run-per-agent tokens here) — an honest zero,
//     not a fabricated split.
//   • Per-transition timestamps live on `MissionTask.statusHistory`, which the plan
//     route does not project. So task-status transitions are anchored at the Mission's
//     real start (T+0); recorded Handoffs/Mentions carry their own real `at` instants.
//     Only tasks that have progressed past `pending` emit a transition — a pending task
//     contributes nothing, keeping the timeline honest about what ran.
//
// GLASS RECIPE (.kiro/steering/glass-theme.md — mandatory):
//   • shell  = `sb-dashboard min-h-full text-[var(--dash-text)]` (aurora + grid backdrop)
//   • hero   = `dash-panel dash-grain dash-spotlight dash-interactive` + a
//              `dash-spotlight-glow` first child + `useSpotlight()`
//   • panels = `dash-panel dash-grain dash-interactive`; headings `.dash-metallic-text`
//   • tokens = `--dash-*` only; timeline rows are inset wells. The Kill_Switch's abort
//              dialog is portalled with ROOT tokens (handled inside that component).

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRightLeft,
  AtSign,
  CircleDot,
  Clock,
  GitBranch,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import {
  ObservabilityPanel,
  deriveObservability,
} from '@/components/missions/ObservabilityPanel'
import { KillSwitch } from '@/components/missions/KillSwitch'
import type { MissionState } from '@/lib/agents/mission/lifecycle'
import {
  buildMissionTimeline,
  usageVsCeiling,
  type Handoff,
  type Mention,
  type TaskStatus,
  type TaskTransitionRow,
  type TimelineEntry,
} from '@/lib/agents/mission/timeline'
import { useSpotlight } from '@/lib/use-spotlight'

// ── Payload types (mirror the two GET routes' serialized shapes) ───────────────

/** One embedded Handoff as the lean Mission doc serializes it (ObjectIds → strings). */
interface MissionHandoffDoc {
  at: string
  fromTaskKey: string
  toTaskKey: string
  runId: string | null
  proposalIds: string[]
}

/** One embedded Mention as the lean Mission doc serializes it. */
interface MissionMentionDoc {
  at: string
  byTaskKey: string
  byAgentId: string
  referencedTaskKey: string
  referencedAgentId: string
  note: string
}

/** The lean Mission document returned by GET /api/missions/[id] (`{ mission }`). */
interface MissionDoc {
  _id: string
  objective: string
  lifecycle: MissionState
  limits: {
    maxGraphDepth: number
    maxTaskCount: number
    concurrencyLimit: number
    tokenCeiling: number
    costCeiling: number
    wallClockLimitMs: number
  }
  usage: { tokensUsed: number; costUsed: number }
  handoffs: MissionHandoffDoc[]
  mentions: MissionMentionDoc[]
  startedAt: string | null
  approvedAt: string | null
  finishedAt: string | null
}

/** One Task_Graph node from GET /api/missions/[id]/plan (`{ plan: { tasks } }`). */
interface PlanTask {
  key: string
  description: string
  dependsOn: string[]
  status: TaskStatus
  assignmentFallback: boolean
  assignedAgent: { id: string; name: string | null; role: string | null } | null
}

type LoadState = 'loading' | 'error' | 'ready'

// ── Page ────────────────────────────────────────────────────────────────────────

export default function MissionTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  // Read the `[id]` route param via `use(params)` — the repo convention (see the
  // sibling `[id]/plan/page.tsx`), since `params` is a Promise in this Next.js version.
  const { id } = use(params)

  const [state, setState] = useState<LoadState>('loading')
  const [mission, setMission] = useState<MissionDoc | null>(null)
  const [tasks, setTasks] = useState<PlanTask[]>([])
  const [error, setError] = useState('')

  // Fetch the lean Mission doc + its Task_Graph together. Both are user-scoped on the
  // server; a mission the caller does not own reads as 404 (never a leak).
  const load = useCallback(async () => {
    try {
      const [missionRes, planRes] = await Promise.all([
        fetch(`/api/missions/${id}`, { cache: 'no-store' }),
        fetch(`/api/missions/${id}/plan`, { cache: 'no-store' }),
      ])
      const missionBody = await missionRes.json().catch(() => ({}))
      if (!missionRes.ok) {
        setError(missionBody?.error || 'Could not load this mission.')
        setState('error')
        return
      }
      const planBody = await planRes.json().catch(() => ({}))
      setMission(missionBody.mission as MissionDoc)
      // The plan route is best-effort here: if it fails we still show the mission, just
      // with no task rows (honest — never a fabricated graph).
      setTasks(planRes.ok && Array.isArray(planBody?.plan?.tasks) ? (planBody.plan.tasks as PlanTask[]) : [])
      setState('ready')
    } catch {
      setError('Network error. Please try again.')
      setState('error')
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-[1280px] p-4 sm:p-5 lg:p-6 2xl:p-7">
        <BackLink />
        {state === 'loading' && <LoadingView />}
        {state === 'error' && <ErrorView message={error} onRetry={load} />}
        {state === 'ready' && mission && (
          <MissionView mission={mission} tasks={tasks} onRefetch={load} />
        )}
      </div>
    </main>
  )
}

function BackLink() {
  return (
    <Link
      href="/app/missions"
      className="mb-4 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-[var(--dash-subtle)] transition-colors hover:text-[var(--dash-text)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Missions
    </Link>
  )
}

// ── Ready view: hero + Kill_Switch | Observability | Timeline ──────────────────

function MissionView({
  mission,
  tasks,
  onRefetch,
}: {
  mission: MissionDoc
  tasks: PlanTask[]
  onRefetch: () => void
}) {
  // Resolve agentId → display name from the Task_Graph's assigned Agents (the only
  // place names ride along in the read API). Used to label timeline + contribution rows.
  const agentNames = useMemo(() => {
    const names: Record<string, string> = {}
    for (const t of tasks) {
      if (t.assignedAgent?.id && t.assignedAgent.name) names[t.assignedAgent.id] = t.assignedAgent.name
    }
    return names
  }, [tasks])

  // ── Build the TimelineInput from REAL records (Req 8.1–8.6) ──────────────────
  // `startedAnyRun` is honest: true only when the mission actually started (has a
  // `startedAt`) AND at least one task has progressed beyond `pending`. When false,
  // `buildMissionTimeline` returns [] → the honest empty state (Req 8.4).
  const startedAt = mission.startedAt
  const anyTaskProgressed = useMemo(
    () => tasks.some((t) => t.status !== 'pending'),
    [tasks],
  )
  const startedAnyRun = Boolean(startedAt) && anyTaskProgressed

  // Task status transitions: derive from each task's CURRENT status (statusHistory is
  // not projected by the read API — see the file header). Only non-`pending` tasks
  // contribute, anchored at the Mission's real start (T+0). No fabricated rows.
  const taskTransitions = useMemo<TaskTransitionRow[]>(() => {
    if (!startedAt) return []
    return tasks
      .filter((t) => t.status !== 'pending')
      .map((t) => ({
        taskKey: t.key,
        agentId: t.assignedAgent?.id ?? '',
        status: t.status,
        at: startedAt,
      }))
  }, [tasks, startedAt])

  // Recorded Handoffs/Mentions carry their own real `at` instants from the Mission doc.
  const handoffs = useMemo<Handoff[]>(
    () =>
      (mission.handoffs ?? []).map((h) => ({
        at: h.at,
        fromTaskKey: h.fromTaskKey,
        toTaskKey: h.toTaskKey,
        outputRef: { runId: h.runId ?? '', proposalIds: h.proposalIds ?? [] },
      })),
    [mission.handoffs],
  )
  const mentions = useMemo<Mention[]>(
    () =>
      (mission.mentions ?? []).map((m) => ({
        at: m.at,
        byTaskKey: m.byTaskKey,
        byAgentId: m.byAgentId,
        referencedTaskKey: m.referencedTaskKey,
        referencedAgentId: m.referencedAgentId,
        note: m.note,
      })),
    [mission.mentions],
  )

  const timeline = useMemo(
    () =>
      buildMissionTimeline({
        missionStartedAt: startedAt,
        taskTransitions,
        handoffs,
        mentions,
        agentNames,
        startedAnyRun,
      }),
    [startedAt, taskTransitions, handoffs, mentions, agentNames, startedAnyRun],
  )

  // ── Derive the Observability panel's props (Req 11) ──────────────────────────
  // `deriveObservability` runs the pure tally helpers. We have no per-run AgentRun
  // rows from the read API, so `runs` is empty: per-Agent contribution shows real
  // completed-task counts (from the task statuses) with honest 0-token attribution,
  // and the aggregate token/cost + budget bars come from the Mission's PERSISTED
  // `usage` (accumulated from real Run records by the executor) — see file header.
  const derived = useMemo(
    () =>
      deriveObservability({
        tasks: tasks.map((t) => ({ status: t.status, assignedAgentId: t.assignedAgent?.id ?? null })),
        runs: [],
        ceiling: { tokenCeiling: mission.limits.tokenCeiling, costCeiling: mission.limits.costCeiling },
        agentNames,
      }),
    [tasks, mission.limits.tokenCeiling, mission.limits.costCeiling, agentNames],
  )

  // Replace the (all-zero, run-derived) usage totals + budget bars with the Mission's
  // PERSISTED usage so the panel reflects real accumulated spend even without run rows.
  const observabilityUsage = mission.usage ?? { tokensUsed: 0, costUsed: 0 }
  const observabilityBudget = usageVsCeiling(observabilityUsage, {
    tokenCeiling: mission.limits.tokenCeiling,
    costCeiling: mission.limits.costCeiling,
  })

  return (
    <div className="space-y-4 2xl:space-y-5">
      <MissionHero mission={mission} taskCount={tasks.length} onRefetch={onRefetch} />

      <div className="grid gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_380px] 2xl:gap-5">
        {/* Main column — the chronological Mission_Timeline (Req 8.1–8.3) */}
        <section className="min-w-0">
          <TimelinePanel entries={timeline} startedAnyRun={startedAnyRun} lifecycle={mission.lifecycle} />
        </section>

        {/* Right rail — the composed Observability / Cost panel (Req 11) */}
        <aside className="min-w-0">
          <ObservabilityPanel
            lifecycleState={mission.lifecycle}
            taskCounts={derived.taskCounts}
            usage={observabilityUsage}
            contributions={derived.contributions}
            budget={observabilityBudget}
          />
        </aside>
      </div>
    </div>
  )
}

// ── Hero — objective + lifecycle + Kill_Switch (Req 8, 5.10) ───────────────────

const LIFECYCLE_META: Record<MissionState, { label: string; color: string; soft?: boolean }> = {
  planning: { label: 'Planning', color: 'var(--dash-muted)' },
  'awaiting-plan-approval': { label: 'Awaiting your approval', color: 'var(--dash-accent)', soft: true },
  running: { label: 'Running', color: '#34d399' },
  paused: { label: 'Paused', color: 'var(--dash-muted)' },
  completed: { label: 'Completed', color: '#34d399' },
  failed: { label: 'Failed', color: '#fb7185' },
  aborted: { label: 'Aborted', color: '#fb7185' },
}

function MissionHero({
  mission,
  taskCount,
  onRefetch,
}: {
  mission: MissionDoc
  taskCount: number
  onRefetch: () => void
}) {
  const spotlight = useSpotlight<HTMLElement>()
  const meta = LIFECYCLE_META[mission.lifecycle]

  return (
    <section
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      className="dash-panel dash-grain dash-spotlight dash-interactive dash-rise p-5 2xl:p-6"
      style={{ animationDelay: '0s' }}
    >
      <span className="dash-spotlight-glow" aria-hidden />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mono mb-2 text-[10px] uppercase tracking-widest text-[var(--dash-subtle)]">
            Mission · Timeline
          </p>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight">
            <span className="dash-metallic-text">{mission.objective}</span>
          </h1>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
          style={{
            color: meta.color,
            background: meta.soft ? 'var(--dash-accent-soft)' : 'var(--dash-soft)',
            border: `1px solid ${meta.soft ? 'var(--dash-border-glow)' : 'var(--dash-border)'}`,
          }}
        >
          {meta.label}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
        <MetaItem icon={GitBranch} label="Tasks" value={`${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`} />
        <MetaItem
          icon={Clock}
          label="Started"
          value={mission.startedAt ? formatWhen(mission.startedAt) : 'Not started'}
        />
        <Link
          href={`/app/missions/${mission._id}/plan`}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--dash-subtle)] underline-offset-2 transition-colors hover:text-[var(--dash-text)] hover:underline"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          View plan
        </Link>
      </div>

      {/* Kill_Switch — pause / resume / abort, re-fetching on change (Req 5.10) */}
      <div className="mt-4 border-t border-[var(--dash-border)] pt-4">
        <KillSwitch missionId={mission._id} lifecycle={mission.lifecycle} onChange={onRefetch} />
      </div>
    </section>
  )
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof GitBranch
  label: string
  value: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--dash-muted)]">
      <Icon className="h-3.5 w-3.5 text-[var(--dash-subtle)]" />
      <span className="text-[var(--dash-subtle)]">{label}:</span>
      <span className="font-medium text-[var(--dash-text)]">{value}</span>
    </span>
  )
}

// ── Timeline panel — chronological from T+0, honest empty state (Req 8) ────────

function TimelinePanel({
  entries,
  startedAnyRun,
  lifecycle,
}: {
  entries: TimelineEntry[]
  startedAnyRun: boolean
  lifecycle: MissionState
}) {
  return (
    <section className="dash-panel dash-grain dash-interactive dash-rise p-4 sm:p-5" style={{ animationDelay: '0.08s' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-soft)] text-[var(--dash-muted)]">
            <Activity className="h-3.5 w-3.5" />
          </span>
          <h2 className="dash-metallic-text text-sm font-semibold tracking-tight">Timeline</h2>
        </div>
        <span className="text-[11px] font-medium text-[var(--dash-subtle)] [font-variant-numeric:tabular-nums]">
          {entries.length} {entries.length === 1 ? 'event' : 'events'}
        </span>
      </div>

      {/* Honest empty state (Req 8.4): no Run has started → no fabricated activity. */}
      {!startedAnyRun || entries.length === 0 ? (
        <TimelineEmptyState lifecycle={lifecycle} />
      ) : (
        <ol className="mt-4 space-y-2.5">
          {entries.map((entry) => (
            <TimelineRow key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  )
}

// The honest "nothing has run yet" state — explains WHY there's no activity rather than
// inventing placeholder rows (Req 8.4, 8.5).
function TimelineEmptyState({ lifecycle }: { lifecycle: MissionState }) {
  const note =
    lifecycle === 'planning'
      ? 'This mission is still planning. Decompose and approve the plan to begin.'
      : lifecycle === 'awaiting-plan-approval'
        ? 'The plan is awaiting your approval. No agent has run yet.'
        : lifecycle === 'running'
          ? 'The mission is running. Activity will stream in here as the first task starts.'
          : 'No agent run has started, so there is nothing on the timeline yet.'
  return (
    <div
      className="mt-4 rounded-xl border border-dashed px-4 py-10 text-center"
      style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }}
    >
      <Clock className="mx-auto h-5 w-5" style={{ color: 'var(--dash-subtle)' }} />
      <p className="mt-2 text-[13px] font-medium text-[var(--dash-text)]">Nothing has run yet</p>
      <p className="mt-0.5 text-[11px] text-[var(--dash-subtle)]">{note}</p>
    </div>
  )
}

// One timeline entry, rendered as an inset well (--dash-card-solid + --dash-border).
// The leading glyph signals the source: task-status / handoff / mention.
function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const { Icon, tint } = sourceTreatment(entry)
  return (
    <li
      className="flex items-start gap-3 rounded-xl p-3.5"
      style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
    >
      <span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border"
        style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-soft)', color: tint }}
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[13px] font-medium leading-snug text-[var(--dash-text-strong)]">
            {entry.summary}
          </p>
          {entry.source === 'task-status' && entry.status && (
            <TaskStatusBadge status={entry.status} />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--dash-subtle)]">
          {entry.taskKey && (
            <span className="mono inline-flex items-center gap-1">
              <CircleDot className="h-2.5 w-2.5" />
              {entry.taskKey}
            </span>
          )}
          <span className="[font-variant-numeric:tabular-nums]">{formatWhen(entry.at)}</span>
        </div>
      </div>
    </li>
  )
}

// Per-source icon + tint. Warm --dash-accent is reserved for sign-off; timeline glyphs
// use neutral/semantic tones so they never compete with the Plan-Approval accent.
function sourceTreatment(entry: TimelineEntry): { Icon: typeof Activity; tint: string } {
  if (entry.source === 'handoff') return { Icon: ArrowRightLeft, tint: 'var(--dash-muted)' }
  if (entry.source === 'mention') return { Icon: AtSign, tint: 'var(--dash-muted)' }
  // task-status: tint by the status it carries.
  return { Icon: CircleDot, tint: STATUS_META[entry.status ?? 'pending'].color }
}

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'var(--dash-subtle)' },
  running: { label: 'Running', color: '#34d399' },
  completed: { label: 'Completed', color: '#34d399' },
  failed: { label: 'Failed', color: '#fb7185' },
  blocked: { label: 'Blocked', color: '#fbbf24' },
}

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: meta.color, background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
    >
      {meta.label}
    </span>
  )
}

// ── Loading / error / time helpers ─────────────────────────────────────────────

function LoadingView() {
  return (
    <div className="flex items-center justify-center py-24 text-[var(--dash-subtle)]">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="ml-2 text-[13px]">Loading mission…</span>
    </div>
  )
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="dash-panel dash-grain dash-interactive flex flex-col items-center gap-3 p-10 text-center">
      <AlertCircle className="h-6 w-6" style={{ color: '#fb7185' }} />
      <p className="text-[13px] font-medium text-[var(--dash-text)]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12px] font-medium transition hover:border-[var(--dash-border-glow)]"
        style={{ background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Retry
      </button>
    </div>
  )
}

/** Format an ISO instant for display. Honest about an unparseable/missing value. */
function formatWhen(at: string | null): string {
  if (!at) return '—'
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
