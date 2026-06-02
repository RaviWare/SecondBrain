// Unit tests for the token-attribution module (task 7.3).
//
// Validates: Requirements 10.2, 10.3
//
// Example-based pins for the exact rules of the PURE `attributeTokens` and
// `allowanceVsConsumed`. The universal conservation property over arbitrary
// inputs is covered separately by Property 18 (task 7.8). The "no fabricated
// data" rule is pinned here by the empty-input case → all zeros.

import { describe, it, expect } from 'vitest'

import {
  attributeTokens,
  allowanceVsConsumed,
  UNATTRIBUTED_SKILL,
  UNKNOWN_AGENT,
  type RunLike,
} from './token-attribution'

// Sum a bucket's values (the conservation check both byAgent and bySkill must pass).
function sum(bucket: Record<string, number>): number {
  return Object.values(bucket).reduce((n, v) => n + v, 0)
}

function run(over: Partial<RunLike> = {}): RunLike {
  return { agentId: 'agent-1', tokensUsed: 0, trace: [], ...over }
}

describe('attributeTokens — empty inputs fabricate nothing (Req 10.2)', () => {
  it('returns zero total and empty buckets for no runs', () => {
    expect(attributeTokens([])).toEqual({ total: 0, byAgent: {}, bySkill: {} })
  })

  it('treats null/undefined input as no runs', () => {
    expect(attributeTokens(null)).toEqual({ total: 0, byAgent: {}, bySkill: {} })
    expect(attributeTokens(undefined)).toEqual({ total: 0, byAgent: {}, bySkill: {} })
  })

  it('a run with an empty trace and zero meter contributes nothing', () => {
    const a = attributeTokens([run({ trace: [], tokensUsed: 0 })])
    expect(a.total).toBe(0)
    expect(a.byAgent).toEqual({ 'agent-1': 0 })
    expect(a.bySkill).toEqual({})
  })
})

describe('attributeTokens — conservation on a mixed fixture (Property 18, Req 10.2)', () => {
  // Two agents, three skills, plus null-skill steps. Each run's tokensUsed equals
  // its trace sum (the consistent case), so no reconciliation surplus is added.
  const runs: RunLike[] = [
    run({
      agentId: 'agent-1',
      tokensUsed: 150,
      trace: [
        { skillId: 'skill-research', tokens: 100 },
        { skillId: null, tokens: 30 }, // system/context step → unattributed
        { skillId: 'skill-synth', tokens: 20 },
      ],
    }),
    run({
      agentId: 'agent-2',
      tokensUsed: 90,
      trace: [
        { skillId: 'skill-research', tokens: 50 },
        { skillId: 'skill-connect', tokens: 40 },
      ],
    }),
    run({
      agentId: 'agent-1',
      tokensUsed: 25,
      trace: [{ skillId: null, tokens: 25 }], // fetch step, no skill
    }),
  ]

  it('conserves the grand total across both breakdowns', () => {
    const a = attributeTokens(runs)
    expect(a.total).toBe(265) // 150 + 90 + 25
    expect(sum(a.byAgent)).toBe(a.total)
    expect(sum(a.bySkill)).toBe(a.total)
  })

  it('buckets agents correctly', () => {
    const a = attributeTokens(runs)
    expect(a.byAgent).toEqual({ 'agent-1': 175, 'agent-2': 90 })
  })

  it('buckets skills correctly, with null-skill steps in the unattributed bucket', () => {
    const a = attributeTokens(runs)
    expect(a.bySkill).toEqual({
      'skill-research': 150, // 100 + 50
      'skill-synth': 20,
      'skill-connect': 40,
      [UNATTRIBUTED_SKILL]: 55, // 30 + 25
    })
  })
})

describe('attributeTokens — null-skill steps land in the unattributed bucket (Req 10.2)', () => {
  it('routes both null and missing skillId steps to UNATTRIBUTED_SKILL', () => {
    const a = attributeTokens([
      run({
        agentId: 'agent-1',
        tokensUsed: 30,
        trace: [
          { skillId: null, tokens: 10 },
          { tokens: 20 }, // skillId absent → also unattributed
        ],
      }),
    ])
    expect(a.bySkill).toEqual({ [UNATTRIBUTED_SKILL]: 30 })
    expect(sum(a.bySkill)).toBe(a.total)
  })
})

describe('attributeTokens — meter vs trace-sum reconciliation', () => {
  it('attributes the surplus to unattributed when tokensUsed exceeds the trace sum', () => {
    // Meter says 100, trace only accounts for 70 → 30 unaccounted = unattributed.
    const a = attributeTokens([
      run({
        agentId: 'agent-1',
        tokensUsed: 100,
        trace: [{ skillId: 'skill-a', tokens: 70 }],
      }),
    ])
    expect(a.total).toBe(100)
    expect(a.byAgent).toEqual({ 'agent-1': 100 })
    expect(a.bySkill).toEqual({ 'skill-a': 70, [UNATTRIBUTED_SKILL]: 30 })
    expect(sum(a.byAgent)).toBe(a.total)
    expect(sum(a.bySkill)).toBe(a.total)
  })

  it('trusts the larger trace sum when tokensUsed is lower (no negative bucket)', () => {
    // Trace accounts for 120 but the meter only logged 50 → runTotal = 120.
    const a = attributeTokens([
      run({
        agentId: 'agent-1',
        tokensUsed: 50,
        trace: [
          { skillId: 'skill-a', tokens: 80 },
          { skillId: 'skill-b', tokens: 40 },
        ],
      }),
    ])
    expect(a.total).toBe(120)
    expect(a.byAgent).toEqual({ 'agent-1': 120 })
    expect(a.bySkill).toEqual({ 'skill-a': 80, 'skill-b': 40 })
    // No unattributed surplus and no negative entries.
    expect(a.bySkill[UNATTRIBUTED_SKILL]).toBeUndefined()
    expect(sum(a.bySkill)).toBe(a.total)
  })
})

