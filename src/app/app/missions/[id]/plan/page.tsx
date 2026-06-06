'use client'

// ── Plan Review — the mandatory Plan_Approval checkpoint (Req 3.2, 3.3, 12.10) ──
// This is the ONE deliberate "stop and get the user's consent" gate the mission layer
// adds on top of agents-run-freely: an autonomous plan never executes until the user
// reviews the decomposed Task_Graph and grants an explicit Plan_Approval. The page is
// READ-then-SIGN-OFF: it GETs `/api/missions/[id]/plan` and renders every Mission_Task
// (description, assigned Agent, dependsOn, status) with a clear view of the dependency
// relationships, then offers Approve / Edit / Reject wired to POST.
//
// The route — not this page — owns every state move: approval only flips the lifecycle
// FSM to `running` (it starts NO Run); the executor tick advances a running mission.
// We just reflect the real lifecycle the API reports back.
//
// Glass recipe is mandatory (Req 12.10, `.kiro/steering/glass-theme.md`):
//   • shell  = `sb-dashboard` (paints the aurora + grid backdrop)
//   • panels = `dash-panel dash-grain dash-interactive`; the hero adds `dash-spotlight`
//              + a `dash-spotlight-glow` child + `useSpotlight`
//   • headings = `.dash-metallic-text`; the primary **Approve Plan** button uses
//     `.dash-accent-grad` and reads with the reserved WARM accent — the sign-off moment.
//     Reject is a secondary/destructive affordance (rose, never the warm accent).
//   • tokens = `--dash-*` only; inset task rows = `--dash-card-solid` + `--dash-border`.

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  CircleDot,
  Clock,
  GitBranch,
  Loader2,
  Pencil,
  Play,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useSpotlight } from '@/lib/use-spotlight'
import { cn } from '@/lib/utils'

// ── Payload types (mirror `/api/missions/[id]/plan` GET) ──────────────────────

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked'

type MissionLifecycle =
  | 'planning'
  | 'awaiting-plan-approval'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'aborted'

interface PlanTask {
  key: string
  description: string
  dependsOn: string[]
  status: TaskStatus
  assignmentFallback: boolean
  assignedAgent: { id: string; name: string | null; role: string | null } | null
}

interface MissionPlan {
  missionId: string
  objective: string
  lifecycle: MissionLifecycle
  leadAgentId: string | null
  approvedAt: string | null
  startedAt: string | null
  tasks: PlanTask[]
}

type LoadState = 'loading' | 'error' | 'ready'
type PlanAction = 'approve' | 'edit' | 'reject' | 'decompose'

/** A failed `edit` (422): the validator's reason + the limit value it tripped. */
interface EditRejection {
  reason: 'cycle' | 'graph-limit-depth' | 'graph-limit-count' | string
  depth?: number
  taskCount?: number
  message?: string
}

/** Editable working copy of a task while the user is editing the plan (dependsOn is a
 *  comma-separated string for a lightweight text affordance; assignment is preserved). */
