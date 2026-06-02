// Tests for the Scheduler trigger-matching core (task 8.3).
//
// Validates: Requirements 1.4 (scheduled cron execution), 1.5 (reactive event
// execution), 1.6 (reactive chaining off another Agent's terminal Run + source
// binding + self-trigger guard), and 1.13 (paused/retired/budget-paused Agents are
// never scheduled). Reuses Property 14's `isRunnable`/matching logic from lifecycle.ts.
//
// The scheduler core (`isCronDue`, `dueScheduledAgents`, `matchReactiveAgents`,
// `tick`) is PURE / TOTAL / DETERMINISTIC — no DB, no clock, no mocks. The caller
// supplies `now` and the already-fetched rows, so everything is tested directly.
//
// `isCronDue` evaluates against HOST LOCAL time (the same convention as the rest of
// the codebase), so every `now` below is built with `new Date(y, mIdx, d, h, min)`
// (local constructor) to keep assertions deterministic regardless of the test
// machine's timezone.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  isCronDue,
  dueScheduledAgents,
  matchReactiveAgents,
  tick,
  DOMAIN_EVENT_TYPES,
  type SchedulableAgent,
  type ScheduleSpec,
  type DomainEvent,
  type DomainEventType,
} from './scheduler'
import { isRunnable, LIFECYCLE_STATES, type LifecycleState } from './lifecycle'

// ── Fixtures ─────────────────────────────────────────────────────────────────────

/** Build a SchedulableAgent fixture; only `schedule` is required, the rest default
 *  to a runnable agent so each test overrides exactly the field it exercises. */
function makeAgent(over: Partial<SchedulableAgent> & { schedule: ScheduleSpec | null }): SchedulableAgent {
  return {
    id: over.id ?? 'agent-1',
    lifecycle: over.lifecycle ?? 'monitor',
    budgetPaused: over.budgetPaused ?? false,
    schedule: over.schedule,
    lastRunAt: over.lastRunAt,
  }
}

const scheduled = (cron: string): ScheduleSpec => ({ kind: 'scheduled', cron })
const reactive = (event: string, sourceAgentId: string | null = null): ScheduleSpec => ({
  kind: 'reactive',
  event,
  sourceAgentId,
})

// A Monday at 09:30 local time. 2024-01-15 is a Monday (day-of-week 1).
const MON_0930 = new Date(2024, 0, 15, 9, 30)
// A Sunday at 09:00 local time. 2024-01-14 is a Sunday (day-of-week 0).
const SUN_0900 = new Date(2024, 0, 14, 9, 0)

// ── isCronDue — field evaluation (Req 1.4) ───────────────────────────────────────

describe('isCronDue — step / fixed / range / list fields (Req 1.4)', () => {
  it('*/15 is due at minutes 0,15,30,45 but not 7', () => {
    const cron = '*/15 * * * *'
    for (const minute of [0, 15, 30, 45]) {
      expect(isCronDue(cron, new Date(2024, 0, 15, 9, minute))).toBe(true)
    }
    expect(isCronDue(cron, new Date(2024, 0, 15, 9, 7))).toBe(false)
  })

  it('0 9 * * * is due at 09:00 local but not 10:00', () => {
    const cron = '0 9 * * *'
    expect(isCronDue(cron, new Date(2024, 0, 15, 9, 0))).toBe(true)
    expect(isCronDue(cron, new Date(2024, 0, 15, 10, 0))).toBe(false)
    // Wrong minute at the right hour is also not due.
    expect(isCronDue(cron, new Date(2024, 0, 15, 9, 1))).toBe(false)
  })

  it('a minute range 1-5 matches inside the range, not outside', () => {
    const cron = '1-5 * * * *'
    for (const minute of [1, 3, 5]) {
      expect(isCronDue(cron, new Date(2024, 0, 15, 9, minute))).toBe(true)
    }
    for (const minute of [0, 6, 7]) {
      expect(isCronDue(cron, new Date(2024, 0, 15, 9, minute))).toBe(false)
    }
  })

  it('a comma list 1,15 matches only the listed minutes', () => {
    const cron = '1,15 * * * *'
    expect(isCronDue(cron, new Date(2024, 0, 15, 9, 1))).toBe(true)
    expect(isCronDue(cron, new Date(2024, 0, 15, 9, 15))).toBe(true)
    expect(isCronDue(cron, new Date(2024, 0, 15, 9, 2))).toBe(false)
  })

  it('day-of-week alias 7 is treated as Sunday (0)', () => {
    // `7` in the dow field normalises to Sunday.
    expect(isCronDue('* * * * 7', SUN_0900)).toBe(true)
    expect(isCronDue('* * * * 0', SUN_0900)).toBe(true)
    // Not Sunday → not due.
    expect(isCronDue('* * * * 7', MON_0930)).toBe(false)
  })

  it('* * * * * (every minute) is always due for a valid instant', () => {
    expect(isCronDue('* * * * *', MON_0930)).toBe(true)
    expect(isCronDue('* * * * *', SUN_0900)).toBe(true)
  })
})

