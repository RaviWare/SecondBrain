// Unit tests for the PURE dry-run helpers (task 4.4).
// These pin the concrete summary-count definitions (Req 7.7) and the
// clean-completion deploy-eligibility gate (Req 7.9, 7.10) that the run route
// wires in. The universal fast-check "dry-run counts are accurate" property is
// task 4.9 (separate/optional, Property 22).
//
// `summarizeDryRun` and `isCleanDryRunCompletion` are PURE / TOTAL /
// DETERMINISTIC, so they are tested directly with plain objects — no I/O, no mocks.

import { describe, it, expect } from 'vitest'

import {
  summarizeDryRun,
  isCleanDryRunCompletion,
  type ProposalKind,
} from './dry-run'

/** Build a proposals fixture from a list of kinds. */
function proposalsOf(...kinds: ProposalKind[]) {
  return { proposals: kinds.map((kind) => ({ kind })) }
}

describe('summarizeDryRun — counts equal the true tallies (Req 7.7)', () => {
  it('returns all-zero counts for an empty run (no fabrication)', () => {
    expect(summarizeDryRun({ proposals: [] })).toEqual({
      wouldIngest: 0,
      filtered: 0,
      wouldPropose: 0,
    })
  })

  it('counts ingest-class proposals as wouldIngest', () => {
    const summary = summarizeDryRun(proposalsOf('ingest', 'ingest', 'ingest'))
    expect(summary).toEqual({ wouldIngest: 3, filtered: 0, wouldPropose: 3 })
  })

  it('counts flagged-content proposals as filtered (held, not ingested)', () => {
    const summary = summarizeDryRun(proposalsOf('flagged-content', 'flagged-content'))
    expect(summary).toEqual({ wouldIngest: 0, filtered: 2, wouldPropose: 2 })
  })

  it('counts a realistic mix: ingest + filtered + synthesis/connection', () => {
    const summary = summarizeDryRun(
      proposalsOf('ingest', 'ingest', 'flagged-content', 'synthesis', 'connection'),
    )
    // wouldPropose is the TOTAL emitted; ingest=2, filtered=1, and the
    // synthesis/connection are neither ingest nor filtered.
    expect(summary).toEqual({ wouldIngest: 2, filtered: 1, wouldPropose: 5 })
  })

  it('keeps the partition invariant: wouldIngest + filtered ≤ wouldPropose', () => {
    const summary = summarizeDryRun(
      proposalsOf('ingest', 'flagged-content', 'synthesis', 'ingest', 'connection'),
    )
    expect(summary.wouldIngest + summary.filtered).toBeLessThanOrEqual(summary.wouldPropose)
    expect(summary.wouldIngest).toBeGreaterThanOrEqual(0)
    expect(summary.filtered).toBeGreaterThanOrEqual(0)
  })

  it('tolerates a missing proposals array (total)', () => {
    // @ts-expect-error — exercising the defensive `?? []` path with a malformed input.
    expect(summarizeDryRun({})).toEqual({ wouldIngest: 0, filtered: 0, wouldPropose: 0 })
  })
})

describe('isCleanDryRunCompletion — deploy-eligibility gate (Req 7.9, 7.10)', () => {
  it('is TRUE only for a completed run with no scope violation', () => {
    expect(isCleanDryRunCompletion({ completed: true, scopeViolation: false })).toBe(true)
  })

  it('is FALSE when the run did not complete', () => {
    expect(isCleanDryRunCompletion({ completed: false, scopeViolation: false })).toBe(false)
  })

  it('is FALSE for a scope-violating dry-run even if it completed (Req 4.4 / 7.9)', () => {
    expect(isCleanDryRunCompletion({ completed: true, scopeViolation: true })).toBe(false)
  })

  it('is FALSE when both flags are unfavorable', () => {
    expect(isCleanDryRunCompletion({ completed: false, scopeViolation: true })).toBe(false)
  })
})
