// ── Scheduler trigger-matching core (PURE, total, deterministic) ─────────────────
// The decision layer for Hermes Agent scheduling: given a set of Agent rows and the
// current instant (plus, optionally, a just-emitted domain event), decide WHICH
// Agents are due to start a Run. See design.md → §2.4 "Triggers and scheduling" and
// Requirements 1.4–1.6, 1.13.
//
// Two trigger classes (Req 1.4–1.6):
//   • Scheduled — `schedule = { kind: 'scheduled', cron }`. Due when its cron matches
//     `now` AND the Agent is runnable (not paused/retired/budget-paused — Req 1.13).
//   • Reactive  — `schedule = { kind: 'reactive', event, sourceAgentId? }`. Matched
//     when a domain event of the named type is emitted; when `sourceAgentId` is set
//     the event must originate from THAT Agent (Req 1.6), and an `agent.run.completed`
//     event only chains once the source Run has reached a TERMINAL state.
//
// WHY THIS FILE IS PURE: this is the unit/property-testable heart of scheduling. It
// performs NO I/O — no `connectDB`, no model imports, no `Date.now()` inside the
// matchers. The caller passes `now` and the already-fetched Agent rows in, and the
// async orchestration (DB fetch + actually enqueuing the returned Runs) lives in the
// protected `/api/agents/scheduler/tick` route (task 8.2). Keeping the logic pure lets
// task 8.3 property-test trigger matching without a database or a clock.
//
// HONEST INFRA CAVEAT (mirrors the design's tone): always-on scheduling needs a real
// worker/cron — Next.js route handlers are request-scoped and won't fire timers
// reliably. The design isolates the logic behind `tick()` so it is testable now;
// interim, `tick()` is driven by (a) an external cron hitting the protected route and
// (b) opportunistically after any Run completes (for immediate reactive chaining). A
// dedicated long-lived worker is later infrastructure, not a change to this logic.
//
// The cron evaluator below is a deliberately MINIMAL, dependency-free, interim
// implementation (the repo ships no cron library and we add none). It supports the
// common 5-field syntax and conservatively returns `false` for anything it does not
// understand — never throwing — so the function stays total. A production-grade cron
// engine is part of the later worker infra, not this pure decision layer.

import { isRunnable, type LifecycleState } from './lifecycle'

// ── Schedule + agent view (structural; mirrors `Agent.schedule` in @/lib/models) ──
// Declared locally so this module imports ONLY `isRunnable` / `LifecycleState` from
// lifecycle.ts and stays a dependency-free pure module. It MUST stay in sync with the
// `Agent.schedule` discriminated union in `src/lib/models.ts`.

/** The Agent schedule discriminated union (Req 1.4–1.6), discriminated by `kind`. */
export type ScheduleSpec =
  | { kind: 'scheduled'; cron: string }
  | { kind: 'reactive'; event: string; sourceAgentId: string | null }
  | { kind: 'manual' }

/**
 * The minimal Agent view the matchers read. Accepts any object with these fields
 * (a hydrated `Agent` document, a `.lean()` row, or a plain test fixture):
 *   • `id`           — the Agent's id, used for the self-trigger guard (Req 1.6).
 *   • `lifecycle`    — feeds `isRunnable` (a halted Agent is never scheduled, Req 1.13).
 *   • `budgetPaused` — feeds `isRunnable` (Budget_Paused Agents are excluded, Req 10.6).
 *   • `schedule`     — the trigger spec; `null`/`undefined` means "no schedule" → never due.
 *   • `lastRunAt`    — optional; used by the cron double-fire guard (see `isCronDue`).
 */
export interface SchedulableAgent {
  id: string
  lifecycle: LifecycleState
  budgetPaused: boolean
  schedule: ScheduleSpec | null | undefined
  lastRunAt?: Date | number | null
}

// ── Domain events (reactive triggers) ────────────────────────────────────────────

/** The domain event types reactive Agents can chain off (design.md §2.4, Req 1.6). */
export type DomainEventType =
  | 'agent.run.completed'
  | 'proposal.approved'
  | 'vault.page.created'

/** All domain event types, for exhaustive iteration (legends / property tests). */
export const DOMAIN_EVENT_TYPES: readonly DomainEventType[] = [
  'agent.run.completed',
  'proposal.approved',
  'vault.page.created',
] as const

/**
 * A just-emitted domain event the Scheduler reacts to.
 *   • `type`         — which event fired.
 *   • `sourceAgentId`— the Agent the event originated from (when applicable). Used to
 *                      honour a reactive Agent's `sourceAgentId` binding (Req 1.6) and
 *                      to prevent an Agent self-triggering off its own run completion.
 *   • `runTerminal`  — for `agent.run.completed` ONLY: whether the source Run reached a
 *                      TERMINAL state. A still-running source never chains (Req 1.6).
 *                      Irrelevant for non-run events.
 */
export interface DomainEvent {
  type: DomainEventType
  sourceAgentId?: string | null
  runTerminal?: boolean
}

