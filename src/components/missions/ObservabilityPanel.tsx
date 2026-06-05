'use client'

import type { CSSProperties } from 'react'
import type { MissionState } from '@/lib/agents/mission/lifecycle'
import {
  tallyAgentContributions,
  tallyTaskStatuses,
  tallyUsage,
  usageVsCeiling,
  type AgentContribution,
  type RunUsageRow,
  type TaskStatus,
  type TaskStatusCounts,
  type TaskTallyRow,
  type UsageVsCeiling,
} from '@/lib/agents/mission/timeline'
import { useSpotlight } from '@/lib/use-spotlight'
import { cn } from '@/lib/utils'

/**
 * Per-mission Observability / Cost panel (Req 11.1–11.6, 12.10).
 *
 * A PRESENTATIONAL glass panel: it fetches NOTHING. The mission detail page (Phase 5)
 * derives the metrics from the real `MissionTask` + `AgentRun` records — via the pure
 * tally helpers in `src/lib/agents/mission/timeline.ts` — and hands the already-computed
 * values in as props. (`deriveObservability` below is exported as a convenience for that
 * page; the component itself never calls it on raw rows.)
 *
 * Honest about zero (Req 11.5, 11.6): every number rendered is exactly what the tally
 * helpers produced. A mission with no usage shows real `0`s and an empty contribution
 * list — never a fabricated value. An unlimited Mission_Budget ceiling (`ratio === null`
 * / `+Infinity` remaining) renders an "Unlimited" pill instead of a bogus progress bar.
 *
 * Glass recipe (glass-theme.md): the panel root is a feature card carrying the full
 * texture stack `dash-panel dash-grain dash-spotlight dash-interactive` with a
 * `.dash-spotlight-glow` first child + `useSpotlight()` so the border/glow track the
 * cursor. The warm `--dash-accent` stays RESERVED for the sign-off moment — here that's
 * the `awaiting-plan-approval` lifecycle badge only; usage bars use neutral/semantic
 * tones so they never compete with the Plan-Approval accent.
 */
export interface ObservabilityPanelProps {
  /** The Mission's current lifecycle state (Req 11.1). */
  lifecycleState: MissionState
  /** Per-status Mission_Task counts — from `tallyTaskStatuses` (Req 11.1). */
  taskCounts: TaskStatusCounts
  /** Accumulated tokens/cost summed from real Run records — from `tallyUsage` (Req 11.2). */
  usage: { tokensUsed: number; costUsed: number }
  /** Per-Agent contribution rows — from `tallyAgentContributions` (Req 11.3). */
  contributions: AgentContribution[]
  /** Accumulated usage measured against the Mission_Budget ceiling — from `usageVsCeiling` (Req 11.4). */
  budget: UsageVsCeiling
  /** Extra classes for the panel root (layout/grid placement by the caller). */
  className?: string
}

// ── Derive helper (for the detail page; the component takes the derived values) ────

/** The already-fetched, user-scoped rows the detail page hands the derive helper. */
export interface ObservabilityRows {
  /** Mission_Task rows (status + assigned agent) for the status + contribution tallies. */
  tasks: ReadonlyArray<TaskTallyRow>
  /** Real AgentRun rows (agent + tokens + cost) for the usage + contribution tallies. */
  runs: ReadonlyArray<RunUsageRow>
  /** Mission_Budget ceiling (`0`/unset = unlimited, same convention as `budget.ts`). */
  ceiling: { tokenCeiling: number; costCeiling: number }
  /** Optional `agentId → display name` map for contribution labels. */
  agentNames?: Map<string, string> | Record<string, string>
}

/** What the derive helper returns — the exact props the panel consumes. */
export interface DerivedObservability {
  taskCounts: TaskStatusCounts
  usage: { tokensUsed: number; costUsed: number }
  contributions: AgentContribution[]
  budget: UsageVsCeiling
}

/**
 * Derive the panel's metrics from already-fetched raw rows using the pure tally
 * helpers (Req 11.1–11.6). A thin convenience for the detail page so the wiring lives
 * in one place; honest about zero because the helpers are. The panel itself accepts the
 * derived values directly — it never fetches or derives on its own.
 */
export function deriveObservability(rows: ObservabilityRows): DerivedObservability {
  const usage = tallyUsage(rows.runs)
  return {
    taskCounts: tallyTaskStatuses(rows.tasks),
    usage,
    contributions: tallyAgentContributions({
      tasks: rows.tasks,
      runs: rows.runs,
      agentNames: rows.agentNames,
    }),
    budget: usageVsCeiling(usage, rows.ceiling),
  }
}

// ── Static label / tone maps ───────────────────────────────────────────────────────

const LIFECYCLE_LABEL: Record<MissionState, string> = {
  planning: 'Planning',
  'awaiting-plan-approval': 'Awaiting plan approval',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  aborted: 'Aborted',
}

