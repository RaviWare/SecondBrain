// Feature: hermes-agents, Property 2: Stakes classifier is total, correct, and trust-monotone
//
// Validates: Requirements 3.4, 3.5, 4.10, 4.11
//
// `classifyStakes(proposal, agent)` is a PURE, TOTAL, DETERMINISTIC function that
// decides whether a Proposal may auto-apply ('low-reversible') or must pass the
// Aegis_Gate for explicit sign-off ('sign-off-required'). This file is the
// property-based-test target for Property 2 (task 1.11). It asserts four facets:
//
//   (a) TOTALITY — for ANY DraftProposal (incl. unknown/garbage `kind`) and ANY
//       Agent, the function returns exactly one of the two `Stakes` enum values
//       and never throws. (the function's documented totality guarantee)
//   (b) SIGN-OFF-REQUIRED CONDITIONS (Req 3.5) — a knowledge-STRUCTURE write
//       (ingest/synthesis) that is not a reversible low-stakes action, and any
//       Flagged_Content hold, is always 'sign-off-required' regardless of policy
//       or trust band.
//   (c) WATCH-BAND OVERRIDE (Req 4.11) — every knowledge-altering proposal from
//       an Agent in the Watch band (Trust_Score 0–39) is 'sign-off-required',
//       regardless of the Agent's configured Sign_Off_Policy.
//   (d) TRUST-BAND MONOTONICITY (Req 4.10) — raising an Agent's Trust_Score never
//       makes a proposal MORE restrictive: a proposal classified 'low-reversible'
//       at a lower score stays 'low-reversible' at a higher score, all else equal.
//
// These are tested directly (no I/O, no mocks) since the classifier is pure.

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { classifyStakes, type Stakes } from './classify'
import { band } from '../trust'
import type { DraftProposal } from '../runner/types'

// ── Local mirrors of the classifier's structural input types ──────────────────
// (`ClassifiableAgent`/`SignOffAction` are not exported; we mirror the shape the
// classifier reads so the generators stay honest about the real contract.)
type SignOffAction = 'auto' | 'ask' | 'notify'
type TestAgent = {
  trustScore: number
  signOffPolicy: {
    ingestSource: SignOffAction
    createSynthesis: SignOffAction
    createConnection: SignOffAction
    flagContradiction: SignOffAction
  }
}

const KNOWN_KINDS = ['ingest', 'synthesis', 'connection', 'flagged-content'] as const
const STAKES: readonly Stakes[] = ['low-reversible', 'sign-off-required']

// ── Generators ─────────────────────────────────────────────────────────────────

const signOffAction: fc.Arbitrary<SignOffAction> = fc.constantFrom('auto', 'ask', 'notify')

const signOffPolicy = fc.record({
  ingestSource: signOffAction,
  createSynthesis: signOffAction,
  createConnection: signOffAction,
  flagContradiction: signOffAction,
})

// Trust scores spread across all three bands, plus out-of-range and NaN so the
// totality/Watch facets exercise band() clamping (score>100 ⇒ trusted, score<0
// and NaN ⇒ watch).
const anyTrustScore: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0, max: 39 }), // watch
  fc.integer({ min: 40, max: 79 }), // proving
  fc.integer({ min: 80, max: 100 }), // trusted
  fc.integer({ min: -100, max: 200 }), // out of range
  fc.constant(Number.NaN), // non-finite ⇒ watch
)

// Scores that are unambiguously in the Watch band (band(score) === 'watch').
const watchTrustScore: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0, max: 39 }),
  fc.integer({ min: -100, max: -1 }),
  fc.constant(Number.NaN),
)

const citation = fc.record({
  slug: fc.option(fc.string(), { nil: undefined }),
  url: fc.option(fc.string(), { nil: undefined }),
  quote: fc.string(),
})

