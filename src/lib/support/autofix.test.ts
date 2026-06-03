import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  planAutoFix,
  plannedBudgetRaise,
  isAutoApplyEligible,
  BUDGET_RAISE_STEP,
  type AutoFixConfig,
} from './autofix'
import type { TicketCategory } from './triage'

const OFF: AutoFixConfig = {
  enabled: false,
  retryTransient: true,
  autoRaiseBudget: true,
  budgetCeiling: 1_000_000,
  autoApplyLowStakes: true,
  proposeScopeChanges: true,
}
const ON = (over: Partial<AutoFixConfig> = {}): AutoFixConfig => ({
  enabled: true,
  retryTransient: true,
  autoRaiseBudget: false,
  budgetCeiling: 0,
  autoApplyLowStakes: false,
  proposeScopeChanges: false,
  ...over,
})

const budget = (cap: number, used = 0) => ({ tokenCap: cap, tokensThisPeriod: used })

describe('planAutoFix — master gate + security', () => {
  it('returns none when auto-fix is disabled', () => {
    const a = planAutoFix({ category: 'transient', retryCount: 0, maxRetries: 2, cfg: OFF, budget: budget(0) })
    expect(a.kind).toBe('none')
  })

  it('NEVER auto-fixes injection, even with everything enabled', () => {
    const cfg = ON({ autoRaiseBudget: true, budgetCeiling: 1_000_000, autoApplyLowStakes: true, proposeScopeChanges: true })
    const a = planAutoFix({ category: 'injection', retryCount: 0, maxRetries: 2, cfg, budget: budget(0) })
    expect(a.kind).toBe('none')
  })

  it('NEVER auto-fixes unknown failures', () => {
    const a = planAutoFix({ category: 'unknown', retryCount: 0, maxRetries: 2, cfg: ON(), budget: budget(0) })
    expect(a.kind).toBe('none')
  })
})

describe('planAutoFix — tiers', () => {
  it('retries transient/timeout when the tier is on and retries remain', () => {
    expect(planAutoFix({ category: 'transient', retryCount: 0, maxRetries: 2, cfg: ON(), budget: budget(0) }).kind).toBe('retry')
    expect(planAutoFix({ category: 'timeout', retryCount: 1, maxRetries: 2, cfg: ON(), budget: budget(0) }).kind).toBe('retry')
  })

  it('escalates (none) when retries are exhausted', () => {
    expect(planAutoFix({ category: 'transient', retryCount: 2, maxRetries: 2, cfg: ON(), budget: budget(0) }).kind).toBe('none')
  })

  it('does not retry when the retry tier is off', () => {
    expect(planAutoFix({ category: 'transient', retryCount: 0, maxRetries: 2, cfg: ON({ retryTransient: false }), budget: budget(0) }).kind).toBe('none')
  })

  it('raises budget within the ceiling', () => {
    const cfg = ON({ autoRaiseBudget: true, budgetCeiling: 200_000 })
    const a = planAutoFix({ category: 'budget', retryCount: 0, maxRetries: 2, cfg, budget: budget(100_000, 100_000) })
    expect(a.kind).toBe('raise-budget')
    if (a.kind === 'raise-budget') expect(a.newCap).toBeLessThanOrEqual(200_000)
  })

  it('does NOT raise budget past the ceiling (escalates instead)', () => {
    const cfg = ON({ autoRaiseBudget: true, budgetCeiling: 100_000 })
    const a = planAutoFix({ category: 'budget', retryCount: 0, maxRetries: 2, cfg, budget: budget(100_000) })
    expect(a.kind).toBe('none')
  })

  it('proposes (not auto-applies) a scope change when enabled', () => {
    const a = planAutoFix({ category: 'scope', retryCount: 0, maxRetries: 2, cfg: ON({ proposeScopeChanges: true }), budget: budget(0) })
    expect(a.kind).toBe('propose-scope-change')
  })

  it('escalates scope when the propose tier is off', () => {
    expect(planAutoFix({ category: 'scope', retryCount: 0, maxRetries: 2, cfg: ON(), budget: budget(0) }).kind).toBe('none')
  })
})

