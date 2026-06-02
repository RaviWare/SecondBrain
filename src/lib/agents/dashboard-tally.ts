// ── Squad Dashboard tallies (PURE counting + thin async fetch) ────────────────
// Computes the two read-only numeric summaries the Squad_Dashboard shows at the
// top (design.md → "Squad Dashboard", Requirements 6.1, 6.2):
//
//   • Status strip   — running / scheduled / awaiting-sign-off  (Req 6.1)
//   • "Today" proof-of-work — sources ingested / connections made /
//                              syntheses proposed                (Req 6.2)
//
// THE HARD RULE (design.md → Property 19, "Dashboard counts equal the true
// tallies — no fabricated data"): every number here is a REAL tally derived by
// counting actual `Agent` / `Proposal` / `Log` records. Nothing is hardcoded,
// estimated, or sparkline-faked. If there is no matching record the count is 0.
//
// Structure (mirrors the planner split in `vault-ops.ts` and the fetch-then-pure
// shape of `src/app/api/dashboard/route.ts`):
//   • `tallyDashboard(input)` — a PURE, total, deterministic function over
//     already-fetched rows. This is the Property-19 target (task 3.5 tests it
//     directly): given the same rows it always returns the same counts, and each
//     count equals the obvious filter-and-count of the input.
//   • `getDashboardTally(userId)` — a thin async wrapper that does the scoped
//     Mongo fetch (`connectDB` + queries scoped by `userId`) and calls the pure
//     tallier. No counting logic lives here beyond shaping rows.
//
// All model imports are confined to the async wrapper so the pure layer has zero
// I/O and is trivially testable with plain objects.

import { connectDB } from '@/lib/mongodb'
import { Agent, AgentRun, Proposal, Log } from '@/lib/models'
import type { AgentStatus } from './accent'

// ── Shared constants ──────────────────────────────────────────────────────────

/** One day in milliseconds — the width of the "today" window. */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Proposal statuses that mean the proposed write actually LANDED in the vault
 * (it was approved by the user or auto-applied as a low-stakes action). Used for
 * the "connections made" proof-of-work count — a connection only counts once it
 * has truly been made, never while it is still pending or after it was dismissed.
 */
const APPLIED_STATUSES: ReadonlySet<ProposalTallyRow['status']> = new Set([
  'approved',
  'auto-applied',
])

// ── Input row shapes (duck-typed; accept lean rows, hydrated docs, or fixtures) ─
// Declared locally rather than importing the Mongoose interfaces so the pure
// layer stays DB-agnostic. Any object with these fields is accepted.

/** Agent lifecycle states (mirrors `IAgent.lifecycle` in `@/lib/models`). */
export type AgentLifecycle =
  | 'describe' | 'preview' | 'dry-run' | 'deploy' | 'monitor' | 'pause' | 'retire'

/**
 * The minimal Agent view the status strip reads.
 * - `hasActiveRun` — REAL signal that the Agent is currently executing: it has an
 *   `AgentRun` with status `'running'`. This (not a stored flag) is "running".
 * - `schedule` / `lifecycle` / `budgetPaused` — used to decide whether the Agent
 *   is a *runnable scheduled* Agent (a cron-scheduled Agent that isn't halted).
 */
export interface AgentTallyRow {
  hasActiveRun: boolean
  schedule?: { kind?: string | null } | null
  lifecycle?: AgentLifecycle
  budgetPaused?: boolean
}

/** The minimal Proposal view the awaiting-sign-off + proof-of-work counts read. */
export interface ProposalTallyRow {
  kind: 'ingest' | 'synthesis' | 'connection' | 'flagged-content'
  status: 'pending' | 'approved' | 'refined' | 'dismissed' | 'auto-applied' | 'failed'
  createdAt: Date | string | number
}

/** The minimal Log view the "sources ingested today" count reads. */
export interface LogTallyRow {
  operation: 'ingest' | 'query' | 'lint' | 'agent'
  createdAt: Date | string | number
}

// ── Output shape ────────────────────────────────────────────────────────────────

/** The status strip counts (Req 6.1). */
export interface StatusStripTally {
  /** Agents currently executing a Run (an active `AgentRun`, status 'running'). */
  running: number
  /** Runnable, cron-scheduled Agents (schedule.kind 'scheduled', not paused/retired/budget-paused). */
  scheduled: number
  /** Items awaiting the user's sign-off = the Aegis Queue depth = PENDING proposals. */
  awaitingSignOff: number
}

