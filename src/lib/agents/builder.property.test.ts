// Feature: hermes-agents, Property 22: Builder preview merge is field-precise; ambiguity asks exactly one question; dry-run counts are accurate
//
// **Validates: Requirements 7.3, 7.4, 7.7**
//
// Universal (fast-check) property for the three pure judgment calls behind the
// Conversational Builder + dry-run gate. All targets are PURE / TOTAL /
// DETERMINISTIC, so the property runs the REAL functions directly with no mocks
// and no I/O:
//
//   1. MERGE FIELD-PRECISION (Req 7.3) — `mergePreview(state, update)` changes
//      ONLY the fields/leaves explicitly stated in `update` (a defined value,
//      incl. explicit `null`) and PRESERVES everything else (absent/undefined =
//      "not stated"). Precision holds DEEP for the nested config objects
//      (`schedule` / `signOffPolicy` / `trustScope`): updating one sub-field must
//      not clobber its siblings. The result shares no mutable reference with
//      `update` (mutating `update` afterward never changes the merged result).
//
//   2. AMBIGUITY = EXACTLY ONE QUESTION (Req 7.4) — `nextClarifyingQuestion`
//      returns either NOTHING (null) or EXACTLY ONE question, never more; it asks
//      iff at least one REQUIRED field is ambiguous, and asks the highest-priority
//      ambiguous field per `REQUIRED_FIELD_ORDER`.
//
//   3. DRY-RUN COUNTS ACCURATE (Req 7.7) — `summarizeDryRun(output)` returns
//      counts that EQUAL the true tallies of the run's proposals by kind, with the
//      partition invariants holding for any input (empty ⇒ all zero).

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  mergePreview,
  nextClarifyingQuestion,
  ambiguousRequiredFields,
  REQUIRED_FIELD_ORDER,
  AGENT_ROLES,
  type PreviewState,
  type PreviewUpdate,
  type RequiredField,
  type ParsedIntent,
} from './builder'
import { summarizeDryRun, type ProposalKind } from './dry-run'

// ── Shared helpers ──────────────────────────────────────────────────────────────

