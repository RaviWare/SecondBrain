import { describe, it, expect } from 'vitest'

import {
  toQueueItem,
  pendingQueue,
  isPending,
  QUEUE_ACTIONS,
  type ProposalView,
} from './queue-view'

// A factual ingest proposal fixture (pending) with one citation.
function makeProposal(overrides: Partial<ProposalView> = {}): ProposalView {
  return {
    _id: 'prop-1',
    agentId: 'agent-9',
    kind: 'ingest',
    title: 'Ingest "GTM Plan" from blog post',
    rationale: 'Matches your active GTM research thread.',
    citations: [{ url: 'https://example.com/post', quote: 'The wedge is SMB.' }],
    status: 'pending',
    ...overrides,
  }
}

describe('toQueueItem (Aegis queue anatomy)', () => {
  it('maps what/why/citations and id/agentId', () => {
    const item = toQueueItem(makeProposal())
    expect(item.what).toBe('Ingest "GTM Plan" from blog post')
    expect(item.why).toBe('Matches your active GTM research thread.')
    expect(item.citations).toEqual([{ url: 'https://example.com/post', quote: 'The wedge is SMB.' }])
    expect(item.id).toBe('prop-1')
    expect(item.agentId).toBe('agent-9')
    expect(item.kind).toBe('ingest')
  })

  it('always offers exactly the three decisions in order', () => {
    const item = toQueueItem(makeProposal())
    expect(item.actions).toEqual(['approve', 'refine', 'dismiss'])
  })

  it('hands out a fresh actions array (cannot mutate the shared constant)', () => {
    const a = toQueueItem(makeProposal())
    const b = toQueueItem(makeProposal())
    expect(a.actions).not.toBe(b.actions)
    a.actions.push('approve')
    expect(QUEUE_ACTIONS).toEqual(['approve', 'refine', 'dismiss'])
  })

  it('normalizes ObjectId-like _id/agentId via String()', () => {
    const idLike = { toString: () => '507f1f77bcf86cd799439011' }
    const item = toQueueItem(makeProposal({ _id: idLike, agentId: idLike }))
    expect(item.id).toBe('507f1f77bcf86cd799439011')
    expect(item.agentId).toBe('507f1f77bcf86cd799439011')
  })

  it('marks ingest/synthesis/connection as factual', () => {
    for (const kind of ['ingest', 'synthesis', 'connection'] as const) {
      expect(toQueueItem(makeProposal({ kind })).isFactual).toBe(true)
    }
  })

  it('marks flagged-content as NOT factual', () => {
    expect(toQueueItem(makeProposal({ kind: 'flagged-content' })).isFactual).toBe(false)
  })
})

describe('isPending', () => {
  it('is true only for pending status', () => {
    expect(isPending({ status: 'pending' })).toBe(true)
    for (const status of ['approved', 'refined', 'dismissed', 'auto-applied', 'failed'] as const) {
      expect(isPending({ status })).toBe(false)
    }
  })
})

describe('pendingQueue', () => {
  it('excludes terminal-status proposals and preserves order', () => {
    const proposals: ProposalView[] = [
      makeProposal({ _id: 'a', status: 'pending' }),
      makeProposal({ _id: 'b', status: 'approved' }),
      makeProposal({ _id: 'c', status: 'pending' }),
      makeProposal({ _id: 'd', status: 'dismissed' }),
    ]
    const queue = pendingQueue(proposals)
    expect(queue.map((q) => q.id)).toEqual(['a', 'c'])
  })

  it('returns an empty queue when nothing is pending', () => {
    const proposals: ProposalView[] = [
      makeProposal({ status: 'approved' }),
      makeProposal({ status: 'failed' }),
    ]
    expect(pendingQueue(proposals)).toEqual([])
  })

  // Regression: ids that are JS prototype keys ("constructor", "__proto__",
  // "toString") and duplicate ids must NOT confuse the queue. Production uses a
  // plain filter+map (no dictionary/`in` lookup keyed by id), so order is
  // preserved and no inherited prototype key leaks in. (This is the scenario a
  // seed-dependent property run surfaced.)
  it('handles prototype-key and duplicate ids without prototype-chain confusion', () => {
    const proposals: ProposalView[] = [
      makeProposal({ _id: 'constructor', status: 'pending' }),
      makeProposal({ _id: '__proto__', status: 'dismissed' }),
      makeProposal({ _id: 'toString', status: 'pending' }),
      // Same id as the terminal '__proto__' above but pending — both retained,
      // order preserved, with no membership-table collision.
      makeProposal({ _id: '__proto__', status: 'pending' }),
    ]
    const queue = pendingQueue(proposals)
    expect(queue.map((q) => q.id)).toEqual(['constructor', 'toString', '__proto__'])
  })
})