// ── isCronDue — malformed / unsupported never throw, return false (Req 1.4) ───────

describe('isCronDue — malformed or unsupported crons yield false without throwing', () => {
  const badCrons: Array<[string, string]> = [
    ['empty', ''],
    ['blank', '   '],
    ['too few fields', '* * *'],
    ['too many fields', '* * * * * *'],
    ['non-numeric token', 'bad * * * *'],
    ['minute out of range', '60 * * * *'],
    ['hour out of range', '* 24 * * *'],
    ['dow out of range', '* * * * 8'],
    ['macro @hourly', '@hourly'],
    ['name alias MON', '* * * * MON'],
    ['step zero', '*/0 * * * *'],
    ['reversed range', '5-1 * * * *'],
    ['L qualifier', '* * L * *'],
  ]

  for (const [label, cron] of badCrons) {
    it(`returns false for ${label} (${JSON.stringify(cron)})`, () => {
      let result: boolean | undefined
      expect(() => {
        result = isCronDue(cron, MON_0930)
      }).not.toThrow()
      expect(result).toBe(false)
    })
  }

  it('returns false for a non-string cron and an invalid instant without throwing', () => {
    expect(isCronDue(undefined as unknown as string, MON_0930)).toBe(false)
    expect(isCronDue('* * * * *', new Date('not-a-date'))).toBe(false)
    expect(isCronDue('* * * * *', Number.NaN)).toBe(false)
  })
})

// ── isCronDue — same-minute double-fire guard (Req 1.4) ───────────────────────────

describe('isCronDue — double-fire guard via lastRunAt (Req 1.4)', () => {
  it('is NOT due when lastRunAt falls in the same minute as now', () => {
    // now is due (every-minute cron); a lastRunAt within the same wall-clock minute
    // suppresses a second fire.
    const sameMinute = new Date(2024, 0, 15, 9, 30, 45) // :45s, still minute 30
    expect(isCronDue('* * * * *', MON_0930, sameMinute)).toBe(false)
    // lastRunAt exactly equal to now also suppresses.
    expect(isCronDue('* * * * *', MON_0930, MON_0930)).toBe(false)
  })

  it('is still due when lastRunAt was in a previous minute', () => {
    const previousMinute = new Date(2024, 0, 15, 9, 29, 0)
    expect(isCronDue('* * * * *', MON_0930, previousMinute)).toBe(true)
  })

  it('ignores a null/undefined lastRunAt (no guard applied)', () => {
    expect(isCronDue('* * * * *', MON_0930, null)).toBe(true)
    expect(isCronDue('* * * * *', MON_0930, undefined)).toBe(true)
  })

  it('accepts a numeric epoch lastRunAt', () => {
    expect(isCronDue('* * * * *', MON_0930, MON_0930.getTime())).toBe(false)
    expect(isCronDue('* * * * *', MON_0930, MON_0930.getTime() - 60_000)).toBe(true)
  })
})

// ── dueScheduledAgents — selection + exclusions (Req 1.4, 1.13) ───────────────────

