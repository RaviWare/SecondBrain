// ── Aegis layer · Stakes classifier ───────────────────────────────────────────
// `classifyStakes` decides, for a single emitted Proposal, whether the action may
// auto-apply (reversible + low-stakes, with an Undo_Toast) or must pass through
// the Aegis_Queue for explicit user sign-off.
//
// This function is PURE (no I/O), TOTAL (always returns one of the two `Stakes`
// values for any input), and DETERMINISTIC (same inputs → same output). It is a
// property-based-test target (Property 2, task 1.11).
//
// See design.md → "Components and Interfaces · 2. Aegis layer" and Requirements
// 2.4, 3.4, 3.5, 4.10, 4.11.

import type { DraftProposal } from '../runner/types'
import { band } from '../trust'

/** Stakes classification of a proposed action (Stakes_Scaling). */
export type Stakes = 'low-reversible' | 'sign-off-required'

/** Per-action sign-off setting (subset of `Agent.signOffPolicy`). */
type SignOffAction = 'auto' | 'ask' | 'notify'

/**
 * The minimal slice of an `Agent` this classifier reads. We intentionally type
 * only what we use (trust + sign-off policy) rather than importing the full
 * Mongoose `Agent` model, keeping this module pure and DB-import-free.
 */
type ClassifiableAgent = {
  trustScore: number
  signOffPolicy: {
    ingestSource: SignOffAction
    createSynthesis: SignOffAction
    createConnection: SignOffAction
    flagContradiction: SignOffAction
  }
}

/**
 * REVERSIBILITY ASSUMPTION (this phase):
 * Stakes_Scaling auto-applies an action only when it is BOTH low-stakes AND
 * reversible (Req 3.4). Of the knowledge-altering proposal kinds we treat:
 *   - 'connection' as reversible-low-stakes-eligible — drawing a graph edge is
 *     a cheap, cleanly reversible operation (delete the edge to undo).
 *   - 'ingest' and 'synthesis' as knowledge-STRUCTURE writes (they create new
 *     nodes/pages); these are NOT reversible-low-stakes and therefore always
 *     require sign-off unless... they never qualify for auto-apply this phase.
 * Per Req 3.5, a knowledge-structure write that is not a reversible low-stakes
 * action requires explicit sign-off.
 */
function isReversibleLowStakesEligible(kind: DraftProposal['kind']): boolean {
  return kind === 'connection'
}

/**
 * Map a proposal kind to the `signOffPolicy` action that governs it. Returns
 * `null` for kinds that are not policy-governed knowledge-altering writes
 * (currently only 'flagged-content', which is handled before this is consulted).
 */
function policyForKind(
  kind: DraftProposal['kind'],
  policy: ClassifiableAgent['signOffPolicy'],
): SignOffAction | null {
  switch (kind) {
    case 'ingest':
      return policy.ingestSource
    case 'synthesis':
      return policy.createSynthesis
    case 'connection':
      return policy.createConnection
    case 'flagged-content':
      return null
    default:
      // Exhaustive in practice; keeps the function total for any future kind.
      return null
  }
}

/**
 * Classify a Proposal's stakes.
 *
 * Decision order (deterministic):
 *   1. Flagged content always requires sign-off (Req 5.6) — never auto-applies.
 *   2. Watch-band override (Req 4.11): any knowledge-altering proposal from an
 *      Agent whose Trust_Score is in the Watch band (0–39) is forced to
 *      sign-off-required, regardless of the Agent's configured Sign_Off_Policy.
 *   3. Stakes_Scaling (Req 3.4 / 3.5): the action auto-applies ('low-reversible')
 *      ONLY when its sign-off policy is 'auto' AND the kind is a reversible
 *      low-stakes action. Otherwise ('ask'/'notify', or a non-reversible
 *      knowledge-structure write) it requires sign-off.
 *
 * TOTAL: every path returns a `Stakes` value; unknown/garbage shapes fall through
 * to the safe default of 'sign-off-required'.
 */
export function classifyStakes(proposal: DraftProposal, agent: ClassifiableAgent): Stakes {
  // 1. Flagged content is held for review; it is never auto-applied (Req 5.6).
  if (proposal.kind === 'flagged-content') {
    return 'sign-off-required'
  }

  // 2. Watch-band override — forces sign-off for any knowledge-altering proposal
  //    regardless of policy (Req 4.11).
  if (band(agent.trustScore) === 'watch') {
    return 'sign-off-required'
  }

  // 3. Stakes_Scaling: auto-apply only for an 'auto' policy on a reversible
  //    low-stakes action; everything else requires sign-off.
  const policy = policyForKind(proposal.kind, agent.signOffPolicy)
  if (policy === 'auto' && isReversibleLowStakesEligible(proposal.kind)) {
    return 'low-reversible'
  }

  // 'ask'/'notify', a non-reversible knowledge-structure write (ingest/synthesis),
  // or any unrecognized kind → safe default. (Req 3.5)
  return 'sign-off-required'
}