// ── Minimal, total, dependency-free cron evaluator ───────────────────────────────
// Standard 5-field cron: `minute hour day-of-month month day-of-week`.
// Supported per field: `*`, a single integer, comma lists (`1,15`), step values
// (`*/15`, also `a-b/2`), and ranges (`1-5`). Day-of-week accepts 0–6 (Sun=0) and the
// alias `7` for Sunday (normalised to 0). Evaluation uses the host's LOCAL time, the
// same convention as the rest of this codebase (cf. `dashboard-tally.startOfDay`).
//
// Anything outside this supported subset — extra/missing fields, names like `MON`,
// `@hourly` macros, `?`/`L`/`#` qualifiers, out-of-range numbers — conservatively
// yields `false` (not due). This is the documented INTERIM evaluator; a production
// cron engine is later worker infra, not part of this pure layer.

const FIELD_BOUNDS: ReadonlyArray<{ min: number; max: number }> = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 }, // day of week (0 and 7 are both Sunday)
]

/**
 * Expand a single cron field into the set of integers it allows, or `null` if the
 * field is malformed / uses unsupported syntax. PURE; never throws. `7` in the
 * day-of-week field is normalised to `0` (Sunday).
 */
function parseCronField(field: string, min: number, max: number): Set<number> | null {
  if (field.length === 0) return null
  const values = new Set<number>()
  const normalize = (n: number): number => (max === 7 && n === 7 ? 0 : n)
  const add = (n: number): boolean => {
    if (!Number.isInteger(n) || n < min || n > max) return false
    values.add(normalize(n))
    return true
  }

  for (const rawPart of field.split(',')) {
    const part = rawPart.trim()
    if (part.length === 0) return null

    // Optional step: split `<base>/<step>`.
    let base = part
    let step = 1
    const slash = part.indexOf('/')
    if (slash !== -1) {
      const stepStr = part.slice(slash + 1)
      base = part.slice(0, slash)
      if (!/^\d+$/.test(stepStr)) return null
      step = Number(stepStr)
      if (step <= 0) return null
    }

    if (base === '*') {
      for (let n = min; n <= max; n += step) if (!add(n)) return null
      continue
    }

    const dash = base.indexOf('-')
    if (dash !== -1) {
      const startStr = base.slice(0, dash)
      const endStr = base.slice(dash + 1)
      if (!/^\d+$/.test(startStr) || !/^\d+$/.test(endStr)) return null
      const start = Number(startStr)
      const end = Number(endStr)
      if (start > end || start < min || end > max) return null
      for (let n = start; n <= end; n += step) if (!add(n)) return null
      continue
    }

    // Single integer, optionally with a step meaning "from this value to max".
    if (!/^\d+$/.test(base)) return null
    const startN = Number(base)
    if (startN < min || startN > max) return null
    if (slash === -1) {
      if (!add(startN)) return null
    } else {
      for (let n = startN; n <= max; n += step) if (!add(n)) return null
    }
  }

  return values.size > 0 ? values : null
}

/** Floor a timestamp to its minute (epoch-minute index). */
function toEpochMinute(at: Date | number): number {
  const ts = at instanceof Date ? at.getTime() : Number(at)
  if (Number.isNaN(ts)) return Number.NaN
  return Math.floor(ts / 60_000)
}

/**
 * Is a `scheduled` Agent's cron due at `now`? PURE, TOTAL, DETERMINISTIC.
 *
 * Returns `true` iff `cron` is a well-formed 5-field expression (in the supported
 * subset) whose minute/hour/day-of-month/month/day-of-week fields all match `now`
 * (host local time). To prevent double-firing within the same minute, when
 * `lastRunAt` is provided and falls in the SAME minute as `now`, the Agent is treated
 * as NOT due. A malformed/empty cron, an invalid `now`, or any unsupported syntax
 * yields `false` — it never throws (totality).
 *
 * NOTE: minimal interim evaluator — see the module header. Standard cron's quirk that
 * day-of-month and day-of-week are OR'd when BOTH are restricted is intentionally NOT
 * modelled here; both restricted fields must match (AND). Documented and conservative.
 */
export function isCronDue(
  cron: string,
  now: Date | number,
  lastRunAt?: Date | number | null,
): boolean {
  if (typeof cron !== 'string') return false
  const trimmed = cron.trim()
  if (trimmed.length === 0) return false

  const fields = trimmed.split(/\s+/)
  if (fields.length !== 5) return false

  const at = now instanceof Date ? now : new Date(now)
  const atMs = at.getTime()
  if (Number.isNaN(atMs)) return false

  // Double-fire guard: already ran in the current minute → not due again (Req 1.4).
  if (lastRunAt !== undefined && lastRunAt !== null) {
    const lastMinute = toEpochMinute(lastRunAt)
    if (!Number.isNaN(lastMinute) && lastMinute === toEpochMinute(atMs)) return false
  }

  const nowParts = [
    at.getMinutes(),
    at.getHours(),
    at.getDate(),
    at.getMonth() + 1, // getMonth() is 0-based; cron month is 1-based
    at.getDay(), // 0 (Sun) – 6 (Sat)
  ]

  for (let i = 0; i < 5; i++) {
    const { min, max } = FIELD_BOUNDS[i]
    const allowed = parseCronField(fields[i], min, max)
    if (allowed === null) return false // malformed/unsupported → conservatively not due
    if (!allowed.has(nowParts[i])) return false
  }

  return true
}

