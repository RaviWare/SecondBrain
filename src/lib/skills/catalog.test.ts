import { describe, it, expect } from 'vitest'
import { SKILLS, SKILL_CATEGORIES, getSkill, toPublicSkill } from './catalog'

describe('skill catalog', () => {
  it('has at least 5 skills', () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(5)
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
