// ── Token attribution (PURE aggregation + thin async fetch) ───────────────────
// Breaks the squad's token consumption down BY AGENT and BY SKILL from the
// `AgentRun.trace` rows, and exposes the plan allowance vs the amount consumed
// this period (design.md → "Cost & Budget", Requirements 10.2, 10.3).
//
// THE HARD RULE (design.md → Property 18, "Token attribution is conserved"):
// the grand total is never lost and never double-counted. For ANY set of runs:
//
//     sum(byAgent values)                === total
//     sum(bySkill values incl. unattrib) === total
//
// Reconciliation — which number is a run's "total"? (the divergence question)
//   • The per-step `trace` is the ATTRIBUTION DETAIL: each step carries a
//     `skillId` (or `null` for system/context/fetch steps that consume real
//     tokens attributable to NO skill) and a `tokens` count.
//   • `AgentRun.tokensUsed` is the run-level METER.
//   These can diverge. We define a run's authoritative total as
//       runTotal = max(sum(trace step tokens), tokensUsed)
//   and reconcile so conservation always holds, never going negative:
//     - tokensUsed > traceSum → the meter saw MORE than the trace accounts for;
//       the unaccounted difference is real consumption with no skill → it lands
//       in the `unattributed` bucket (so bySkill still sums to runTotal).
//     - tokensUsed ≤ traceSum → we trust the more detailed trace sum as the
//       floor and add nothing negative (the difference would be ≤ 0).
//   The per-agent number uses the SAME runTotal, so byAgent and bySkill agree.
//   In the normal, consistent case (tokensUsed === traceSum) the reconciliation
//   adds 0 and the only `unattributed` tokens are the genuine `skillId: null`
//   steps.
//
// Structure (mirrors `dashboard-tally.ts`: a pure aggregator + a thin async
// fetch wrapper):
//   • `attributeTokens(runs)` — PURE, total, deterministic. The Property-18
//     target (task 7.8 tests it directly). Zero I/O; typed STRUCTURALLY so it
//     never imports the Mongoose model.
//   • `allowanceVsConsumed(allowance, consumed)` — PURE plan-allowance helper
//     for Req 10.3 (the UI in task 7.5 renders it).
//   • `getTokenAttribution(userId, period?)` — a thin async wrapper that scopes
//     the `AgentRun` fetch by `userId` (optionally within the current period)
//     and delegates ALL counting to the pure functions above.

import { connectDB } from '@/lib/mongodb'
import { AgentRun, SquadBudget } from '@/lib/models'

// ── Bucket keys (exported so tests + UI share one definition) ───────────────────

/**
 * The `bySkill` bucket that holds tokens NOT attributable to a Skill: every
 * trace step with `skillId: null` (system context, source fetch, etc.) plus any
 * meter-vs-trace reconciliation surplus. Named so the UI can label it clearly
 * and so the conservation sum has an explicit home — these tokens are real
 * consumption, never dropped.
 */
export const UNATTRIBUTED_SKILL = '__unattributed__' as const

/**
 * The `byAgent` bucket for runs whose `agentId` is missing/blank. Keeps the
 * aggregator total even on malformed rows rather than throwing or losing tokens.
 */
export const UNKNOWN_AGENT = '__unknown_agent__' as const

// ── Input row shapes (structural; accept lean rows, hydrated docs, or fixtures) ─
// Declared locally rather than importing `IAgentRun` so the pure layer stays
// DB-agnostic. Any object with these fields is accepted.

/** The minimal per-step trace view the attribution reads (mirrors `AgentRun.trace[]`). */
export interface TraceStepLike {
  /** The Skill the step is attributed to, or `null`/absent for unattributed work. */
  skillId?: string | null
  /** Tokens consumed by this step. Missing/negative/non-finite is clamped to 0. */
  tokens?: number | null
}

/** The minimal run view the attribution reads (mirrors `AgentRun`). */
export interface RunLike {
  /** The owning Agent. Missing/blank lands in the `UNKNOWN_AGENT` bucket. */
  agentId?: string | null
  /** The run-level token meter. Reconciled against the trace sum (see header). */
  tokensUsed?: number | null
  /** The per-step Run_Trace; the by-skill attribution detail. May be empty/absent. */
  trace?: ReadonlyArray<TraceStepLike> | null
}

// ── Output shape ────────────────────────────────────────────────────────────────

