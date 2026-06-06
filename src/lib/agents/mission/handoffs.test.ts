// Feature: mission-orchestrator, Property 8: Handoffs are recorded for exactly the dependents and carry the real output reference
//
// **Validates: Requirements 4.3, 7.1, 7.5**
//
// The Handoff-recording laws over an ARBITRARY just-completed task + an ARBITRARY task
// set, run directly against the REAL pure `handoffsForCompletion` (no mocks, no I/O —
// it imports no model). When a Mission_Task finishes, the recorder must produce the
// collaboration record that hands its produced output to the tasks that depend on it:
//
//   • DEPENDENT COVERAGE (Req 4.3, 7.1) — EXACTLY one Handoff for each task whose
//     `dependsOn` includes the completed task's key, and NONE for any task that does
//     not depend on it. The set of receiving keys equals the oracle's dependent set.
//   • NEVER SELF (Req 4.3) — the completed task is never handed off to itself, even
//     when it (defensively) lists itself in its own `dependsOn`.
//   • REAL OUTPUT REFERENCE (Req 7.5) — every Handoff carries the completed task's
//     real `runId` and `proposalIds` VERBATIM from the supplied `outputRef`, and names
//     the source (`fromTaskKey === completedTaskKey`) and the receiver (`toTaskKey`).
//   • NON-ALIASING (Req 7.5) — `proposalIds` is copied per Handoff, so mutating one
//     returned Handoff's array can never affect another Handoff or the caller's input.
//
// The oracle below independently computes the expected dependent set from the raw task
// list (unique keys, excluding the completed key itself), then the properties assert
// the function agrees with it for every generated scenario — including the cases where
// the completed key is absent from the task set or refers to a task that lists itself.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { handoffsForCompletion, type Handoff, type HandoffTaskRef } from './handoffs'

// ── Oracle ───────────────────────────────────────────────────────────────────────

/**
 * Independently derive the set of keys that should RECEIVE a Handoff when
 * `completedTaskKey` finishes: every task whose `dependsOn` includes the completed
 * key, EXCEPT the completed task itself (never handed off to itself). Mirrors the
 * implementation's contract without reusing its loop.
 */
function expectedReceiverKeys(completedTaskKey: string, tasks: HandoffTaskRef[]): string[] {
  const receivers: string[] = []
  for (const task of tasks) {
    if (task.key === completedTaskKey) continue // never to itself
    if (task.dependsOn.includes(completedTaskKey)) receivers.push(task.key)
  }
  return receivers
}

// ── Generators ───────────────────────────────────────────────────────────────────

// A small key pool so dependencies collide often with the completed key — exercising
// the real-dependent path heavily rather than degenerating into all-non-dependents.
const KEY_POOL = ['t0', 't1', 't2', 't3', 't4', 't5'] as const

/**
 * Build a task set with UNIQUE keys: take a subset of the key pool (preserving order),
 * and for each chosen key generate a `dependsOn` list drawn from the pool. The pool is
 * shared with the completed-key generator so dependencies frequently point at the
 * completed task — and a task may list ITSELF (defensive self-dependency) which the
 * recorder must still never hand off to itself.
 */
const tasksArb: fc.Arbitrary<HandoffTaskRef[]> = fc
  .subarray([...KEY_POOL], { minLength: 0, maxLength: KEY_POOL.length })
  .chain((keys) =>
    fc.tuple(
      ...keys.map((key) =>
        fc
          .subarray([...KEY_POOL], { minLength: 0, maxLength: KEY_POOL.length })
          .map((dependsOn): HandoffTaskRef => ({ key, dependsOn })),
      ),
    ),
  )
  .map((arr) => arr as HandoffTaskRef[])

// The just-completed task key: USUALLY drawn from the pool (so it is present in the
// task set and matches dependencies), sometimes an absent key (no task depends on it),
// covering "present", "self-referencing", and "not present" scenarios.
const completedKeyArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...KEY_POOL) },
  { weight: 1, arbitrary: fc.constant('absent-key') },
)

