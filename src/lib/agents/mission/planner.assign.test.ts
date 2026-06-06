// Feature: mission-orchestrator, Property 7: Every task is assigned exactly once, with Lead_Agent fallback
//
// **Validates: Requirements 2.3, 2.4**
//
// The role-fit assignment laws over ARBITRARY tasks / squads / Lead_Agent, run
// directly against the REAL pure `assignByRole` (no mocks, no I/O — it imports no
// model). The function turns each structural task into exactly one assigned
// `PlannedTask`:
//
//   • ROLE MATCH (Req 2.3) — a task whose role hint equals a Squad Agent's role
//     (matched case-insensitively + whitespace-insensitively) is assigned to that
//     Squad Agent with `assignmentFallback === false`. When several Squad members
//     share the normalized role the FIRST one wins (deterministic best-fit).
//   • LEAD FALLBACK (Req 2.4) — a task with no hint, an empty/whitespace hint, an
//     unknown role, or against an EMPTY squad is assigned to `leadAgentId` with
//     `assignmentFallback === true`.
//   • TOTALITY — every task ends up with EXACTLY ONE string `assignedAgentId`; the
//     output is one PlannedTask per input task, in input order. There is no
//     "unassigned" outcome.
//
// The oracle below mirrors the implementation's normalization (trim + lowercase) and
// "first-member-wins" rule, then the properties assert the function agrees with it
// for every generated scenario, including the empty-squad case where everything
// falls back to the lead.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { assignByRole, type SquadAgentRef } from './planner'

// ── Oracle helpers (mirror the implementation's matching semantics) ──────────────

/** Normalization the implementation applies to BOTH a role and a role hint. */
const normalize = (s: string): string => s.trim().toLowerCase()

/**
 * Build the normalized-role → agentId lookup the implementation uses: skip members
 * with a non-string/empty id, a non-string role, or an empty normalized role; the
 * FIRST member for a given normalized role wins.
 */
function buildRoleMap(squad: SquadAgentRef[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const member of squad) {
    if (!member || typeof member !== 'object') continue
    const { agentId, role } = member
    if (typeof agentId !== 'string' || agentId.length === 0) continue
    if (typeof role !== 'string') continue
    const norm = normalize(role)
    if (norm.length === 0) continue
    if (!m.has(norm)) m.set(norm, agentId)
  }
  return m
}

/** The expected fit (a squad agentId) for a task's hint, or `undefined` when none. */
function expectedFit(roleHint: string | undefined, roleMap: Map<string, string>): string | undefined {
  const hint = typeof roleHint === 'string' ? normalize(roleHint) : ''
  return hint.length > 0 ? roleMap.get(hint) : undefined
}

// ── Generators ───────────────────────────────────────────────────────────────────

// A small pool of roles so squad roles and task hints collide often — exercising the
// role-match path heavily rather than degenerating into all-fallback.
const ROLE_POOL = ['Researcher', 'Writer', 'Analyst', 'Engineer', 'Designer'] as const

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

// A pool role wrapped in arbitrary surrounding whitespace and re-cased. Every variant
// normalizes back to the same base role (base.toLowerCase()), so a decorated hint and
// a decorated role drawn from the same base ALWAYS match — this is what proves the
// case/whitespace-insensitive matching (Req 2.3).
const decoratedRoleArb: fc.Arbitrary<string> = fc
  .record({ base: fc.constantFrom(...ROLE_POOL), lead: wsArb, trail: wsArb, mode: caseArb })
  .map(({ base, lead, trail, mode }) => lead + applyCase(base, mode) + trail)

// Squad-member roles: a mix of pool roles (frequent matches), free-text roles, and
// empty/whitespace roles (which the matcher must ignore).
const squadRoleArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: decoratedRoleArb },
  { weight: 1, arbitrary: fc.string() },
  { weight: 1, arbitrary: wsArb },
)

// Task role hints: a pool role (matchable), free text (usually no fit), an explicit
// empty/whitespace hint, or NO hint at all — every fallback trigger is represented.
const hintArb: fc.Arbitrary<string | undefined> = fc.oneof(
  { weight: 3, arbitrary: decoratedRoleArb },
  { weight: 1, arbitrary: fc.string() },
  { weight: 1, arbitrary: wsArb },
  { weight: 1, arbitrary: fc.constant(undefined) },
)

// A full scenario: squad member roles (agentIds assigned by index → unique + valid),
// per-task role hints (keys assigned by index → unique), and a Lead_Agent id that is
// namespaced so it never collides with a squad agentId.
const scenarioArb = fc.record({
  squadRoles: fc.array(squadRoleArb, { maxLength: 6 }),
  taskHints: fc.array(hintArb, { maxLength: 8 }),
  leadSuffix: fc.string({ maxLength: 8 }),
})