/** The conserved attribution breakdown returned by `attributeTokens`. */
export interface TokenAttribution {
  /** The grand total of tokens consumed across every run. */
  total: number
  /** Tokens per `agentId` (with `UNKNOWN_AGENT` for missing ids). Sums to `total`. */
  byAgent: Record<string, number>
  /**
   * Tokens per `skillId`, including the `UNATTRIBUTED_SKILL` bucket for
   * `skillId: null` steps and meter reconciliation. Sums to `total`.
   */
  bySkill: Record<string, number>
}

/** The plan-allowance view for Req 10.3 (allowance vs consumed this period). */
export interface AllowanceVsConsumed {
  /** The plan/Squad monthly token allowance (cap). `Infinity` ⇒ uncapped. */
  allowance: number
  /** Tokens consumed in the current period. */
  consumed: number
  /** Headroom left this period — always `max(0, allowance - consumed)`. */
  remaining: number
}

/** The full report the async wrapper returns: the breakdown plus the allowance view. */
export interface TokenAttributionReport extends TokenAttribution {
  allowance: AllowanceVsConsumed
}

// ── Normalization helpers (keep the math total — never NaN/negative) ─────────────

/**
 * Normalize a token count: missing, `NaN`, `-Infinity`, or negative ⇒ 0;
 * `+Infinity` is preserved (an unbounded meter stays unbounded); otherwise the
 * value as-is. Tokens can never be negative or unknown-as-NaN.
 */