// The real output reference carried by the completed task's Run: an arbitrary runId
// and an arbitrary (possibly empty, possibly duplicated) list of proposal ids.
const outputRefArb: fc.Arbitrary<Handoff['outputRef']> = fc.record({
  runId: fc.string({ maxLength: 24 }),
  proposalIds: fc.array(fc.string({ maxLength: 12 }), { maxLength: 5 }),
})

const atArb = fc.date({ noInvalidDate: true }).map((d) => d.toISOString())

describe('Property 8: Handoffs are recorded for exactly the dependents and carry the real output reference', () => {
  // ── (1) DEPENDENT COVERAGE (Req 4.3, 7.1) — one Handoff per dependent, none else ──
  it('emits exactly one Handoff per dependent and none for non-dependents (never to itself)', () => {
    fc.assert(
      fc.property(completedKeyArb, outputRefArb, tasksArb, atArb, (completedKey, outputRef, tasks, at) => {
        const result = handoffsForCompletion(completedKey, outputRef, tasks, at)
        const expected = expectedReceiverKeys(completedKey, tasks)

        // The set of receiving keys equals the oracle's dependent set, exactly once each.
        const receiverKeys = result.map((h) => h.toTaskKey)
        expect(receiverKeys).toEqual(expected)
        expect(result).toHaveLength(expected.length)

        // No Handoff ever targets the completed task itself.
        for (const handoff of result) {
          expect(handoff.toTaskKey).not.toBe(completedKey)
        }
      }),
      { numRuns: 100 },
    )
  })

  // ── (2) SOURCE + REAL OUTPUT REFERENCE (Req 7.1, 7.5) — verbatim runId + proposalIds ─
  it('names the source and carries the completed task real runId + proposalIds verbatim', () => {
    fc.assert(
      fc.property(completedKeyArb, outputRefArb, tasksArb, atArb, (completedKey, outputRef, tasks, at) => {
        const result = handoffsForCompletion(completedKey, outputRef, tasks, at)

        for (const handoff of result) {
          // Source is the completed task; the recorded instant is the supplied `at`.
          expect(handoff.fromTaskKey).toBe(completedKey)
          expect(handoff.at).toBe(at)
          // Real Run reference copied verbatim — never fabricated (Req 7.5).
          expect(handoff.outputRef.runId).toBe(outputRef.runId)
          expect(handoff.outputRef.proposalIds).toEqual(outputRef.proposalIds)
        }
      }),
      { numRuns: 100 },
    )
  })

  // ── (3) NON-ALIASING (Req 7.5) — proposalIds copied, not shared across Handoffs ───
  it('copies proposalIds so mutating one Handoff array cannot affect any other Handoff', () => {
    fc.assert(
      fc.property(
        // Force ≥2 dependents and a non-empty proposalIds so aliasing would be observable.
        fc.record({
          proposalIds: fc.array(fc.string({ maxLength: 12 }), { minLength: 1, maxLength: 5 }),
          runId: fc.string({ maxLength: 24 }),
        }),
        atArb,
        (outputRef, at) => {
          // Two tasks that both depend on the completed task → two Handoffs sharing the ref.
          const tasks: HandoffTaskRef[] = [
            { key: 'dep-a', dependsOn: ['done'] },
            { key: 'dep-b', dependsOn: ['done'] },
          ]
          const result = handoffsForCompletion('done', outputRef, tasks, at)
          expect(result).toHaveLength(2)

          // Each Handoff owns a distinct array instance (not aliased to each other or input).
          expect(result[0].outputRef.proposalIds).not.toBe(result[1].outputRef.proposalIds)
          expect(result[0].outputRef.proposalIds).not.toBe(outputRef.proposalIds)

          // Mutating the first Handoff's ids leaves the second (and the input) untouched.
          const originalSecond = [...result[1].outputRef.proposalIds]
          const originalInput = [...outputRef.proposalIds]
          result[0].outputRef.proposalIds.push('MUTATION')
          expect(result[1].outputRef.proposalIds).toEqual(originalSecond)
          expect(outputRef.proposalIds).toEqual(originalInput)
        },
      ),
      { numRuns: 100 },
    )
  })
})