// Lifecycle dot treatment. Warm `--dash-accent` is reserved for the sign-off moment,
// so only `awaiting-plan-approval` binds it; every other state is neutral/semantic.
const LIFECYCLE_DOT: Record<MissionState, string> = {
  planning: 'bg-[var(--dash-subtle)]',
  'awaiting-plan-approval': 'bg-[var(--dash-accent)]',
  running: 'bg-emerald-400 dash-live-dot',
  paused: 'bg-[var(--dash-subtle)]',
  completed: 'bg-emerald-400',
  failed: 'bg-rose-500',
  aborted: 'bg-rose-500',
}

// Per-status tiles, in pipeline order. The count value tone signals the status; a
// zero count still renders (honest zero, Req 11.5).
const STATUS_TILES: ReadonlyArray<{ key: TaskStatus; label: string; tone: string }> = [
  { key: 'pending', label: 'Pending', tone: 'text-[var(--dash-text-strong)]' },
  { key: 'running', label: 'Running', tone: 'text-emerald-500 dark:text-emerald-400' },
  { key: 'completed', label: 'Completed', tone: 'text-emerald-500 dark:text-emerald-400' },
  { key: 'failed', label: 'Failed', tone: 'text-rose-500' },
  { key: 'blocked', label: 'Blocked', tone: 'text-amber-500 dark:text-amber-400' },
]

// Inset-well surface, used for every tile / row / bar track (glass-theme.md rule 4).
const WELL_STYLE: CSSProperties = {
  background: 'var(--dash-card-solid)',
  border: '1px solid var(--dash-border)',
}

// ── Pure formatting helpers (honest about zero) ─────────────────────────────────────

/** A finite, non-negative integer-ish token count; anything else ⇒ 0 (honest zero). */
function formatTokens(n: number): string {
  const v = Number.isFinite(n) && n > 0 ? n : 0
  return v.toLocaleString()
}

/**
 * Format an accumulated cost honestly. Zero reads as `$0.00`; sub-cent values keep more
 * precision so a real-but-tiny spend is never rounded away to a fabricated `$0.00`.
 */
function formatCost(n: number): string {
  const v = Number.isFinite(n) && n > 0 ? n : 0
  if (v === 0) return '$0.00'
  if (v < 0.01) return `$${v.toFixed(4)}`
  return `$${v.toFixed(2)}`
}

