// Feature: hermes-agents, Property 21: Role defaults are conservative and scope statements deny by name
//
// **Validates: Requirements 1.3, 1.8**
//
// Two halves, both run against the REAL pure functions (no mocks, no I/O):
//
//   (1) ROLE DEFAULTS ARE CONSERVATIVE (Req 1.3) — for ANY Agent_Role, AND for
//       arbitrary garbage role strings (totality), `roleDefaults(role)`:
//         • sets EVERY knowledge-write action (KNOWLEDGE_WRITE_ACTIONS) to `'ask'`
//           — ask-first for writes to knowledge structure (no auto-approved write),
//         • returns a WELL-FORMED skill set (every id resolves via `getSkill`),
//         • never throws.
//
//   (2) SCOPE STATEMENTS DENY BY NAME (Req 1.8) — for ARBITRARY Trust_Scopes
//       (sources/collections empty vs restricted, webAccess true/false, budgets
//       incl. 0 / negative / huge / non-finite), `trustScopeStatement(scope)`:
//         • produces a NON-EMPTY explicit "cannot" list ALWAYS,
//         • denies by name: no-web denial when `webAccess === false`; an
//           out-of-scope-read denial when sources are restricted,
//         • `canDo` reflects the scope (restricted sources → "read … granted";
//           unrestricted → whole-vault read),
//         • never throws on malformed scope;
//       and `renderTrustScopeStatement(scope)` always contains a "cannot" section.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  roleDefaults,
  trustScopeStatement,
  renderTrustScopeStatement,
  AGENT_ROLES,
  KNOWLEDGE_WRITE_ACTIONS,
  type AgentRole,
} from './role-defaults'
import { getSkill } from '@/lib/skills/catalog'
import type { TrustScope } from './scope'

// ── Generators ────────────────────────────────────────────────────────────────

// Any real Agent_Role OR an arbitrary/garbage string — exercises totality (an
// unknown role must still yield the conservative default, never throw).
const roleArb: fc.Arbitrary<AgentRole> = fc.oneof(
  fc.constantFrom(...AGENT_ROLES),
  fc.string() as fc.Arbitrary<AgentRole>,
)

// Budgets that span the full pathological domain: 0, negative, huge, and the
// non-finite values (NaN / ±Infinity) the generator must survive.
const budgetArb: fc.Arbitrary<number> = fc.oneof(
  fc.double({ noNaN: true, noDefaultInfinity: true }), // ordinary finite (incl. negative & huge)
  fc.constantFrom(0, -1, -100000, Number.MAX_VALUE, Infinity, -Infinity, NaN),
)

const sourceListArb = fc.array(fc.constantFrom('s1', 's2', 's3', 's4', 's5'), { maxLength: 6 })
const collectionListArb = fc.array(
  fc.constantFrom('Research', 'Calls', 'Personal', 'Work', 'Archive'),
  { maxLength: 5 },
)

// Arbitrary Trust_Scope: independently varies sources/collections (empty vs
// restricted), webAccess (true/false), and budget (0/negative/huge/non-finite).
const trustScopeArb: fc.Arbitrary<TrustScope> = fc.record({
  readableSourceIds: sourceListArb,
  readableCollections: collectionListArb,
  webAccess: fc.boolean(),
  perRunTokenBudget: budgetArb,
})

describe('Property 21: Role defaults are conservative and scope statements deny by name', () => {
  // ── (1) ROLE DEFAULTS CONSERVATIVE (Req 1.3) ──────────────────────────────────
  it('roleDefaults is conservative for ANY role: every knowledge-write action = "ask", skills well-formed, never throws', () => {
    fc.assert(
      fc.property(roleArb, (role) => {
        const result = roleDefaults(role)

        // Conservative: NO knowledge-write action ever auto-approves — all "ask".
        for (const action of KNOWLEDGE_WRITE_ACTIONS) {
          expect(result.signOffPolicy[action]).toBe('ask')
        }

        // Well-formed: every returned skill id resolves in the curated catalog.
        expect(Array.isArray(result.skillIds)).toBe(true)
        for (const id of result.skillIds) {
          expect(getSkill(id)).toBeDefined()
        }
      }),
      { numRuns: 100 },
    )
  })

  // ── (2) SCOPE STATEMENTS DENY BY NAME (Req 1.8) ───────────────────────────────
  it('trustScopeStatement denies by name for ANY scope: cannotDo non-empty, canDo reflects scope, never throws', () => {
    fc.assert(
      fc.property(trustScopeArb, (scope) => {
        const { canDo, cannotDo } = trustScopeStatement(scope)

        // cannotDo is ALWAYS non-empty — the core denials guarantee it.
        expect(cannotDo.length).toBeGreaterThanOrEqual(1)

        const sourcesRestricted = scope.readableSourceIds.length > 0
        const collectionsRestricted = scope.readableCollections.length > 0

        // Scope-derived denials by name:
        if (!scope.webAccess) {
          // No web access ⇒ an explicit "cannot … web" denial is present.
          expect(cannotDo.some((c) => c.includes('web'))).toBe(true)
        }
        if (sourcesRestricted) {
          // Restricted sources ⇒ an out-of-scope-read denial is named.
          expect(cannotDo.some((c) => c.includes('not explicitly granted'))).toBe(true)
        }

        // canDo reflects the scope's read reach.
        if (sourcesRestricted) {
          // Restricted sources → a "read … granted" capability is present.
          expect(canDo.some((c) => c.includes('granted'))).toBe(true)
        }
        if (!sourcesRestricted && !collectionsRestricted) {
          // Wholly unrestricted → whole-vault read capability.
          expect(canDo.some((c) => c.includes('entire vault'))).toBe(true)
        }

        // The defining, always-true capability: it proposes (never writes).
        expect(canDo.some((c) => c.includes('propose'))).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('renderTrustScopeStatement always contains a "cannot" section for ANY scope', () => {
    fc.assert(
      fc.property(trustScopeArb, (scope) => {
        const text = renderTrustScopeStatement(scope)
        expect(text).toContain('This agent cannot:')
        expect(text).toContain('Cannot')
      }),
      { numRuns: 100 },
    )
  })

  // ── Totality on fully malformed input (no type contract at all) ───────────────
  it('is TOTAL — never throws on arbitrary/malformed scope, and cannotDo stays non-empty', () => {
    fc.assert(
      fc.property(fc.anything(), (junk) => {
        const stmt = trustScopeStatement(junk as unknown as TrustScope)
        // Core denials guarantee a non-empty "cannot" list for ANY input shape.
        expect(stmt.cannotDo.length).toBeGreaterThanOrEqual(1)

        // renderTrustScopeStatement is equally total and always denies by name.
        const text = renderTrustScopeStatement(junk as unknown as TrustScope)
        expect(text).toContain('Cannot')
      }),
      { numRuns: 100 },
    )
  })
})