describe('dueScheduledAgents — selects due runnable scheduled agents (Req 1.4)', () => {
  it('selects a runnable scheduled agent whose cron is due', () => {
    const agent = makeAgent({ id: 'due', schedule: scheduled('0 9 * * *') })
    const due = dueScheduledAgents([agent], new Date(2024, 0, 15, 9, 0))
    expect(due).toEqual([agent])
  })

  it('excludes a scheduled agent whose cron is NOT due', () => {
    const agent = makeAgent({ id: 'not-due', schedule: scheduled('0 9 * * *') })
    expect(dueScheduledAgents([agent], new Date(2024, 0, 15, 10, 0))).toEqual([])
  })

  it('excludes reactive- and manual-scheduled agents even if "now" is a valid instant', () => {
    const reactiveAgent = makeAgent({ id: 'reactive', schedule: reactive('vault.page.created') })
    const manualAgent = makeAgent({ id: 'manual', schedule: { kind: 'manual' } })
    expect(dueScheduledAgents([reactiveAgent, manualAgent], MON_0930)).toEqual([])
  })

  it('excludes agents with a missing/garbage schedule', () => {
    const nullSched = makeAgent({ id: 'null', schedule: null })
    const undefSched = makeAgent({ id: 'undef', schedule: undefined })
    expect(dueScheduledAgents([nullSched, undefSched], MON_0930)).toEqual([])
  })

  it('honours the per-agent double-fire guard via lastRunAt', () => {
    const cron = '* * * * *'
    const ranThisMinute = makeAgent({ id: 'ran', schedule: scheduled(cron), lastRunAt: MON_0930 })
    const ranEarlier = makeAgent({
      id: 'earlier',
      schedule: scheduled(cron),
      lastRunAt: new Date(2024, 0, 15, 9, 29),
    })
    const due = dueScheduledAgents([ranThisMinute, ranEarlier], MON_0930)
    expect(due.map((a) => a.id)).toEqual(['earlier'])
  })
})

describe('dueScheduledAgents — excludes halted agents (Req 1.13, reuses isRunnable)', () => {
  const dueCron = '* * * * *'

  it('excludes budget-paused agents', () => {
    const agent = makeAgent({ id: 'budget', schedule: scheduled(dueCron), budgetPaused: true })
    expect(isRunnable(agent)).toBe(false)
    expect(dueScheduledAgents([agent], MON_0930)).toEqual([])
  })

  it('excludes paused-lifecycle agents', () => {
    const agent = makeAgent({ id: 'paused', schedule: scheduled(dueCron), lifecycle: 'pause' })
    expect(dueScheduledAgents([agent], MON_0930)).toEqual([])
  })

  it('excludes retired-lifecycle agents', () => {
    const agent = makeAgent({ id: 'retired', schedule: scheduled(dueCron), lifecycle: 'retire' })
    expect(dueScheduledAgents([agent], MON_0930)).toEqual([])
  })

  it('keeps the runnable agent while dropping each halted variant in one pass', () => {
    const ok = makeAgent({ id: 'ok', schedule: scheduled(dueCron), lifecycle: 'monitor' })
    const paused = makeAgent({ id: 'paused', schedule: scheduled(dueCron), lifecycle: 'pause' })
    const retired = makeAgent({ id: 'retired', schedule: scheduled(dueCron), lifecycle: 'retire' })
    const budget = makeAgent({ id: 'budget', schedule: scheduled(dueCron), budgetPaused: true })
    const due = dueScheduledAgents([ok, paused, retired, budget], MON_0930)
    expect(due.map((a) => a.id)).toEqual(['ok'])
  })

  it('returns [] for a non-array input without throwing (totality)', () => {
    expect(dueScheduledAgents(undefined as unknown as SchedulableAgent[], MON_0930)).toEqual([])
  })
})

// ── matchReactiveAgents — event matching + chaining (Req 1.5, 1.6) ────────────────

describe('matchReactiveAgents — matches reactive agents by event type (Req 1.5)', () => {
  it('matches a runnable reactive agent whose schedule.event equals the event type', () => {
    const agent = makeAgent({ id: 'r', schedule: reactive('vault.page.created') })
    const matched = matchReactiveAgents([agent], { type: 'vault.page.created' })
    expect(matched).toEqual([agent])
  })

  it('does not match when the event type differs', () => {
    const agent = makeAgent({ id: 'r', schedule: reactive('vault.page.created') })
    expect(matchReactiveAgents([agent], { type: 'proposal.approved' })).toEqual([])
  })

  it('never matches scheduled or manual agents', () => {
    const sched = makeAgent({ id: 's', schedule: scheduled('* * * * *') })
    const manual = makeAgent({ id: 'm', schedule: { kind: 'manual' } })
    expect(matchReactiveAgents([sched, manual], { type: 'vault.page.created' })).toEqual([])
  })

  it('returns [] for a malformed event or non-array agents without throwing (totality)', () => {
    const agent = makeAgent({ id: 'r', schedule: reactive('vault.page.created') })
    expect(matchReactiveAgents([agent], undefined as unknown as DomainEvent)).toEqual([])
    expect(matchReactiveAgents([agent], { type: 123 as unknown as DomainEventType })).toEqual([])
    expect(matchReactiveAgents(null as unknown as SchedulableAgent[], { type: 'vault.page.created' })).toEqual([])
  })
})