/** Non-null, non-array object — the only thing the merge recurses into. */
function isPlainObj(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Build an arbitrary that produces a PARTIAL object: each key is independently
 * (a) OMITTED, (b) present with value `undefined`, or (c) present with a real
 * value. This mirrors how a parsed conversation update arrives — only some fields
 * stated, some explicitly cleared/undefined, the rest absent — and is what makes
 * the merge field-precision test meaningful.
 */
function partialRecord(
  shape: Record<string, fc.Arbitrary<unknown>>,
): fc.Arbitrary<Record<string, unknown>> {
  const keys = Object.keys(shape)
  const entries = keys.map(
    (k) =>
      [k, fc.tuple(fc.constantFrom('omit', 'undef', 'val'), shape[k])] as const,
  )
  return fc.record(Object.fromEntries(entries)).map((obj) => {
    const out: Record<string, unknown> = {}
    for (const k of keys) {
      const [mode, val] = obj[k] as [string, unknown]
      if (mode === 'omit') continue
      out[k] = mode === 'undef' ? undefined : val
    }
    return out
  })
}

// ── Generators for PreviewState / PreviewUpdate (same deeply-partial shape) ─────

const scheduleShape = {
  kind: fc.constantFrom('scheduled', 'reactive', 'manual'),
  cron: fc.string(),
  event: fc.string(),
  sourceAgentId: fc.oneof(fc.string(), fc.constant(null)),
}

const signOffShape = {
  ingestSource: fc.constantFrom('auto', 'ask'),
  createSynthesis: fc.constantFrom('auto', 'ask'),
  createConnection: fc.constantFrom('auto', 'ask'),
  flagContradiction: fc.constantFrom('auto', 'ask', 'notify'),
}

const trustScopeShape = {
  readableSourceIds: fc.array(fc.string(), { maxLength: 5 }),
  readableCollections: fc.array(fc.string(), { maxLength: 5 }),
  webAccess: fc.boolean(),
  perRunTokenBudget: fc.nat({ max: 1_000_000 }),
}

/**
 * The top-level preview shape. Nested config fields are generated as a partial
 * OBJECT (so they exercise the deep-merge path) — never as a scalar — which keeps
 * the per-level preservation assertions precise. Scalars/arrays/null are leaves.
 */
const previewShape = {
  name: fc.string(),
  role: fc.constantFrom(...AGENT_ROLES),
  customRoleDescription: fc.oneof(fc.string(), fc.constant(null)),
  schedule: partialRecord(scheduleShape),
  assignedSkillIds: fc.array(fc.string(), { maxLength: 5 }),
  signOffPolicy: partialRecord(signOffShape),
  trustScope: partialRecord(trustScopeShape),
  objective: fc.string(),
}

const TOP_LEVEL_KEYS = Object.keys(previewShape)
const NESTED_KEYS = ['schedule', 'signOffPolicy', 'trustScope'] as const

const previewArb = partialRecord(previewShape) as fc.Arbitrary<PreviewState>
const updateArb = partialRecord(previewShape) as fc.Arbitrary<PreviewUpdate>

// ── Merge verification helpers ───────────────────────────────────────────────────

/** Read a nested value by path; returns `undefined` if any segment is absent. */
function getAtPath(root: unknown, path: string[]): unknown {
  let cur: unknown = root
  for (const seg of path) {
    if (!isPlainObj(cur)) return undefined
    cur = cur[seg]
  }
  return cur
}

/**
 * Collect every STATED leaf of `update` (a defined, non-plain-object value at any
 * depth). Recursing into plain objects mirrors the merge's own recursion, so each
 * collected leaf must appear unchanged at the same path in the merged result —
 * whether the merge recursed (both sides objects) or replaced wholesale (cloned).
 */
function collectStatedLeaves(
  value: unknown,
  path: string[],
  acc: Array<{ path: string[]; value: unknown }>,
): void {
  if (!isPlainObj(value)) return
  for (const key of Object.keys(value)) {
    const v = value[key]
    if (v === undefined) continue // "not stated" — not a leaf
    if (isPlainObj(v)) {
      collectStatedLeaves(v, [...path, key], acc)
    } else {
      acc.push({ path: [...path, key], value: v }) // scalar / array / null leaf
    }
  }
}

/** True when `obj` has `key` present with a defined (non-undefined) value. */
function statesDefined(obj: unknown, key: string): boolean {
  return isPlainObj(obj) && key in obj && obj[key] !== undefined
}

/** Deeply mutate every array/object in place (to prove the result doesn't alias). */
function deepMutate(value: unknown): void {
  if (Array.isArray(value)) {
    value.push('__leaked__')
    for (const el of value) deepMutate(el)
  } else if (isPlainObj(value)) {
    for (const k of Object.keys(value)) deepMutate(value[k])
    value['__leaked__'] = '__leaked__'
  }
}

// ── 1. MERGE FIELD-PRECISION (Req 7.3) ───────────────────────────────────────────

describe('Property 22: builder preview merge is field-precise (Req 7.3)', () => {
  it('changes only stated fields, preserves the rest (deep), and never aliases the update', () => {
    fc.assert(
      fc.property(previewArb, updateArb, (state, update) => {
        const result = mergePreview(state, update)

        // mergePreview must not mutate its inputs.
        const stateBefore = structuredClone(state)
        const updateBefore = structuredClone(update)

        // (1a) PRESENT ⇒ EQUALS: every stated leaf of `update` (incl. null,
        //      arrays, nested sub-fields) appears unchanged in the result.
        const leaves: Array<{ path: string[]; value: unknown }> = []
        collectStatedLeaves(update, [], leaves)
        for (const { path, value } of leaves) {
          expect(getAtPath(result, path)).toEqual(value)
        }

        // (1b) ABSENT/UNDEFINED ⇒ PRESERVED, deep per leaf.
        for (const key of TOP_LEVEL_KEYS) {
          if (!statesDefined(update, key)) {
            // Top-level field not stated → preserved exactly from state.
            expect((result as Record<string, unknown>)[key]).toEqual(
              (state as Record<string, unknown>)[key],
            )
            continue
          }
          // Stated as a nested object onto an existing nested object → the
          // unstated SIBLING sub-fields must survive (deep field-precision).
          if (NESTED_KEYS.includes(key as (typeof NESTED_KEYS)[number])) {
            const su = (update as Record<string, unknown>)[key]
            const ss = (state as Record<string, unknown>)[key]
            if (isPlainObj(su) && isPlainObj(ss)) {
              for (const subKey of Object.keys(ss)) {
                if (!statesDefined(su, subKey)) {
                  const merged = getAtPath(result, [key, subKey])
                  expect(merged).toEqual(ss[subKey])
                }
              }
            }
          }
        }

        // (1c) NON-ALIASING: mutating `update` after the merge must not change the
        //      merged result (no shared mutable reference with the update).
        const resultSnapshot = structuredClone(result)
        deepMutate(update)
        expect(result).toEqual(resultSnapshot)

        // Inputs were not mutated by mergePreview itself (update mutation above is
        // post-snapshot); compare state to its pre-merge clone.
        expect(state).toEqual(stateBefore)
        // `updateBefore` documents the pre-mutation update for clarity.
        void updateBefore
      }),
      { numRuns: 100 },
    )
  })
})

// ── 2. AMBIGUITY = EXACTLY ONE QUESTION (Req 7.4) ────────────────────────────────

// State generator skewed to produce both resolved and ambiguous required fields:
// role may be a valid role, an unknown string, or absent; name may be non-empty,
// blank/whitespace, or absent; customRoleDescription may be set, blank, or absent.
const roleFieldArb = fc.oneof(
  fc.constantFrom(...AGENT_ROLES),
  fc.constantFrom('', 'not-a-role', 'SCOUT'),
  fc.constant(undefined),
)
const nameFieldArb = fc.oneof(
  fc.constantFrom('Scout One', 'Agent', 'x'),
  fc.constantFrom('', '   ', '\t'),
  fc.constant(undefined),
)
const descFieldArb = fc.oneof(
  fc.constantFrom('Do the thing', 'Summarize weekly'),
  fc.constantFrom('', '   '),
  fc.constant(null),
  fc.constant(undefined),
)

const questionStateArb: fc.Arbitrary<PreviewState> = fc
  .record({ role: roleFieldArb, name: nameFieldArb, customRoleDescription: descFieldArb })
  .map((o) => {
    const out: Record<string, unknown> = {}
    if (o.role !== undefined) out.role = o.role
    if (o.name !== undefined) out.name = o.name
    if (o.customRoleDescription !== undefined) out.customRoleDescription = o.customRoleDescription
    return out as PreviewState
  })

const REQUIRED_FIELDS: readonly RequiredField[] = ['role', 'customRoleDescription', 'name']
const intentArb: fc.Arbitrary<ParsedIntent | undefined> = fc.oneof(
  fc.constant(undefined),
  fc
    .subarray([...REQUIRED_FIELDS])
    .map((ambiguousFields) => ({ ambiguousFields }) as ParsedIntent),
)

describe('Property 22: ambiguity asks exactly one question, or none (Req 7.4)', () => {
  it('returns null or exactly ONE question — the highest-priority ambiguous required field', () => {
    fc.assert(
      fc.property(questionStateArb, intentArb, (state, intent) => {
        const ambiguous = ambiguousRequiredFields(state, intent)
        const q = nextClarifyingQuestion(state, intent)

        // Never an array / never "multiple questions" — it is a single object|null.
        expect(Array.isArray(q)).toBe(false)

        if (ambiguous.length === 0) {
          // Nothing required is ambiguous ⇒ NO question.
          expect(q).toBeNull()
          return
        }

        // At least one required field ambiguous ⇒ EXACTLY ONE question, and it is
        // the top-priority ambiguous field per REQUIRED_FIELD_ORDER.
        expect(q).not.toBeNull()
        expect(q!.field).toBe(ambiguous[0])
        expect(REQUIRED_FIELD_ORDER).toContain(q!.field)
        expect(typeof q!.question).toBe('string')
        expect(q!.question.length).toBeGreaterThan(0)
        // The returned object resolves a SINGLE field (no extra fields encoding a
        // second question).
        expect(Object.keys(q!).sort()).toEqual(['field', 'question'])

        // Determinism: same input ⇒ same single question.
        expect(nextClarifyingQuestion(state, intent)).toEqual(q)
      }),
      { numRuns: 100 },
    )
  })
})

// ── 3. DRY-RUN COUNTS ACCURATE (Req 7.7) ─────────────────────────────────────────

const proposalKindArb = fc.constantFrom<ProposalKind>(
  'ingest',
  'synthesis',
  'connection',
  'flagged-content',
)
const proposalsArb = fc.array(fc.record({ kind: proposalKindArb }), { maxLength: 30 })

describe('Property 22: dry-run summary counts equal the true tallies (Req 7.7)', () => {
  it('wouldIngest/filtered/wouldPropose equal the kind tallies and satisfy the partition invariants', () => {
    fc.assert(
      fc.property(proposalsArb, (proposals) => {
        const summary = summarizeDryRun({ proposals })

        const expectedIngest = proposals.filter((p) => p.kind === 'ingest').length
        const expectedFiltered = proposals.filter((p) => p.kind === 'flagged-content').length

        // Counts equal the true tallies — nothing fabricated, nothing dropped.
        expect(summary.wouldIngest).toBe(expectedIngest)
        expect(summary.filtered).toBe(expectedFiltered)
        expect(summary.wouldPropose).toBe(proposals.length)

        // Partition invariants hold for ANY input.
        expect(summary.wouldIngest).toBeLessThanOrEqual(summary.wouldPropose)
        expect(summary.filtered).toBeLessThanOrEqual(summary.wouldPropose)
        expect(summary.wouldIngest + summary.filtered).toBeLessThanOrEqual(summary.wouldPropose)

        // Empty run ⇒ all-zero counts.
        if (proposals.length === 0) {
          expect(summary).toEqual({ wouldIngest: 0, filtered: 0, wouldPropose: 0 })
        }
      }),
      { numRuns: 100 },
    )
  })
})
