// Unit tests for the three-level Budget guard (task 7.2).
//
// Validates: Requirements 10.4, 10.6, 10.7, 10.8, 10.9, 10.10
//
// Example-based pins for the exact allowed/blocked rules, the `effective` clamp,
// and the bar-state thresholds. The universal invariants over arbitrary inputs are
// covered separately by Property 9 (task 7.6) and Property 10 (task 7.7).

import { describe, it, expect } from 'vitest'

import {
  canStartRun,
  budgetBarState,
  type BudgetInputs,
} from './budget'

// A baseline that is comfortably under every cap, so each test can override only
// the field it exercises.
const UNDER: BudgetInputs = {
  budgetPaused: false,
  agentCap: 10_000,
  agentUsed: 1_000,
  squadCap: 100_000,
  squadUsed: 5_000,
  perRunBudget: 2_000,
}

describe('canStartRun — allowed path (Req 10.4)', () => {
  it('allows a Run that is under all three caps', () => {
    const r = canStartRun(UNDER)
    expect(r.allowed).toBe(true)
    expect(r.reason).toBeUndefined()
  })

  it('effective per-run = min(requested, agent remaining, squad remaining)', () => {
    // agentRemaining = 9_000, squadRemaining = 95_000, requested = 2_000 → 2_000.
    const r = canStartRun(UNDER)
    expect(r.effective.agentRemaining).toBe(9_000)
    expect(r.effective.squadRemaining).toBe(95_000)
    expect(r.effective.perRunTokens).toBe(2_000)
  })

  it('clamps the per-run request DOWN to the smallest remaining cap (Property 9)', () => {
    // Agent has only 500 left; request 5_000 → effective capped at 500.
    const r = canStartRun({ ...UNDER, agentCap: 2_000, agentUsed: 1_500, perRunBudget: 5_000 })
    expect(r.allowed).toBe(true)
    expect(r.effective.agentRemaining).toBe(500)
    expect(r.effective.perRunTokens).toBe(500)
  })

  it('squad remaining can be the binding constraint', () => {
    // squadRemaining = 300, smaller than agentRemaining and the request.
    const r = canStartRun({ ...UNDER, squadCap: 10_000, squadUsed: 9_700, perRunBudget: 5_000 })
    expect(r.allowed).toBe(true)
    expect(r.effective.squadRemaining).toBe(300)
    expect(r.effective.perRunTokens).toBe(300)
  })

  it('treats unset caps (0) as unlimited → bounded only by the per-run request', () => {
    const r = canStartRun({
      budgetPaused: false,
      agentCap: 0,
      agentUsed: 0,
      squadCap: 0,
      squadUsed: 0,
      perRunBudget: 4_000,
    })
    expect(r.allowed).toBe(true)
    expect(r.effective.agentRemaining).toBe(Number.POSITIVE_INFINITY)
    expect(r.effective.squadRemaining).toBe(Number.POSITIVE_INFINITY)
    expect(r.effective.perRunTokens).toBe(4_000)
  })

  it('effective never exceeds the smallest remaining cap', () => {
    const r = canStartRun({ ...UNDER, agentCap: 3_000, agentUsed: 2_400, squadCap: 50_000, squadUsed: 49_900, perRunBudget: 9_999 })
    // agentRemaining = 600, squadRemaining = 100 → min = 100.
    expect(r.effective.perRunTokens).toBe(100)
    expect(r.effective.perRunTokens).toBeLessThanOrEqual(r.effective.agentRemaining)
    expect(r.effective.perRunTokens).toBeLessThanOrEqual(r.effective.squadRemaining)
  })
})