describe('plannedBudgetRaise — ceiling math', () => {
  it('returns null when auto-raise is off', () => {
    expect(plannedBudgetRaise(ON({ autoRaiseBudget: false }), budget(0))).toBeNull()
  })
  it('returns null with no ceiling', () => {
    expect(plannedBudgetRaise(ON({ autoRaiseBudget: true, budgetCeiling: 0 }), budget(0))).toBeNull()
  })
  it('clamps the raise to the ceiling', () => {
    const cap = plannedBudgetRaise(ON({ autoRaiseBudget: true, budgetCeiling: 120_000 }), budget(100_000))
    expect(cap).toBe(120_000) // 100k + 50k step clamped to 120k
  })
})

describe('isAutoApplyEligible', () => {
  it('eligible only for enabled + autoApplyLowStakes + pending + low-reversible', () => {
    const cfg = { enabled: true, autoApplyLowStakes: true }
    expect(isAutoApplyEligible({ cfg, proposalStatus: 'pending', stakes: 'low-reversible' })).toBe(true)
    expect(isAutoApplyEligible({ cfg, proposalStatus: 'pending', stakes: 'sign-off-required' })).toBe(false)
    expect(isAutoApplyEligible({ cfg, proposalStatus: 'approved', stakes: 'low-reversible' })).toBe(false)
    expect(isAutoApplyEligible({ cfg: { enabled: false, autoApplyLowStakes: true }, proposalStatus: 'pending', stakes: 'low-reversible' })).toBe(false)
    expect(isAutoApplyEligible({ cfg: { enabled: true, autoApplyLowStakes: false }, proposalStatus: 'pending', stakes: 'low-reversible' })).toBe(false)
  })
})

describe('planAutoFix — properties', () => {
  const catArb = fc.constantFrom<TicketCategory>('budget', 'timeout', 'transient', 'scope', 'injection', 'unknown')
  const cfgArb = fc.record({
    enabled: fc.boolean(),
    retryTransient: fc.boolean(),
    autoRaiseBudget: fc.boolean(),
    budgetCeiling: fc.nat({ max: 2_000_000 }),
    autoApplyLowStakes: fc.boolean(),
    proposeScopeChanges: fc.boolean(),
  })
  const budgetArb = fc.record({ tokenCap: fc.nat({ max: 2_000_000 }), tokensThisPeriod: fc.nat({ max: 2_000_000 }) })

  it('disabled config NEVER yields an action other than none', () => {
    fc.assert(
      fc.property(catArb, fc.integer({ min: 0, max: 5 }), budgetArb, (category, retryCount, budget) => {
        const a = planAutoFix({ category, retryCount, maxRetries: 2, cfg: { ...cfgArb as never, enabled: false } as AutoFixConfig, budget })
        expect(a.kind).toBe('none')
      }),
    )
  })

  it('injection and unknown ALWAYS yield none regardless of config', () => {
    fc.assert(
      fc.property(fc.constantFrom<TicketCategory>('injection', 'unknown'), cfgArb, budgetArb, (category, cfg, budget) => {
        const a = planAutoFix({ category, retryCount: 0, maxRetries: 2, cfg: { ...cfg, enabled: true }, budget })
        expect(a.kind).toBe('none')
      }),
    )
  })

  it('a budget raise never exceeds the ceiling', () => {
    fc.assert(
      fc.property(cfgArb, budgetArb, (cfg, budget) => {
        const a = planAutoFix({ category: 'budget', retryCount: 0, maxRetries: 2, cfg: { ...cfg, enabled: true }, budget })
        if (a.kind === 'raise-budget') {
          expect(a.newCap).toBeLessThanOrEqual(cfg.budgetCeiling)
          expect(a.newCap).toBeGreaterThan(budget.tokenCap)
        }
      }),
    )
  })

  it('scope is never auto-widened — at most proposed', () => {
    fc.assert(
      fc.property(cfgArb, budgetArb, (cfg, budget) => {
        const a = planAutoFix({ category: 'scope', retryCount: 0, maxRetries: 2, cfg: { ...cfg, enabled: true }, budget })
        expect(['none', 'propose-scope-change']).toContain(a.kind)
      }),
    )
  })

  it('BUDGET_RAISE_STEP is a positive constant', () => {
    expect(BUDGET_RAISE_STEP).toBeGreaterThan(0)
  })
})
