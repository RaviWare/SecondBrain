// Unit tests for the status / Work_Board accent mapping (task 2.7).
//
// Validates: Requirements 6.5, 6.6, 6.7, 8.3
//
// Example-based pins for the exact decision tables. The universal "accent iff
// review" property over arbitrary inputs is covered separately by Property 17
// (task 2.12) — this file documents the concrete rules and the totality fallback.

import { describe, it, expect } from 'vitest'

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

describe('accentForStatus — status → accent decision table (Req 6.5, 6.6, 6.7)', () => {
  it('applies the accent ONLY to the review state', () => {
    expect(accentForStatus('review')).toBe(true)
  })

  it('never applies the accent to live / idle / paused / error', () => {
    expect(accentForStatus('live')).toBe(false)
    expect(accentForStatus('idle')).toBe(false)
    expect(accentForStatus('paused')).toBe(false)
    expect(accentForStatus('error')).toBe(false)
  })

  it('exactly one of the five statuses owns the accent', () => {
    const accented = AGENT_STATUSES.filter(accentForStatus)
    expect(accented).toEqual(['review'])
  })

  it('is total: an unknown/garbage status returns false and never throws', () => {
    const garbage = ['', 'REVIEW', 'running', 'unknown', undefined, null] as unknown as AgentStatus[]
    for (const s of garbage) {
      expect(() => accentForStatus(s)).not.toThrow()
      expect(accentForStatus(s)).toBe(false)
    }
  })
})

describe('accentForColumn — column → accent decision table (Req 8.3)', () => {
  it('applies the accent ONLY to the Review column', () => {
    expect(accentForColumn('review')).toBe(true)
  })

  it('never applies the accent to Queued / Reading / Connecting / Woven in', () => {
    expect(accentForColumn('queued')).toBe(false)
    expect(accentForColumn('reading')).toBe(false)
    expect(accentForColumn('connecting')).toBe(false)
    expect(accentForColumn('woven-in')).toBe(false)
  })

  it('exactly one of the five columns owns the accent', () => {
    const accented = WORK_BOARD_COLUMNS.filter(accentForColumn)
    expect(accented).toEqual(['review'])
  })

  it('preserves the canonical pipeline order', () => {
    expect([...WORK_BOARD_COLUMNS]).toEqual([
      'queued',
      'reading',
      'connecting',
      'review',
      'woven-in',
    ])
  })

  it('is total: an unknown/garbage column returns false and never throws', () => {
    const garbage = ['', 'Review', 'done', 'unknown', undefined, null] as unknown as WorkBoardColumn[]
    for (const c of garbage) {
      expect(() => accentForColumn(c)).not.toThrow()
      expect(accentForColumn(c)).toBe(false)
    }
  })
})

describe('accent token helpers (decision → token name, no raw colors)', () => {
  it('returns the reserved token for review status/column and null otherwise', () => {
    expect(accentTokenForStatus('review')).toBe(ACCENT_TOKEN)
    expect(accentTokenForStatus('live')).toBeNull()
    expect(accentTokenForColumn('review')).toBe(ACCENT_TOKEN)
    expect(accentTokenForColumn('queued')).toBeNull()
  })

  it('token presence matches the boolean decision for every status and column', () => {
    for (const s of AGENT_STATUSES) {
      expect(accentTokenForStatus(s) !== null).toBe(accentForStatus(s))
    }
    for (const c of WORK_BOARD_COLUMNS) {
      expect(accentTokenForColumn(c) !== null).toBe(accentForColumn(c))
    }
  })
})

describe('statusColorRole — full status color language (Req 6.5)', () => {
  it('maps each status to its color-language role', () => {
    expect(statusColorRole('live')).toBe('green')
    expect(statusColorRole('review')).toBe('accent')
    expect(statusColorRole('idle')).toBe('grey')
    expect(statusColorRole('paused')).toBe('disabled')
    expect(statusColorRole('error')).toBe('red')
  })

  it("'accent' role is returned IFF the status is accented (review only)", () => {
    for (const s of AGENT_STATUSES) {
      expect(statusColorRole(s) === 'accent').toBe(accentForStatus(s))
    }
  })

  it("is total: an unknown status falls back to 'grey', never 'accent'", () => {
    const role = statusColorRole('mystery' as AgentStatus)
    expect(role).toBe('grey')
    expect(role).not.toBe('accent')
  })
})
