// Property test for the status / Work_Board accent reservation (task 2.12).
//
// Validates: Requirements 6.5, 6.6, 6.7, 8.3
//
// The universal "warm accent IFF review" invariant over ARBITRARY inputs — both
// real union members AND unknown/garbage strings (totality). The exact decision
// tables and concrete examples are pinned separately in accent.test.ts.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  AGENT_STATUSES,
  WORK_BOARD_COLUMNS,
  ACCENT_TOKEN,
  accentForStatus,
  accentForColumn,
  accentTokenForStatus,
  accentTokenForColumn,
  statusColorRole,
  type AgentStatus,
  type WorkBoardColumn,
} from './accent'

// ── Generators ─────────────────────────────────────────────────────────────────
// Draw from the REAL unions so review is well represented, but also mix in
// unknown/garbage strings (and adversarial near-misses for 'review') so the
// property exercises totality: any non-`'review'` value — typed or not — must
// resolve to NO accent without throwing.

const GARBAGE = [
  '',
  'review ',
  ' review',
  'Review',
  'REVIEW',
  'reviewed',
  'running',
  'done',
  'unknown',
  'accent',
  'constructor',
  '__proto__',
] as const

// `as AgentStatus` / `as WorkBoardColumn` deliberately smuggle off-union values
// through the type boundary to prove the runtime fallback holds for real inputs
// that TypeScript can't catch (e.g. data from the DB / API).
const statusArb = fc.oneof(
  fc.constantFrom(...AGENT_STATUSES),
  fc.constantFrom(...(GARBAGE as readonly string[])),
  fc.string(),
) as fc.Arbitrary<AgentStatus>

const columnArb = fc.oneof(
  fc.constantFrom(...WORK_BOARD_COLUMNS),
  fc.constantFrom(...(GARBAGE as readonly string[])),
  fc.string(),
) as fc.Arbitrary<WorkBoardColumn>

// ── Property 17 ──────────────────────────────────────────────────────────────────
// Feature: hermes-agents, Property 17: The warm accent is reserved for the review state only
// Validates: Requirements 6.5, 6.6, 6.7, 8.3
describe('Property 17: The warm accent is reserved for the review state only', () => {
  it('applies the accent to an Agent status IFF the status is exactly "review" (Req 6.5, 6.6, 6.7)', () => {
    fc.assert(
      fc.property(statusArb, (status) => {
        const accented = accentForStatus(status)

        // The one rule: accent IFF the awaiting-sign-off / review state.
        expect(accented).toBe(status === 'review')

        // Token presence agrees with the boolean, and the token — when present —
        // is EXACTLY the single reserved accent token (review only).
        const token = accentTokenForStatus(status)
        expect(token !== null).toBe(accented)
        expect(token).toBe(accented ? ACCENT_TOKEN : null)

        // The 'accent' color ROLE is reserved to the accented state and no other.
        expect(statusColorRole(status) === 'accent').toBe(accented)
      }),
      { numRuns: 100 },
    )
  })

  it('applies the accent to a Work_Board column IFF the column is exactly the Review column (Req 8.3)', () => {
    fc.assert(
      fc.property(columnArb, (column) => {
        const accented = accentForColumn(column)

        // accent IFF the Review column (the Aegis_Gate); never the other four.
        expect(accented).toBe(column === 'review')

        const token = accentTokenForColumn(column)
        expect(token !== null).toBe(accented)
        expect(token).toBe(accented ? ACCENT_TOKEN : null)
      }),
      { numRuns: 100 },
    )
  })

  it('is total: arbitrary unknown/garbage status & column inputs never throw and never get the accent', () => {
    fc.assert(
      fc.property(
        // Exclude the only accent-bearing value so EVERY drawn input must be
        // accent-free; covers DB/API junk that bypasses the type system.
        fc.string().filter((s) => s !== 'review'),
        (junk) => {
          const s = junk as AgentStatus
          const c = junk as WorkBoardColumn

          expect(() => accentForStatus(s)).not.toThrow()
          expect(() => accentForColumn(c)).not.toThrow()
          expect(() => accentTokenForStatus(s)).not.toThrow()
          expect(() => accentTokenForColumn(c)).not.toThrow()
          expect(() => statusColorRole(s)).not.toThrow()

          expect(accentForStatus(s)).toBe(false)
          expect(accentForColumn(c)).toBe(false)
          expect(accentTokenForStatus(s)).toBeNull()
          expect(accentTokenForColumn(c)).toBeNull()
          // Garbage falls back to a neutral role, never the reserved 'accent'.
          expect(statusColorRole(s)).not.toBe('accent')
        },
      ),
      { numRuns: 100 },
    )
  })
})