interface EditableTask {
  key: string
  description: string
  dependsOn: string
  assignedAgentId: string | null
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlanReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [state, setState] = useState<LoadState>('loading')
  const [plan, setPlan] = useState<MissionPlan | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/missions/${id}/plan`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error || 'Could not load this mission plan.')
        setState('error')
        return
      }
      setPlan(body.plan as MissionPlan)
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
      <div className="mx-auto max-w-[1100px] p-4 sm:p-5 lg:p-6">
        <BackLink />
        {state === 'loading' && <LoadingView />}
        {state === 'error' && <ErrorView message={error} onRetry={load} />}
        {state === 'ready' && plan && <PlanView plan={plan} onRefetch={load} />}
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

// ── Ready view ─────────────────────────────────────────────────────────────────

function PlanView({ plan, onRefetch }: { plan: MissionPlan; onRefetch: () => void }) {
  const spotlight = useSpotlight<HTMLElement>()

  // The action currently in flight (disables all action buttons + shows a spinner).
  const [acting, setActing] = useState<PlanAction | null>(null)
  const [actionError, setActionError] = useState('')

  // Edit mode: a local working copy of the tasks + the last edit rejection (422 reason).
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<EditableTask[]>([])
  const [editRejection, setEditRejection] = useState<EditRejection | null>(null)

  const canReview = plan.lifecycle === 'awaiting-plan-approval'
  const canDecompose = plan.lifecycle === 'planning'

  // Resolve the Lead_Agent's display name from whichever task it is assigned to (the
  // GET returns leadAgentId only; names ride on the per-task assignedAgent). Honest
  // fallback to a short id when the lead is assigned to no task.
  const leadName = useMemo(() => {
    if (!plan.leadAgentId) return null
    const match = plan.tasks.find((t) => t.assignedAgent?.id === plan.leadAgentId)
    return match?.assignedAgent?.name ?? null
  }, [plan.leadAgentId, plan.tasks])

  const enterEdit = useCallback(() => {
    setDraft(
      plan.tasks.map((t) => ({
        key: t.key,
        description: t.description,
        dependsOn: t.dependsOn.join(', '),
        assignedAgentId: t.assignedAgent?.id ?? null,
      })),
    )
    setEditRejection(null)
    setActionError('')
    setEditing(true)
  }, [plan.tasks])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setDraft([])
    setEditRejection(null)
  }, [])

  async function runAction(action: PlanAction, tasks?: unknown) {
    setActing(action)
    setActionError('')
    if (action !== 'edit') setEditRejection(null)
    try {
      const res = await fetch(`/api/missions/${plan.missionId}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tasks !== undefined ? { action, tasks } : { action }),
      })
      const body = await res.json().catch(() => ({}))

      // A rejected edit (cyclic / over-limit) comes back 422 with a `reason`. Surface it
      // inline and keep the user in edit mode so they can fix the dependency they tripped.
      if (action === 'edit' && res.status === 422) {
        setEditRejection({
          reason: body?.reason ?? 'invalid',
          depth: typeof body?.depth === 'number' ? body.depth : undefined,
          taskCount: typeof body?.taskCount === 'number' ? body.taskCount : undefined,
          message: body?.error,
        })
        return
      }

      if (!res.ok) {
        setActionError(body?.error || 'That action could not be completed.')
        return
      }

      // Success: a valid edit leaves edit mode; every action re-syncs from the server so
      // the lifecycle banner + task statuses reflect the real persisted state.
      if (action === 'edit') {
        setEditing(false)
        setDraft([])
        setEditRejection(null)
      }
      onRefetch()
    } catch {
      setActionError('Network error. Please try again.')
    } finally {
      setActing(null)
    }
  }

  function saveEdit() {
    const tasks = draft.map((t) => ({
      key: t.key,
      description: t.description,
      dependsOn: t.dependsOn
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d.length > 0),
      // Preserve the original assignment; the route honors a still-owned Agent, else it
      // falls the task back to the Lead_Agent (Req 2.4) — both are correct here.
      ...(t.assignedAgentId ? { assignedAgentId: t.assignedAgentId } : {}),
    }))
    runAction('edit', tasks)
  }

  return (
    <div className="space-y-4">
      {/* Hero / summary — the sign-off context (objective · lifecycle · lead · size) */}
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
              Mission · Plan review
            </p>
            <h1 className="text-2xl font-semibold leading-tight tracking-tight">
              <span className="dash-metallic-text">{plan.objective}</span>
            </h1>
          </div>
          <LifecycleBadge lifecycle={plan.lifecycle} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
          <MetaItem
            icon={ShieldCheck}
            label="Lead agent"
            value={leadName ?? (plan.leadAgentId ? 'Assigned' : 'None')}
          />
          <MetaItem
            icon={GitBranch}
            label="Tasks"
            value={`${plan.tasks.length} ${plan.tasks.length === 1 ? 'task' : 'tasks'}`}
          />
          {plan.approvedAt && (
            <MetaItem icon={Check} label="Approved" value={formatWhen(plan.approvedAt)} />
          )}
        </div>

        <LifecycleNote lifecycle={plan.lifecycle} />
      </section>

      {actionError && (
        <p
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
          style={{ color: '#fb7185', background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {actionError}
        </p>
      )}

      {/* Task_Graph — every Mission_Task, its assignment, deps, and status (Req 3.2) */}
      <TaskGraphPanel
        tasks={plan.tasks}
        lifecycle={plan.lifecycle}
        editing={editing}
        draft={draft}
        onDraftChange={setDraft}
        editRejection={editRejection}
      />

      {/* Decision bar — Approve / Edit / Reject (Req 3.3) or planning's Decompose */}
      <ActionBar
        lifecycle={plan.lifecycle}
        canReview={canReview}
        canDecompose={canDecompose}
        editing={editing}
        acting={acting}
        hasTasks={plan.tasks.length > 0}
        onApprove={() => runAction('approve')}
        onReject={() => runAction('reject')}
        onDecompose={() => runAction('decompose')}
        onEnterEdit={enterEdit}
        onCancelEdit={cancelEdit}
        onSaveEdit={saveEdit}
      />
    </div>
  )
}

// ── Task_Graph panel ────────────────────────────────────────────────────────────

function TaskGraphPanel({
  tasks,
  lifecycle,
  editing,
  draft,
  onDraftChange,
  editRejection,
}: {
  tasks: PlanTask[]
  lifecycle: MissionLifecycle
  editing: boolean
  draft: EditableTask[]
  onDraftChange: (next: EditableTask[]) => void
  editRejection: EditRejection | null
}) {
  // key → description, so a dependsOn chip can name what it waits on (Req 3.2 clarity).
  const descByKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tasks) m.set(t.key, t.description)
    return m
  }, [tasks])

  return (
    <section className="dash-panel dash-grain dash-interactive dash-rise p-4 sm:p-5" style={{ animationDelay: '0.08s' }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-soft)] text-[var(--dash-muted)]">
            <GitBranch className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-[var(--dash-text-strong)]">
            {editing ? 'Edit the plan' : 'Task graph'}
          </h2>
        </div>
        <span className="text-[11px] font-medium text-[var(--dash-subtle)] [font-variant-numeric:tabular-nums]">
          {(editing ? draft.length : tasks.length)} {(editing ? draft.length : tasks.length) === 1 ? 'task' : 'tasks'}
        </span>
      </div>

      {editing && (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--dash-muted)]">
          Edit descriptions and dependencies, then save. Dependencies are task keys
          separated by commas. The plan is re-checked for cycles and size limits before
          it can be approved.
        </p>
      )}

      {/* The 422 reason from a rejected edit — shown inline, right above the rows. */}
      {editRejection && <EditRejectionNote rejection={editRejection} />}

      {/* Empty state — honest, never fabricated (notably while still `planning`). */}
      {!editing && tasks.length === 0 ? (
        <div
          className="mt-4 rounded-xl border border-dashed px-4 py-10 text-center"
          style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }}
        >
          <Sparkles className="mx-auto h-5 w-5" style={{ color: 'var(--dash-subtle)' }} />
          <p className="mt-2 text-[13px] font-medium text-[var(--dash-text)]">No tasks yet</p>
          <p className="mt-0.5 text-[11px] text-[var(--dash-subtle)]">
            {lifecycle === 'planning'
              ? 'Decompose the objective to generate the task graph.'
              : 'This plan has no tasks to review.'}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {editing
            ? draft.map((t, i) => (
                <EditableTaskRow
                  key={t.key}
                  task={t}
                  onChange={(next) => onDraftChange(draft.map((d, j) => (j === i ? next : d)))}
                  onRemove={() => onDraftChange(draft.filter((_, j) => j !== i))}
                />
              ))
            : tasks.map((t) => <TaskRow key={t.key} task={t} descByKey={descByKey} />)}
        </ul>
      )}
    </section>
  )
}

