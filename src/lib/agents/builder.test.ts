// Unit tests for the Conversational Builder core (task 4.3): `mergePreview`
// field-precision (incl. deep nested config objects) and the
// `nextClarifyingQuestion` exactly-one-question rule. These pin the concrete
// behavior behind Property 22 ("Builder preview merge is field-precise; ambiguity
// asks exactly one question; …"); the universal fast-check property is task 4.9
// (separate/optional).
//
// `mergePreview` and `nextClarifyingQuestion` are PURE / TOTAL / DETERMINISTIC, so
// they are tested directly with no I/O and no mocks.

import { describe, it, expect } from 'vitest'

import {
  mergePreview,
  nextClarifyingQuestion,
  ambiguousRequiredFields,
  REQUIRED_FIELD_ORDER,
  type PreviewState,
} from './builder'

// A fully-populated, unambiguous preview to mutate in field-precision tests.
function fullPreview(overrides: Partial<PreviewState> = {}): PreviewState {
  return {
    name: 'Scout One',
    role: 'scout',
    customRoleDescription: null,
    schedule: { kind: 'scheduled', cron: '0 9 * * *' },
    assignedSkillIds: ['skill-a', 'skill-b'],
    signOffPolicy: {
      ingestSource: 'ask',
      createSynthesis: 'ask',
      createConnection: 'ask',
      flagContradiction: 'notify',
    },
    trustScope: {
      readableSourceIds: ['src-1'],
      readableCollections: ['col-1'],
      webAccess: false,
      perRunTokenBudget: 5000,
    },
    objective: 'Find new sources about distributed systems.',
    ...overrides,
  }
}

describe('mergePreview — top-level field precision', () => {
  it('changes only the stated field and preserves all others', () => {
    const state = fullPreview()
    const result = mergePreview(state, { name: 'Renamed Scout' })

    expect(result.name).toBe('Renamed Scout')
    // Everything else is byte-for-byte preserved.
    expect(result.role).toBe(state.role)
    expect(result.schedule).toEqual(state.schedule)
    expect(result.assignedSkillIds).toEqual(state.assignedSkillIds)
    expect(result.signOffPolicy).toEqual(state.signOffPolicy)
    expect(result.trustScope).toEqual(state.trustScope)
    expect(result.objective).toBe(state.objective)
  })

  it('treats an absent key as "not stated" (preserves the existing value)', () => {
    const state = fullPreview()
    const result = mergePreview(state, {})
    expect(result).toEqual(state)
  })

  it('treats an explicit undefined as "not stated" (does not clobber a set value)', () => {
    const state = fullPreview()
    const result = mergePreview(state, { name: undefined, role: undefined })
    expect(result.name).toBe(state.name)
    expect(result.role).toBe(state.role)
  })

  it('honors an explicit null as a stated value (clears the field)', () => {
    const state = fullPreview({ customRoleDescription: 'old description' })
    const result = mergePreview(state, { customRoleDescription: null })
    expect(result.customRoleDescription).toBeNull()
  })

  it('does not mutate the input state or the update', () => {
    const state = fullPreview()
    const stateSnapshot = JSON.parse(JSON.stringify(state))
    const update: PreviewState = { signOffPolicy: { ingestSource: 'auto' } }
    const updateSnapshot = JSON.parse(JSON.stringify(update))

    mergePreview(state, update)

    expect(state).toEqual(stateSnapshot)
    expect(update).toEqual(updateSnapshot)
  })
})