/** The "today" proof-of-work counts (Req 6.2), all scoped to the user's day. */
export interface ProofOfWorkTally {
  /** Sources the squad ingested today — today's agent-attributed Activity Log rows. */
  sourcesIngested: number
  /** Graph connections the squad made today — today's APPLIED connection proposals. */
  connectionsMade: number
  /** Syntheses the squad proposed today — today's synthesis proposals (any status). */
  synthesesProposed: number
}

/** The full dashboard tally object returned by both the pure and async layers. */
export interface DashboardTally {
  statusStrip: StatusStripTally
  today: ProofOfWorkTally
}

/** Everything the pure tallier needs — already fetched, scoped, and shaped. */
export interface DashboardTallyInput {
  /** Every Agent in the user's squad. */
  agents: AgentTallyRow[]
  /**
   * Proposals to tally over. The wrapper passes the union of (a) all PENDING
   * proposals (for awaiting-sign-off, regardless of age) and (b) all of today's
   * proposals (for proof-of-work). The pure tallier re-filters each count, so
   * passing a superset never inflates a number.
   */
  proposals: ProposalTallyRow[]
  /** Today's agent-attributed Log rows (operation 'agent'). */
  agentLogs: LogTallyRow[]
  /** Epoch ms of the start of the user's day; the "today" window is [dayStartMs, +24h). */
  dayStartMs: number
}

// ── Pure predicates (exported so tests + UI share one definition) ───────────────

