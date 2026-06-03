import { describe, it, expect } from 'vitest'
import { SKILLS, SKILL_CATEGORIES, getSkill, toPublicSkill } from './catalog'
import { scanSkill } from './security-scan'

describe('skill catalog', () => {
  it('has at least 5 skills', () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(5)
  })

  it('ships a large library (100+ skills) for the Skills Library', () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(100)
  })

  // REGRESSION (prod bug, 2025): three first-party skills shipped with
  // `writesToVault: true` but `touches: ['vault-read']` and no `ingest` tool, so
  // the Security_Scan flagged a capability-mismatch and BLOCKED their install in
  // the live Skills Library. Every CURATED catalog skill must pass its own scan —
  // a first-party skill that can't be installed is a shipping bug.
  it('every catalog skill PASSES its own security scan (declared touches match behavior)', () => {
    for (const s of SKILLS) {
      const result = scanSkill(s)
      expect(result.status, `${s.name} failed scan: ${result.reasons.join(', ')}`).toBe('passed')
    }
  })

  // Guard the specific inconsistency that caused it: a skill that does NOT declare
  // vault-write must not claim writesToVault / carry the ingest tool, and vice-versa.
  it('writesToVault / ingest tool is consistent with the declared vault-write touch', () => {
    for (const s of SKILLS) {
      const writes = s.writesToVault || s.tools.includes('ingest')
      const declaresWrite = s.touches.includes('vault-write')
      expect(writes, `${s.name}: writesToVault/ingest must match touches vault-write`).toBe(declaresWrite)
    }
  })


  it('has unique skill ids', () => {
    const ids = SKILLS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every skill has a category that exists in SKILL_CATEGORIES', () => {
    const cats = new Set(SKILL_CATEGORIES.map(c => c.id))
    for (const s of SKILLS) {
      expect(cats.has(s.category)).toBe(true)
    }
  })

  it('every skill declares at least one tool and a prompt template', () => {
    for (const s of SKILLS) {
      expect(s.tools.length).toBeGreaterThan(0)
      expect(s.promptTemplate).toContain('{{objective}}')
    }
  })

  it('tools are restricted to the allowed set', () => {
    const allowed = new Set(['search', 'query', 'ingest'])
    for (const s of SKILLS) {
      for (const t of s.tools) expect(allowed.has(t)).toBe(true)
    }
  })

  it('manual schedule is implicitly available; schedules are valid', () => {
    const allowed = new Set(['manual', 'daily', 'weekly'])
    for (const s of SKILLS) {
      for (const sch of s.schedules) expect(allowed.has(sch)).toBe(true)
    }
  })

  it('getSkill finds by id and returns undefined for unknown', () => {
    expect(getSkill(SKILLS[0].id)?.id).toBe(SKILLS[0].id)
    expect(getSkill('does-not-exist')).toBeUndefined()
  })

  it('toPublicSkill strips the prompt template', () => {
    const pub = toPublicSkill(SKILLS[0]) as Record<string, unknown>
    expect(pub.promptTemplate).toBeUndefined()
    expect(pub.id).toBe(SKILLS[0].id)
  })
})
