// Feature: hermes-agents, Property 8: Sub-agent and token scope never exceed the parent/agent scope (subset)
//
// **Validates: Requirements 8.10, 11.6**
//
// For ANY parent Trust_Scope and ANY requested Sub_Agent scope — INCLUDING a
// request that asks for MORE than the parent (extra sources/collections, web
// access the parent lacks, a larger budget) — the resolved Sub_Agent scope is a
// SUBSET of the parent (Req 8.10); and for ANY Trust_Scope the derived brain-token
// scope is never broader than read-only (Req 11.6). `resolveSubScope` and
// `deriveTokenScopes` are PURE / TOTAL, so this runs the REAL functions directly
// with no mocks and no I/O.
//
// ── Why "subset" is asserted via an ACCESSIBILITY model, not array ⊆ ────────────
// The design's policy is "EMPTY list = the whole vault / unrestricted". A naive
// array-subset check is therefore WRONG: a restricted parent (`['a','b']`) with an
// empty request (`[]`) must clamp to the parent — but `[] ⊆ ['a','b']` would
// "pass" while actually meaning the child got the WHOLE vault (a privilege
// escalation). So we model the ACCESSIBLE SET — `grants(list, id)` where an empty
// list grants every id (universe) and a non-empty list grants only its members —
// and assert the real invariant: anything the resolved scope can access, the
// parent could already access (`resolved-accessible ⊆ parent-accessible`).

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { resolveSubScope, deriveTokenScopes, type TrustScope } from './scope'

// ── Accessibility model (empty list = universe) ─────────────────────────────────
const keyOf = (id: unknown): string => String(id)

/**
 * Does `list` (a Trust_Scope list field) grant access to `candidateKey`?
 * Empty/absent = unrestricted ⇒ grants everything (the whole vault). Otherwise
 * access is granted only to members (compared by string form, ObjectId-safe).
 */
function grants(list: readonly unknown[] | undefined | null, candidateKey: string): boolean {
  if (!Array.isArray(list) || list.length === 0) return true
  return list.some((item) => keyOf(item) === candidateKey)
}

/**
 * Assert resolved-accessible ⊆ parent-accessible over a candidate universe that
 * spans every id either side mentions PLUS sentinel "outside" ids (to exercise
 * the empty-parent = universe case). For every candidate the resolved scope
 * grants, the parent must already grant it.
 */
function assertAccessibleSubset(
  parentList: readonly unknown[],
  requestedList: readonly unknown[],
  resolvedList: readonly unknown[],
  outsideSentinels: readonly string[],
): void {
  const candidates = new Set<string>([
    ...parentList.map(keyOf),
    ...requestedList.map(keyOf),
    ...resolvedList.map(keyOf),
    ...outsideSentinels,
  ])
  for (const candidate of candidates) {
    if (grants(resolvedList, candidate)) {
      // Resolved grants `candidate` ⇒ the parent must also grant it (subset).
      expect(grants(parentList, candidate)).toBe(true)
    }
  }
}

// ── Generators ──────────────────────────────────────────────────────────────────
// Small, overlapping label pools so independently-generated parent/requested
// arrays naturally produce overlaps, disjoint extras (request > parent), and
// empty (whole-vault) cases. Source ids are randomly emitted as a plain string OR
// an ObjectId-like `{ toString }` of the SAME label, exercising id normalization.
const SOURCE_LABELS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const
const COLLECTION_LABELS = ['research', 'personal', 'work', 'secret', 'archive'] as const

const sourceIdArb = fc
  .constantFrom(...SOURCE_LABELS)
  .chain((label) => fc.boolean().map((wrap) => (wrap ? { toString: () => label } : label)))

const sourceListArb = fc.array(sourceIdArb, { maxLength: 8 })
const collectionListArb = fc.array(fc.constantFrom(...COLLECTION_LABELS), { maxLength: 6 })
// Non-negative, finite token budgets up to a large ceiling (the realistic domain).
const budgetArb = fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true })

const trustScopeArb: fc.Arbitrary<TrustScope> = fc.record({
  readableSourceIds: sourceListArb,
  readableCollections: collectionListArb,
  webAccess: fc.boolean(),
  perRunTokenBudget: budgetArb,
})

describe('Property 8: Sub-agent and token scope never exceed the parent/agent scope (subset)', () => {
  it('resolves a Sub_Agent scope that is a SUBSET of the parent for any parent + any request (incl. requests for MORE)', () => {
    fc.assert(
      fc.property(trustScopeArb, trustScopeArb, (parent, requested) => {
        const resolved = resolveSubScope(parent, requested)

        // (1) accessible source set ⊆ parent's (empty parent = whole vault).
        assertAccessibleSubset(
          parent.readableSourceIds,
          requested.readableSourceIds,
          resolved.readableSourceIds,
          ['__outside_src_a__', '__outside_src_b__'],
        )

        // (2) accessible collection set ⊆ parent's (empty parent = all collections).
        assertAccessibleSubset(
          parent.readableCollections,
          requested.readableCollections,
          resolved.readableCollections,
          ['__outside_coll_a__', '__outside_coll_b__'],
        )

        // (3) webAccess ⇒ parent.webAccess (never true when the parent is false,
        //     even if the request asks for it).
        if (resolved.webAccess) {
          expect(parent.webAccess).toBe(true)
        }

        // (4) budget never exceeds the parent's, and is a finite, non-negative number.
        expect(resolved.perRunTokenBudget).toBeLessThanOrEqual(parent.perRunTokenBudget)
        expect(Number.isFinite(resolved.perRunTokenBudget)).toBe(true)
        expect(resolved.perRunTokenBudget).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 100 },
    )
  })

  it('is TOTAL — never throws and returns a well-formed scope, even on malformed/missing fields', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (parent, requested) => {
        const resolved = resolveSubScope(parent as unknown as TrustScope, requested as unknown as TrustScope)

        expect(Array.isArray(resolved.readableSourceIds)).toBe(true)
        expect(Array.isArray(resolved.readableCollections)).toBe(true)
        expect(typeof resolved.webAccess).toBe('boolean')
        // finiteOrZero guarantees a finite budget for ALL inputs (non-finite → 0).
        expect(Number.isFinite(resolved.perRunTokenBudget)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('derives a brain-token scope no broader than read-only for any Trust_Scope (never grants write) — Req 11.6', () => {
    // Mix well-formed Trust_Scopes with arbitrary junk to prove the derivation is
    // total and can never widen to a write-capable scope.
    const scopeOrJunkArb = fc.oneof(trustScopeArb, fc.anything() as fc.Arbitrary<TrustScope>)
    fc.assert(
      fc.property(scopeOrJunkArb, (trustScope) => {
        const scopes = deriveTokenScopes(trustScope)

        expect(Array.isArray(scopes)).toBe(true)
        // Never broader than read-only: 'write' must never appear.
        expect(scopes).not.toContain('write')
        // Every granted scope is exactly the read-only capability.
        for (const scope of scopes) {
          expect(scope).toBe('read')
        }
      }),
      { numRuns: 100 },
    )
  })
})