/** Start-of-day (local) epoch ms for a given instant. */
export function startOfDay(atMs: number): number {
  const d = new Date(atMs)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** True iff `createdAt` falls inside the [dayStartMs, dayStartMs + 24h) window. */
export function isWithinToday(createdAt: Date | string | number, dayStartMs: number): boolean {
  const ts = new Date(createdAt).getTime()
  if (Number.isNaN(ts)) return false
  return ts >= dayStartMs && ts < dayStartMs + DAY_MS
}

/**
 * True iff the Agent is a runnable, cron-scheduled Agent and therefore counts
 * toward the "scheduled" strip number (Req 6.1): its Schedule is time-based
 * (`kind === 'scheduled'`) AND it is not halted — paused / retired Agents and
 * budget-paused Agents are excluded (they will not start a scheduled Run; cf.
 * Req 1.10, 1.13). Reactive- and manual-schedule Agents are not "scheduled".
 */
export function isScheduledRunnable(agent: AgentTallyRow): boolean {
  if (agent.schedule?.kind !== 'scheduled') return false
  if (agent.budgetPaused) return false
  if (agent.lifecycle === 'pause' || agent.lifecycle === 'retire') return false
  return true
}

// ── The pure tallier (Property-19 target) ───────────────────────────────────────

/**
 * Compute the dashboard tallies from already-fetched rows. PURE, total, and
 * deterministic — no I/O, no clock, no randomness. Every field is a literal
 * count of matching input records (design.md Property 19; Requirements 6.1, 6.2):
 *
 *   statusStrip.running          = # Agents with an active Run
 *   statusStrip.scheduled        = # runnable cron-scheduled Agents
 *   statusStrip.awaitingSignOff  = # PENDING proposals (Aegis Queue depth)
 *   today.sourcesIngested        = # today's agent Activity Log rows
 *   today.connectionsMade        = # today's APPLIED connection proposals
 *   today.synthesesProposed      = # today's synthesis proposals (any status)
 *
 * No count is ever fabricated: with empty inputs every number is 0.
 */
export function tallyDashboard(input: DashboardTallyInput): DashboardTally {
  const { agents, proposals, agentLogs, dayStartMs } = input

  // ── Status strip (Req 6.1) ──
  const running = agents.reduce((n, a) => (a.hasActiveRun ? n + 1 : n), 0)
  const scheduled = agents.reduce((n, a) => (isScheduledRunnable(a) ? n + 1 : n), 0)
  const awaitingSignOff = proposals.reduce((n, p) => (p.status === 'pending' ? n + 1 : n), 0)

  // ── "Today" proof-of-work (Req 6.2) ──
  // Sources ingested = the canonical agent-ingest Activity Log rows for today
  // (`applyIngestPlan` writes one `operation:'agent'` Log per agent ingest).
  const sourcesIngested = agentLogs.reduce(
    (n, l) => (l.operation === 'agent' && isWithinToday(l.createdAt, dayStartMs) ? n + 1 : n),
    0,
  )
  // Connections made = connection proposals that actually LANDED in the vault
  // today (the Log can't distinguish edge-draws by kind, so Proposal.kind is the
  // real source for this category).
  const connectionsMade = proposals.reduce(
    (n, p) =>
      p.kind === 'connection' && APPLIED_STATUSES.has(p.status) && isWithinToday(p.createdAt, dayStartMs)
        ? n + 1
        : n,
    0,
  )
  // Syntheses proposed = synthesis proposals raised today, in any status
  // ("proposed", not necessarily approved).
  const synthesesProposed = proposals.reduce(
    (n, p) => (p.kind === 'synthesis' && isWithinToday(p.createdAt, dayStartMs) ? n + 1 : n),
    0,
  )

  return {
    statusStrip: { running, scheduled, awaitingSignOff },
    today: { sourcesIngested, connectionsMade, synthesesProposed },
  }
}

// ── Optional pure helper: derive an Agent's display status ───────────────────────
// Not part of the tally itself, but lives here as a shared pure helper so the
// dashboard API (task 3.2) and Agent card (task 3.4) classify status the same way
// the strip counts "running". Keeps the accent==='review' invariant aligned with
// `accent.ts`. Total: unknown signals fall back to the neutral 'idle'.

/** Runtime signals (beyond stored config) needed to classify display status. */
export interface AgentStatusSignals {
  hasActiveRun: boolean
  awaitingSignOff: boolean
  lifecycle?: AgentLifecycle
  budgetPaused?: boolean
  lastRunFailed?: boolean
}

/**
 * Map an Agent's stored lifecycle plus live runtime signals to its display
 * `AgentStatus` (live/review/idle/paused/error — see `accent.ts`). Precedence:
 * halted (paused/budget-paused) → retired (idle) → executing (live) → awaiting
 * sign-off (review) → last run failed (error) → idle.
 */
export function deriveAgentStatus(signals: AgentStatusSignals): AgentStatus {
  if (signals.budgetPaused || signals.lifecycle === 'pause') return 'paused'
  if (signals.lifecycle === 'retire') return 'idle'
  if (signals.hasActiveRun) return 'live'
  if (signals.awaitingSignOff) return 'review'
  if (signals.lastRunFailed) return 'error'
  return 'idle'
}

// ── Async fetch wrapper ──────────────────────────────────────────────────────────

/**
 * Fetch the user's `Agent` / `Proposal` / `Log` rows and compute the dashboard
 * tallies. Thin glue only: it scopes every query by `userId`, shapes rows for the
 * pure tallier, and delegates ALL counting to `tallyDashboard`. Mirrors the
 * connect-then-query style of `src/app/api/dashboard/route.ts`.
 */
export async function getDashboardTally(userId: string): Promise<DashboardTally> {
  await connectDB()

  const dayStartMs = startOfDay(Date.now())
  const dayStart = new Date(dayStartMs)
  const dayEnd = new Date(dayStartMs + DAY_MS)

  const [agentDocs, activeRuns, proposalDocs, agentLogs] = await Promise.all([
    // Squad roster — only the fields the strip needs.
    Agent.find({ userId }, 'schedule lifecycle budgetPaused').lean(),
    // Agents currently executing: any AgentRun still 'running'.
    AgentRun.find({ userId, status: 'running' }, 'agentId').lean(),
    // Proposals: all PENDING (awaiting sign-off, any age) ∪ all of TODAY's
    // (proof-of-work). The pure tallier re-filters, so the union is safe.
    Proposal.find(
      { userId, $or: [{ status: 'pending' }, { createdAt: { $gte: dayStart, $lt: dayEnd } }] },
      'kind status createdAt',
    ).lean(),
    // Today's agent-attributed Activity Log rows (sources ingested).
    Log.find(
      { userId, operation: 'agent', createdAt: { $gte: dayStart, $lt: dayEnd } },
      'operation createdAt',
    ).lean(),
  ])

  const runningAgentIds = new Set(activeRuns.map((r) => String(r.agentId)))

  const agents: AgentTallyRow[] = agentDocs.map((a) => ({
    hasActiveRun: runningAgentIds.has(String(a._id)),
    schedule: (a.schedule as { kind?: string | null } | null) ?? null,
    lifecycle: a.lifecycle as AgentLifecycle | undefined,
    budgetPaused: a.budgetPaused,
  }))

  const proposals: ProposalTallyRow[] = proposalDocs.map((p) => ({
    kind: p.kind,
    status: p.status,
    createdAt: p.createdAt,
  }))

  const logs: LogTallyRow[] = agentLogs.map((l) => ({
    operation: l.operation,
    createdAt: l.createdAt,
  }))

  return tallyDashboard({ agents, proposals, agentLogs: logs, dayStartMs })
}