// ── Trigger matchers (the property-test targets) ─────────────────────────────────

/**
 * The scheduled Agents that are due to run at `now`. PURE, TOTAL, DETERMINISTIC.
 *
 * An Agent is returned iff ALL hold (Req 1.4, 1.13):
 *   (a) `schedule.kind === 'scheduled'`,
 *   (b) `isRunnable(agent)` (not paused/retired/budget-paused — reuses lifecycle.ts),
 *   (c) `isCronDue(schedule.cron, now, agent.lastRunAt)`.
 * Malformed rows (missing/garbage schedule, bad cron) are simply excluded — never thrown.
 */
export function dueScheduledAgents(
  agents: SchedulableAgent[],
  now: Date | number,
): SchedulableAgent[] {
  if (!Array.isArray(agents)) return []
  return agents.filter((agent) => {
    const schedule = agent?.schedule
    if (!schedule || schedule.kind !== 'scheduled') return false
    if (!isRunnable(agent)) return false
    return isCronDue(schedule.cron, now, agent.lastRunAt)
  })
}

/**
 * The reactive Agents that match a just-emitted domain `event`. PURE, TOTAL,
 * DETERMINISTIC. An Agent is returned iff ALL hold:
 *   • `schedule.kind === 'reactive'` and `schedule.event === event.type`;
 *   • `isRunnable(agent)` (halted Agents never chain — Req 1.13);
 *   • SOURCE BINDING (Req 1.6): when the Agent's `schedule.sourceAgentId` is set
 *     (non-null), the event must originate from that Agent
 *     (`event.sourceAgentId === schedule.sourceAgentId`). When it is null/absent the
 *     Agent matches the event regardless of source;
 *   • TERMINAL GATE (Req 1.6): for an `agent.run.completed` event, only match when
 *     `event.runTerminal === true` — a still-running source Run never chains. For
 *     non-run events (`proposal.approved`, `vault.page.created`) the flag is ignored;
 *   • SELF-TRIGGER GUARD: for an `agent.run.completed` event, an Agent never matches
 *     its OWN completion (`event.sourceAgentId === agent.id`), so an Agent cannot
 *     infinitely re-trigger itself off its own run completion.
 */
export function matchReactiveAgents(
  agents: SchedulableAgent[],
  event: DomainEvent,
): SchedulableAgent[] {
  if (!Array.isArray(agents) || !event || typeof event.type !== 'string') return []

  const isRunCompleted = event.type === 'agent.run.completed'
  // Terminal gate: a run-completed event only chains once the source Run is terminal.
  if (isRunCompleted && event.runTerminal !== true) return []

  return agents.filter((agent) => {
    const schedule = agent?.schedule
    if (!schedule || schedule.kind !== 'reactive') return false
    if (schedule.event !== event.type) return false
    if (!isRunnable(agent)) return false

    // Self-trigger guard: never chain an Agent off its own run completion (Req 1.6).
    if (isRunCompleted && event.sourceAgentId != null && event.sourceAgentId === agent.id) {
      return false
    }

    // Source binding (Req 1.6): a bound reactive Agent only chains off its named source.
    if (schedule.sourceAgentId != null && event.sourceAgentId !== schedule.sourceAgentId) {
      return false
    }

    return true
  })
}

// ── Top-level pure entry point ────────────────────────────────────────────────────

/** What a single `tick` resolves to: the Agents to enqueue Runs for. */
export interface TickResult {
  /** Scheduled Agents whose cron is due at `now` and that are runnable. */
  scheduledDue: SchedulableAgent[]
  /** Reactive Agents matched to `input.event` (empty when no event was supplied). */
  reactiveMatched: SchedulableAgent[]
}

/** Input for one scheduler tick — already-fetched rows + the current instant. */
export interface TickInput {
  /** The Agent rows to evaluate (the route fetches these scoped by user). */
  agents: SchedulableAgent[]
  /** The current instant the matchers evaluate against (caller supplies the clock). */
  now: Date | number
  /** An optional just-emitted domain event to react to. */
  event?: DomainEvent
}

/**
 * Compute one scheduler tick. PURE, TOTAL, DETERMINISTIC — no I/O, never throws.
 *
 * Always computes `scheduledDue = dueScheduledAgents(agents, now)`. When an `event`
 * is supplied it also computes `reactiveMatched = matchReactiveAgents(agents, event)`;
 * otherwise `reactiveMatched` is empty. This is exactly the decision the protected
 * `/api/agents/scheduler/tick` route (task 8.2) consumes — the route does the DB
 * fetch and enqueues a Run for each returned Agent — and what task 8.3 property-tests.
 */
export function tick(input: TickInput): TickResult {
  const agents = Array.isArray(input?.agents) ? input.agents : []
  const now = input?.now
  return {
    scheduledDue: dueScheduledAgents(agents, now),
    reactiveMatched: input?.event ? matchReactiveAgents(agents, input.event) : [],
  }
}
