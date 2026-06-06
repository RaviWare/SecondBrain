// Unit tests for the command-palette model + matcher (`@/lib/command-palette`).
//
// The matcher is PURE / TOTAL, so it runs directly with plain fixtures — no DB, no UI.
// These pin: empty-query browse order, ranking (exact > prefix > word-prefix >
// contains > keyword), stable tie-break, honest empty result, and grouping order. They
// also assert every shipped command points at an in-app `/app/*` route (NO DUMMY DATA —
// no dead links).

import { describe, it, expect } from 'vitest'
import {
  COMMANDS,
  filterCommands,
  groupCommands,
  type PaletteCommand,
} from './command-palette'

const FIX: PaletteCommand[] = [
  { id: 'a', label: 'Dashboard', href: '/app/dashboard', group: 'Navigate', keywords: ['home'] },
  { id: 'b', label: 'Search', href: '/app/query', group: 'Navigate', keywords: ['query', 'find'] },
  { id: 'c', label: 'Settings', href: '/app/settings', group: 'Navigate', keywords: ['account'] },
  { id: 'd', label: 'Start a mission', href: '/app/missions', group: 'Create', keywords: ['objective'] },
]

describe('filterCommands', () => {
  it('returns ALL commands in declared order for an empty/whitespace query', () => {
    expect(filterCommands('', FIX).map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(filterCommands('   ', FIX).map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ranks an exact label match above a prefix match', () => {
    const list: PaletteCommand[] = [
      { id: 'pre', label: 'Searcher', href: '/app/x', group: 'Navigate' },
      { id: 'exact', label: 'Search', href: '/app/query', group: 'Navigate' },
    ]
    expect(filterCommands('search', list).map((c) => c.id)).toEqual(['exact', 'pre'])
  })

  it('matches a label-word prefix (not just the first word)', () => {
    const list: PaletteCommand[] = [{ id: 'm', label: 'Start a mission', href: '/app/missions', group: 'Create' }]
    expect(filterCommands('miss', list).map((c) => c.id)).toEqual(['m'])
  })

  it('matches via keywords when the label does not contain the query', () => {
    // "account" is only a keyword of Settings, never in its label.
    expect(filterCommands('account', FIX).map((c) => c.id)).toEqual(['c'])
  })

  it('returns an honest empty array when nothing matches (no fabricated result)', () => {
    expect(filterCommands('zzzznotacommand', FIX)).toEqual([])
  })

  it('is stable: equal-scoring matches keep declared order', () => {
    const list: PaletteCommand[] = [
      { id: 'first', label: 'Notes', href: '/app/a', group: 'Navigate' },
      { id: 'second', label: 'Notebook', href: '/app/b', group: 'Navigate' },
    ]
    // both are prefix matches for "note" → same score → declared order preserved
    expect(filterCommands('note', list).map((c) => c.id)).toEqual(['first', 'second'])
  })

  it('is total over malformed input', () => {
    expect(() => filterCommands('x', [])).not.toThrow()
    // @ts-expect-error — exercising a non-array guard
    expect(filterCommands('x', null)).toEqual([])
  })
})

describe('groupCommands', () => {
  it('groups by section preserving first-seen group order and within-group order', () => {
    const grouped = groupCommands(FIX)
    expect(grouped.map((g) => g.group)).toEqual(['Navigate', 'Create'])
    expect(grouped[0].commands.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(grouped[1].commands.map((c) => c.id)).toEqual(['d'])
  })
})

describe('COMMANDS (shipped set)', () => {
  it('every command points at a real in-app route and has a unique id', () => {
    const ids = new Set<string>()
    for (const cmd of COMMANDS) {
      expect(cmd.href.startsWith('/app/')).toBe(true)
      expect(cmd.label.length).toBeGreaterThan(0)
      expect(ids.has(cmd.id)).toBe(false)
      ids.add(cmd.id)
    }
  })
})
