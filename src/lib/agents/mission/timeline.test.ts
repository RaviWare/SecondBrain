// Property tests for the Mission Timeline builder (task 1.18).
//
// `buildMissionTimeline` is the PURE, I/O-free core that the Mission Console uses to
// shape the task-by-task / agent-by-agent timeline (Req 8). It merges three REAL
// record streams — Mission_Task status transitions, recorded Handoffs, recorded
// Mentions — into one chronological list, returns the honest empty state when no Run
// has started, and never fabricates an entry. Being pure/total/deterministic, the
// property runs the REAL function directly with no mocks or DB (mirroring
// `dashboard-tally.property.test.ts` / `scheduler.test.ts`).
//
// This file hosts ONLY the Property 12 block; the observability-tally property
// (Property 13) lives in its own file (task 1.19).

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  buildMissionTimeline,
  TASK_STATUSES,
  type TaskStatus,
  type TaskTransitionRow,
  type Handoff,
  type Mention,
  type TimelineInput,
  type TimelineSource,
} from './timeline'

// ── Generators ─────────────────────────────────────────────────────────────────
// Each record carries an explicit epoch-ms instant (`atMs`) kept inside a sane range
// (≈ year 2000–2100) so the derived ISO string is always valid. We hand the builder
// the ISO string (its real input shape) but retain `atMs` so the oracle can decide
// chronological position + traceability BY CONSTRUCTION rather than by re-parsing the
// way the implementation does — a genuinely independent ground truth. Because every
// ISO is valid, the builder's `toMs` normalization is the identity here, which keeps
// the ordering assertions clean (per the task's guidance).

const msArb = fc.integer({ min: 946684800000, max: 4102444800000 })
const isoFromMs = (ms: number): string => new Date(ms).toISOString()

// Small key / id pools so collisions (shared instants, repeated agents) actually
// occur and the stable-tie + projection logic is exercised on realistic overlap.
const taskKeyArb = fc.constantFrom('t1', 't2', 't3', 't4', 't5')
const agentIdArb = fc.constantFrom('a1', 'a2', 'a3', 'agent-x', 'agent-y')
const statusArb = fc.constantFrom<TaskStatus>(...(TASK_STATUSES as readonly TaskStatus[]))

interface TransitionSpec {
  atMs: number
  taskKey: string
  agentId: string
  status: TaskStatus
}
const transitionSpecArb: fc.Arbitrary<TransitionSpec> = fc.record({
  atMs: msArb,
  taskKey: taskKeyArb,
  agentId: agentIdArb,
  status: statusArb,
})

interface HandoffSpec {
  atMs: number
  fromTaskKey: string
  toTaskKey: string
  runId: string
}
const handoffSpecArb: fc.Arbitrary<HandoffSpec> = fc.record({
  atMs: msArb,
  fromTaskKey: taskKeyArb,
  toTaskKey: taskKeyArb,
  runId: fc.constantFrom('run-1', 'run-2', 'run-3'),
})

interface MentionSpec {
  atMs: number
  byTaskKey: string
  byAgentId: string
  referencedTaskKey: string
  referencedAgentId: string
  note: string
}
const mentionSpecArb: fc.Arbitrary<MentionSpec> = fc.record({
  atMs: msArb,
  byTaskKey: taskKeyArb,
  byAgentId: agentIdArb,
  referencedTaskKey: taskKeyArb,
  referencedAgentId: agentIdArb,
  note: fc.string({ maxLength: 24 }),
})

// Optional `agentId → display name` map (sometimes absent, per the input shape).
const agentNamesArb = fc.option(
  fc.dictionary(agentIdArb, fc.string({ minLength: 1, maxLength: 12 })),
  { nil: undefined },
)

// ── Spec → real input row builders ───────────────────────────────────────────────
const buildTransition = (s: TransitionSpec): TaskTransitionRow => ({
  taskKey: s.taskKey,
  agentId: s.agentId,
  status: s.status,
  at: isoFromMs(s.atMs),
})
const buildHandoff = (s: HandoffSpec): Handoff => ({
  at: isoFromMs(s.atMs),
  fromTaskKey: s.fromTaskKey,
  toTaskKey: s.toTaskKey,
  outputRef: { runId: s.runId, proposalIds: [] },
})
const buildMention = (s: MentionSpec): Mention => ({
  at: isoFromMs(s.atMs),
  byTaskKey: s.byTaskKey,
  byAgentId: s.byAgentId,
  referencedTaskKey: s.referencedTaskKey,
  referencedAgentId: s.referencedAgentId,
  note: s.note,
})

// ── Oracle helpers (independent of the implementation) ────────────────────────────
const KNOWN_SOURCES: ReadonlyArray<TimelineSource> = ['task-status', 'handoff', 'mention']
const SOURCE_RANK: Record<TimelineSource, number> = { 'task-status': 0, handoff: 1, mention: 2 }

