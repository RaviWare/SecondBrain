// Unit tests for scope-subset resolution + scoped-token scope derivation
// (task 2.5). These pin the concrete subset rules behind Property 8 ("Sub-agent
// and token scope never exceed the parent/agent scope"); the universal
// fast-check property is task 2.11 (separate/optional).
//
// `resolveSubScope` and `deriveTokenScopes` are PURE / TOTAL / DETERMINISTIC, so
// they are tested directly with no I/O and no mocks. The DB-backed
// `mintScopedAgentToken` is covered indirectly: it derives its scopes from
// `deriveTokenScopes`, which is asserted here.

import { describe, it, expect } from 'vitest'

import { resolveSubScope, deriveTokenScopes, type TrustScope } from './scope'

// A convenient full-vault, web-enabled, generous parent scope.
function parentScope(overrides: Partial<TrustScope> = {}): TrustScope {
  return {
    readableSourceIds: [],
    readableCollections: [],
    webAccess: true,
    perRunTokenBudget: 10_000,
    ...overrides,
  }
}

describe('resolveSubScope — readableSourceIds subset', () => {
  it('intersects requested with a restricted parent (drops items the parent lacks)', () => {
    const parent = parentScope({ readableSourceIds: ['a', 'b', 'c'] })
    const requested: TrustScope = {
      readableSourceIds: ['b', 'c', 'd', 'e'], // d,e are NOT in the parent
      readableCollections: [],
      webAccess: true,
      perRunTokenBudget: 10_000,
    }
    const result = resolveSubScope(parent, requested)
    expect(result.readableSourceIds.sort()).toEqual(['b', 'c'])
  })

  it('clamps an empty (whole-vault) request to the parent when the parent is restricted', () => {
    // Empty = whole vault. A restricted parent must NOT let the child have everything.
    const parent = parentScope({ readableSourceIds: ['a', 'b'] })
    const requested = parentScope({ readableSourceIds: [] })
    const result = resolveSubScope(parent, requested)
    expect(result.readableSourceIds.sort()).toEqual(['a', 'b'])
  })

  it('lets a whole-vault parent grant any narrowing the child requests', () => {
    const parent = parentScope({ readableSourceIds: [] }) // whole vault
    const requested = parentScope({ readableSourceIds: ['x', 'y'] })
    const result = resolveSubScope(parent, requested)
    expect(result.readableSourceIds.sort()).toEqual(['x', 'y'])
  })

  it('clamps a DISJOINT request to a restricted parent instead of yielding empty (no escalation to whole vault)', () => {
    // Regression for the privilege-escalation bug Property 8 caught: a restricted
    // parent intersected with a DISJOINT restricted request gives an empty
    // intersection, which would read downstream as "whole vault" (empty =
    // universe) — broader than the parent. The resolved set must stay within the
    // parent, so it clamps to the parent's bound rather than becoming empty.
    const parent = parentScope({ readableSourceIds: ['s1'] })
    const requested = parentScope({ readableSourceIds: ['s6'] }) // disjoint from parent
    const result = resolveSubScope(parent, requested)
    expect(result.readableSourceIds).toEqual(['s1'])
    expect(result.readableSourceIds.length).toBeGreaterThan(0) // never empty (≠ whole vault)
  })

  it('de-duplicates the resolved source ids', () => {
    const parent = parentScope({ readableSourceIds: ['a', 'b'] })
    const requested = parentScope({ readableSourceIds: ['a', 'a', 'b', 'b'] })
    const result = resolveSubScope(parent, requested)
    expect(result.readableSourceIds.sort()).toEqual(['a', 'b'])
  })

  it('compares ObjectId-like ids by their string form', () => {
    const oid = (s: string) => ({ toString: () => s })
    const parent: TrustScope = parentScope({ readableSourceIds: [oid('id1'), oid('id2')] })
    const requested: TrustScope = parentScope({ readableSourceIds: [oid('id2'), oid('id3')] })
    const result = resolveSubScope(parent, requested)
    expect(result.readableSourceIds.map(String)).toEqual(['id2'])
  })
})

