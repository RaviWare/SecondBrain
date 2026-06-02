import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { resolveActiveIndex, formatBadge, type NavMatch } from './sidebar-nav'

// The real sidebar nav list — the six /app/wiki items + two /app/query items are
// exactly the ones that caused the original "multiple orange pills" bug.
const nav: NavMatch[] = [
  { href: '/app/dashboard', label: 'Dashboard' },
  { href: '/app/query', label: 'Search' },
  { href: '/app/ingest', label: 'Inbox' },
  { href: '/app/wiki?view=sources', label: 'Sources' },
  { href: '/app/wiki', label: 'Memory' },
  { href: '/app/dashboard#knowledge-graph', label: 'Graph' },
  { href: '/app/wiki?type=concept', label: 'Topics' },
  { href: '/app/wiki?type=entity', label: 'People' },
  { href: '/app/wiki?type=synthesis', label: 'Decisions' },
  { href: '/app/wiki?view=collections', label: 'Collections' },
  { href: '/app/agent', label: 'AI Agent' },
  { href: '/app/query', label: 'AI Assistant' },
]

describe('resolveActiveIndex — single active nav item', () => {
  it('selects exactly one most-specific item for the real routes (the 6-pill bug)', () => {
    // Bare /app/wiki → Memory (the only /app/wiki item with no required query).
    expect(nav[resolveActiveIndex('/app/wiki', '', nav)!].label).toBe('Memory')
    // type=concept → Topics specifically, NOT all six wiki items.
    expect(nav[resolveActiveIndex('/app/wiki', 'type=concept', nav)!].label).toBe('Topics')
    expect(nav[resolveActiveIndex('/app/wiki', 'type=entity', nav)!].label).toBe('People')
    expect(nav[resolveActiveIndex('/app/wiki', 'view=sources', nav)!].label).toBe('Sources')
    expect(nav[resolveActiveIndex('/app/wiki', 'view=collections', nav)!].label).toBe('Collections')
    // /app/query → first match (Search) wins over the duplicate (AI Assistant).
    expect(nav[resolveActiveIndex('/app/query', '', nav)!].label).toBe('Search')
    // Dashboard.
    expect(nav[resolveActiveIndex('/app/dashboard', '', nav)!].label).toBe('Dashboard')
  })

  it('returns null when the route matches no item', () => {
    expect(resolveActiveIndex('/app/unknown', '', nav)).toBeNull()
    expect(resolveActiveIndex('/', '', nav)).toBeNull()
  })

  // Feature: quiet-instrument-design-system, Property 2: Exactly one active navigation item
  it('Property 2: never returns more than one active item, for any path+query', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('/app/wiki', '/app/query', '/app/dashboard', '/app/ingest', '/app/agent', '/x'),
        fc.dictionary(
          fc.constantFrom('type', 'view', 'q', 'foo'),
          fc.constantFrom('concept', 'entity', 'synthesis', 'sources', 'collections', 'bar'),
        ),
        (pathname, params) => {
          const search = new URLSearchParams(params).toString()
          const idx = resolveActiveIndex(pathname, search, nav)
          // Result is null or a single valid in-range index — never a set.
          return idx === null || (Number.isInteger(idx) && idx >= 0 && idx < nav.length)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('is order-stable: equal-specificity ties resolve to the first item', () => {
    const dup: NavMatch[] = [
      { href: '/x', label: 'first' },
      { href: '/x', label: 'second' },
    ]
    expect(dup[resolveActiveIndex('/x', '', dup)!].label).toBe('first')
  })
})

describe('formatBadge — honest Inbox count with 99+ rule', () => {
  it('0 / negative / non-finite → null (no badge)', () => {
    expect(formatBadge(0)).toBeNull()
    expect(formatBadge(-3)).toBeNull()
    expect(formatBadge(NaN)).toBeNull()
  })

  it('caps above 99 at "99+"', () => {
    expect(formatBadge(100)).toBe('99+')
    expect(formatBadge(4213)).toBe('99+')
    expect(formatBadge(99)).toBe('99')
  })

  // Feature: quiet-instrument-design-system, Property 3: Inbox badge reflects the real count with the 99+ rule
  it('Property 3: 0→null, >99→"99+", else the decimal string', () => {
    fc.assert(
      fc.property(fc.integer({ min: -50, max: 100000 }), (n) => {
        const out = formatBadge(n)
        if (n <= 0) return out === null
        if (n > 99) return out === '99+'
        return out === String(n)
      }),
      { numRuns: 200 },
    )
  })
})