describe('mergePreview — deep precision on nested config objects', () => {
  it('signOffPolicy: updating one sub-field preserves its siblings', () => {
    const state = fullPreview()
    const result = mergePreview(state, { signOffPolicy: { ingestSource: 'auto' } })

    expect(result.signOffPolicy).toEqual({
      ingestSource: 'auto', // changed
      createSynthesis: 'ask', // preserved
      createConnection: 'ask', // preserved
      flagContradiction: 'notify', // preserved
    })
  })

  it('trustScope: updating one leaf preserves the other leaves', () => {
    const state = fullPreview()
    const result = mergePreview(state, { trustScope: { webAccess: true } })

    expect(result.trustScope).toEqual({
      readableSourceIds: ['src-1'], // preserved
      readableCollections: ['col-1'], // preserved
      webAccess: true, // changed
      perRunTokenBudget: 5000, // preserved
    })
  })

  it('schedule: updating one field preserves the other discriminated fields', () => {
    const state = fullPreview({ schedule: { kind: 'scheduled', cron: '0 9 * * *' } })
    const result = mergePreview(state, { schedule: { cron: '0 18 * * *' } })

    expect(result.schedule).toEqual({ kind: 'scheduled', cron: '0 18 * * *' })
  })

  it('replaces array leaves wholesale (does not element-merge)', () => {
    const state = fullPreview({ assignedSkillIds: ['a', 'b', 'c'] })
    const result = mergePreview(state, { assignedSkillIds: ['x'] })
    expect(result.assignedSkillIds).toEqual(['x'])
  })

  it('a nested undefined sub-field is preserved, not cleared', () => {
    const state = fullPreview()
    const result = mergePreview(state, {
      signOffPolicy: { ingestSource: 'auto', createSynthesis: undefined },
    })
    expect(result.signOffPolicy?.ingestSource).toBe('auto')
    expect(result.signOffPolicy?.createSynthesis).toBe('ask') // preserved
  })

  it('introduces a nested object when the base had none', () => {
    const state: PreviewState = { name: 'Bare', role: 'scout' }
    const result = mergePreview(state, { trustScope: { webAccess: true } })
    expect(result.trustScope).toEqual({ webAccess: true })
    expect(result.name).toBe('Bare')
  })

  it('does not share mutable references with the update (deep clone of changed values)', () => {
    const state = fullPreview()
    const update: PreviewState = { trustScope: { readableSourceIds: ['new-src'] } }
    const result = mergePreview(state, update)

    // Mutating the update after merging must not affect the merged result.
    update.trustScope!.readableSourceIds!.push('leaked')
    expect(result.trustScope?.readableSourceIds).toEqual(['new-src'])
  })

  it('is total on non-object inputs (treats them as empty)', () => {
    expect(mergePreview(undefined as unknown as PreviewState, { name: 'X' })).toEqual({ name: 'X' })
    expect(mergePreview(fullPreview(), undefined as unknown as PreviewState)).toEqual(fullPreview())
  })
})

describe('nextClarifyingQuestion — exactly one, or none', () => {
  it('returns null when all required fields are unambiguous', () => {
    expect(nextClarifyingQuestion(fullPreview())).toBeNull()
  })

  it('asks for role first when role is missing', () => {
    const q = nextClarifyingQuestion({ name: 'Has name' })
    expect(q).not.toBeNull()
    expect(q!.field).toBe('role')
  })

  it('asks for customRoleDescription only when role is custom and it is blank', () => {
    const q = nextClarifyingQuestion({ name: 'Named', role: 'custom' })
    expect(q!.field).toBe('customRoleDescription')

    // Provided custom description → no longer ambiguous.
    expect(
      nextClarifyingQuestion({ name: 'Named', role: 'custom', customRoleDescription: 'Do X' }),
    ).toBeNull()
  })

  it('does not ask for customRoleDescription for a non-custom role', () => {
    const fields = ambiguousRequiredFields({ name: 'Named', role: 'scout' })
    expect(fields).not.toContain('customRoleDescription')
    expect(nextClarifyingQuestion({ name: 'Named', role: 'scout' })).toBeNull()
  })

  it('asks for name last when only the name is missing', () => {
    const q = nextClarifyingQuestion({ role: 'scout' })
    expect(q!.field).toBe('name')
  })

  it('emits the highest-priority field when several are ambiguous (still exactly one)', () => {
    // role AND name both unresolved → role wins over name in priority.
    const state: PreviewState = {}
    expect(ambiguousRequiredFields(state)).toEqual(['role', 'name'])

    const q = nextClarifyingQuestion(state)
    expect(q!.field).toBe('role')

    // The selector returns a single object — never an array/more than one.
    expect(Array.isArray(q)).toBe(false)
  })

  it('asks customRoleDescription (not name) when role=custom and both desc+name pending', () => {
    // role is set (custom) so it is unambiguous; customRoleDescription outranks name.
    const state: PreviewState = { role: 'custom' }
    expect(ambiguousRequiredFields(state)).toEqual(['customRoleDescription', 'name'])
    expect(nextClarifyingQuestion(state)!.field).toBe('customRoleDescription')
  })

  it('respects parser-flagged ambiguity even when a value is present', () => {
    const state = fullPreview() // role + name set
    const q = nextClarifyingQuestion(state, { ambiguousFields: ['role'] })
    expect(q!.field).toBe('role')
  })

  it('whitespace-only name counts as missing', () => {
    const q = nextClarifyingQuestion({ role: 'scout', name: '   ' })
    expect(q!.field).toBe('name')
  })

  it('REQUIRED_FIELD_ORDER drives priority (role → customRoleDescription → name)', () => {
    expect(REQUIRED_FIELD_ORDER).toEqual(['role', 'customRoleDescription', 'name'])
  })
})
