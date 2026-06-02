// Property test for the Squad Dashboard tallies (task 3.5).
//
// Feature: hermes-agents, Property 19: Dashboard counts equal the true tallies (no fabricated data)
// Validates: Requirements 6.1, 6.2
//
// The universal claim over ARBITRARY Agents / Proposals / Logs: every one of the
// six dashboard counts `tallyDashboard` returns EQUALS an INDEPENDENT, from-scratch
// recomputation of the true tally (an oracle computed differently than the
// implementation — `filter().length` over ground-truth spec fields rather than the
// implementation's `reduce` + shared predicates), and no count is ever fabricated
// (empty inputs → all zero; every count is a non-negative integer that can never
// exceed the population of the relevant record type). The exact counting rules and
// concrete examples are pinned separately in dashboard-tally.test.ts (task 3.1).

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  tallyDashboard,
  type AgentTallyRow,
  type ProposalTallyRow,
  type LogTallyRow,
  type AgentLifecycle,
  type DashboardTallyInput,
} from './dashboard-tally'

// One day in ms — the width of the "today" window [dayStartMs, dayStartMs + 24h).
const DAY_MS = 24 * 60 * 60 * 1000

// ── Generators ─────────────────────────────────────────────────────────────────
// Each row is generated as a flat "spec" of its salient fields plus a timestamp
// *offset* relative to the (arbitrary) day-start anchor. Carrying the offset is
// what lets the oracle decide "within today" by CONSTRUCTION (offset ∈ [0, 24h))
// instead of re-parsing the date the way the implementation does — a genuinely
// independent ground truth.

const KINDS = ['ingest', 'synthesis', 'connection', 'flagged-content'] as const
const STATUSES = ['pending', 'approved', 'refined', 'dismissed', 'auto-applied', 'failed'] as const
const OPERATIONS = ['ingest', 'query', 'lint', 'agent'] as const
const SCHEDULE_KINDS = ['scheduled', 'reactive', 'manual', null] as const
const LIFECYCLES: ReadonlyArray<AgentLifecycle | undefined> = [
  'describe', 'preview', 'dry-run', 'deploy', 'monitor', 'pause', 'retire', undefined,
]

// Offsets deliberately straddle BOTH edges of the window so "today" membership is
// exercised on either side of the boundary (exact start, last ms inside, the
// excluded next-day start, just before, far before/after).
const offsetArb = fc.oneof(
  fc.constantFrom(0, DAY_MS - 1, DAY_MS, -1, DAY_MS + 1, -DAY_MS),
  fc.integer({ min: 0, max: DAY_MS - 1 }), // within today
  fc.integer({ min: -7 * DAY_MS, max: -1 }), // before today
  fc.integer({ min: DAY_MS, max: 7 * DAY_MS }), // after today
)

// Day-start anchor kept inside a sane epoch range (≈ year 2000–2100) so every
// derived timestamp is a valid Date in all three representations below.
const dayStartArb = fc.integer({ min: 946684800000, max: 4102444800000 })

// Build a createdAt value in one of the shapes the pure layer must accept
// (Date | ISO string | epoch ms); the representation must not change the tally.
type Repr = 'date' | 'iso' | 'number'
function makeCreatedAt(dayStartMs: number, offsetMs: number, repr: Repr): Date | string | number {
  const ms = dayStartMs + offsetMs
  if (repr === 'date') return new Date(ms)
  if (repr === 'iso') return new Date(ms).toISOString()
  return ms
}

interface AgentSpec {
  hasActiveRun: boolean
  scheduleShape: 'obj' | 'null' | 'undef'
  scheduleKind: (typeof SCHEDULE_KINDS)[number]
  lifecycle: AgentLifecycle | undefined
  budgetPaused: boolean | undefined
}
const agentSpecArb: fc.Arbitrary<AgentSpec> = fc.record({
  hasActiveRun: fc.boolean(),
  scheduleShape: fc.constantFrom('obj', 'null', 'undef'),
  scheduleKind: fc.constantFrom(...SCHEDULE_KINDS),
  lifecycle: fc.constantFrom(...LIFECYCLES),
  budgetPaused: fc.constantFrom(true, false, undefined),
})

interface ProposalSpec {
  kind: (typeof KINDS)[number]
  status: (typeof STATUSES)[number]
  offsetMs: number
  repr: Repr
}
const proposalSpecArb: fc.Arbitrary<ProposalSpec> = fc.record({
  kind: fc.constantFrom(...KINDS),
  status: fc.constantFrom(...STATUSES),
  offsetMs: offsetArb,
  repr: fc.constantFrom('date', 'iso', 'number'),
})

interface LogSpec {
  operation: (typeof OPERATIONS)[number]
  offsetMs: number
  repr: Repr
}
const logSpecArb: fc.Arbitrary<LogSpec> = fc.record({
  operation: fc.constantFrom(...OPERATIONS),
  offsetMs: offsetArb,
  repr: fc.constantFrom('date', 'iso', 'number'),
})

