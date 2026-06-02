import { describe, it, expect } from 'vitest'
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

// ── roleDefaults ──────────────────────────────────────────────────────────────

describe('roleDefaults', () => {
  it('returns a well-formed default skill set for every role (each id resolves)', () => {
    for (const role of AGENT_ROLES) {
      const { skillIds } = roleDefaults(role)
      for (const id of skillIds) {
        expect(getSkill(id), `${role} → ${id} must resolve in the catalog`).toBeDefined()
      }
    }
  })

  it('sets every knowledge-write action to "ask" for every role (conservative)', () => {
    for (const role of AGENT_ROLES) {
      const { signOffPolicy } = roleDefaults(role)
      for (const action of KNOWLEDGE_WRITE_ACTIONS) {
        expect(signOffPolicy[action], `${role}.${action}`).toBe('ask')
      }
    }
  })

  it('defaults flagContradiction to the non-acting "notify" (not auto)', () => {
    for (const role of AGENT_ROLES) {
      expect(roleDefaults(role).signOffPolicy.flagContradiction).toBe('notify')
    }
  })

  it('gives non-custom roles at least one suggested skill', () => {
    const nonCustom = AGENT_ROLES.filter((r) => r !== 'custom')
    for (const role of nonCustom) {
      expect(roleDefaults(role).skillIds.length).toBeGreaterThan(0)
    }
  })

  it('gives the custom role a safe minimal (empty) default skill set', () => {
    expect(roleDefaults('custom').skillIds).toEqual([])
  })

  it('falls back to the conservative custom default for an unknown role', () => {
    const result = roleDefaults('nonsense' as AgentRole)
    expect(result.skillIds).toEqual([])
    expect(result.signOffPolicy).toEqual({
      ingestSource: 'ask',
      createSynthesis: 'ask',
      createConnection: 'ask',
      flagContradiction: 'notify',
    })
  })

  it('returns a fresh policy object per call (no shared mutable default)', () => {
    const a = roleDefaults('scout')
    a.signOffPolicy.ingestSource = 'auto'
    const b = roleDefaults('scout')
    expect(b.signOffPolicy.ingestSource).toBe('ask')
  })

  it('maps researcher to a research skill', () => {
    expect(roleDefaults('researcher').skillIds).toContain('research-analyst')
  })
})

// ── trustScopeStatement ─────────────────────────────────────────────────────────

const wholeVault: TrustScope = {
  readableSourceIds: [],
  readableCollections: [],
  webAccess: false,
  perRunTokenBudget: 0,
}

describe('trustScopeStatement', () => {
  it('always produces a non-empty "cannot" list (Property 21 core)', () => {
    const cases: TrustScope[] = [
      wholeVault,
      { readableSourceIds: ['s1'], readableCollections: [], webAccess: true, perRunTokenBudget: 5000 },
      { readableSourceIds: [], readableCollections: ['Calls'], webAccess: false, perRunTokenBudget: 0 },
      { readableSourceIds: ['a', 'b'], readableCollections: ['X'], webAccess: true, perRunTokenBudget: 100 },
    ]
    for (const scope of cases) {
      expect(trustScopeStatement(scope).cannotDo.length).toBeGreaterThan(0)
    }
  })

  it('denies web access by name when webAccess is false', () => {
    const { cannotDo } = trustScopeStatement(wholeVault)
    expect(cannotDo.some((c) => c.includes('web'))).toBe(true)
  })

  it('grants web access by name when webAccess is true and does not deny it', () => {
    const { canDo, cannotDo } = trustScopeStatement({ ...wholeVault, webAccess: true })
    expect(canDo.some((c) => c.includes('web'))).toBe(true)
    expect(cannotDo.some((c) => c.includes('access the web'))).toBe(false)
  })

  it('reads the whole vault when both sources and collections are unrestricted', () => {
    const { canDo } = trustScopeStatement(wholeVault)
    expect(canDo.some((c) => c.includes('entire vault'))).toBe(true)
  })

  it('denies out-of-scope sources by name when restricted', () => {
    const { canDo, cannotDo } = trustScopeStatement({
      ...wholeVault,
      readableSourceIds: ['src-1', 'src-2'],
    })
    expect(canDo.some((c) => c.includes('2 sources'))).toBe(true)
    expect(cannotDo.some((c) => c.includes('not explicitly granted'))).toBe(true)
  })

  it('names the granted collections and denies the others', () => {
    const { canDo, cannotDo } = trustScopeStatement({
      ...wholeVault,
      readableCollections: ['Research'],
    })
    expect(canDo.some((c) => c.includes('Research'))).toBe(true)
    expect(cannotDo.some((c) => c.includes('Research'))).toBe(true)
  })

  it('lists the per-run token budget when positive', () => {
    const { canDo } = trustScopeStatement({ ...wholeVault, perRunTokenBudget: 12000 })
    expect(canDo.some((c) => c.includes('12,000'))).toBe(true)
  })

  it('always includes the propose-never-write capability and the no-write denial', () => {
    const { canDo, cannotDo } = trustScopeStatement(wholeVault)
    expect(canDo.some((c) => c.includes('propose'))).toBe(true)
    expect(cannotDo.some((c) => c.includes('without your approval'))).toBe(true)
  })

  it('is total: a malformed scope degrades safely and never throws', () => {
    // @ts-expect-error — deliberately malformed input to exercise totality
    const stmt = trustScopeStatement({})
    expect(stmt.cannotDo.length).toBeGreaterThan(0)
    // Missing webAccess reads as false → web is denied.
    expect(stmt.cannotDo.some((c) => c.includes('web'))).toBe(true)
  })
})

// ── renderTrustScopeStatement ────────────────────────────────────────────────────

describe('renderTrustScopeStatement', () => {
  it('renders a plain-language statement that always contains a "Cannot" section', () => {
    const text = renderTrustScopeStatement(wholeVault)
    expect(text).toContain('This agent can:')
    expect(text).toContain('This agent cannot:')
    expect(text).toContain('Cannot')
  })
})