// One read-only task row: key, description, assigned agent, dependsOn, status.
function TaskRow({ task, descByKey }: { task: PlanTask; descByKey: Map<string, string> }) {
  return (
    <li
      className="rounded-xl p-3.5"
      style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mono mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--dash-muted)', background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
          >
            {task.key}
          </span>
          <p className="min-w-0 text-[13px] font-medium leading-snug text-[var(--dash-text-strong)]">
            {task.description || <span className="text-[var(--dash-subtle)]">Untitled task</span>}
          </p>
        </div>
        <TaskStatusBadge status={task.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Assigned agent (name + role) */}
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--dash-muted)]">
          <span
            className="grid h-5 w-5 place-items-center rounded-md border text-[var(--dash-subtle)]"
            style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-soft)' }}
          >
            <CircleDot className="h-3 w-3" />
          </span>
          {task.assignedAgent?.name ?? 'Unassigned'}
          {task.assignedAgent?.role && (
            <span className="text-[var(--dash-subtle)]">· {task.assignedAgent.role}</span>
          )}
          {task.assignmentFallback && (
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
              style={{ color: 'var(--dash-subtle)', background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
              title="No squad agent fit by role — assigned to the lead agent as a fallback."
            >
              Lead fallback
            </span>
          )}
        </span>

        {/* Dependencies — the dependency relationship, annotated by key + description */}
        <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--dash-subtle)]">
          <span className="inline-flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {task.dependsOn.length === 0 ? 'No dependencies (root task)' : 'Depends on'}
          </span>
          {task.dependsOn.map((dep) => (
            <span
              key={dep}
              className="mono rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ color: 'var(--dash-muted)', background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
              title={descByKey.get(dep) ?? 'Unknown task'}
            >
              {dep}
            </span>
          ))}
        </span>
      </div>
    </li>
  )
}