describe('matchReactiveAgents — terminal gate for agent.run.completed (Req 1.6)', () => {
  it('does NOT match a run-completed event whose source Run is not terminal', () => {
    const agent = makeAgent({ id: 'chain', schedule: reactive('agent.run.completed') })
    // runTerminal false
    expect(matchReactiveAgents([agent], { type: 'agent.run.completed', runTerminal: false })).toEqual([])
    // runTerminal omitted (defaults to non-terminal)
    expect(matchReactiveAgents([agent], { type: 'agent.run.completed' })).toEqual([])
  })

  it('matches a run-completed event only once the source Run is terminal', () => {
    const agent = makeAgent({ id: 'chain', schedule: reactive('agent.run.completed') })
    const matched = matchReactiveAgents([agent], {
      type: 'agent.run.completed',
      sourceAgentId: 'other',
      runTerminal: true,
    })
    expect(matched).toEqual([agent])
  })

  it('ignores runTerminal for non-run events (always considered ready)', () => {
    const proposal = makeAgent({ id: 'p', schedule: reactive('proposal.approved') })
    const vault = makeAgent({ id: 'v', schedule: reactive('vault.page.created') })
    expect(matchReactiveAgents([proposal], { type: 'proposal.approved', runTerminal: false })).toEqual([proposal])
    expect(matchReactiveAgents([vault], { type: 'vault.page.created' })).toEqual([vault])
  })
})

describe('matchReactiveAgents — source binding (Req 1.6)', () => {
  it('a bound agent (sourceAgentId set) matches only its named source', () => {
    const agent = makeAgent({ id: 'b', schedule: reactive('agent.run.completed', 'A') })
    // From the bound source A → matches.
    expect(
      matchReactiveAgents([agent], { type: 'agent.run.completed', sourceAgentId: 'A', runTerminal: true }),
    ).toEqual([agent])
    // From a different source → no match.
    expect(
      matchReactiveAgents([agent], { type: 'agent.run.completed', sourceAgentId: 'Z', runTerminal: true }),
    ).toEqual([])
  })

  it('an unbound agent (sourceAgentId null) matches any source', () => {
    const agent = makeAgent({ id: 'u', schedule: reactive('proposal.approved', null) })
    expect(matchReactiveAgents([agent], { type: 'proposal.approved', sourceAgentId: 'A' })).toEqual([agent])
    expect(matchReactiveAgents([agent], { type: 'proposal.approved', sourceAgentId: 'B' })).toEqual([agent])
    expect(matchReactiveAgents([agent], { type: 'proposal.approved' })).toEqual([agent])
  })

  it('a bound agent does not match when the event carries no source', () => {
    const agent = makeAgent({ id: 'b', schedule: reactive('proposal.approved', 'A') })
    expect(matchReactiveAgents([agent], { type: 'proposal.approved' })).toEqual([])
  })
})

describe('matchReactiveAgents — self-trigger guard (Req 1.6)', () => {
  it('an agent bound to its own completion never matches itself', () => {
    const agent = makeAgent({ id: 'A', schedule: reactive('agent.run.completed', 'A') })
    expect(
      matchReactiveAgents([agent], { type: 'agent.run.completed', sourceAgentId: 'A', runTerminal: true }),
    ).toEqual([])
  })

  it('an unbound agent never matches its OWN run completion', () => {
    const agent = makeAgent({ id: 'A', schedule: reactive('agent.run.completed', null) })
    expect(
      matchReactiveAgents([agent], { type: 'agent.run.completed', sourceAgentId: 'A', runTerminal: true }),
    ).toEqual([])
    // But it DOES chain off a different agent's terminal completion.
    expect(
      matchReactiveAgents([agent], { type: 'agent.run.completed', sourceAgentId: 'B', runTerminal: true }),
    ).toEqual([agent])
  })
})

