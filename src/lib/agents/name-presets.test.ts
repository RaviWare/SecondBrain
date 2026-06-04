import { describe, it, expect } from 'vitest'
import {
  suggestNames,
  AGENT_NAME_PRESETS,
  SQUAD_PACKS,
  GENERAL_AGENT_NAMES,
} from './name-presets'
import { AGENT_ROLES } from './builder'

describe('name presets', () => {
  it('every role has at least 4 curated names', () => {
    for (const role of AGENT_ROLES) {
      expect(AGENT_NAME_PRESETS[role]?.length ?? 0).toBeGreaterThanOrEqual(4)
    }
  })

  it('suggestNames returns role-appropriate names', () => {
    const critic = suggestNames('critic', new Set(), 6)
    expect(critic.length).toBe(6)
    // Sentinel is a curated critic name.
    expect(critic.some((n) => n.name === 'Sentinel')).toBe(true)
  })

  it('falls back to general names when no role is given', () => {
    const out = suggestNames(undefined, new Set(), 4)
    expect(out.length).toBe(4)
    expect(GENERAL_AGENT_NAMES.some((g) => g.name === out[0].name)).toBe(true)
  })

  it('excludes already-taken names (case-insensitive)', () => {
    const taken = new Set(['sentinel', 'warden'])
    const out = suggestNames('critic', taken, 6)
    expect(out.some((n) => n.name.toLowerCase() === 'sentinel')).toBe(false)
    expect(out.some((n) => n.name.toLowerCase() === 'warden')).toBe(false)
  })

  it('tops up from the general pool if a role list is exhausted by taken names', () => {
    const allCritic = new Set(AGENT_NAME_PRESETS.critic.map((n) => n.name.toLowerCase()))
    const out = suggestNames('critic', allCritic, 6)
    // Should still return suggestions (from the general pool), none of them taken.
    expect(out.length).toBeGreaterThan(0)
    for (const n of out) expect(allCritic.has(n.name.toLowerCase())).toBe(false)
  })

  it('every name preset has a non-empty name and blurb', () => {
    for (const role of AGENT_ROLES) {
      for (const p of AGENT_NAME_PRESETS[role]) {
        expect(p.name.trim().length).toBeGreaterThan(0)
        expect(p.blurb.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('squad packs reference valid roles and have members', () => {
    const roles = new Set(AGENT_ROLES)
    for (const pack of SQUAD_PACKS) {
      expect(pack.members.length).toBeGreaterThan(0)
      expect(pack.squadName.trim().length).toBeGreaterThan(0)
      for (const m of pack.members) {
        expect(roles.has(m.role)).toBe(true)
        expect(m.name.trim().length).toBeGreaterThan(0)
      }
    }
  })
})