describe('canStartRun — blocked paths each carry the right reason (Req 10.6, 10.7, 10.8)', () => {
  it('blocks when Budget_Paused', () => {
    const r = canStartRun({ ...UNDER, budgetPaused: true })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('budget-paused')
    expect(r.effective.perRunTokens).toBe(0)
  })

  it('blocks when the per-Agent cap is reached (used >= cap)', () => {
    const r = canStartRun({ ...UNDER, agentCap: 5_000, agentUsed: 5_000 })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('agent-cap-reached')
    expect(r.effective.perRunTokens).toBe(0)
    expect(r.effective.agentRemaining).toBe(0)
  })

  it('blocks when the per-Agent cap is exceeded (used > cap)', () => {
    const r = canStartRun({ ...UNDER, agentCap: 5_000, agentUsed: 6_000 })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('agent-cap-reached')
  })

  it('blocks when the Squad cap is reached (used >= cap)', () => {
    const r = canStartRun({ ...UNDER, squadCap: 20_000, squadUsed: 20_000 })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('squad-cap-reached')
    expect(r.effective.perRunTokens).toBe(0)
    expect(r.effective.squadRemaining).toBe(0)
  })

  it('Budget_Paused takes priority over a reached cap', () => {
    const r = canStartRun({ ...UNDER, budgetPaused: true, agentCap: 5_000, agentUsed: 5_000 })
    expect(r.reason).toBe('budget-paused')
  })

  it('per-Agent cap is checked before the Squad cap when both are reached', () => {
    const r = canStartRun({ ...UNDER, agentCap: 5_000, agentUsed: 5_000, squadCap: 20_000, squadUsed: 20_000 })
    expect(r.reason).toBe('agent-cap-reached')
  })
})

describe('canStartRun — totality (never throws, sanitizes garbage)', () => {
  it('treats negative / NaN usage as 0', () => {
    const r = canStartRun({ ...UNDER, agentUsed: -100, squadUsed: Number.NaN })
    expect(r.allowed).toBe(true)
    expect(r.effective.agentRemaining).toBe(10_000)
    expect(r.effective.squadRemaining).toBe(100_000)
  })

  it('effective is always >= 0', () => {
    const r = canStartRun({ ...UNDER, agentCap: 1_000, agentUsed: 999, perRunBudget: 1 })
    expect(r.effective.perRunTokens).toBeGreaterThanOrEqual(0)
  })
})

describe('budgetBarState — thresholds and boundaries (Req 10.9, 10.10)', () => {
  const CAP = 1_000

  it("is 'ok' at 0% usage", () => {
    expect(budgetBarState(0, CAP)).toBe('ok')
  })

  it("is 'ok' just below 80% (79.9%)", () => {
    expect(budgetBarState(799, CAP)).toBe('ok')
  })

  it("flips to 'amber' exactly at 80%", () => {
    expect(budgetBarState(800, CAP)).toBe('amber')
  })

  it("stays 'amber' just below 100% (99.9%)", () => {
    expect(budgetBarState(999, CAP)).toBe('amber')
  })

  it("flips to 'over' exactly at 100% (>= cap)", () => {
    expect(budgetBarState(1_000, CAP)).toBe('over')
  })

  it("is 'over' above 100%", () => {
    expect(budgetBarState(1_500, CAP)).toBe('over')
  })
})

describe('budgetBarState — edge handling (totality)', () => {
  it("cap = 0 with no usage is 'ok' (0 of 0 is not over budget)", () => {
    expect(budgetBarState(0, 0)).toBe('ok')
  })

  it("cap = 0 with usage is 'over'", () => {
    expect(budgetBarState(1, 0)).toBe('over')
  })

  it("negative cap behaves like no budget: 'over' iff used > 0", () => {
    expect(budgetBarState(0, -50)).toBe('ok')
    expect(budgetBarState(10, -50)).toBe('over')
  })

  it("unlimited cap (+Infinity) is always 'ok'", () => {
    expect(budgetBarState(1_000_000, Number.POSITIVE_INFINITY)).toBe('ok')
  })

  it("NaN cap behaves like no budget: 'over' iff used > 0", () => {
    expect(budgetBarState(0, Number.NaN)).toBe('ok')
    expect(budgetBarState(5, Number.NaN)).toBe('over')
  })

  it('negative / NaN usage is treated as 0', () => {
    expect(budgetBarState(-100, 1_000)).toBe('ok')
    expect(budgetBarState(Number.NaN, 1_000)).toBe('ok')
  })
})
