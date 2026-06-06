// ── Mission / MissionTask model smoke + static schema introspection test ─────────
// Task 2.2 (Phase 2 — additive persistence). A CONNECTION-FREE static test: importing
// `@/lib/models` pulls in mongoose and registers the schemas, but we never call
// `mongoose.connect`. We only inspect the in-memory `Schema` (paths, refs, indexes,
// enum values), exactly like a compile-time guard. This mirrors how existing model
// tests (e.g. `src/lib/skills/install.test.ts`) import `@/lib/models` directly.
//
// It asserts the four guarantees Phase 2 must hold (Req 12.1, 12.2, 12.3, 12.5):
//   1. The new `Mission` + `MissionTask` schemas exist and reference the existing
//      Agent / AgentRun / Proposal collections by ObjectId + ref ONLY (no embedded
//      copies of their data) — Req 12.1, 12.2.
//   2. The partial-unique `{ missionId, key }` index is declared on MissionTask.
//   3. The Mission `{ userId }` and `{ userId, lifecycle }` indexes are declared.
//   4. Strictly ADDITIVE: no existing field on Agent / AgentRun / Proposal was altered
//      or removed — a field-list comparison guards against accidental edits (Req 12.3).
//   5. The persisted enums stay in sync with the pure cores' unions: Mission.lifecycle
//      == MISSION_STATES (lifecycle FSM) and MissionTask.status == the TaskStatus set.

import { describe, it, expect } from 'vitest'
import type { Schema } from 'mongoose'
import { Mission, MissionTask, Agent, AgentRun, Proposal } from '@/lib/models'
import { MISSION_STATES } from '@/lib/agents/mission/lifecycle'
import { TASK_STATUSES } from '@/lib/agents/mission/timeline'

// ── Introspection helpers ────────────────────────────────────────────────────────

/**
 * Resolve the `ref` declared on a path that is an ObjectId (or an array of ObjectIds),
 * asserting the path both EXISTS and is ObjectId-typed (never an embedded copy of the
 * referenced collection's data). Returns the declared `ref` collection name.
 */
function objectIdRef(schema: Schema, pathName: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = schema.path(pathName)
  expect(p, `path "${pathName}" should exist`).toBeTruthy()

  // Single ObjectId: `{ type: ObjectId, ref }`.
  if (/objectid/i.test(p.instance)) {
    return p.options?.ref as string | undefined
  }
  // Array of ObjectId: `[{ type: ObjectId, ref }]`. The element type lives on
  // `embeddedSchemaType` (mongoose 9.x) or `caster` (older), depending on version.
  if (p.instance === 'Array') {
    const element = p.embeddedSchemaType ?? p.caster
    if (element && /objectid/i.test(element.instance)) {
      return element.options?.ref as string | undefined
    }
  }
  throw new Error(`path "${pathName}" is not ObjectId-typed (instance=${p.instance})`)
}

/** The embedded subdocument schema behind a DocumentArray path (e.g. Mission.handoffs). */
function subSchema(schema: Schema, pathName: string): Schema {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = schema.path(pathName)
  expect(p, `array path "${pathName}" should exist`).toBeTruthy()
  expect(p.schema, `path "${pathName}" should carry an embedded schema`).toBeTruthy()
  return p.schema as Schema
}

/** Does the schema declare an index whose key spec deep-equals `fields` (+ optional opts)? */
function hasIndex(
  schema: Schema,
  fields: Record<string, 1 | -1>,
  optionPredicate?: (opts: Record<string, unknown>) => boolean,
): boolean {
  const target = JSON.stringify(fields)
  return schema.indexes().some(([f, opts]) => {
    if (JSON.stringify(f) !== target) return false
    return optionPredicate ? optionPredicate((opts ?? {}) as Record<string, unknown>) : true
  })
}

// ── 1. Schemas exist + cross-collection references are ObjectId/ref only ──────────

describe('Mission / MissionTask schemas exist and reference existing collections by id only (Req 12.1, 12.2)', () => {
  it('registers the two new models with a Schema', () => {
    expect(Mission?.schema, 'Mission model should exist').toBeTruthy()
    expect(MissionTask?.schema, 'MissionTask model should exist').toBeTruthy()
    expect(Mission.modelName).toBe('Mission')
    expect(MissionTask.modelName).toBe('MissionTask')
  })

  it('Mission references Agent / AgentRun / Proposal via ObjectId + ref only', () => {
    // Lead_Agent (top-level ObjectId → Agent).
    expect(objectIdRef(Mission.schema, 'leadAgentId')).toBe('Agent')

    // Embedded handoffs[] carry the producing Run + emitted Proposals BY ID.
    const handoff = subSchema(Mission.schema, 'handoffs')
    expect(objectIdRef(handoff, 'runId')).toBe('AgentRun')
    expect(objectIdRef(handoff, 'proposalIds')).toBe('Proposal')

    // Embedded mentions[] reference Agents BY ID.
    const mention = subSchema(Mission.schema, 'mentions')
    expect(objectIdRef(mention, 'byAgentId')).toBe('Agent')
    expect(objectIdRef(mention, 'referencedAgentId')).toBe('Agent')
  })

  it('MissionTask references Agent / Mission / AgentRun / Proposal via ObjectId + ref only', () => {
    expect(objectIdRef(MissionTask.schema, 'assignedAgentId')).toBe('Agent')
    expect(objectIdRef(MissionTask.schema, 'missionId')).toBe('Mission')
    // outputRef is a REFERENCE to the originating Run + its emitted Proposals (Req 12.2).
    expect(objectIdRef(MissionTask.schema, 'outputRef.runId')).toBe('AgentRun')
    expect(objectIdRef(MissionTask.schema, 'outputRef.proposalIds')).toBe('Proposal')
  })
})

