// ── Squad Dashboard: Activity_Feed slice + roster "now" line (PURE) ───────────
// Two pure, total, deterministic helpers the dashboard data API (task 3.2) uses
// to shape the parts of the Squad_Dashboard that are NOT plain tallies:
//
//   • `buildActivityFeed(input)` — merges the agent-attributed Activity_Feed
//     events (agent `Log` rows + `Proposal` outcomes + `AgentRun` completions),
//     sorts them newest-first, and returns a bounded slice. This is the design's
//     Activity_Feed: "the unified, ambient timeline of Agent events" extending the
//     existing Activity Log (Requirements 6.4; glossary "Activity_Feed").
//   • `deriveNowLine(signals)` — the roster card's "now" line describing what an
//     Agent is doing right now (Req 6.3), built from REAL run/proposal signals.
//     If nothing is in flight it returns an empty string — the card then shows its
//     honest "Nothing in flight" placeholder. NEVER fabricates activity.
//
// Both functions are I/O-free (no DB, no clock, no model imports) so the route can
// fetch + shape rows and hand plain objects in. Easy to unit test in isolation.

import type { AgentStatus } from './accent'

// ── Activity_Feed ──────────────────────────────────────────────────────────────

/** Which underlying record a feed entry was projected from. */
export type ActivitySource = 'log' | 'proposal' | 'run'

/**
 * One entry in the unified Activity_Feed (Req 6.4). A flat, render-ready shape the
 * dashboard right rail lists below the Aegis Queue. `at` is an ISO timestamp so
 * the client can format it; entries are pre-sorted newest-first.
 */
export interface ActivityEntry {
  id: string
  source: ActivitySource
  /** The record's own sub-type: log.operation | proposal.kind | run.trigger. */
  kind: string
  /** Originating Agent id (string), or null for un-attributed rows. */
  agentId: string | null
  /** Resolved Agent display name when known (for per-agent filtering + labels). */
  agentName: string | null
  /** Human-register one-liner (the "what happened"). */
  summary: string
  /** Lifecycle status for proposal/run entries (e.g. 'approved', 'completed'). */
  status?: string
  /** ISO-8601 instant the event occurred (used for sorting + display). */
  at: string
}

// ── Duck-typed input rows (accept lean docs, hydrated docs, or fixtures) ─────────

/** Minimal agent-attributed `Log` row (operation:'agent'). */
export interface LogFeedRow {
  _id: unknown
  agentId?: unknown
  operation: 'ingest' | 'query' | 'lint' | 'agent'
  summary: string
  createdAt: Date | string | number
}

/** Minimal `Proposal` row for the feed (outcome of an Aegis decision). */
export interface ProposalFeedRow {
  _id: unknown
  agentId?: unknown
  kind: 'ingest' | 'synthesis' | 'connection' | 'flagged-content'
  title: string
  status: 'pending' | 'approved' | 'refined' | 'dismissed' | 'auto-applied' | 'failed'
  createdAt: Date | string | number
  decidedAt?: Date | string | number | null
}

/** Minimal `AgentRun` row for the feed (a check-in / completion). */
export interface RunFeedRow {
  _id: unknown
  agentId?: unknown
  trigger: 'manual' | 'dry-run' | 'scheduled' | 'reactive'
  status: 'running' | 'completed' | 'failed' | 'budget-stopped' | 'timeout'
  outcome?: string | null
  createdAt: Date | string | number
  finishedAt?: Date | string | number | null
}

/** Everything `buildActivityFeed` needs — already fetched and scoped by userId. */
export interface ActivityFeedInput {
  /** Agent-attributed Activity Log rows (operation:'agent'). */
  logs: LogFeedRow[]
  /** Recent proposals (any status) — their outcomes appear in the feed (Req 3.11). */
  proposals: ProposalFeedRow[]
  /** Recent agent runs — completions/check-ins appear in the feed. */
  runs: RunFeedRow[]
  /** Max entries to return after the merge+sort. */
  limit: number
  /** Optional map of `agentId → display name` so entries carry the agent's name. */
  agentNames?: Map<string, string> | Record<string, string>
}

/** Resolve an agent display name from the optional name map (null when unknown). */
function resolveName(
  agentId: string | null,
  names: ActivityFeedInput['agentNames'],
): string | null {
  if (!agentId || !names) return null
  if (names instanceof Map) return names.get(agentId) ?? null
  return (names as Record<string, string>)[agentId] ?? null
}

