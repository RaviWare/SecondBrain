// ── Budget guard ────────────────────────────────────────────────────────────────
// Pure, total, deterministic helpers for the three-level token Budget (Req 10.4):
//
//   • per-Run   — the token allowance for a single Run (`AgentRun.perRunBudget`,
//                 resolved from `Agent.trustScope.perRunTokenBudget`).
//   • per-Agent — the Agent's weekly/monthly cap (`Agent.budget.tokenCap` vs
//                 `Agent.budget.tokensThisPeriod`).
//   • Squad     — the user's master monthly cap (`SquadBudget.monthlyTokenCap`
//                 vs `SquadBudget.tokensThisPeriod`).
//
// See design.md → "Components and Interfaces · 5. Budget guard" and
// Requirement 10. This module has NO I/O and imports no Mongoose model: callers
// (the run route, task 7.4) read the model fields and pass PLAIN NUMBERS in, so
// the property tests (Properties 9 & 10, tasks 7.6/7.7) can drive it directly.
//
// ── The "0 / unset cap means UNLIMITED" convention ───────────────────────────────
// The model defaults every cap to `0` ("not configured"), and the run route already
// treats a `0` per-run budget as unset (`perRunTokenBudget || DEFAULT`). We honor the
// same convention here: a cap that is `<= 0` or non-finite means "no cap configured
// at that level" — it is UNLIMITED, can never be "reached", and contributes an
// infinite remaining headroom. A cap is ACTIVE only when it is a finite value `> 0`,
// and only an active cap can block a Run via the literal `used >= cap` rule. This is
// what makes the guard usable (an unset Squad cap must not block every Agent) and
// matches Property 10's "positive cap" framing.
//
// TOTALITY: negative / NaN / Infinity inputs are sanitized; these functions never
// throw and always return a well-formed result.

/**
 * The resolved effective Budget a Run starts with (design.md → Budget guard).
 * `perRunTokens` is the actual allowance the runner must stay under; the two
 * `*Remaining` fields are the live headroom at the Agent and Squad levels.
 *
 * NOTE: `agentRemaining` / `squadRemaining` are `Number.POSITIVE_INFINITY` when
 * that level has no cap configured (unlimited). `perRunTokens` is always finite
 * and `>= 0` whenever a Run is allowed with any active cap or per-run request.
 */
export type ResolvedBudget = {
  perRunTokens: number
  agentRemaining: number
  squadRemaining: number
}

/**
 * The plain-number inputs to {@link canStartRun}. Typed STRUCTURALLY (not against
 * the Mongoose models) so the run route can assemble it from `Agent.budget`,
 * `SquadBudget`, and the resolved per-run budget, and the property test can pass
 * arbitrary numbers. All token counts are in tokens.
 */
export interface BudgetInputs {
  /** The Agent's Budget_Paused flag (`Agent.budgetPaused`, Req 10.6). */
  budgetPaused: boolean
  /** Per-Agent cap (`Agent.budget.tokenCap`). `<= 0` / non-finite ⇒ unlimited. */
  agentCap: number
  /** Tokens the Agent has consumed this period (`Agent.budget.tokensThisPeriod`). */
  agentUsed: number
  /** Squad master cap (`SquadBudget.monthlyTokenCap`). `<= 0` / non-finite ⇒ unlimited. */
  squadCap: number
  /** Tokens consumed squad-wide this period (`SquadBudget.tokensThisPeriod`). */
  squadUsed: number
  /** Requested per-Run budget (`Agent.trustScope.perRunTokenBudget`). `<= 0` ⇒ unbounded request. */
  perRunBudget: number
}

/** Why a Run was refused, surfaced to the caller / Aegis Queue (Req 10.6, 10.8). */
export type BudgetBlockReason = 'budget-paused' | 'agent-cap-reached' | 'squad-cap-reached'

/** The return shape of {@link canStartRun}. `reason` is present iff `allowed === false`. */
export interface CanStartRunResult {
  allowed: boolean
  effective: ResolvedBudget
  reason?: BudgetBlockReason
}

/** The per-Run Budget bar treatment (Req 10.9, 10.10). */
export type BudgetBarState = 'ok' | 'amber' | 'over'

// ── Numeric helpers (keep everything total) ──────────────────────────────────────