// ── Spec → input row builders ────────────────────────────────────────────────────
function buildAgent(s: AgentSpec): AgentTallyRow {
  const schedule =
    s.scheduleShape === 'null' ? null : s.scheduleShape === 'undef' ? undefined : { kind: s.scheduleKind }
  return { hasActiveRun: s.hasActiveRun, schedule, lifecycle: s.lifecycle, budgetPaused: s.budgetPaused }
}
function buildProposal(s: ProposalSpec, dayStartMs: number): ProposalTallyRow {
  return { kind: s.kind, status: s.status, createdAt: makeCreatedAt(dayStartMs, s.offsetMs, s.repr) }
}
function buildLog(s: LogSpec, dayStartMs: number): LogTallyRow {
  return { operation: s.operation, createdAt: makeCreatedAt(dayStartMs, s.offsetMs, s.repr) }
}

// ── Independent oracle helpers (computed differently than the implementation) ─────
const isWithin = (offsetMs: number): boolean => offsetMs >= 0 && offsetMs < DAY_MS
const isScheduledTrue = (s: AgentSpec): boolean =>
  s.scheduleShape === 'obj' &&
  s.scheduleKind === 'scheduled' &&
  s.budgetPaused !== true &&
  s.lifecycle !== 'pause' &&
  s.lifecycle !== 'retire'

// A count must be a non-negative integer that never exceeds its population — a
// tally can report at most everything it was given, so it can never invent data.
function expectBoundedCount(count: number, population: number): void {
  expect(Number.isInteger(count)).toBe(true)
  expect(count).toBeGreaterThanOrEqual(0)
  expect(count).toBeLessThanOrEqual(population)
}

// ── Property 19 ──────────────────────────────────────────────────────────────────
describe('Property 19: Dashboard counts equal the true tallies (no fabricated data)', () => {
  it('every count equals an independent recomputation of the true tally (Req 6.1, 6.2)', () => {
    fc.assert(
      fc.property(
        dayStartArb,
        fc.array(agentSpecArb, { maxLength: 40 }),
        fc.array(proposalSpecArb, { maxLength: 40 }),
        fc.array(logSpecArb, { maxLength: 40 }),
        (dayStartMs, agentSpecs, propSpecs, logSpecs) => {
          const agents = agentSpecs.map(buildAgent)
          const proposals = propSpecs.map((s) => buildProposal(s, dayStartMs))
          const agentLogs = logSpecs.map((s) => buildLog(s, dayStartMs))
          const input: DashboardTallyInput = { agents, proposals, agentLogs, dayStartMs }

          const result = tallyDashboard(input)

          // ── Status strip (Req 6.1) — oracle via filter().length over ground truth ──
          const trueRunning = agentSpecs.filter((s) => s.hasActiveRun).length
          const trueScheduled = agentSpecs.filter(isScheduledTrue).length
          const trueAwaiting = propSpecs.filter((s) => s.status === 'pending').length

          expect(result.statusStrip.running).toBe(trueRunning)
          expect(result.statusStrip.scheduled).toBe(trueScheduled)
          expect(result.statusStrip.awaitingSignOff).toBe(trueAwaiting)

          // ── "Today" proof-of-work (Req 6.2) — membership decided by construction ──
          const trueSources = logSpecs.filter((s) => s.operation === 'agent' && isWithin(s.offsetMs)).length
          const trueConnections = propSpecs.filter(
            (s) =>
              s.kind === 'connection' &&
              (s.status === 'approved' || s.status === 'auto-applied') &&
              isWithin(s.offsetMs),
          ).length
          const trueSyntheses = propSpecs.filter((s) => s.kind === 'synthesis' && isWithin(s.offsetMs)).length

          expect(result.today.sourcesIngested).toBe(trueSources)
          expect(result.today.connectionsMade).toBe(trueConnections)
          expect(result.today.synthesesProposed).toBe(trueSyntheses)

          // ── No fabrication: every count is a non-negative int ≤ its population ──
          expectBoundedCount(result.statusStrip.running, agents.length)
          expectBoundedCount(result.statusStrip.scheduled, agents.length)
          expectBoundedCount(result.statusStrip.awaitingSignOff, proposals.length)
          expectBoundedCount(result.today.sourcesIngested, agentLogs.length)
          expectBoundedCount(result.today.connectionsMade, proposals.length)
          expectBoundedCount(result.today.synthesesProposed, proposals.length)

          // ── Determinism: same input → identical counts ──
          expect(tallyDashboard(input)).toEqual(result)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('fabricates nothing from empty inputs: all six counts are exactly 0 (Req 6.1, 6.2)', () => {
    fc.assert(
      fc.property(dayStartArb, (dayStartMs) => {
        const t = tallyDashboard({ agents: [], proposals: [], agentLogs: [], dayStartMs })
        expect(t).toEqual({
          statusStrip: { running: 0, scheduled: 0, awaitingSignOff: 0 },
          today: { sourcesIngested: 0, connectionsMade: 0, synthesesProposed: 0 },
        })
      }),
      { numRuns: 100 },
    )
  })
})
