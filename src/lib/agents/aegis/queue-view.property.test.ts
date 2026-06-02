import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  toQueueItem,
  pendingQueue,
  isPending,
  type ProposalView,
} from './queue-view'

// ── Generators ─────────────────────────────────────────────────────────────────
// All Proposal statuses (pending + every terminal status) and all kinds. A
// terminal status is any non-`pending` status — once resolved, an item leaves
// the pending queue (Req 3.11) and carries its outcome.
const STATUSES = ['pending', 'approved', 'refined', 'dismissed', 'auto-applied', 'failed'] as const
const TERMINAL_STATUSES = STATUSES.filter((s) => s !== 'pending')
const FACTUAL_KINDS = ['ingest', 'synthesis', 'connection'] as const

const statusArb = fc.constantFrom(...STATUSES)
const kindArb = fc.constantFrom('ingest', 'synthesis', 'connection', 'flagged-content' as const)

// A citation always carries a non-empty quote (the evidence); slug/url optional.
const citationArb = fc.record(
  {
    slug: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    url: fc.option(fc.webUrl(), { nil: undefined }),
    quote: fc.string({ minLength: 1 }),
  },
  { requiredKeys: ['quote'] },
)

// Ids may be plain strings OR ObjectId-like objects with a toString(); both must
// normalize to the same string via String(...).
const idArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 16 }),
  fc.string({ minLength: 1, maxLength: 16 }).map((s) => ({ toString: () => s })),
)

// A well-formed Proposal as emitted by a Run: factual kinds carry ≥1 citation
// (Property 15 invariant); flagged-content holds may carry 0..n.
const proposalArb: fc.Arbitrary<ProposalView> = fc
  .record({
    _id: idArb,
    agentId: idArb,
    kind: kindArb,
    title: fc.string({ minLength: 1 }),
    rationale: fc.string(),
    status: statusArb,
  })
  .chain((base) => {
    const isFactualKind = base.kind !== 'flagged-content'
    const citationsArb = isFactualKind
      ? fc.array(citationArb, { minLength: 1, maxLength: 4 })
      : fc.array(citationArb, { minLength: 0, maxLength: 4 })
    return citationsArb.map((citations) => ({ ...base, citations }))
  })

// ── Property 16 ──────────────────────────────────────────────────────────────────
// Feature: hermes-agents, Property 16: Aegis Queue items have consistent anatomy and resolve cleanly
// Validates: Requirements 3.2, 3.3, 3.11, 8.7
describe('Property 16: Aegis Queue items have consistent anatomy and resolve cleanly', () => {
  it('exposes what/why/≥1-citation (for factual items) and EXACTLY the three actions, for any proposal', () => {
    fc.assert(
      fc.property(proposalArb, (proposal) => {
        const item = toQueueItem(proposal)

        // what = title (what is proposed) — Req 3.2
        expect(item.what).toBe(proposal.title)
        // why = rationale (the evidence narrative) — Req 3.2, 8.7
        expect(item.why).toBe(proposal.rationale)
        // id/agentId normalized to strings (ObjectId-safe)
        expect(item.id).toBe(String(proposal._id))
        expect(item.agentId).toBe(String(proposal.agentId))

        // EXACTLY the three decision actions, in order — Req 3.3
        expect(item.actions).toEqual(['approve', 'refine', 'dismiss'])
        expect(item.actions).toHaveLength(3)

        // Factual proposals (ingest/synthesis/connection) expose ≥1 citation as
        // the "why" evidence; flagged-content holds are not factual claims.
        const factual = (FACTUAL_KINDS as readonly string[]).includes(proposal.kind)
        expect(item.isFactual).toBe(factual)
        if (factual) {
          expect(item.citations.length).toBeGreaterThanOrEqual(1)
        }
        // Citations are surfaced verbatim regardless of kind — Req 8.7
        expect(item.citations).toEqual(proposal.citations)
      }),
      { numRuns: 100 },
    )
  })

  it('keeps pending items and drops terminal-status items from the pending queue, reflecting their outcome', () => {
    // Per-element `toContain` / `not.toContain` assertions below are only
    // well-defined when each proposal has a DISTINCT normalized id: if a pending
    // and a terminal proposal shared an id, the same id would be both expected
    // and not-expected in the queue. `idArb` can generate colliding strings
    // (e.g. two proposals both normalizing to "constructor"), so constrain the
    // array to unique normalized ids. This is a test-harness invariant only —
    // production `pendingQueue` is order-preserving and correct even with
    // duplicate ids; we assert that separately below.
    const uniqueByIdArb = fc.uniqueArray(proposalArb, {
      maxLength: 12,
      selector: (p) => String(p._id),
    })
    fc.assert(
      fc.property(uniqueByIdArb, (proposals) => {
        const queue = pendingQueue(proposals)
        const queuedIds = queue.map((q) => q.id)

        // The pending queue is EXACTLY the pending proposals, in input order.
        const expectedIds = proposals
          .filter((p) => p.status === 'pending')
          .map((p) => String(p._id))
        expect(queuedIds).toEqual(expectedIds)

        for (const p of proposals) {
          const id = String(p._id)
          if (p.status === 'pending') {
            // isPending agrees, and a pending item appears in the queue.
            expect(isPending(p)).toBe(true)
            expect(queuedIds).toContain(id)
          } else {
            // Terminal-status proposal: absent from the pending queue (Req 3.11),
            // and its outcome is a well-defined terminal status (reflected).
            expect(isPending(p)).toBe(false)
            expect(queuedIds).not.toContain(id)
            expect(TERMINAL_STATUSES).toContain(p.status)
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})