describe('resolveSubScope — readableCollections subset', () => {
  it('intersects requested collections with a restricted parent', () => {
    const parent = parentScope({ readableCollections: ['research', 'personal'] })
    const requested = parentScope({ readableCollections: ['personal', 'secret'] })
    const result = resolveSubScope(parent, requested)
    expect(result.readableCollections).toEqual(['personal'])
  })

  it('clamps an empty collection request to a restricted parent', () => {
    const parent = parentScope({ readableCollections: ['research'] })
    const requested = parentScope({ readableCollections: [] })
    const result = resolveSubScope(parent, requested)
    expect(result.readableCollections).toEqual(['research'])
  })

  it('clamps a DISJOINT collection request to a restricted parent (no escalation to all collections)', () => {
    const parent = parentScope({ readableCollections: ['research'] })
    const requested = parentScope({ readableCollections: ['secret'] }) // disjoint
    const result = resolveSubScope(parent, requested)
    expect(result.readableCollections).toEqual(['research'])
  })
})

describe('resolveSubScope — webAccess implication', () => {
  it('grants web access only when BOTH parent and requested allow it', () => {
    expect(resolveSubScope(parentScope({ webAccess: true }), parentScope({ webAccess: true })).webAccess).toBe(true)
    expect(resolveSubScope(parentScope({ webAccess: true }), parentScope({ webAccess: false })).webAccess).toBe(false)
  })

  it('NEVER grants web access when the parent lacks it, even if requested (webAccess ⇒ parent.webAccess)', () => {
    const parent = parentScope({ webAccess: false })
    const requested = parentScope({ webAccess: true }) // asks for MORE than parent
    expect(resolveSubScope(parent, requested).webAccess).toBe(false)
  })
})

describe('resolveSubScope — perRunTokenBudget min', () => {
  it('takes the minimum of parent and requested budgets', () => {
    expect(resolveSubScope(parentScope({ perRunTokenBudget: 5_000 }), parentScope({ perRunTokenBudget: 8_000 })).perRunTokenBudget).toBe(5_000)
    expect(resolveSubScope(parentScope({ perRunTokenBudget: 8_000 }), parentScope({ perRunTokenBudget: 5_000 })).perRunTokenBudget).toBe(5_000)
  })

  it('clamps a request for a LARGER budget down to the parent (never widens)', () => {
    const result = resolveSubScope(parentScope({ perRunTokenBudget: 1_000 }), parentScope({ perRunTokenBudget: 999_999 }))
    expect(result.perRunTokenBudget).toBe(1_000)
  })

  it('treats non-finite budgets as 0 (total, never NaN)', () => {
    const result = resolveSubScope(parentScope({ perRunTokenBudget: Number.NaN }), parentScope({ perRunTokenBudget: 500 }))
    expect(result.perRunTokenBudget).toBe(0)
  })
})

describe('resolveSubScope — totality on malformed input', () => {
  it('never throws on missing arrays/fields and returns a well-formed subset', () => {
    // Deliberately malformed shapes coerced through the public type.
    const parent = { webAccess: true, perRunTokenBudget: 100 } as unknown as TrustScope
    const requested = {} as unknown as TrustScope
    const result = resolveSubScope(parent, requested)
    expect(result.readableSourceIds).toEqual([])
    expect(result.readableCollections).toEqual([])
    expect(result.webAccess).toBe(false) // requested.webAccess is undefined ⇒ false
    expect(result.perRunTokenBudget).toBe(0) // requested budget undefined ⇒ 0
  })
})

describe('deriveTokenScopes — never broader than Trust_Scope (Req 11.6)', () => {
  it('derives a read-only scope (Agent proposes; never writes via its brain token)', () => {
    expect(deriveTokenScopes(parentScope())).toEqual(['read'])
  })

  it('stays read-only regardless of how broad the Trust_Scope is', () => {
    const broad = parentScope({
      readableSourceIds: [],
      readableCollections: [],
      webAccess: true,
      perRunTokenBudget: 1_000_000,
    })
    expect(deriveTokenScopes(broad)).toEqual(['read'])
    // never contains 'write'
    expect(deriveTokenScopes(broad)).not.toContain('write')
  })
})