// ── 2. The partial-unique { missionId, key } index on MissionTask ─────────────────

describe('MissionTask declares the partial-unique { missionId, key } index', () => {
  it('has a unique index on { missionId: 1, key: 1 } with a partialFilterExpression', () => {
    const found = hasIndex(
      MissionTask.schema,
      { missionId: 1, key: 1 },
      (opts) =>
        opts.unique === true &&
        typeof opts.partialFilterExpression === 'object' &&
        opts.partialFilterExpression !== null,
    )
    expect(found, 'partial-unique { missionId, key } index should be declared').toBe(true)
  })
})

// ── 3. The Mission { userId } and { userId, lifecycle } indexes ───────────────────

describe('Mission declares its list/filter indexes', () => {
  it('has { userId: 1 }', () => {
    expect(hasIndex(Mission.schema, { userId: 1 })).toBe(true)
  })
  it('has { userId: 1, lifecycle: 1 }', () => {
    expect(hasIndex(Mission.schema, { userId: 1, lifecycle: 1 })).toBe(true)
  })
})

// ── 4. Strictly additive: no existing field altered/removed (Req 12.3) ────────────
// Field-list comparison: enumerate the KNOWN existing top-level + nested-leaf paths of
// Agent / AgentRun / Proposal and assert every one is still present. This guards
// against an accidental edit/removal on those models while adding the mission layer.

const AGENT_EXPECTED_PATHS = [
  '_id',
  'userId',
  'name',
  'role',
  'customRoleDescription',
  'schedule',
  'assignedSkillIds',
  'signOffPolicy.ingestSource',
  'signOffPolicy.createSynthesis',
  'signOffPolicy.createConnection',
  'signOffPolicy.flagContradiction',
  'trustScope.readableSourceIds',
  'trustScope.readableCollections',
  'trustScope.webAccess',
  'trustScope.perRunTokenBudget',
  'trustScopeStatement',
  'trustScore',
  'budget.period',
  'budget.tokenCap',
  'budget.tokensThisPeriod',
  'budget.periodStart',
  'autoFix.enabled',
  'autoFix.retryTransient',
  'autoFix.autoRaiseBudget',
  'autoFix.budgetCeiling',
  'autoFix.autoApplyLowStakes',
  'autoFix.proposeScopeChanges',
  'lifecycle',
  'hadSuccessfulDryRun',
  'budgetPaused',
  'parentAgentId',
  'userAgentId',
  'tokenId',
  'createdAt',
  'updatedAt',
]

const AGENT_RUN_EXPECTED_PATHS = [
  '_id',
  'userId',
  'agentId',
  'parentRunId',
  'trigger',
  'dryRun',
  'status',
  'outcome',
  'failureReason',
  'trace',
  'tokensUsed',
  'perRunBudget',
  'proposalIds',
  'scopeViolations',
  'carryOver.pending',
  'carryOver.note',
  'startedAt',
  'finishedAt',
  'createdAt',
  'updatedAt',
]

const PROPOSAL_EXPECTED_PATHS = [
  '_id',
  'userId',
  'agentId',
  'runId',
  'parentProposalId',
  'kind',
  'title',
  'rationale',
  'citations',
  'plan',
  'stakes',
  'status',
  'scanResult',
  'affectedPages',
  'failureReason',
  'undo',
  'decidedBy',
  'decidedAt',
  'createdAt',
  'updatedAt',
]

describe('Additive, non-breaking guarantee — existing models are untouched (Req 12.3)', () => {
  it.each([
    ['Agent', () => Agent, AGENT_EXPECTED_PATHS],
    ['AgentRun', () => AgentRun, AGENT_RUN_EXPECTED_PATHS],
    ['Proposal', () => Proposal, PROPOSAL_EXPECTED_PATHS],
  ] as const)('%s still has every known existing field', (_name, getModel, expected) => {
    const paths = Object.keys(getModel().schema.paths)
    for (const p of expected) {
      expect(paths, `${_name} should still declare "${p}"`).toContain(p)
    }
  })
})

// ── 5. Persisted enums stay in sync with the pure-core unions ─────────────────────

describe('Persisted enums match the pure-core unions', () => {
  it('Mission.lifecycle enum equals MISSION_STATES (lifecycle FSM)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enumValues = (Mission.schema.path('lifecycle') as any).enumValues as string[]
    expect([...enumValues].sort()).toEqual([...MISSION_STATES].sort())
  })

  it('MissionTask.status enum equals the TaskStatus set (TASK_STATUSES)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enumValues = (MissionTask.schema.path('status') as any).enumValues as string[]
    expect([...enumValues].sort()).toEqual([...TASK_STATUSES].sort())
  })
})
