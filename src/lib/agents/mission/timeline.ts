// ── Mission Timeline builder + observability tally helpers (PURE) ────────────────
// The Mission analogue of `src/lib/agents/dashboard-feed.ts`: pure, total, I/O-free
// builders the Mission Console / observability data API (Phase 5) use to shape the
// parts of a Mission surface that are NOT plain scalars.
//
//   • `buildMissionTimeline(input)` — merges the REAL Mission_Task status transitions
//     + recorded Handoffs + recorded Mentions into ONE chronological list ordered
//     oldest→newest from the Mission's start at T+0 (Req 8.1–8.3, 8.6). When the
//     Mission has started no Run it returns `[]` — the honest empty state (Req 8.4),
//     and it NEVER fabricates an entry: every entry projects a supplied real record
//     (Req 8.5).
//   • the small `tally*` / `usageVsCeiling` helpers — the per-mission observability
//     metrics (Req 11): per-status task counts (11.1), accumulated tokens/cost summed
//     from real Run records with no loss/double-count (11.2), per-Agent contribution
//     (tasks completed + tokens consumed, 11.3), and accumulated usage-vs-ceiling
//     (11.4). All are honest about zero (11.5, 11.6): an absence of records yields an
//     all-zero state, never a fabricated non-zero value.
//
// Every function here is I/O-free (no DB, no clock, no model imports). Callers fetch
// the already-scoped rows and hand PLAIN objects/fixtures in, so the property tests
// (tasks 1.18 / 1.19) drive them directly. This mirrors the discipline of
// `dashboard-feed.ts` / `dashboard-tally.ts` exactly.

// ── Cross-task type sourcing (ordering-hazard note) ──────────────────────────────
// The design sources `TaskStatus` from `mission/executor.ts` (task 1.12) and
// `Handoff` / `Mention` from `mission/handoffs.ts` (task 1.15). Those sibling pure
// cores may not exist yet when this module is built, so — to avoid a hard cross-task
// build dependency — we define structurally-identical LOCAL copies here. They match
// the design's Components section verbatim, so once those modules land a maintainer
// can swap these for `import type { TaskStatus } from './executor'` /
// `import type { Handoff, Mention } from './handoffs'` with zero shape change.

/** A Mission_Task's lifecycle status (mirrors `mission/executor.ts`). */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked'

/** All task statuses, for exhaustive iteration + honest zero-initialization. */
export const TASK_STATUSES: readonly TaskStatus[] = [
  'pending',
  'running',
  'completed',
  'failed',
  'blocked',
] as const

/**
 * A Handoff record produced when a task completes (mirrors `mission/handoffs.ts`).
 * Carries the completed task's REAL output reference only (Req 7.5).
 */
export interface Handoff {
  at: string // ISO instant
  fromTaskKey: string
  toTaskKey: string
  outputRef: { runId: string; proposalIds: string[] }
}

/** A Mention record (mirrors `mission/handoffs.ts`). */
export interface Mention {
  at: string // ISO instant
  byTaskKey: string
  byAgentId: string
  referencedTaskKey: string
  referencedAgentId: string
  note: string
}

// ── Mission_Timeline ─────────────────────────────────────────────────────────────

/** Which underlying record a timeline entry was projected from. */
export type TimelineSource = 'task-status' | 'handoff' | 'mention'

/**
 * One entry in the unified Mission_Timeline (Req 8.1–8.3). A flat, render-ready shape;
 * `at` is an ISO timestamp so the client can format it. Entries are pre-sorted
 * oldest→newest (chronologically from T+0).
 */
export interface TimelineEntry {
  id: string
  source: TimelineSource
  /** ISO-8601 instant the event occurred (used for sorting + display). */
  at: string
  /** The Mission_Task this entry concerns (the producing task for a Handoff). */
  taskKey?: string
  /** Originating Agent id (string), or null when the source carries none. */
  agentId?: string | null
  /** Resolved Agent display name when known (for per-agent labels). */
  agentName?: string | null
  /** Task status for `task-status` entries (e.g. 'completed'). */
  status?: TaskStatus
  /** Human-register one-liner (the "what happened"). */
  summary: string
}

/** One real Mission_Task status transition (from `MissionTask.statusHistory` + run). */
export interface TaskTransitionRow {
  taskKey: string
  agentId: string
  status: TaskStatus
  at: string
}