export function ObservabilityPanel({
  lifecycleState,
  taskCounts,
  usage,
  contributions,
  budget,
  className,
}: ObservabilityPanelProps) {
  const spotlight = useSpotlight<HTMLElement>()

  const lifecycleLabel = LIFECYCLE_LABEL[lifecycleState] ?? lifecycleState
  const totalTasks = STATUS_TILES.reduce((sum, t) => sum + (taskCounts[t.key] ?? 0), 0)

  return (
    <section
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      className={cn(
        'dash-panel dash-grain dash-spotlight dash-interactive group flex flex-col gap-5 p-5',
        className
      )}
      aria-label="Mission observability and cost"
    >
      <span className="dash-spotlight-glow" aria-hidden />

      {/* Header: title + lifecycle state badge (Req 11.1). */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="dash-metallic-text text-[15px] font-semibold leading-tight">
            Observability &amp; Cost
          </h2>
          <p className="mt-0.5 text-[11px] font-medium text-[var(--dash-subtle)]">
            {totalTasks === 0
              ? 'No tasks yet'
              : `${totalTasks} ${totalTasks === 1 ? 'task' : 'tasks'} in the graph`}
          </p>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--dash-muted)]"
          style={WELL_STYLE}
          data-lifecycle={lifecycleState}
        >
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', LIFECYCLE_DOT[lifecycleState])}
            aria-hidden
          />
          {lifecycleLabel}
        </span>
      </div>

      {/* Per-status task counts (Req 11.1). Every status tile renders, zero included. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STATUS_TILES.map(({ key, label, tone }) => (
          <div
            key={key}
            className="flex flex-col gap-1 rounded-xl px-3 py-2.5"
            style={WELL_STYLE}
            data-status={key}
          >
            <span
              className={cn(
                'text-xl font-semibold leading-none tracking-tight [font-variant-numeric:tabular-nums]',
                tone
              )}
            >
              {taskCounts[key] ?? 0}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--dash-subtle)]">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Accumulated tokens + cost from real Run records (Req 11.2). */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 rounded-xl px-3.5 py-3" style={WELL_STYLE}>
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--dash-subtle)]">
            Tokens used
          </span>
          <span className="text-2xl font-semibold leading-none tracking-tight text-[var(--dash-text-strong)] [font-variant-numeric:tabular-nums]">
            {formatTokens(usage?.tokensUsed)}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl px-3.5 py-3" style={WELL_STYLE}>
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--dash-subtle)]">
            Cost
          </span>
          <span className="text-2xl font-semibold leading-none tracking-tight text-[var(--dash-text-strong)] [font-variant-numeric:tabular-nums]">
            {formatCost(usage?.costUsed)}
          </span>
        </div>
      </div>

      {/* Usage vs Mission_Budget ceiling (Req 11.4). Unlimited ⇒ pill, not a bogus bar. */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--dash-muted)]">
          Budget
        </h3>
        <UsageBar
          label="Tokens"
          used={budget?.tokensUsed ?? 0}
          ceiling={budget?.tokenCeiling ?? 0}
          remaining={budget?.tokenRemaining ?? Number.POSITIVE_INFINITY}
          ratio={budget?.tokenRatio ?? null}
          format={formatTokens}
        />
        <UsageBar
          label="Cost"
          used={budget?.costUsed ?? 0}
          ceiling={budget?.costCeiling ?? 0}
          remaining={budget?.costRemaining ?? Number.POSITIVE_INFINITY}
          ratio={budget?.costRatio ?? null}
          format={formatCost}
        />
      </div>

      {/* Per-Agent contribution rows (Req 11.3). Honest empty state when none. */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--dash-muted)]">
          Per-agent contribution
        </h3>
        {contributions.length === 0 ? (
          <p
            className="rounded-xl px-3.5 py-3 text-[12px] text-[var(--dash-subtle)]"
            style={WELL_STYLE}
          >
            No agent activity yet
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {contributions.map((c) => (
              <li
                key={c.agentId}
                className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5"
                style={WELL_STYLE}
              >
                <span className="min-w-0 truncate text-[13px] font-medium text-[var(--dash-text)]">
                  {c.agentName?.trim() ? c.agentName : c.agentId}
                </span>
                <div className="flex shrink-0 items-center gap-4 text-[11px] [font-variant-numeric:tabular-nums]">
                  <span className="flex flex-col items-end leading-tight">
                    <span className="font-semibold text-[var(--dash-text-strong)]">
                      {c.tasksCompleted}
                    </span>
                    <span className="text-[9px] uppercase tracking-wide text-[var(--dash-subtle)]">
                      done
                    </span>
                  </span>
                  <span className="flex flex-col items-end leading-tight">
                    <span className="font-semibold text-[var(--dash-text-strong)]">
                      {formatTokens(c.tokensUsed)}
                    </span>
                    <span className="text-[9px] uppercase tracking-wide text-[var(--dash-subtle)]">
                      tokens
                    </span>
                  </span>
                  <span className="flex flex-col items-end leading-tight">
                    <span className="font-semibold text-[var(--dash-text-strong)]">
                      {formatCost(c.costUsed)}
                    </span>
                    <span className="text-[9px] uppercase tracking-wide text-[var(--dash-subtle)]">
                      cost
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * One usage-vs-ceiling row (Req 11.4). When the ceiling is unlimited (`ratio === null`,
 * which pairs with `+Infinity` remaining) it renders an "Unlimited" pill instead of a
 * bogus progress bar. Otherwise it draws an inset-well track with a fill clamped to
 * `[0, 100]%`; the fill shifts to a warning tone as usage nears/exceeds the ceiling so
 * the warm Plan-Approval accent is never borrowed for routine metering.
 */
function UsageBar({
  label,
  used,
  ceiling,
  remaining,
  ratio,
  format,
}: {
  label: string
  used: number
  ceiling: number
  remaining: number
  ratio: number | null
  format: (n: number) => string
}) {
  const unlimited = ratio === null
  const pct = unlimited ? 0 : Math.min(100, Math.max(0, ratio * 100))
  const reached = !unlimited && ratio >= 1
  const near = !unlimited && ratio >= 0.9 && ratio < 1

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="font-medium text-[var(--dash-muted)]">{label}</span>
        {unlimited ? (
          <span className="inline-flex items-center gap-1.5 text-[var(--dash-subtle)] [font-variant-numeric:tabular-nums]">
            <span>{format(used)}</span>
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={WELL_STYLE}
            >
              Unlimited
            </span>
          </span>
        ) : (
          <span className="text-[var(--dash-subtle)] [font-variant-numeric:tabular-nums]">
            {format(used)} / {format(ceiling)} ({Math.round(pct)}%)
          </span>
        )}
      </div>

      {unlimited ? null : (
        <>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={WELL_STYLE}
            role="progressbar"
            aria-label={`${label} budget usage`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500',
                reached ? 'bg-rose-500' : near ? 'bg-amber-500' : 'bg-emerald-500'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-[var(--dash-subtle)] [font-variant-numeric:tabular-nums]">
            {Number.isFinite(remaining)
              ? `${format(remaining)} remaining`
              : 'No ceiling set'}
          </span>
        </>
      )}
    </div>
  )
}
