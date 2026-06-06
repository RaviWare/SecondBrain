// Unit tests for the Action Center deriver (`@/lib/action-center`).
//
// PURE / TOTAL, so it runs with plain fixtures — no DB, no UI. These pin: the
// honest empty result, priority ordering (mission approvals before sign-offs), the
// queue-preview + overflow-summary behavior, an honest `total` independent of the
// render cap, and tolerance of malformed input.

import { describe, it, expect } from 'vitest'
import { buildActionItems, type ActionCenterInput } from './action-center'
import type { MissionLite, QueueItemLite } from './use-squad-snapshot'

function mission(over: Partial<MissionLite> & { _id: string }): MissionLite {
  return { objective: `Objective ${over._id}`, lifecycle: 'running', ...over }
}
function qitem(over: Partial<QueueItemLite> & { id: string }): QueueItemLite {
  return { ...over }
}

const EMPTY: ActionCenterInput = { pendingSignOff: 0, queue: [], missions: [] }

describe('buildActionItems', () => {
  it('returns an honest empty result when nothing is pending', () => {
    const r = buildActionItems(EMPTY)
    expect(r.items).toEqual([])
    expect(r.total).toBe(0)
  })

  it('surfaces a mission awaiting plan approval as a top-tier item linking to its plan', () => {
    const r = buildActionItems({
      ...EMPTY,
      missions: [
        mission({ _id: 'm1', lifecycle: 'running' }),
        mission({ _id: 'm2', lifecycle: 'awaiting-plan-approval', objective: 'Ship the launch' }),
      ],
    })
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({
      kind: 'mission-approval',
      title: 'Ship the launch',
      href: '/app/missions/m2/plan',
    })
    expect(r.total).toBe(1)
  })

  it('orders mission approvals before sign-offs', () => {
    const r = buildActionItems({
      pendingSignOff: 1,
      queue: [qitem({ id: 'q1', title: 'Approve a synthesis' })],
      missions: [mission({ _id: 'm1', lifecycle: 'awaiting-plan-approval' })],
    })
    expect(r.items.map((i) => i.kind)).toEqual(['mission-approval', 'sign-off'])
    expect(r.total).toBe(2)
  })

  it('uses queue item titles, then falls back to agent name, then a generic label', () => {
    const r = buildActionItems({
      pendingSignOff: 3,
      queue: [
        qitem({ id: 'a', title: 'Merge note' }),
        qitem({ id: 'b', agentName: 'Scout' }),
        qitem({ id: 'c' }),
      ],
      missions: [],
    })
    expect(r.items.map((i) => i.title)).toEqual([
      'Merge note',
      'Scout needs your sign-off',
      'A proposal needs your sign-off',
    ])
  })

  it('adds ONE overflow summary when pendingSignOff exceeds the previewed queue', () => {
    const r = buildActionItems({
      pendingSignOff: 5,
      queue: [qitem({ id: 'a', title: 'One' }), qitem({ id: 'b', title: 'Two' })],
      missions: [],
    })
    // 2 previewed + 1 summary for the remaining 3
    const signOffs = r.items.filter((i) => i.kind === 'sign-off')
    expect(signOffs).toHaveLength(3)
    expect(signOffs[2].title).toBe('3 more proposals need your sign-off')
    // total is the authoritative count, not the number of rendered items
    expect(r.total).toBe(5)
  })

  it('singularizes the overflow summary for a remainder of one', () => {
    const r = buildActionItems({
      pendingSignOff: 2,
      queue: [qitem({ id: 'a', title: 'One' })],
      missions: [],
    })
    const summary = r.items.find((i) => i.id === 'sign-off:more')
    expect(summary?.title).toBe('1 more proposal needs your sign-off')
  })

  it('never previews more sign-offs than the authoritative count', () => {
    // queue has 3 entries but only 1 is actually pending → preview just 1, no overflow
    const r = buildActionItems({
      pendingSignOff: 1,
      queue: [qitem({ id: 'a' }), qitem({ id: 'b' }), qitem({ id: 'c' })],
      missions: [],
    })
    expect(r.items.filter((i) => i.kind === 'sign-off')).toHaveLength(1)
    expect(r.items.find((i) => i.id === 'sign-off:more')).toBeUndefined()
    expect(r.total).toBe(1)
  })

  it('caps rendered items but keeps an honest total', () => {
    const missions = Array.from({ length: 8 }, (_, i) =>
      mission({ _id: `m${i}`, lifecycle: 'awaiting-plan-approval' }),
    )
    const r = buildActionItems({ pendingSignOff: 0, queue: [], missions }, 5)
    expect(r.items).toHaveLength(5)
    expect(r.total).toBe(8)
  })

  it('is total over malformed input (bad counts / missing arrays)', () => {
    // @ts-expect-error — exercising the guards
    expect(() => buildActionItems({ pendingSignOff: NaN, queue: null, missions: undefined })).not.toThrow()
    // @ts-expect-error
    const r = buildActionItems({ pendingSignOff: -3, queue: null, missions: null })
    expect(r.items).toEqual([])
    expect(r.total).toBe(0)
  })
})
