// Feature: mission-orchestrator, Property 6: Lead_Agent auto-selection picks an eligible agent independently of validation
//
// **Validates: Requirements 1.4, 1.8**
//
// The Lead_Agent auto-selection laws over ARBITRARY squads, run directly against the
// REAL pure `selectLeadAgent` (no mocks, no I/O — it imports no model). The route uses
// this to auto-select a Lead_Agent when the user picks none (Req 1.4), and it MUST be
// a self-contained pure function so the route can run it INDEPENDENTLY of the Objective
// validation (Req 1.6) and the Lead-eligibility validation (Req 1.5) — auto-selection
// reads ONLY the squad it is handed (Req 1.8).
//
// LEAD-ELIGIBILITY RULE (documented in planner.ts): a Squad member is Lead-eligible
// when its `role`, once trimmed + lower-cased, CONTAINS any of the lead-indicating
// keywords ['lead','leader','orchestrator','coordinator','manager'] as a SUBSTRING.
// The FIRST eligible member in squad order wins; `null` when none is eligible (incl.
// an empty or non-array squad). Members with a non-string/empty `agentId`, a non-string
// role, or an empty normalized role are skipped.
//
// The oracle below re-derives that rule independently (a substring scan over the same
// keyword set, normalized the same way) and the properties assert the function agrees
// with it for every generated scenario — mixing lead-indicating roles, plain non-lead
// roles, whitespace/empty roles, and garbage strings, plus the all-non-eligible and
// empty-squad cases.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { selectLeadAgent, type SquadAgentRef } from './planner'

// ── Independent oracle (mirrors the documented eligibility rule) ─────────────────

// The lead-indicating vocabulary, re-stated here so the oracle is genuinely
// independent of the implementation's own copy.
const LEAD_KEYWORDS = ['lead', 'leader', 'orchestrator', 'coordinator', 'manager'] as const

/** Normalization the implementation applies to a role before matching. */
const normalize = (s: string): string => s.trim().toLowerCase()

/** Is a single squad member Lead-eligible per the documented rule? */
function isEligible(member: SquadAgentRef): boolean {
  if (!member || typeof member !== 'object') return false
  const { agentId, role } = member as { agentId: unknown; role: unknown }
  if (typeof agentId !== 'string' || agentId.length === 0) return false
  if (typeof role !== 'string') return false
  const norm = normalize(role)
  if (norm.length === 0) return false
  return LEAD_KEYWORDS.some((keyword) => norm.includes(keyword))
}

/** The expected selection: the FIRST eligible member in squad order, else `null`. */
function expectedLead(squad: SquadAgentRef[]): SquadAgentRef | null {
  if (!Array.isArray(squad)) return null
  for (const member of squad) {
    if (isEligible(member)) return member
  }
  return null
}

// ── Generators ───────────────────────────────────────────────────────────────────

const WHITESPACE = ['', ' ', '  ', '\t', ' \t '] as const
const wsArb = fc.constantFrom(...WHITESPACE)

type CaseMode = 'as-is' | 'lower' | 'upper' | 'title'
const caseArb = fc.constantFrom<CaseMode>('as-is', 'lower', 'upper', 'title')

function applyCase(s: string, mode: CaseMode): string {
  switch (mode) {
    case 'lower':
      return s.toLowerCase()
    case 'upper':
      return s.toUpperCase()
    case 'title':
      return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
    default:
      return s
  }
}

// Free-text roles that CLEARLY indicate leadership — each normalizes to a string that
// contains one of the keywords as a substring, so the "contains" (not exact-match)
// rule must accept them (the real-world reading the design calls out).
const LEAD_ROLE_POOL = [
  'Team Lead',
  'Engineering Manager',
  'Coordinator',
  'Squad Orchestrator',
  'Lead Researcher',
  'Project Leader',
  'Ops Manager',
  'lead',
] as const

// Plain roles that do NOT contain any keyword substring — never Lead-eligible.
const NON_LEAD_ROLE_POOL = [
  'Researcher',
  'Writer',
  'Analyst',
  'Engineer',
  'Designer',
  'Scientist',
  'Editor',
] as const

/** Wrap a pool role in arbitrary surrounding whitespace + re-casing; the normalized
 *  form is unchanged, so a lead role stays lead-eligible and a non-lead role stays
 *  non-eligible — this is what proves the matching is case/whitespace-insensitive. */
const decoratedFrom = (pool: readonly string[]): fc.Arbitrary<string> =>
  fc
    .record({ base: fc.constantFrom(...pool), lead: wsArb, trail: wsArb, mode: caseArb })
    .map(({ base, lead, trail, mode }) => lead + applyCase(base, mode) + trail)

const leadRoleArb = decoratedFrom(LEAD_ROLE_POOL)
const plainNonLeadRoleArb = decoratedFrom(NON_LEAD_ROLE_POOL)

// Garbage free-text, filtered so it can NEVER accidentally contain a keyword (which
// would make it eligible). Used to harden the "no eligible ⇒ null" branch.
const garbageNonLeadArb = fc
  .string({ maxLength: 16 })
  .filter((s) => !LEAD_KEYWORDS.some((keyword) => normalize(s).includes(keyword)))

// A guaranteed NON-eligible role: a plain non-lead role, an empty/whitespace role, or
// filtered garbage.
const nonEligibleRoleArb = fc.oneof(
  { weight: 3, arbitrary: plainNonLeadRoleArb },
  { weight: 1, arbitrary: wsArb },
  { weight: 1, arbitrary: garbageNonLeadArb },
)