// A DraftProposal whose `kind` is drawn from a supplied arbitrary. `plan` and
// `scanResult` are varied (the classifier must ignore them) to prove the result
// depends only on kind + trust + policy.
function proposalArb(kindArb: fc.Arbitrary<string>): fc.Arbitrary<DraftProposal> {
  return fc.record({
    kind: kindArb,
    title: fc.string(),
    rationale: fc.string(),
    citations: fc.array(citation),
    plan: fc.oneof(fc.constant(null), fc.string(), fc.record({ op: fc.string() })),
    scanResult: fc.oneof(fc.constant(null), fc.record({ status: fc.string() })),
  }) as fc.Arbitrary<DraftProposal>
}

const knownKind = fc.constantFrom(...KNOWN_KINDS)
// Known kinds PLUS arbitrary unknown strings, to drive the classifier's `default`
// (unrecognized-kind) path for the totality facet.
const anyKind = fc.oneof(knownKind, fc.string())

const agentArb: fc.Arbitrary<TestAgent> = fc.record({
  trustScore: anyTrustScore,
  signOffPolicy,
})

// A proposal kind that writes knowledge STRUCTURE (creates new nodes) and is
// never a reversible low-stakes action — must always require sign-off (Req 3.5).
const structureWriteKind = fc.constantFrom('ingest', 'synthesis')

// ── Property tests ──────────────────────────────────────────────────────────────