function clampTokens(n: number | null | undefined): number {
  if (n === undefined || n === null) return 0
  if (n === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY
  if (!Number.isFinite(n)) return 0 // NaN or -Infinity
  return n < 0 ? 0 : n
}

/**
 * Normalize a non-negative quantity for the allowance view: missing, `NaN`,
 * `-Infinity`, or negative ⇒ 0; `+Infinity` preserved (uncapped allowance);
 * otherwise the value as-is.
 */
function normalizeNonNeg(n: number | null | undefined): number {
  return clampTokens(n)
}

/**
 * Resolve a run's `agentId` to a stable string bucket key. Missing/blank (after
 * trimming) ⇒ `UNKNOWN_AGENT`. Accepts anything string-coercible (e.g. an
 * ObjectId via the async wrapper) but the pure type is `string | null`.
 */
function agentKey(agentId: string | null | undefined): string {
  if (agentId === undefined || agentId === null) return UNKNOWN_AGENT
  const key = String(agentId).trim()
  return key.length > 0 ? key : UNKNOWN_AGENT
}

/** Add `amount` into `bucket[key]` (treating a missing entry as 0). */
function add(bucket: Record<string, number>, key: string, amount: number): void {
  bucket[key] = (bucket[key] ?? 0) + amount
}

// ── attributeTokens — the pure aggregator (Property-18 target) ───────────────────
/**
 * Break a set of runs down by Agent and by Skill, conserving the grand total.
 *
 * PURE / TOTAL / DETERMINISTIC. No I/O, no clock, no randomness, never throws.
 * The Property-18 target (task 7.8). Conservation invariant — for ANY input:
 *
 *     sum(Object.values(byAgent))  === total
 *     sum(Object.values(bySkill))  === total   // bySkill INCLUDES UNATTRIBUTED_SKILL
 *
 * Per-run reconciliation (see the module header for the rationale):
 *   traceSum = Σ clampTokens(step.tokens)
 *   runTotal = max(traceSum, clampTokens(tokensUsed))
 *   • each step's tokens go to bySkill[step.skillId ?? UNATTRIBUTED_SKILL]
 *   • the surplus (runTotal − traceSum, always ≥ 0) goes to UNATTRIBUTED_SKILL
 *   • runTotal goes to byAgent[agentKey(agentId)]
 *   • total += runTotal
 *
 * Robust to malformed rows: a missing/empty `trace`, missing `agentId`, and
 * negative/non-finite `tokens` are all handled without throwing (clamped to 0).
 * With no runs (or only zero-token runs) every number is 0 — nothing fabricated.
 */
export function attributeTokens(runs: ReadonlyArray<RunLike> | null | undefined): TokenAttribution {
  const byAgent: Record<string, number> = {}
  const bySkill: Record<string, number> = {}
  let total = 0

  for (const run of runs ?? []) {
    if (!run) continue

    const steps = run.trace ?? []
    let traceSum = 0

    // Attribute each step's tokens to its skill (null ⇒ unattributed bucket).
    for (const step of steps) {
      if (!step) continue
      const tokens = clampTokens(step.tokens)
      if (tokens === 0) continue
      const skillKey = step.skillId == null ? UNATTRIBUTED_SKILL : step.skillId
      add(bySkill, skillKey, tokens)
      traceSum += tokens
    }

    // Reconcile the run-level meter against the trace sum. The authoritative
    // run total is the larger of the two; any meter surplus is consumption with
    // no skill attribution and lands in the unattributed bucket so bySkill still
    // sums to runTotal. (surplus is ≥ 0, so it never produces a negative bucket.)
    const declared = clampTokens(run.tokensUsed)
    const runTotal = Math.max(traceSum, declared)
    const surplus = runTotal - traceSum
    if (surplus > 0) add(bySkill, UNATTRIBUTED_SKILL, surplus)

    // The per-agent number uses the SAME runTotal so byAgent and bySkill agree.
    add(byAgent, agentKey(run.agentId), runTotal)
    total += runTotal
  }

  return { total, byAgent, bySkill }
}

// ── allowanceVsConsumed — the plan allowance view (Req 10.3) ─────────────────────
/**
 * Compute the plan allowance vs amount consumed this period.
 *
 * PURE / TOTAL. `remaining` is always `max(0, allowance − consumed)` so a fully
 * or over-consumed plan reports 0 headroom rather than a negative number.
 * Inputs are normalized (missing/NaN/-Infinity/negative ⇒ 0; `+Infinity`
 * allowance ⇒ uncapped, `remaining` stays `Infinity`).
 */
export function allowanceVsConsumed(allowance: number | null | undefined, consumed: number | null | undefined): AllowanceVsConsumed {
  const a = normalizeNonNeg(allowance)
  const c = normalizeNonNeg(consumed)
  const remaining = a === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.max(0, a - c)
  return { allowance: a, consumed: c, remaining }
}

// ── Async fetch wrapper ──────────────────────────────────────────────────────────

/** Optional period window for `getTokenAttribution`; bounds are inclusive of `start`, exclusive of `end`. */
export interface AttributionPeriod {
  start?: Date | number
  end?: Date | number
}

/**
 * Fetch the user's `AgentRun` rows and compute the conserved token attribution
 * plus the plan allowance view. Thin glue only: it scopes every query by
 * `userId` (optionally within `period`), reads the Squad allowance, and delegates
 * ALL counting to the pure `attributeTokens` / `allowanceVsConsumed`. Mirrors the
 * connect-then-query style of `dashboard-tally.ts`'s `getDashboardTally`.
 *
 * Period: if `period` is omitted, the window defaults to the user's current
 * `SquadBudget` period (`[periodStart, now)`) when a Squad budget exists, else
 * all-time. `consumed` is the attribution total over that window (derived from
 * the real runs), and `allowance` is the Squad monthly cap.
 */
export async function getTokenAttribution(userId: string, period?: AttributionPeriod): Promise<TokenAttributionReport> {
  await connectDB()

  const squad = await SquadBudget.findOne({ userId }, 'monthlyTokenCap periodStart').lean()

  // Resolve the period window. Explicit `period` wins; otherwise fall back to the
  // Squad budget's current period; otherwise all-time (no createdAt filter).
  const startMs =
    period?.start !== undefined
      ? new Date(period.start).getTime()
      : squad?.periodStart
        ? new Date(squad.periodStart).getTime()
        : undefined
  const endMs = period?.end !== undefined ? new Date(period.end).getTime() : undefined

  const query: Record<string, unknown> = { userId }
  if (startMs !== undefined || endMs !== undefined) {
    const range: Record<string, Date> = {}
    if (startMs !== undefined && !Number.isNaN(startMs)) range.$gte = new Date(startMs)
    if (endMs !== undefined && !Number.isNaN(endMs)) range.$lt = new Date(endMs)
    if (Object.keys(range).length > 0) query.createdAt = range
  }

  const runDocs = await AgentRun.find(query, 'agentId tokensUsed trace').lean()

  const runs: RunLike[] = runDocs.map((r) => ({
    agentId: r.agentId != null ? String(r.agentId) : null,
    tokensUsed: r.tokensUsed,
    trace: (r.trace ?? []).map((s) => ({ skillId: s.skillId ?? null, tokens: s.tokens })),
  }))

  const attribution = attributeTokens(runs)
  const allowance = allowanceVsConsumed(squad?.monthlyTokenCap ?? 0, attribution.total)

  return { ...attribution, allowance }
}