// A sorted "bag" (multiset as a sorted string array) so equality proves same count +
// same members regardless of order.
const bag = (xs: string[]): string[] => [...xs].sort()
const msOf = (iso: string): number => new Date(iso).getTime()

// ── Property 12 ────────────────────────────────────────────────────────────────
// Feature: mission-orchestrator, Property 12: The Mission Timeline is chronological, projection-only, and honest about emptiness
describe('Property 12: The Mission Timeline is chronological, projection-only, and honest about emptiness', () => {
  it('entries are chronological (oldest→newest) and project exactly the supplied real records — none fabricated (Req 8.1, 8.2, 8.3, 8.5, 8.6)', () => {
    fc.assert(
      fc.property(
        fc.array(transitionSpecArb, { maxLength: 30 }),
        fc.array(handoffSpecArb, { maxLength: 30 }),
        fc.array(mentionSpecArb, { maxLength: 30 }),
        agentNamesArb,
        (transitionSpecs, handoffSpecs, mentionSpecs, agentNames) => {
          const taskTransitions = transitionSpecs.map(buildTransition)
          const handoffs = handoffSpecs.map(buildHandoff)
          const mentions = mentionSpecs.map(buildMention)
          const input: TimelineInput = {
            missionStartedAt: isoFromMs(946684800000),
            taskTransitions,
            handoffs,
            mentions,
            agentNames,
            startedAnyRun: true, // a Run has started ⇒ the timeline is materialized
          }

          const entries = buildMissionTimeline(input)

          // ── Projection count: total output == sum of supplied real records ──
          const totalInputs = taskTransitions.length + handoffs.length + mentions.length
          expect(entries.length).toBe(totalInputs)

          // ── No fabricated SOURCE: every entry is one of the three known kinds ──
          for (const e of entries) {
            expect(KNOWN_SOURCES).toContain(e.source)
          }

          // ── Chronological order (oldest→newest) by the event instant ──
          for (let i = 1; i < entries.length; i++) {
            expect(msOf(entries[i].at)).toBeGreaterThanOrEqual(msOf(entries[i - 1].at))
          }

          // ── Stable ties: records sharing an instant keep source order
          //    (task-status, then handoff, then mention) ──
          for (let i = 1; i < entries.length; i++) {
            if (msOf(entries[i].at) === msOf(entries[i - 1].at)) {
              expect(SOURCE_RANK[entries[i].source]).toBeGreaterThanOrEqual(
                SOURCE_RANK[entries[i - 1].source],
              )
            }
          }

          // ── Traceability (per source): every emitted entry matches a supplied
          //    record by its salient fields + instant, and the multisets are equal
          //    (so nothing is invented and nothing is dropped) ──
          const outTaskStatus = entries.filter((e) => e.source === 'task-status')
          const outHandoff = entries.filter((e) => e.source === 'handoff')
          const outMention = entries.filter((e) => e.source === 'mention')

          expect(bag(outTaskStatus.map((e) => `${e.taskKey}|${e.status}|${msOf(e.at)}`))).toEqual(
            bag(transitionSpecs.map((s) => `${s.taskKey}|${s.status}|${s.atMs}`)),
          )
          expect(bag(outHandoff.map((e) => `${e.taskKey}|${msOf(e.at)}`))).toEqual(
            bag(handoffSpecs.map((s) => `${s.fromTaskKey}|${s.atMs}`)),
          )
          expect(bag(outMention.map((e) => `${e.taskKey}|${msOf(e.at)}`))).toEqual(
            bag(mentionSpecs.map((s) => `${s.byTaskKey}|${s.atMs}`)),
          )

          // ── Determinism: same input ⇒ identical timeline ──
          expect(buildMissionTimeline(input)).toEqual(entries)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returns the honest empty state [] whenever startedAnyRun is false, regardless of any other input (Req 8.4)', () => {
    fc.assert(
      fc.property(
        fc.array(transitionSpecArb, { maxLength: 30 }),
        fc.array(handoffSpecArb, { maxLength: 30 }),
        fc.array(mentionSpecArb, { maxLength: 30 }),
        agentNamesArb,
        fc.option(msArb, { nil: null }),
        (transitionSpecs, handoffSpecs, mentionSpecs, agentNames, startedAtMs) => {
          const input: TimelineInput = {
            missionStartedAt: startedAtMs == null ? null : isoFromMs(startedAtMs),
            taskTransitions: transitionSpecs.map(buildTransition),
            handoffs: handoffSpecs.map(buildHandoff),
            mentions: mentionSpecs.map(buildMention),
            agentNames,
            startedAnyRun: false, // no Run started ⇒ honest empty state
          }

          // Empty even when the three record streams are densely populated.
          expect(buildMissionTimeline(input)).toEqual([])
        },
      ),
      { numRuns: 100 },
    )
  })
})