// One editable task row (lightweight): description + dependsOn text inputs + remove.
function EditableTaskRow({
  task,
  onChange,
  onRemove,
}: {
  task: EditableTask
  onChange: (next: EditableTask) => void
  onRemove: () => void
}) {
  return (
    <li
      className="rounded-xl p-3.5"
      style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="mono rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--dash-muted)', background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
        >
          {task.key}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--dash-subtle)] transition-colors hover:text-[#fb7185]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>

      <label className="mt-2.5 block">
        <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--dash-subtle)]">
          Description
        </span>
        <textarea
          value={task.description}
          onChange={(e) => onChange({ ...task, description: e.target.value })}
          rows={2}
          className="w-full resize-none rounded-lg px-3 py-2 text-[12px] leading-relaxed text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-subtle)] focus:border-[var(--dash-border-glow)] focus:shadow-[0_0_0_3px_var(--dash-accent-soft)]"
          style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
        />
      </label>

      <label className="mt-2 block">
        <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--dash-subtle)]">
          Depends on (task keys, comma-separated)
        </span>
        <input
          type="text"
          value={task.dependsOn}
          onChange={(e) => onChange({ ...task, dependsOn: e.target.value })}
          placeholder="e.g. t1, t2"
          className="mono w-full rounded-lg px-3 py-2 text-[12px] text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-subtle)] focus:border-[var(--dash-border-glow)] focus:shadow-[0_0_0_3px_var(--dash-accent-soft)]"
          style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
        />
      </label>
    </li>
  )
}