/** Normalize any date-ish value to epoch ms; unparseable → 0 (sorts last). */
function toMs(value: Date | string | number | null | undefined): number {
  if (value == null) return 0
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/** Normalize an id-ish value (ObjectId | string | null) to a string or null. */
function idOrNull(value: unknown): string | null {
  if (value == null) return null
  const s = String(value)
  return s.length > 0 ? s : null
}

/**
 * Build the Activity_Feed slice (Req 6.4). PURE & total: projects each source row
 * to a uniform `ActivityEntry`, merges the three streams, sorts newest-first by
 * the event instant, and returns the first `limit` entries. With empty inputs it
 * returns `[]` — it never fabricates an event.
 *
 * Per-source event instant:
 *   • log      → createdAt
 *   • proposal → decidedAt (when resolved) else createdAt
 *   • run      → finishedAt (when finished) else createdAt
 */
export function buildActivityFeed(input: ActivityFeedInput): ActivityEntry[] {
  const { logs, proposals, runs, limit, agentNames } = input
  const entries: Array<ActivityEntry & { _ms: number }> = []

  for (const l of logs) {
    const agentId = idOrNull(l.agentId)
    entries.push({
      _ms: toMs(l.createdAt),
      id: String(l._id),
      source: 'log',
      kind: l.operation,
      agentId,
      agentName: resolveName(agentId, agentNames),
      summary: l.summary,
      at: new Date(toMs(l.createdAt)).toISOString(),
    })
  }

  for (const p of proposals) {
    const ms = toMs(p.decidedAt) || toMs(p.createdAt)
    const agentId = idOrNull(p.agentId)
    entries.push({
      _ms: ms,
      id: String(p._id),
      source: 'proposal',
      kind: p.kind,
      agentId,
      agentName: resolveName(agentId, agentNames),
      summary: p.title,
      status: p.status,
      at: new Date(ms).toISOString(),
    })
  }

  for (const r of runs) {
    const ms = toMs(r.finishedAt) || toMs(r.createdAt)
    const agentId = idOrNull(r.agentId)
    entries.push({
      _ms: ms,
      id: String(r._id),
      source: 'run',
      kind: r.trigger,
      agentId,
      agentName: resolveName(agentId, agentNames),
      summary: r.outcome?.trim() ? r.outcome : `${r.trigger} run ${r.status}`,
      status: r.status,
      at: new Date(ms).toISOString(),
    })
  }

  // Newest-first; stable enough for display. Strip the sort key on the way out.
  entries.sort((a, b) => b._ms - a._ms)
  const sliced = limit > 0 ? entries.slice(0, limit) : entries
  return sliced.map(({ _ms, ...entry }) => { void _ms; return entry })
}

// ── Roster "now" line ────────────────────────────────────────────────────────────

/** Real runtime signals used to phrase an Agent's "now" line (no fabrication). */
export interface NowLineSignals {
  /** The Agent's resolved display status (from `deriveAgentStatus`). */
  status: AgentStatus
  /** Last trace step of the Agent's active run, if it is currently running. */
  latestTraceStep?: string | null
  /** How many of the Agent's proposals are pending sign-off. */
  pendingCount?: number
}

/**
 * Phrase the roster card's "now" line from REAL signals (Req 6.3). PURE & total.
 *
 *   • live   → the active run's latest trace step, else a plain "Running…"
 *   • review → "<n> proposal(s) awaiting your sign-off" (real pending count)
 *   • paused → "Paused"
 *   • error  → "Last run failed"
 *   • idle   → "" (nothing in flight — the card shows its own placeholder)
 *
 * The empty string for idle is deliberate: there is no current activity to report,
 * and we never invent one. The Agent card renders "Nothing in flight" in its place.
 */
export function deriveNowLine(signals: NowLineSignals): string {
  switch (signals.status) {
    case 'live': {
      const step = signals.latestTraceStep?.trim()
      return step && step.length > 0 ? step : 'Running…'
    }
    case 'review': {
      const n = Math.max(0, signals.pendingCount ?? 0)
      if (n <= 0) return 'Awaiting your sign-off'
      return `${n} ${n === 1 ? 'proposal' : 'proposals'} awaiting your sign-off`
    }
    case 'paused':
      return 'Paused'
    case 'error':
      return 'Last run failed'
    case 'idle':
    default:
      return ''
  }
}


// ── Per-agent heartbeat ("last active") ───────────────────────────────────────

/** A run row used to compute an agent's last-active instant. */
export interface HeartbeatRunRow {
  agentId?: unknown
  status?: string
  startedAt?: Date | string | number | null
  finishedAt?: Date | string | number | null
}

/**
 * Compute each agent's most-recent activity instant (epoch ms) from their run
 * rows. PURE & total. An in-flight run (status 'running') uses `startedAt` so a
 * currently-working agent reads as active "now"; finished runs use `finishedAt`
 * (falling back to `startedAt`). Returns a `Map<agentId, ms>`; agents with no
 * runs are simply absent (the UI shows no heartbeat for them).
 */
export function deriveLastActiveAt(runs: HeartbeatRunRow[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of runs) {
    const agentId = idOrNull(r.agentId)
    if (!agentId) continue
    const ms = r.status === 'running'
      ? toMs(r.startedAt)
      : (toMs(r.finishedAt) || toMs(r.startedAt))
    if (ms <= 0) continue
    const prev = out.get(agentId)
    if (prev === undefined || ms > prev) out.set(agentId, ms)
  }
  return out
}