describe('matchReactiveAgents — excludes halted agents (Req 1.13, reuses isRunnable)', () => {
  const ev: DomainEvent = { type: 'vault.page.created' }

  it('excludes budget-paused, paused, and retired reactive agents', () => {
    const budget = makeAgent({ id: 'budget', schedule: reactive('vault.page.created'), budgetPaused: true })
    const paused = makeAgent({ id: 'paused', schedule: reactive('vault.page.created'), lifecycle: 'pause' })
    const retired = makeAgent({ id: 'retired', schedule: reactive('vault.page.created'), lifecycle: 'retire' })
    expect(matchReactiveAgents([budget, paused, retired], ev)).toEqual([])
  })

  it('keeps the runnable reactive agent while dropping halted variants in one pass', () => {
    const ok = makeAgent({ id: 'ok', schedule: reactive('vault.page.created') })
    const paused = makeAgent({ id: 'paused', schedule: reactive('vault.page.created'), lifecycle: 'pause' })
    const budget = makeAgent({ id: 'budget', schedule: reactive('vault.page.created'), budgetPaused: true })
    const matched = matchReactiveAgents([ok, paused, budget], ev)
    expect(matched.map((a) => a.id)).toEqual(['ok'])
  })
})

// ── tick — integration of the two matchers (Req 1.4–1.6, 1.13) ────────────────────

describe('tick — composes dueScheduledAgents and matchReactiveAgents', () => {
  const agents: SchedulableAgent[] = [
    makeAgent({ id: 'sched-due', schedule: scheduled('* * * * *') }),
    makeAgent({ id: 'sched-paused', schedule: scheduled('* * * * *'), lifecycle: 'pause' }),
    makeAgent({ id: 'react', schedule: reactive('vault.page.created') }),
  ]

  it('with no event: reactiveMatched is empty and scheduledDue equals dueScheduledAgents', () => {
    const result = tick({ agents, now: MON_0930 })
    expect(result.reactiveMatched).toEqual([])
    expect(result.scheduledDue).toEqual(dueScheduledAgents(agents, MON_0930))
    expect(result.scheduledDue.map((a) => a.id)).toEqual(['sched-due'])
  })

  it('with an event: reactiveMatched equals matchReactiveAgents and scheduledDue is still computed', () => {
    const event: DomainEvent = { type: 'vault.page.created' }
    const result = tick({ agents, now: MON_0930, event })
    expect(result.reactiveMatched).toEqual(matchReactiveAgents(agents, event))
    expect(result.reactiveMatched.map((a) => a.id)).toEqual(['react'])
    expect(result.scheduledDue).toEqual(dueScheduledAgents(agents, MON_0930))
  })

  it('is total: empty and malformed inputs never throw', () => {
    expect(() => tick({ agents: [], now: Date.now() })).not.toThrow()
    expect(tick({ agents: [], now: Date.now() })).toEqual({ scheduledDue: [], reactiveMatched: [] })
    expect(() =>
      tick({ agents: undefined as unknown as SchedulableAgent[], now: NaN }),
    ).not.toThrow()
    expect(tick({} as unknown as Parameters<typeof tick>[0])).toEqual({
      scheduledDue: [],
      reactiveMatched: [],
    })
  })
})

// ── Property coverage ─────────────────────────────────────────────────────────────
// Feature: hermes-agents, Property 14 (reuse): the scheduler never schedules a halted agent
// Validates: Requirements 1.4, 1.5, 1.6, 1.13

const HALTED_STATES: readonly LifecycleState[] = ['pause', 'retire']

// A pool of crons: due-always, some structured, some malformed. Generators stay
// inside the supported input space so matching is meaningfully exercised.
const cronArb = fc.constantFrom(
  '* * * * *',
  '*/15 * * * *',
  '0 9 * * *',
  '1-5 * * * *',
  '1,15 * * * *',
  '@hourly', // malformed → never due
  'bad cron', // malformed → never due
)