function EditRejectionNote({ rejection }: { rejection: EditRejection }) {
  const text =
    rejection.reason === 'cycle'
      ? 'The edited plan has a circular dependency. Remove the cycle so tasks can run in order.'
      : rejection.reason === 'graph-limit-depth'
        ? `The edited plan is too deep${rejection.depth ? ` (depth ${rejection.depth})` : ''}. Shorten the longest dependency chain.`
        : rejection.reason === 'graph-limit-count'
          ? `The edited plan has too many tasks${rejection.taskCount ? ` (${rejection.taskCount})` : ''}. Remove some tasks.`
          : rejection.message || 'The edited plan is invalid.'
  return (
    <p
      className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] leading-relaxed"
      style={{ color: '#fb7185', background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {text}
    </p>
  )
}

// ── Decision bar ────────────────────────────────────────────────────────────────

function ActionBar({
  canReview,
  canDecompose,
  editing,
  acting,
  hasTasks,
  onApprove,
  onReject,
  onDecompose,
  onEnterEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  lifecycle: MissionLifecycle
  canReview: boolean
  canDecompose: boolean
  editing: boolean
  acting: PlanAction | null
  hasTasks: boolean
  onApprove: () => void
  onReject: () => void
  onDecompose: () => void
  onEnterEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
}) {
  const busy = acting !== null

  // Planning: the only meaningful action is to generate the plan (decompose).
  if (canDecompose) {
    return (
      <section className="dash-panel dash-grain dash-interactive dash-rise p-4" style={{ animationDelay: '0.16s' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-[var(--dash-muted)]">
            This mission is still planning. Decompose the objective into a task graph to review.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onDecompose}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-semibold transition',
              busy ? 'opacity-60' : 'hover:-translate-y-0.5',
            )}
            style={{ background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border-glow)', color: 'var(--dash-accent)' }}
          >
            {acting === 'decompose' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Decompose objective
          </button>
        </div>
      </section>
    )
  }

  // Awaiting plan approval: the sign-off moment — Approve / Edit / Reject (Req 3.3).
  if (canReview) {
    return (
      <section className="dash-panel dash-grain dash-interactive dash-rise p-4" style={{ animationDelay: '0.16s' }}>
        {editing ? (
          // Edit mode: Save / Cancel.
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={onCancelEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition hover:border-[var(--dash-border-glow)] disabled:opacity-60"
              style={{ background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border)', color: 'var(--dash-muted)' }}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onSaveEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition hover:border-[var(--dash-border-glow)] disabled:opacity-60"
              style={{ background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border-glow)', color: 'var(--dash-text)' }}
            >
              {acting === 'edit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save changes
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Reject — secondary / destructive (rose, never the reserved warm accent) */}
            <button
              type="button"
              disabled={busy}
              onClick={onReject}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition disabled:opacity-60"
              style={{ background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border)', color: '#fb7185' }}
            >
              {acting === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
              Reject plan
            </button>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={busy || !hasTasks}
                onClick={onEnterEdit}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition hover:border-[var(--dash-border-glow)] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border)', color: 'var(--dash-muted)' }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit plan
              </button>

              {/* Approve — the sign-off. Warm accent gradient, reserved for this moment. */}
              <button
                type="button"
                disabled={busy || !hasTasks}
                onClick={onApprove}
                className={cn(
                  'dash-accent-grad inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition',
                  busy || !hasTasks ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5',
                )}
              >
                {acting === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Approve plan
              </button>
            </div>
          </div>
        )}
      </section>
    )
  }

  // Any other lifecycle (running / paused / terminal): no review actions — the
  // LifecycleNote in the hero already explains the current state.
  return null
}

// ── Lifecycle reflection ─────────────────────────────────────────────────────────

const LIFECYCLE_META: Record<
  MissionLifecycle,
  { label: string; color: string; soft?: boolean }
> = {
  planning: { label: 'Planning', color: 'var(--dash-muted)' },
  'awaiting-plan-approval': { label: 'Awaiting your approval', color: 'var(--dash-accent)', soft: true },
  running: { label: 'Running', color: '#34d399' },
  paused: { label: 'Paused', color: 'var(--dash-muted)' },
  completed: { label: 'Completed', color: '#34d399' },
  failed: { label: 'Failed', color: '#fb7185' },
  aborted: { label: 'Aborted', color: '#fb7185' },
}

function LifecycleBadge({ lifecycle }: { lifecycle: MissionLifecycle }) {
  const meta = LIFECYCLE_META[lifecycle]
  return (
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
  )
}

// A short, honest sentence reflecting what the current lifecycle means for the user.
function LifecycleNote({ lifecycle }: { lifecycle: MissionLifecycle }) {
  if (lifecycle === 'awaiting-plan-approval' || lifecycle === 'planning') return null

  const note =
    lifecycle === 'running'
      ? { icon: Play, text: 'This plan is approved and executing. Watch progress on the mission timeline.' }
      : lifecycle === 'paused'
        ? { icon: Clock, text: 'This mission is paused. No new task runs will start until it resumes.' }
        : lifecycle === 'completed'
          ? { icon: CheckCircle2, text: 'This mission has completed. Its deliverables await your sign-off in the Aegis Queue.' }
          : lifecycle === 'failed'
            ? { icon: AlertCircle, text: 'This mission failed during planning. No task runs were started.' }
            : { icon: Ban, text: 'This mission was rejected or aborted. No task runs were started.' }

  const Icon = note.icon
  return (
    <div
      className="mt-4 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
      style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color: LIFECYCLE_META[lifecycle].color }} />
      <p className="text-[12px] text-[var(--dash-muted)]">{note.text}</p>
    </div>
  )
}

// ── Task status badge ────────────────────────────────────────────────────────────

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'var(--dash-subtle)' },
  running: { label: 'Running', color: '#34d399' },
  completed: { label: 'Completed', color: '#34d399' },
  failed: { label: 'Failed', color: '#fb7185' },
  blocked: { label: 'Blocked', color: '#fb7185' },
}

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: meta.color, background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
    >
      {status === 'running' && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-1.5 w-1.5 rounded-full opacity-60 dash-live-dot" style={{ background: '#34d399' }} />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: '#34d399' }} />
        </span>
      )}
      {meta.label}
    </span>
  )
}

// ── Shared bits ──────────────────────────────────────────────────────────────────

function MetaItem({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-[var(--dash-subtle)]" />
      <span className="text-[var(--dash-subtle)]">{label}</span>
      <span className="font-medium text-[var(--dash-text)]">{value}</span>
    </span>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ── Loading / error views ──────────────────────────────────────────────────────

function LoadingView() {
  return (
    <div className="space-y-4">
      <div className="dash-panel dash-grain p-5">
        <span className="mb-3 block h-3 w-32 animate-pulse rounded bg-[var(--dash-soft)]" />
        <span className="block h-7 w-2/3 animate-pulse rounded bg-[var(--dash-soft)]" />
        <span className="mt-4 block h-3 w-1/2 animate-pulse rounded bg-[var(--dash-soft)]" />
      </div>
      <div className="dash-panel dash-grain p-5">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--dash-soft)]" />
          ))}
        </div>
      </div>
    </div>
  )
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="dash-panel dash-grain dash-interactive p-8 text-center">
      <AlertCircle className="mx-auto h-6 w-6" style={{ color: '#fb7185' }} />
      <p className="mt-3 text-[14px] font-medium text-[var(--dash-text-strong)]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition hover:border-[var(--dash-border-glow)]"
        style={{ background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
      >
        Try again
      </button>
    </div>
  )
}