// A mixed role: lead-indicating, plain non-lead, empty/whitespace, or garbage. Drives
// the core "matches the oracle for any squad" property.
const mixedRoleArb = fc.oneof(
  { weight: 3, arbitrary: leadRoleArb },
  { weight: 3, arbitrary: plainNonLeadRoleArb },
  { weight: 1, arbitrary: wsArb },
  { weight: 1, arbitrary: fc.string({ maxLength: 16 }) },
)

/** Turn an array of roles into a squad, assigning a unique valid agentId by index. */
const squadFromRoles = (roles: string[]): SquadAgentRef[] =>
  roles.map((role, i) => ({ agentId: `a${i}`, role }))

const mixedSquadArb: fc.Arbitrary<SquadAgentRef[]> = fc
  .array(mixedRoleArb, { maxLength: 8 })
  .map(squadFromRoles)

const nonEligibleSquadArb: fc.Arbitrary<SquadAgentRef[]> = fc
  .array(nonEligibleRoleArb, { maxLength: 8 })
  .map(squadFromRoles)

// A squad GUARANTEED to contain ≥1 eligible member: arbitrary non-eligible members
// with one eligible member spliced in at an arbitrary index.
const squadWithEligibleArb: fc.Arbitrary<SquadAgentRef[]> = fc
  .record({
    others: fc.array(nonEligibleRoleArb, { maxLength: 7 }),
    leadRole: leadRoleArb,
    at: fc.nat(),
  })
  .map(({ others, leadRole, at }) => {
    const roles = [...others]
    const index = others.length === 0 ? 0 : at % (others.length + 1)
    roles.splice(index, 0, leadRole)
    return squadFromRoles(roles)
  })

// ── Property 6 ───────────────────────────────────────────────────────────────────
// Feature: mission-orchestrator, Property 6: Lead_Agent auto-selection picks an eligible agent independently of validation
// Validates: Requirements 1.4, 1.8
describe('Property 6: Lead_Agent auto-selection picks an eligible agent independently of validation', () => {
  // ── (1) CORE INVARIANT — verdict equals the independent oracle for ANY squad ──────
  // Over arbitrary mixed squads, `selectLeadAgent` returns EXACTLY the first eligible
  // member (by reference) or null — same as the independently-derived oracle.
  it('returns the first eligible member (or null), matching the independent oracle, for any squad', () => {
    fc.assert(
      fc.property(mixedSquadArb, (squad) => {
        let result!: SquadAgentRef | null
        expect(() => {
          result = selectLeadAgent(squad)
        }).not.toThrow()
        // Reference equality: the function returns the matched member object as-is.
        expect(result).toBe(expectedLead(squad))
      }),
      { numRuns: 200 },
    )
  })

  // ── (2) ≥1 ELIGIBLE — returns an eligible Agent, the FIRST in squad order (Req 1.4) ─
  it('returns an eligible Agent — the first eligible one in squad order — whenever the squad has one', () => {
    fc.assert(
      fc.property(squadWithEligibleArb, (squad) => {
        const result = selectLeadAgent(squad)
        // A lead is selected...
        expect(result).not.toBeNull()
        // ...it is genuinely eligible per the rule...
        expect(isEligible(result as SquadAgentRef)).toBe(true)
        // ...and it is specifically the FIRST eligible member in squad order.
        const firstEligible = squad.find((m) => isEligible(m)) ?? null
        expect(result).toBe(firstEligible)
        // Determinism: the same squad always yields the identical selection.
        expect(selectLeadAgent(squad)).toBe(result)
      }),
      { numRuns: 100 },
    )
  })

  // ── (3) INDEPENDENCE (Req 1.8) — the result reads ONLY the squad ──────────────────
  // The other two Mission-creation checks (Objective validation Req 1.6, Lead-
  // eligibility validation Req 1.5) are modelled as arbitrary flags that are POINTEDLY
  // NOT passed to `selectLeadAgent`. Auto-selection proceeds and yields the same result
  // regardless of them — even when the objective is empty (the Mission would be rejected
  // by Req 1.6), an eligible squad still auto-selects its first eligible lead.
  it('yields its result from the squad alone, independent of objective validity / eligibility verdict', () => {
    fc.assert(
      fc.property(
        squadWithEligibleArb,
        fc.boolean(), // "objective is empty" — would reject the Mission under Req 1.6
        fc.boolean(), // an external eligibility verdict — irrelevant to this function
        (squad, objectiveIsEmpty, externalVerdict) => {
          void objectiveIsEmpty
          void externalVerdict
          const result = selectLeadAgent(squad)
          // Decoupled from the other validations: still selects the first eligible lead.
          const firstEligible = squad.find((m) => isEligible(m)) ?? null
          expect(result).toBe(firstEligible)
          expect(result).not.toBeNull()
        },
      ),
      { numRuns: 100 },
    )
  })

  // ── (4) NO ELIGIBLE — returns null (incl. the empty squad) (Req 1.5 signal) ───────
  it('returns null when no member is eligible, including the empty squad', () => {
    fc.assert(
      fc.property(nonEligibleSquadArb, (squad) => {
        // Sanity: the generator really produced an all-non-eligible squad.
        expect(expectedLead(squad)).toBeNull()
        expect(selectLeadAgent(squad)).toBeNull()
      }),
      { numRuns: 100 },
    )
  })

  it('returns null for the empty squad', () => {
    expect(selectLeadAgent([])).toBeNull()
  })
})