/** Everything `buildMissionTimeline` needs — already fetched and scoped by userId. */
export interface TimelineInput {
  /** The Mission's start instant (anchors T+0); null before it starts running. */
  missionStartedAt: string | null
  /** Real Mission_Task status transitions (Req 8.2). */
  taskTransitions: TaskTransitionRow[]
  /** Recorded Handoffs (Req 8.3). */
  handoffs: Handoff[]
  /** Recorded Mentions (Req 8.3). */
  mentions: Mention[]
  /** Optional map of `agentId → display name` so entries carry the agent's name. */
  agentNames?: Map<string, string> | Record<string, string>
  /** false ⇒ honest empty state, regardless of any other input (Req 8.4). */
  startedAnyRun: boolean
}

// ── Shared numeric / id helpers (keep everything total) ───────────────────────────

/** Resolve an agent display name from the optional name map (null when unknown). */
function resolveName(
  agentId: string | null,
  names: TimelineInput['agentNames'],
): string | null {
  if (!agentId || !names) return null
  if (names instanceof Map) return names.get(agentId) ?? null
  return (names as Record<string, string>)[agentId] ?? null
}

/** Normalize any date-ish value to epoch ms; unparseable → 0 (sorts first/at T+0). */
function toMs(value: Date | string | number | null | undefined): number {
  if (value == null) return 0
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/** Normalize an id-ish value (string | null | undefined) to a non-empty string or null. */
function idOrNull(value: unknown): string | null {
  if (value == null) return null
  const s = String(value)
  return s.length > 0 ? s : null
}

/** A finite token/cost count clamped to `>= 0`; anything non-finite/negative ⇒ 0. */
function nonNegFinite(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Build the Mission_Timeline (Req 8.1–8.6). PURE & TOTAL.
 *
 * Projects each real source record to a uniform `TimelineEntry`, merges the three
 * streams (task status transitions + Handoffs + Mentions), and sorts them
 * OLDEST→NEWEST by the event instant so the list reads chronologically from the
 * Mission's start at T+0 (Req 8.1). The sort is stable, so records sharing an instant
 * keep their source order (transitions, then handoffs, then mentions).
 *
 * Honest empty state (Req 8.4): when `startedAnyRun` is false it returns `[]`
 * IMMEDIATELY, regardless of any other field — a Mission that has started no Run shows
 * no activity rather than placeholder rows. It NEVER fabricates an entry: every entry
 * projects a supplied real record (Req 8.5).
 */
export function buildMissionTimeline(input: TimelineInput): TimelineEntry[] {
  // Honest empty state: no Run started ⇒ no timeline, whatever else was passed in.
  if (!input || !input.startedAnyRun) return []

  const { taskTransitions, handoffs, mentions, agentNames } = input
  const entries: Array<TimelineEntry & { _ms: number }> = []

  // Real Mission_Task status transitions (Req 8.2, 8.6).
  for (const t of taskTransitions ?? []) {
    const ms = toMs(t.at)
    const agentId = idOrNull(t.agentId)
    const name = resolveName(agentId, agentNames)
    entries.push({
      _ms: ms,
      id: `task-status:${t.taskKey}:${t.status}:${ms}`,
      source: 'task-status',
      at: new Date(ms).toISOString(),
      taskKey: t.taskKey,
      agentId,
      agentName: name,
      status: t.status,
      summary: `${name ?? agentId ?? 'Agent'} — task ${t.taskKey} ${t.status}`,
    })
  }

  // Recorded Handoffs (Req 8.3). A Handoff carries no agentId of its own; the
  // producing task (`fromTaskKey`) is the entry's task anchor.
  for (const h of handoffs ?? []) {
    const ms = toMs(h.at)
    entries.push({
      _ms: ms,
      id: `handoff:${h.fromTaskKey}->${h.toTaskKey}:${ms}`,
      source: 'handoff',
      at: new Date(ms).toISOString(),
      taskKey: h.fromTaskKey,
      agentId: null,
      agentName: null,
      summary: `Handoff: ${h.fromTaskKey} → ${h.toTaskKey}`,
    })
  }

  // Recorded Mentions (Req 8.3).
  for (const m of mentions ?? []) {
    const ms = toMs(m.at)
    const agentId = idOrNull(m.byAgentId)
    const name = resolveName(agentId, agentNames)
    entries.push({
      _ms: ms,
      id: `mention:${m.byTaskKey}->${m.referencedTaskKey}:${ms}`,
      source: 'mention',
      at: new Date(ms).toISOString(),
      taskKey: m.byTaskKey,
      agentId,
      agentName: name,
      summary: `${name ?? agentId ?? 'Agent'} mentioned ${m.referencedTaskKey}: ${m.note}`,
    })
  }

  // Oldest→newest (chronological from T+0, Req 8.1). Array.sort is stable, so ties
  // keep insertion order. Strip the sort key on the way out.
  entries.sort((a, b) => a._ms - b._ms)
  return entries.map(({ _ms, ...entry }) => {
    void _ms
    return entry
  })
}

// ── Observability tallies (Req 11) ───────────────────────────────────────────────
// All derived from REAL Mission_Task + AgentRun records, all honest about zero. Input
// types are STRUCTURAL (plain fixtures), DB-free — no Mongoose import.

/** Per-status Mission_Task counts; every status present so zero is explicit (Req 11.1). */
export type TaskStatusCounts = Record<TaskStatus, number>

/** Minimal Mission_Task view a tally reads (a `MissionTask` doc or a fixture). */
export interface TaskTallyRow {
  status: TaskStatus
  assignedAgentId?: string | null
}

/** Minimal AgentRun view a usage tally reads (an `AgentRun` doc or a fixture). */
export interface RunUsageRow {
  agentId?: string | null
  tokensUsed?: number | null
  cost?: number | null
}

/** Accumulated usage summed from real Run records (Req 11.2). */
export interface UsageTotals {
  tokensUsed: number
  costUsed: number
}

/**
 * Count Mission_Tasks per status (Req 11.1). PURE & TOTAL. Every `TaskStatus` key is
 * present and starts at 0, so a status with no tasks reads as an honest `0` rather
 * than a missing key (Req 11.5, 11.6). Off-union statuses are ignored (never counted).
 */
export function tallyTaskStatuses(tasks: ReadonlyArray<TaskTallyRow>): TaskStatusCounts {
  const counts = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    blocked: 0,
  } as TaskStatusCounts

  for (const t of tasks ?? []) {
    if (t && (TASK_STATUSES as readonly string[]).includes(t.status)) {
      counts[t.status] += 1
    }
  }
  return counts
}

/**
 * Sum accumulated token consumption + cost from real Run records (Req 11.2). PURE &
 * TOTAL. Each supplied Run is summed exactly once (no loss, no double-count); a
 * non-finite/negative field contributes 0. An empty input yields an all-zero total —
 * the honest zero state, never a fabricated value (Req 11.5, 11.6).
 */
export function tallyUsage(runs: ReadonlyArray<RunUsageRow>): UsageTotals {
  let tokensUsed = 0
  let costUsed = 0
  for (const r of runs ?? []) {
    tokensUsed += nonNegFinite(r?.tokensUsed)
    costUsed += nonNegFinite(r?.cost)
  }
  return { tokensUsed, costUsed }
}

/** Per-Agent contribution to a Mission (Req 11.3). */
export interface AgentContribution {
  agentId: string
  agentName: string | null
  /** Count of this Agent's Mission_Tasks that reached `completed` (Req 11.3). */
  tasksCompleted: number
  /** Tokens this Agent consumed, summed from its real Run records (Req 11.3). */
  tokensUsed: number
  /** Cost this Agent incurred, summed from its real Run records. */
  costUsed: number
}

export interface AgentContributionInput {
  /** Mission_Tasks (their `assignedAgentId` + `status` drive the completed count). */
  tasks: ReadonlyArray<TaskTallyRow>
  /** Real Run records (their `agentId` + usage drive the token/cost attribution). */
  runs: ReadonlyArray<RunUsageRow>
  /** Optional `agentId → display name` map for labels. */
  agentNames?: Map<string, string> | Record<string, string>
}

/**
 * Per-Agent contribution breakdown (Req 11.3). PURE & TOTAL. For each Agent that owns
 * at least one completed task OR consumed at least one Run's tokens/cost, reports the
 * count of Mission_Tasks it completed and the tokens/cost it consumed.
 *
 * Conservation (no loss / no double-count, Property 13): every agent-attributed Run is
 * counted under exactly one Agent, so `Σ contribution.tokensUsed` over the result
 * equals `tallyUsage(runsWithAnAgent).tokensUsed` (likewise for cost). Runs without a
 * resolvable `agentId` cannot be attributed and are excluded from the per-Agent view
 * (real `AgentRun` records always carry an `agentId`). Result is sorted by tokens
 * descending, then `agentId` ascending, for a deterministic order. Empty input ⇒ `[]`
 * (honest zero, Req 11.5, 11.6).
 */
export function tallyAgentContributions(input: AgentContributionInput): AgentContribution[] {
  const byAgent = new Map<string, AgentContribution>()

  const ensure = (agentId: string): AgentContribution => {
    let row = byAgent.get(agentId)
    if (!row) {
      row = {
        agentId,
        agentName: resolveName(agentId, input?.agentNames),
        tasksCompleted: 0,
        tokensUsed: 0,
        costUsed: 0,
      }
      byAgent.set(agentId, row)
    }
    return row
  }

  // Completed Mission_Tasks → per-Agent completed count (Req 11.3).
  for (const t of input?.tasks ?? []) {
    const agentId = idOrNull(t?.assignedAgentId)
    if (!agentId) continue
    if (t.status === 'completed') ensure(agentId).tasksCompleted += 1
  }

  // Real Run records → per-Agent tokens/cost (Req 11.3). Each Run counted once.
  for (const r of input?.runs ?? []) {
    const agentId = idOrNull(r?.agentId)
    if (!agentId) continue
    const row = ensure(agentId)
    row.tokensUsed += nonNegFinite(r?.tokensUsed)
    row.costUsed += nonNegFinite(r?.cost)
  }

  return Array.from(byAgent.values()).sort(
    (a, b) => b.tokensUsed - a.tokensUsed || a.agentId.localeCompare(b.agentId),
  )
}

/** Accumulated usage measured against the Mission_Budget ceiling (Req 11.4). */
export interface UsageVsCeiling {
  tokensUsed: number
  /** Token ceiling; `0`/non-finite = unlimited (same convention as `budget.ts`). */
  tokenCeiling: number
  /** Remaining token headroom; `+Infinity` when unlimited. */
  tokenRemaining: number
  /** Fraction of the token ceiling consumed in `[0, ∞)`; `null` when unlimited. */
  tokenRatio: number | null
  costUsed: number
  costCeiling: number
  costRemaining: number
  costRatio: number | null
}

/** A cap is ACTIVE (enforceable) only when finite and strictly `> 0` (cf. `budget.ts`). */
function isActiveCeiling(cap: number | null | undefined): boolean {
  return typeof cap === 'number' && Number.isFinite(cap) && cap > 0
}

/**
 * Accumulated usage vs the Mission_Budget ceiling (Req 11.4). PURE & TOTAL. Honors the
 * same "`0`/unset = unlimited" convention as `budget.ts`: an unset ceiling reports
 * `+Infinity` remaining and a `null` ratio (no meaningful percentage of "unlimited").
 * Honest about zero — zero usage against any ceiling yields `0` used, never a
 * fabricated value (Req 11.5, 11.6).
 */
export function usageVsCeiling(
  usage: { tokensUsed: number; costUsed: number },
  ceiling: { tokenCeiling: number; costCeiling: number },
): UsageVsCeiling {
  const tokensUsed = nonNegFinite(usage?.tokensUsed)
  const costUsed = nonNegFinite(usage?.costUsed)
  const tokenCeiling = ceiling?.tokenCeiling as number
  const costCeiling = ceiling?.costCeiling as number

  const tokenActive = isActiveCeiling(tokenCeiling)
  const costActive = isActiveCeiling(costCeiling)

  return {
    tokensUsed,
    tokenCeiling: tokenActive ? tokenCeiling : 0,
    tokenRemaining: tokenActive ? Math.max(0, tokenCeiling - tokensUsed) : Number.POSITIVE_INFINITY,
    tokenRatio: tokenActive ? tokensUsed / tokenCeiling : null,
    costUsed,
    costCeiling: costActive ? costCeiling : 0,
    costRemaining: costActive ? Math.max(0, costCeiling - costUsed) : Number.POSITIVE_INFINITY,
    costRatio: costActive ? costUsed / costCeiling : null,
  }
}
