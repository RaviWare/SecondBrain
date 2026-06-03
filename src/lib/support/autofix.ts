// ── Auto-Fix planner (pure core) ──────────────────────────────────────────────
// Given a ticket's category and the agent's OPT-IN autoFix config, decide which
// bounded, reversible remedy the support worker may apply WITHOUT human approval.
//
// HARD INVARIANTS (enforced here, by construction):
//   • Auto-fix only acts when the agent has `autoFix.enabled === true`.
//   • Each tier is independently gated by its own flag.
//   • Security-relevant categories (injection) and unknown failures are NEVER
//     auto-fixed — they always escalate, regardless of config.
//   • Budget auto-raise can NEVER exceed the admin-set `budgetCeiling`.
//   • No remedy here edits code, runs a terminal, touches credentials, or widens
//     scope automatically — scope is only ever PROPOSED for 1-click approval.
//
// PURE / TOTAL / DETERMINISTIC — the unit/property-test target. The async effects
// (re-running the agent, raising the cap, applying a proposal) live in the worker.

import type { TicketCategory } from './triage'

/** The agent's opt-in auto-fix configuration (subset of Agent.autoFix). */
export interface AutoFixConfig {
  enabled: boolean
  retryTransient: boolean
  autoRaiseBudget: boolean
  budgetCeiling: number
  autoApplyLowStakes: boolean
  proposeScopeChanges: boolean
}

/** A snapshot of the agent's current budget needed to plan a safe raise. */
export interface BudgetSnapshot {
  tokenCap: number // current per-agent cap (0 = unlimited)
  tokensThisPeriod: number // used this period
}

/** The remedy the worker should attempt. `none` ⇒ escalate to a human. */
export type AutoFixAction =
  | { kind: 'none'; reason: string }
  | { kind: 'retry'; reason: string }
  | { kind: 'raise-budget'; newCap: number; reason: string }
  | { kind: 'apply-low-stakes'; reason: string }
  | { kind: 'propose-scope-change'; reason: string }

/** How much to raise a budget cap by when auto-raising (one step). */
export const BUDGET_RAISE_STEP = 50_000

/**
 * Compute a safe new cap when auto-raising, clamped to the admin ceiling.
 * Returns null when no raise is permitted (ceiling unset, or already at/above it).
 */
export function plannedBudgetRaise(cfg: AutoFixConfig, budget: BudgetSnapshot): number | null {
  if (!cfg.autoRaiseBudget) return null
  const ceiling = cfg.budgetCeiling
  if (!Number.isFinite(ceiling) || ceiling <= 0) return null // no ceiling ⇒ never auto-raise
  const current = budget.tokenCap > 0 ? budget.tokenCap : 0
  if (current >= ceiling) return null // already at/above the ceiling — cannot raise
  // Raise by a step, but never past the ceiling, and at least enough to clear used.
  const target = Math.min(ceiling, Math.max(current + BUDGET_RAISE_STEP, budget.tokensThisPeriod + 1))
  return target > current ? target : null
}

/**
 * Decide the auto-fix action for a ticket. PURE / TOTAL.
 *
 * Order mirrors safety: a disabled config or a security/unknown category yields
 * `none` (→ escalate). Otherwise route by category to the matching opted-in tier;
 * if that tier is off, yield `none` (→ escalate).
 */
export function planAutoFix(input: {
  category: TicketCategory
  retryCount: number
  maxRetries: number
  cfg: AutoFixConfig
  budget: BudgetSnapshot
}): AutoFixAction {
  const { category, retryCount, maxRetries, cfg, budget } = input

  // Master gate.
  if (!cfg || cfg.enabled !== true) {
    return { kind: 'none', reason: 'Auto-fix is not enabled for this agent.' }
  }

  // Never auto-act on security or unclassified failures.
  if (category === 'injection') {
    return { kind: 'none', reason: 'Security-relevant (possible injection) — always escalated, never auto-fixed.' }
  }
  if (category === 'unknown') {
    return { kind: 'none', reason: 'Unclassified failure — escalated for human inspection.' }
  }

  switch (category) {
    case 'transient':
    case 'timeout':
      if (cfg.retryTransient && retryCount < maxRetries) {
        return { kind: 'retry', reason: `Auto-retry (${retryCount + 1}/${maxRetries}) for a ${category} failure.` }
      }
      return { kind: 'none', reason: 'Retries exhausted or retry tier disabled — escalating.' }

    case 'budget': {
      const newCap = plannedBudgetRaise(cfg, budget)
      if (newCap != null) {
        return { kind: 'raise-budget', newCap, reason: `Auto-raise budget to ${newCap} (≤ ceiling ${cfg.budgetCeiling}).` }
      }
      return { kind: 'none', reason: 'Budget auto-raise disabled or ceiling reached — escalating for a human budget decision.' }
    }

    case 'scope':
      if (cfg.proposeScopeChanges) {
        return { kind: 'propose-scope-change', reason: 'Generating a scope-change proposal for 1-click approval (never auto-widened).' }
      }
      return { kind: 'none', reason: 'Scope-change proposals disabled — escalating.' }

    default:
      return { kind: 'none', reason: 'No auto-fix tier applies — escalating.' }
  }
}


/**
 * Whether a pending proposal is eligible for no-approval auto-apply.
 * PURE. Eligible ONLY when the agent opted in AND the proposal was classified
 * `low-reversible` by the existing Aegis stakes classifier (reversible + low
 * stakes, with an undo window). `sign-off-required` proposals are NEVER eligible.
 */
export function isAutoApplyEligible(input: {
  cfg: Pick<AutoFixConfig, 'enabled' | 'autoApplyLowStakes'>
  proposalStatus: string
  stakes: string
}): boolean {
  if (!input.cfg?.enabled || !input.cfg.autoApplyLowStakes) return false
  if (input.proposalStatus !== 'pending') return false
  return input.stakes === 'low-reversible'
}