const scheduleArb: fc.Arbitrary<ScheduleSpec | null> = fc.oneof(
  cronArb.map((cron): ScheduleSpec => ({ kind: 'scheduled', cron })),
  fc
    .record({
      event: fc.constantFrom<DomainEventType>(...DOMAIN_EVENT_TYPES),
      sourceAgentId: fc.option(fc.constantFrom('A', 'B', 'C'), { nil: null }),
    })
    .map((r): ScheduleSpec => ({ kind: 'reactive', event: r.event, sourceAgentId: r.sourceAgentId })),
  fc.constant<ScheduleSpec>({ kind: 'manual' }),
  fc.constant(null),
)

const agentArb: fc.Arbitrary<SchedulableAgent> = fc.record({
  id: fc.constantFrom('A', 'B', 'C', 'D'),
  lifecycle: fc.constantFrom<LifecycleState>(...LIFECYCLE_STATES),
  budgetPaused: fc.boolean(),
  schedule: scheduleArb,
  lastRunAt: fc.option(fc.constantFrom(MON_0930, new Date(2024, 0, 15, 9, 29)), { nil: undefined }),
})

const eventArb: fc.Arbitrary<DomainEvent> = fc.record({
  type: fc.constantFrom<DomainEventType>(...DOMAIN_EVENT_TYPES),
  sourceAgentId: fc.option(fc.constantFrom('A', 'B', 'C'), { nil: null }),
  runTerminal: fc.option(fc.boolean(), { nil: undefined }),
})

describe('Property 14 (reuse): the scheduler never schedules a halted agent', () => {
  it('every scheduled-due agent is runnable, scheduled-kind, and cron-due', () => {
    fc.assert(
      fc.property(fc.array(agentArb, { maxLength: 8 }), (agents) => {
        for (const agent of dueScheduledAgents(agents, MON_0930)) {
          // Never a halted agent (Req 1.13 / Property 14).
          expect(isRunnable(agent)).toBe(true)
          expect(HALTED_STATES.includes(agent.lifecycle)).toBe(false)
          expect(agent.budgetPaused).toBe(false)
          // Only scheduled agents whose cron is actually due.
          expect(agent.schedule?.kind).toBe('scheduled')
          const sched = agent.schedule as Extract<ScheduleSpec, { kind: 'scheduled' }>
          expect(isCronDue(sched.cron, MON_0930, agent.lastRunAt)).toBe(true)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('every reactive match is runnable, reactive-kind, event-matched, and never a self-trigger', () => {
    fc.assert(
      fc.property(fc.array(agentArb, { maxLength: 8 }), eventArb, (agents, event) => {
        for (const agent of matchReactiveAgents(agents, event)) {
          // Never a halted agent (Req 1.13 / Property 14).
          expect(isRunnable(agent)).toBe(true)
          expect(HALTED_STATES.includes(agent.lifecycle)).toBe(false)
          expect(agent.budgetPaused).toBe(false)

          expect(agent.schedule?.kind).toBe('reactive')
          const sched = agent.schedule as Extract<ScheduleSpec, { kind: 'reactive' }>
          // Event type matches the agent's trigger.
          expect(sched.event).toBe(event.type)
          // Source binding honoured (Req 1.6).
          if (sched.sourceAgentId != null) {
            expect(event.sourceAgentId).toBe(sched.sourceAgentId)
          }
          // Self-trigger guard: an agent never chains off its OWN run completion.
          if (event.type === 'agent.run.completed') {
            expect(event.runTerminal).toBe(true) // terminal gate
            expect(event.sourceAgentId === agent.id).toBe(false)
          }
        }
      }),
      { numRuns: 100 },
    )
  })

  it('tick output equals the two matchers and never throws over arbitrary inputs (totality)', () => {
    fc.assert(
      fc.property(
        fc.array(agentArb, { maxLength: 8 }),
        fc.option(eventArb, { nil: undefined }),
        (agents, event) => {
          const result = tick({ agents, now: MON_0930, event: event ?? undefined })
          expect(result.scheduledDue).toEqual(dueScheduledAgents(agents, MON_0930))
          expect(result.reactiveMatched).toEqual(
            event ? matchReactiveAgents(agents, event) : [],
          )
        },
      ),
      { numRuns: 100 },
    )
  })
})