describe('attributeTokens — robust to malformed rows (total/deterministic)', () => {
  it('buckets a missing/blank agentId under UNKNOWN_AGENT', () => {
    const a = attributeTokens([
      run({ agentId: null, tokensUsed: 10, trace: [{ skillId: 'skill-a', tokens: 10 }] }),
      run({ agentId: '  ', tokensUsed: 5, trace: [{ skillId: 'skill-a', tokens: 5 }] }),
    ])
    expect(a.byAgent).toEqual({ [UNKNOWN_AGENT]: 15 })
    expect(sum(a.byAgent)).toBe(a.total)
  })

  it('clamps negative and non-finite step tokens to 0', () => {
    const a = attributeTokens([
      run({
        agentId: 'agent-1',
        tokensUsed: 0,
        trace: [
          { skillId: 'skill-a', tokens: -50 },
          { skillId: 'skill-b', tokens: Number.NaN },
          { skillId: 'skill-c', tokens: 40 },
        ],
      }),
    ])
    expect(a.total).toBe(40)
    expect(a.bySkill).toEqual({ 'skill-c': 40 })
    expect(sum(a.byAgent)).toBe(a.total)
    expect(sum(a.bySkill)).toBe(a.total)
  })

  it('clamps a negative/NaN run meter to 0 and still conserves', () => {
    const a = attributeTokens([
      run({ agentId: 'agent-1', tokensUsed: -100, trace: [{ skillId: 'skill-a', tokens: 20 }] }),
      run({ agentId: 'agent-2', tokensUsed: Number.NaN, trace: [] }),
    ])
    expect(a.total).toBe(20)
    expect(a.byAgent).toEqual({ 'agent-1': 20, 'agent-2': 0 })
    expect(sum(a.bySkill)).toBe(a.total)
  })

  it('skips null run / null step entries without throwing', () => {
    const runs = [null, run({ agentId: 'agent-1', tokensUsed: 10, trace: [null, { skillId: 'skill-a', tokens: 10 }] })] as unknown as RunLike[]
    const a = attributeTokens(runs)
    expect(a.total).toBe(10)
    expect(a.byAgent).toEqual({ 'agent-1': 10 })
    expect(a.bySkill).toEqual({ 'skill-a': 10 })
  })

  it('is deterministic — same input yields identical output', () => {
    const runs = [run({ agentId: 'a', tokensUsed: 10, trace: [{ skillId: 's', tokens: 10 }] })]
    expect(attributeTokens(runs)).toEqual(attributeTokens(runs))
  })
})

describe('allowanceVsConsumed — plan allowance vs consumed (Req 10.3)', () => {
  it('computes remaining headroom when under the allowance', () => {
    expect(allowanceVsConsumed(1000, 300)).toEqual({ allowance: 1000, consumed: 300, remaining: 700 })
  })

  it('clamps remaining to 0 when fully or over-consumed', () => {
    expect(allowanceVsConsumed(1000, 1000)).toEqual({ allowance: 1000, consumed: 1000, remaining: 0 })
    expect(allowanceVsConsumed(1000, 1500)).toEqual({ allowance: 1000, consumed: 1500, remaining: 0 })
  })

  it('treats missing/NaN/negative inputs as 0', () => {
    expect(allowanceVsConsumed(undefined, undefined)).toEqual({ allowance: 0, consumed: 0, remaining: 0 })
    expect(allowanceVsConsumed(Number.NaN, -10)).toEqual({ allowance: 0, consumed: 0, remaining: 0 })
    expect(allowanceVsConsumed(0, 0)).toEqual({ allowance: 0, consumed: 0, remaining: 0 })
  })

  it('treats an Infinite allowance as uncapped (remaining stays Infinity)', () => {
    const r = allowanceVsConsumed(Number.POSITIVE_INFINITY, 5000)
    expect(r.allowance).toBe(Number.POSITIVE_INFINITY)
    expect(r.consumed).toBe(5000)
    expect(r.remaining).toBe(Number.POSITIVE_INFINITY)
  })

  it('the consumed value can be fed straight from attributeTokens(...).total', () => {
    const { total } = attributeTokens([
      run({ agentId: 'a', tokensUsed: 200, trace: [{ skillId: 's', tokens: 200 }] }),
    ])
    expect(allowanceVsConsumed(1000, total)).toEqual({ allowance: 1000, consumed: 200, remaining: 800 })
  })
})