/** A finite token count clamped to `>= 0`; anything non-finite/negative ⇒ 0. */
function nonNegFinite(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** A cap is ACTIVE (enforceable) only when it is a finite value strictly `> 0`. */
function isActiveCap(cap: number): boolean {
  return Number.isFinite(cap) && cap > 0
}

/**
 * Remaining headroom for a level: `max(0, cap - used)` for an active cap, or
 * `+Infinity` (no limit) when the cap is unset/unlimited.
 */
function remainingFor(cap: number, used: number): number {
  if (!isActiveCap(cap)) return Number.POSITIVE_INFINITY
  return Math.max(0, cap - used)
}

// ── canStartRun ──────────────────────────────────────────────────────────────────

/**
 * Pure pre-flight check: may a Run start, and with what effective per-Run budget?
 *
 * PURE, TOTAL, DETERMINISTIC. No I/O. PBT target (Property 9, task 7.6).
 *
 * Returns `allowed === false` (with a `reason`) when ANY of these hold, checked in
 * priority order (Req 10.6, 10.7, 10.8):
 *   1. the Agent is Budget_Paused                       → `'budget-paused'`
 *   2. an ACTIVE per-Agent cap is reached (`used >= cap`) → `'agent-cap-reached'`
 *   3. an ACTIVE Squad cap is reached (`used >= cap`)     → `'squad-cap-reached'`
 *
 * When allowed, `effective.perRunTokens` is the requested per-Run budget clamped
 * DOWN to the smallest remaining headroom across all three levels, and is always
 * `>= 0` and never exceeds any remaining cap (Property 9 — a Run never starts that
 * would exceed any budget cap). Unlimited levels contribute `+Infinity` remaining
 * and so never constrain the result.
 */
export function canStartRun(b: BudgetInputs): CanStartRunResult {
  const budgetPaused = Boolean(b?.budgetPaused)
  const agentCap = b?.agentCap as number
  const squadCap = b?.squadCap as number
  const agentUsed = nonNegFinite(b?.agentUsed)
  const squadUsed = nonNegFinite(b?.squadUsed)
  const perRunBudget = nonNegFinite(b?.perRunBudget)

  const agentRemaining = remainingFor(agentCap, agentUsed)
  const squadRemaining = remainingFor(squadCap, squadUsed)

  // 1. Budget_Paused short-circuits everything (Req 10.6, 10.7).
  if (budgetPaused) {
    return {
      allowed: false,
      reason: 'budget-paused',
      effective: { perRunTokens: 0, agentRemaining, squadRemaining },
    }
  }

  // 2. Per-Agent cap reached (active cap only) (Req 10.6).
  if (isActiveCap(agentCap) && agentUsed >= agentCap) {
    return {
      allowed: false,
      reason: 'agent-cap-reached',
      effective: { perRunTokens: 0, agentRemaining: 0, squadRemaining },
    }
  }

  // 3. Squad master cap reached (active cap only) — stops new Runs squad-wide (Req 10.8).
  if (isActiveCap(squadCap) && squadUsed >= squadCap) {
    return {
      allowed: false,
      reason: 'squad-cap-reached',
      effective: { perRunTokens: 0, agentRemaining, squadRemaining: 0 },
    }
  }

  // Allowed: clamp the requested per-Run budget to the smallest remaining headroom
  // (Property 9). An unset per-Run request (<= 0) is treated as unbounded so the
  // caps alone bound it.
  const requested = perRunBudget > 0 ? perRunBudget : Number.POSITIVE_INFINITY
  let perRunTokens = Math.min(requested, agentRemaining, squadRemaining)
  if (!Number.isFinite(perRunTokens)) {
    // Everything is unlimited AND no explicit per-Run request was made: fall back
    // to the (possibly 0) requested budget; the caller resolves a sane default.
    perRunTokens = perRunBudget
  }
  perRunTokens = Math.max(0, perRunTokens)

  return { allowed: true, effective: { perRunTokens, agentRemaining, squadRemaining } }
}

// ── budgetBarState ─────────────────────────────────────────────────────────────

/**
 * Classify the per-Run Budget bar from usage (Req 10.9, 10.10):
 *   • `'ok'`    — usage `< 80%` of cap.
 *   • `'amber'` — usage in `[80%, 100%)` of cap (Req 10.9, amber warning).
 *   • `'over'`  — usage `>= cap` (`>= 100%`) (Req 10.10, over-budget/red).
 *
 * PURE, TOTAL, DETERMINISTIC. PBT target (Property 10, task 7.7).
 *
 * Edge handling (beyond Property 10's "non-negative used, positive cap" domain):
 *   • `used` non-finite/negative ⇒ treated as 0.
 *   • `cap === +Infinity` (unlimited) ⇒ always `'ok'` — an infinite budget is
 *     never exceeded.
 *   • `cap <= 0` / NaN / -Infinity (no budget allowed) ⇒ `'over'` if any tokens
 *     were used, else `'ok'` (0 of 0 is not yet over budget).
 */
export function budgetBarState(used: number, cap: number): BudgetBarState {
  const u = nonNegFinite(used)

  if (!Number.isFinite(cap)) {
    // +Infinity ⇒ unlimited budget, never over. Other non-finite caps (NaN,
    // -Infinity) ⇒ no budget: any usage is over.
    return cap === Number.POSITIVE_INFINITY ? 'ok' : u > 0 ? 'over' : 'ok'
  }
  if (cap <= 0) return u > 0 ? 'over' : 'ok'

  const ratio = u / cap
  if (ratio >= 1) return 'over' // >= 100% of cap (Req 10.10)
  if (ratio >= 0.8) return 'amber' // [80%, 100%) (Req 10.9)
  return 'ok' // < 80%
}