describe('classifyStakes — Property 2 (total, correct, trust-monotone)', () => {
  // (a) TOTALITY: never throws; always returns one of exactly two enum values,
  // for known AND unknown kinds, across every trust band and policy combo.
  it('(a) is total: returns a valid Stakes value and never throws for arbitrary inputs', () => {
    fc.assert(
      fc.property(proposalArb(anyKind), agentArb, (proposal, agent) => {
        const result = classifyStakes(proposal, agent)
        return STAKES.includes(result)
      }),
      { numRuns: 100 },
    )
  })

  // (b) SIGN-OFF-REQUIRED for knowledge-structure writes (Req 3.5): ingest and
  // synthesis create new nodes and are not reversible low-stakes actions, so they
  // require sign-off regardless of policy (even 'auto') or trust band.
  it('(b) ingest/synthesis (knowledge-structure writes) always require sign-off', () => {
    fc.assert(
      fc.property(proposalArb(structureWriteKind), agentArb, (proposal, agent) => {
        return classifyStakes(proposal, agent) === 'sign-off-required'
      }),
      { numRuns: 100 },
    )
  })

  // (b') Flagged_Content is always held for review — never auto-applied (Req 5.6),
  // independent of trust band and policy.
  it("(b') flagged-content always requires sign-off", () => {
    fc.assert(
      fc.property(proposalArb(fc.constant('flagged-content')), agentArb, (proposal, agent) => {
        return classifyStakes(proposal, agent) === 'sign-off-required'
      }),
      { numRuns: 100 },
    )
  })

  // (c) WATCH-BAND OVERRIDE (Req 4.11): for ANY knowledge-altering proposal, an
  // Agent in the Watch band forces sign-off regardless of its Sign_Off_Policy
  // (even when every action is configured 'auto').
  it('(c) Watch band forces sign-off for every knowledge-altering proposal', () => {
    const watchAgent = fc.record({ trustScore: watchTrustScore, signOffPolicy })
    fc.assert(
      fc.property(proposalArb(knownKind), watchAgent, (proposal, agent) => {
        // Precondition: the generated agent really is in the Watch band.
        expect(band(agent.trustScore)).toBe('watch')
        return classifyStakes(proposal, agent) === 'sign-off-required'
      }),
      { numRuns: 100 },
    )
  })

  // (d) TRUST-BAND MONOTONICITY (Req 4.10): raising Trust_Score never makes a
  // proposal MORE restrictive. With restrictiveness ranked low-reversible(0) <
  // sign-off-required(1), classifying at a higher score is never strictly more
  // restrictive than at a lower score (all else — proposal + policy — equal).
  it('(d) raising trust never makes a proposal more restrictive (monotone)', () => {
    const rank = (s: Stakes): number => (s === 'low-reversible' ? 0 : 1)
    fc.assert(
      fc.property(
        proposalArb(anyKind),
        signOffPolicy,
        fc.integer({ min: -50, max: 150 }),
        fc.integer({ min: -50, max: 150 }),
        (proposal, policy, a, b) => {
          const lo = Math.min(a, b)
          const hi = Math.max(a, b)
          const atLo = classifyStakes(proposal, { trustScore: lo, signOffPolicy: policy })
          const atHi = classifyStakes(proposal, { trustScore: hi, signOffPolicy: policy })
          // Higher trust is never MORE restrictive than lower trust.
          return rank(atHi) <= rank(atLo)
        },
      ),
      { numRuns: 100 },
    )
  })

  // (d') The concrete consequence stated in the task: a proposal that is
  // low-reversible at a lower score remains low-reversible at any higher score.
  it("(d') low-reversible at a lower score stays low-reversible at a higher score", () => {
    fc.assert(
      fc.property(
        proposalArb(anyKind),
        signOffPolicy,
        fc.integer({ min: -50, max: 150 }),
        fc.integer({ min: -50, max: 150 }),
        (proposal, policy, a, b) => {
          const lo = Math.min(a, b)
          const hi = Math.max(a, b)
          const atLo = classifyStakes(proposal, { trustScore: lo, signOffPolicy: policy })
          if (atLo !== 'low-reversible') return true // vacuously holds
          return classifyStakes(proposal, { trustScore: hi, signOffPolicy: policy }) === 'low-reversible'
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ── Example-based unit tests (specific, documented cases) ─────────────────────────
// These pin the exact decision rules with concrete fixtures, complementing the
// universal properties above.

function agent(trustScore: number, overrides: Partial<TestAgent['signOffPolicy']> = {}): TestAgent {
  return {
    trustScore,
    signOffPolicy: {
      ingestSource: 'ask',
      createSynthesis: 'ask',
      createConnection: 'ask',
      flagContradiction: 'ask',
      ...overrides,
    },
  }
}

function proposal(kind: DraftProposal['kind']): DraftProposal {
  return { kind, title: 't', rationale: 'r', citations: [], plan: null }
}

describe('classifyStakes — example cases', () => {
  it('connection with createConnection=auto in Trusted band auto-applies (low-reversible)', () => {
    expect(classifyStakes(proposal('connection'), agent(90, { createConnection: 'auto' }))).toBe(
      'low-reversible',
    )
  })

  it('connection with createConnection=auto in Proving band still auto-applies (band only gates Watch)', () => {
    expect(classifyStakes(proposal('connection'), agent(50, { createConnection: 'auto' }))).toBe(
      'low-reversible',
    )
  })

  it('connection with createConnection=auto in Watch band is forced to sign-off (Req 4.11)', () => {
    expect(classifyStakes(proposal('connection'), agent(10, { createConnection: 'auto' }))).toBe(
      'sign-off-required',
    )
  })

  it('connection with createConnection=ask requires sign-off even when Trusted', () => {
    expect(classifyStakes(proposal('connection'), agent(95, { createConnection: 'ask' }))).toBe(
      'sign-off-required',
    )
  })

  it('ingest with ingestSource=auto in Trusted band still requires sign-off (knowledge-structure write, Req 3.5)', () => {
    expect(classifyStakes(proposal('ingest'), agent(95, { ingestSource: 'auto' }))).toBe(
      'sign-off-required',
    )
  })

  it('synthesis with createSynthesis=auto in Trusted band still requires sign-off (knowledge-structure write)', () => {
    expect(classifyStakes(proposal('synthesis'), agent(95, { createSynthesis: 'auto' }))).toBe(
      'sign-off-required',
    )
  })

  it('flagged-content always requires sign-off, even Trusted with everything auto', () => {
    expect(
      classifyStakes(
        proposal('flagged-content'),
        agent(100, {
          ingestSource: 'auto',
          createSynthesis: 'auto',
          createConnection: 'auto',
          flagContradiction: 'auto',
        }),
      ),
    ).toBe('sign-off-required')
  })
})
