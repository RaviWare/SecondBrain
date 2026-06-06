// Unit tests for the command-recents list ops (`@/lib/command-recents`).
//
// The list logic is PURE, so it runs with plain arrays. These pin: MRU ordering,
// de-duplication (a repeat moves up, never duplicates), the cap, honest empty handling,
// and resolveRecents dropping ids that no longer map to a known command.

import { describe, it, expect } from 'vitest'
import { pushRecent, resolveRecents, MAX_RECENTS } from './command-recents'

describe('pushRecent', () => {
  it('adds an id to the front (most-recent-first)', () => {
    expect(pushRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it('de-duplicates: a repeated id moves to the front, not duplicated', () => {
    expect(pushRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
    expect(pushRecent(['a', 'b'], 'a')).toEqual(['a', 'b'])
  })

  it('caps the list length, dropping the oldest', () => {
    const start = ['a', 'b', 'c', 'd', 'e']
    const out = pushRecent(start, 'f', 5)
    expect(out).toHaveLength(5)
    expect(out[0]).toBe('f')
    expect(out).not.toContain('e') // oldest dropped
  })

  it('ignores a blank id and is total over malformed input', () => {
    expect(pushRecent(['a'], '')).toEqual(['a'])
    expect(pushRecent(['a'], '   ')).toEqual(['a'])
    // @ts-expect-error — exercising the guard
    expect(pushRecent(null, 'a')).toEqual(['a'])
  })

  it('defaults to MAX_RECENTS when no max is given', () => {
    const many = Array.from({ length: MAX_RECENTS + 4 }, (_, i) => `id${i}`)
    const out = many.reduce<string[]>((acc, id) => pushRecent(acc, id), [])
    expect(out.length).toBeLessThanOrEqual(MAX_RECENTS)
  })
})

describe('resolveRecents', () => {
  const known: Record<string, { id: string; label: string }> = {
    a: { id: 'a', label: 'Alpha' },
    b: { id: 'b', label: 'Bravo' },
  }
  const byId = (id: string) => known[id]

  it('resolves ids to items preserving recents order', () => {
    expect(resolveRecents(['b', 'a'], byId).map((x) => x.label)).toEqual(['Bravo', 'Alpha'])
  })

  it('drops ids that no longer map to a known command', () => {
    expect(resolveRecents(['a', 'ghost', 'b'], byId).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('is total over empty / malformed input', () => {
    expect(resolveRecents([], byId)).toEqual([])
    // @ts-expect-error — guard
    expect(resolveRecents(null, byId)).toEqual([])
  })
})