interface Scenario {
  squad: SquadAgentRef[]
  tasks: Array<{ key: string; description: string; dependsOn: string[]; roleHint?: string }>
  lead: string
}

function buildScenario(raw: {
  squadRoles: string[]
  taskHints: Array<string | undefined>
  leadSuffix: string
}): Scenario {
  const squad: SquadAgentRef[] = raw.squadRoles.map((role, i) => ({ agentId: `a${i}`, role }))
  const tasks = raw.taskHints.map((roleHint, i) => ({
    key: `t${i}`,
    description: `task ${i}`,
    dependsOn: [],
    roleHint,
  }))
  // `lead_` prefix guarantees the lead id is distinct from every `a${i}` squad id, so
  // "role-matched goes to a Squad Agent, not the lead" is a meaningful assertion.
  return { squad, tasks, lead: `lead_${raw.leadSuffix}` }
}

describe('Property 7: Every task is assigned exactly once, with Lead_Agent fallback', () => {
  // ── (1) TOTALITY — one PlannedTask per task, each with exactly one string id ─────
  it('assigns every task exactly once: output is 1:1 with input, in order, each with a single string agentId', () => {
    fc.assert(
      fc.property(scenarioArb, (rawScenario) => {
        const { squad, tasks, lead } = buildScenario(rawScenario)
        const result = assignByRole(tasks, squad, lead)

        // One assigned task per input task, preserving order and keys (exactly once).
        expect(result).toHaveLength(tasks.length)
        for (let i = 0; i < tasks.length; i++) {
          expect(result[i].key).toBe(tasks[i].key)
          // "Exactly one assignedAgentId" — a single, present, string field.
          expect(typeof result[i].assignedAgentId).toBe('string')
          expect(typeof result[i].assignmentFallback).toBe('boolean')
        }
      }),
      { numRuns: 100 },
    )
  })

  // ── (2) ROLE MATCH (Req 2.3) — matched task → the matching Squad Agent, no fallback ─
  it('routes a role-matched task to the matching Squad Agent with assignmentFallback === false', () => {
    fc.assert(
      fc.property(scenarioArb, (rawScenario) => {
        const { squad, tasks, lead } = buildScenario(rawScenario)
        const roleMap = buildRoleMap(squad)
        const squadIds = new Set(squad.map((m) => m.agentId))
        const result = assignByRole(tasks, squad, lead)

        for (let i = 0; i < tasks.length; i++) {
          const fit = expectedFit(tasks[i].roleHint, roleMap)
          if (fit !== undefined) {
            // Assigned to the FIRST Squad member with the matching normalized role,
            // recorded as a non-fallback assignment to a real Squad Agent.
            expect(result[i].assignedAgentId).toBe(fit)
            expect(result[i].assignmentFallback).toBe(false)
            expect(squadIds.has(result[i].assignedAgentId)).toBe(true)
            expect(result[i].assignedAgentId).not.toBe(lead)
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  // ── (3) LEAD FALLBACK (Req 2.4) — no-fit task → the Lead_Agent, fallback recorded ──
  it('routes a no-fit task to the Lead_Agent with assignmentFallback === true', () => {
    fc.assert(
      fc.property(scenarioArb, (rawScenario) => {
        const { squad, tasks, lead } = buildScenario(rawScenario)
        const roleMap = buildRoleMap(squad)
        const result = assignByRole(tasks, squad, lead)

        for (let i = 0; i < tasks.length; i++) {
          const fit = expectedFit(tasks[i].roleHint, roleMap)
          if (fit === undefined) {
            // No Squad Agent fits → the Lead_Agent takes it, flagged as a fallback.
            expect(result[i].assignedAgentId).toBe(lead)
            expect(result[i].assignmentFallback).toBe(true)
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  // ── (4) EMPTY SQUAD — everything falls back to the Lead_Agent (Req 2.4) ──────────
  it('falls every task back to the Lead_Agent when the squad is empty', () => {
    fc.assert(
      fc.property(fc.array(hintArb, { maxLength: 8 }), fc.string({ maxLength: 8 }), (hints, leadSuffix) => {
        const lead = `lead_${leadSuffix}`
        const tasks = hints.map((roleHint, i) => ({
          key: `t${i}`,
          description: `task ${i}`,
          dependsOn: [],
          roleHint,
        }))
        const result = assignByRole(tasks, [], lead)

        expect(result).toHaveLength(tasks.length)
        for (const planned of result) {
          // With no Squad members there is no possible role fit — pure lead fallback.
          expect(planned.assignedAgentId).toBe(lead)
          expect(planned.assignmentFallback).toBe(true)
        }
      }),
      { numRuns: 100 },
    )
  })
})
