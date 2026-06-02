// Feature: hermes-agents, Property 11: A disabled skill is never grantable and never invokable
//
// **Validates: Requirements 9.8, 9.12**
//
// Property 11 (design.md) — "a disabled skill is never grantable and never
// invokable". The grantability half (Req 9.8) is enforced at grant time by the
// async/DB `grantSkillToAgent` (pinned by example in `grant.test.ts`). This file
// targets the UNIVERSAL, run-time half (Req 9.12): the PURE invocability guards
// `invocableSkillIds` / `isSkillInvocable`, which decide which of an Agent's
// `assignedSkillIds` may actually be invoked during a Run. They are PURE / TOTAL /
// DETERMINISTIC (no I/O, clock, or randomness), so the property runs the REAL
// functions directly with no mocks.
//
// The invariant in plain terms: a Skill that is DISABLED (`enabled:false`) — or
// was uninstalled so it has NO install record at all — can never appear in the
// invocable set, regardless of whether it still lingers in `assignedSkillIds`
// (e.g. it was disabled AFTER it was granted). Conversely, every id the guard
// DOES return is genuinely invocable: assigned, installed, and enabled.
//
// ── Generators (why these shapes) ──────────────────────────────────────────────
// `assignedSkillIds` is drawn from a small id pool PLUS "outside" ids that are
// never installed, with duplicates allowed — so we exercise overlap, duplicate
// collapse, and assigned-but-not-installed ids. `installedRecords` carries UNIQUE
// skillIds (an install is keyed per user+skill in reality, so a skillId never
// appears twice) with `enabled` chosen randomly — so each run mixes enabled,
// disabled, and absent records freely.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { invocableSkillIds, isSkillInvocable, type InstalledSkillState } from './grant'

// ── Id pools ────────────────────────────────────────────────────────────────────
// A handful of installable skill ids, plus ids that NEVER get an install record
// (so "assigned but not installed" is always represented in the candidate space).
const SKILL_IDS = ['skill-a', 'skill-b', 'skill-c', 'skill-d', 'skill-e'] as const
const OUTSIDE_IDS = ['outside-1', 'outside-2'] as const

// ── Generators ──────────────────────────────────────────────────────────────────
// Assigned ids: any installable id OR an outside (never-installed) id; duplicates
// allowed so order-preservation + dedupe are exercised.
const assignedArb = fc.array(fc.constantFrom(...SKILL_IDS, ...OUTSIDE_IDS), { maxLength: 12 })

// Installed records: UNIQUE skillIds drawn from the installable pool, each with a
// random enabled flag. Uniqueness mirrors the real per-(user,skill) install key
// and makes "disabled" unambiguous (no two records for one id).
const installedRecordsArb = fc.uniqueArray(
  fc.record({ skillId: fc.constantFrom(...SKILL_IDS), enabled: fc.boolean() }),
  { selector: (r) => r.skillId, maxLength: SKILL_IDS.length },
)

describe('Property 11: A disabled skill is never grantable and never invokable', () => {
  it('never invokes a disabled/uninstalled skill, returns only enabled assigned skills, in first-occurrence order with no duplicates', () => {
    fc.assert(
      fc.property(assignedArb, installedRecordsArb, (assigned, records) => {
        const out = invocableSkillIds(assigned, records)

        // The full candidate universe: everything either side mentions, plus the
        // never-installed sentinels.
        const universe = new Set<string>([
          ...assigned,
          ...records.map((r) => r.skillId),
          ...OUTSIDE_IDS,
        ])

        // (1) NEVER-INVOKABLE — Property 11 core (Req 9.12). For EVERY id that is
        //     disabled (record exists, enabled !== true) OR has NO record at all,
        //     it is not invocable and is absent from the invocable set.
        for (const id of universe) {
          const rec = records.find((r) => r.skillId === id)
          const disabledOrMissing = !rec || rec.enabled !== true
          if (disabledOrMissing) {
            expect(isSkillInvocable(id, records)).toBe(false)
            expect(out).not.toContain(id)
          }
        }

        // (2) ONLY-ENABLED — the output is a subset of the genuinely-invocable
        //     set: every returned id was assigned, has an install record, and that
        //     record is enabled.
        for (const id of out) {
          expect(assigned).toContain(id)
          const rec = records.find((r) => r.skillId === id)
          expect(rec).toBeDefined()
          expect(rec!.enabled).toBe(true)
          expect(isSkillInvocable(id, records)).toBe(true)
        }

        // (3) ORDER + DEDUPE — output preserves first-occurrence order of
        //     `assigned` and contains no duplicates.
        expect(new Set(out).size).toBe(out.length)
        const expected: string[] = []
        const seen = new Set<string>()
        for (const id of assigned) {
          if (seen.has(id)) continue
          seen.add(id)
          if (isSkillInvocable(id, records)) expected.push(id)
        }
        expect(out).toEqual(expected)
      }),
      { numRuns: 100 },
    )
  })

  it('is TOTAL — never throws on null/undefined assigned, empty records, or malformed entries', () => {
    // Assigned: null / undefined / arrays of arbitrary junk (strings, real ids,
    // numbers, null, undefined).
    const assignedJunkArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.array(
        fc.oneof(
          fc.string(),
          fc.constantFrom(...SKILL_IDS),
          fc.integer(),
          fc.constant(null),
          fc.constant(undefined),
        ),
      ),
    )

    // Records: empty, or arrays mixing valid records with malformed entries
    // (null/undefined entries, records missing fields, arbitrary objects).
    const recordsJunkArb = fc.oneof(
      fc.constant([] as unknown[]),
      fc.array(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.record({ skillId: fc.constantFrom(...SKILL_IDS), enabled: fc.boolean() }),
          fc.record({ skillId: fc.string() }),
          fc.record({ enabled: fc.boolean() }),
          fc.anything(),
        ),
      ),
    )

    fc.assert(
      fc.property(assignedJunkArb, recordsJunkArb, (assigned, records) => {
        const recs = records as unknown as readonly InstalledSkillState[]
        expect(() =>
          invocableSkillIds(assigned as unknown as readonly string[] | null | undefined, recs),
        ).not.toThrow()

        const out = invocableSkillIds(
          assigned as unknown as readonly string[] | null | undefined,
          recs,
        )
        // Always a well-formed result: an array of non-empty strings, no dupes.
        expect(Array.isArray(out)).toBe(true)
        expect(new Set(out).size).toBe(out.length)
        for (const id of out) {
          expect(typeof id).toBe('string')
          expect(id.length).toBeGreaterThan(0)
        }

        // isSkillInvocable is likewise total against malformed records.
        expect(() => isSkillInvocable('skill-a', recs)).not.toThrow()
      }),
      { numRuns: 100 },
    )
  })
})
