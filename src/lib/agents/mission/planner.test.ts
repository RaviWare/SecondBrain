// Property tests for the Mission Planner pure core (`mission/planner.ts`).
//
// This file hosts the planner's property-based tests. Task 1.4 implements ONLY the
// Property 2 block below (the Task_Graph validator). Later planner properties
// (1.6 role-fit assignment, 1.8 Lead_Agent auto-selection) will be added here in
// their own blocks — they are intentionally NOT present yet.
//
// `validateTaskGraph` is PURE / TOTAL / DETERMINISTIC (no I/O, no models), so it is
// tested directly with no mocks. The oracles below re-derive the expected result from
// the DOCUMENTED contract using DIFFERENT algorithms than the implementation
// (DFS three-colour cycle detection + memoised longest-path depth, vs the SUT's Kahn
// topological peel + recursion), so a divergence is a real bug, not a tautology.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  validateTaskGraph,
  type PlannedTask,
  type GraphLimits,
  type GraphValidation,
} from './planner'

// ── Independent oracles (separate algorithms from the SUT) ───────────────────────
// Both operate on a node set + a dependency map (`key → set of prerequisite keys`),
// the exact relation `validateTaskGraph` reads from `dependsOn`. A self-dependency
// (key in its own dep set) is a 1-cycle, matching the SUT.

/** Cycle detection via DFS three-colouring (white = unseen, grey = on stack,
 *  black = done). A grey→grey back-edge ⇒ a cycle. Iterative-recursive; never throws. */
function hasCycleOracle(nodes: readonly string[], deps: Map<string, Set<string>>): boolean {
  const WHITE = 0
  const GREY = 1
  const BLACK = 2
  const colour = new Map<string, number>()
  for (const n of nodes) colour.set(n, WHITE)

  let cyclic = false
  const visit = (u: string): void => {
    colour.set(u, GREY)
    for (const v of deps.get(u) ?? new Set<string>()) {
      const c = colour.get(v)
      if (c === GREY) {
        cyclic = true
        return
      }
      if (c === WHITE) {
        visit(v)
        if (cyclic) return
      }
    }
    colour.set(u, BLACK)
  }

  for (const n of nodes) {
    if (cyclic) break
    if (colour.get(n) === WHITE) visit(n)
  }
  return cyclic
}

/** Longest dependency chain measured in NODES (a lone task = 1, `A→B` = 2, empty
 *  graph = 0). Memoised recursion over a known-acyclic graph; defined only after the
 *  cycle check passes, exactly as the SUT documents. */
function longestDepthOracle(nodes: readonly string[], deps: Map<string, Set<string>>): number {
  const memo = new Map<string, number>()
  const chain = (u: string): number => {
    const cached = memo.get(u)
    if (cached !== undefined) return cached
    let best = 1
    for (const d of deps.get(u) ?? new Set<string>()) {
      const candidate = 1 + chain(d)
      if (candidate > best) best = candidate
    }
    memo.set(u, best)
    return best
  }
  let depth = 0
  for (const n of nodes) {
    const d = chain(n)
    if (d > depth) depth = d
  }
  return depth
}

/**
 * The expected `GraphValidation`, derived from the oracles and the DOCUMENTED fixed
 * failure order: cycle → depth → count. Assumes UNIQUE node keys (the generator below
 * guarantees this), and reads only edges that reference an existing key (the SUT drops
 * dangling edges; the generator never emits them).
 */
function expectedValidation(tasks: readonly PlannedTask[], limits: GraphLimits): GraphValidation {
  const nodes: string[] = []
  const present = new Set<string>()
  for (const t of tasks) {
    if (typeof t.key === 'string' && t.key.length > 0 && !present.has(t.key)) {
      present.add(t.key)
      nodes.push(t.key)
    }
  }

  const deps = new Map<string, Set<string>>()
  for (const key of nodes) deps.set(key, new Set<string>())
  for (const t of tasks) {
    const set = deps.get(t.key)
    if (!set) continue
    for (const d of t.dependsOn) if (present.has(d)) set.add(d)
  }

  const taskCount = nodes.length

  if (hasCycleOracle(nodes, deps)) return { ok: false, reason: 'cycle' }

  const depth = longestDepthOracle(nodes, deps)
  const maxDepth = Number.isFinite(limits.maxDepth) ? limits.maxDepth : Infinity
  if (depth > maxDepth) return { ok: false, reason: 'graph-limit-depth', depth }

  const maxTasks = Number.isFinite(limits.maxTasks) ? limits.maxTasks : Infinity
  if (taskCount > maxTasks) return { ok: false, reason: 'graph-limit-count', taskCount }

  return { ok: true, depth, taskCount }
}

// ── Generators ───────────────────────────────────────────────────────────────────
// DESIGN CHOICE (per task 1.4): the generator builds ALREADY-CLEAN graphs — unique
// string keys `t0..t(n-1)` and `dependsOn` edges that ONLY reference existing keys —
// rather than running raw input through `buildTaskGraph`. This keeps the oracle's view
// of the graph identical to the validator's (no dangling edges to reconcile, no key
// dedup to model) so the comparison is exact and the failures are unambiguous.
//
// Coverage is split by an `acyclic` flag so BOTH branches of "cycle iff" are well fed:
//  • acyclic=true  → each node i may depend only on a subset of EARLIER keys
//    (strictly lower index) ⇒ guaranteed DAG, and isolated/disconnected nodes arise
//    naturally (the disconnected-components case Req 2.6 requires).
//  • acyclic=false → each node may depend on ANY key incl. itself and higher indices
//    ⇒ cycles (and self-loops) appear, exercising the cycle-rejection path.

const helper = (key: string, dependsOn: string[]): PlannedTask => ({
  key,
  description: `task ${key}`,
  dependsOn,
  assignedAgentId: 'a1',
  assignmentFallback: false,
})

const graphArb: fc.Arbitrary<PlannedTask[]> = fc
  .record({ n: fc.integer({ min: 0, max: 8 }), acyclic: fc.boolean() })
  .chain(({ n, acyclic }) => {
    if (n === 0) return fc.constant<PlannedTask[]>([])
    const keys = Array.from({ length: n }, (_, i) => `t${i}`)
    const perNode = keys.map((_key, i) => {
      const candidates = acyclic ? keys.slice(0, i) : keys
      return candidates.length === 0 ? fc.constant<string[]>([]) : fc.subarray(candidates)
    })
    return fc.tuple(...perNode).map((depsPerNode) => keys.map((key, i) => helper(key, depsPerNode[i])))
  })

// Limits drawn small (0..10) so the depth threshold (depth ∈ 0..n) and the count
// threshold (count ∈ 0..8) are each exercised on BOTH sides — pass and reject.
const limitsArb: fc.Arbitrary<GraphLimits> = fc.record({
  maxDepth: fc.integer({ min: 0, max: 10 }),
  maxTasks: fc.integer({ min: 0, max: 10 }),
})

// Generous limits that can never themselves trigger a Graph_Limit failure on these
// graphs (depth ≤ 8, count ≤ 8) — isolates the cycle vs ok:true distinction.
const generousLimits: GraphLimits = { maxDepth: 100, maxTasks: 100 }

// ── Property 2 ───────────────────────────────────────────────────────────────────
// Feature: mission-orchestrator, Property 2: The Task_Graph validator rejects every cycle and every over-limit graph, and nothing else
// Validates: Requirements 2.5, 2.6, 2.7, 5.1, 5.2, 6.1
describe('Property 2: The Task_Graph validator rejects every cycle and every over-limit graph, and nothing else', () => {
  // 1. THE CORE INVARIANT: over arbitrary graphs × limits, the validator's verdict
  //    EXACTLY equals the independently-derived oracle verdict — same ok/reason, same
  //    reported depth/taskCount, in the same fixed order (cycle → depth → count).
  it('verdict equals the independent oracle for every graph × limits (incl. disconnected components)', () => {
    fc.assert(
      fc.property(graphArb, limitsArb, (tasks, limits) => {
        let result!: GraphValidation
        expect(() => {
          result = validateTaskGraph({ tasks }, limits)
        }).not.toThrow()
        expect(result).toEqual(expectedValidation(tasks, limits))
      }),
      { numRuns: 200 },
    )
  })

  // 2. CYCLE IFF (Req 2.7, 6.1): with limits that can never trip a Graph_Limit, the
  //    validator reports reason:'cycle' EXACTLY when a cycle exists, and otherwise
  //    accepts the graph — both directions over arbitrary graphs.
  it("reports reason:'cycle' iff a cycle exists (limits held generous)", () => {
    fc.assert(
      fc.property(graphArb, (tasks) => {
        const result = validateTaskGraph({ tasks }, generousLimits)
        const cyclic = hasCycleOracle(
          tasks.map((t) => t.key),
          buildDeps(tasks),
        )
        if (cyclic) {
          expect(result).toEqual({ ok: false, reason: 'cycle' })
        } else {
          expect(result.ok).toBe(true)
        }
      }),
      { numRuns: 200 },
    )
  })

  // 3. CYCLE PRECEDENCE (fixed failure order): a cyclic graph is reported as 'cycle'
  //    even when it ALSO violates the depth and/or count limit — cycle wins.
  it("a cyclic graph reports 'cycle' even when it also exceeds the Graph_Limit", () => {
    fc.assert(
      fc.property(graphArb, limitsArb, (tasks, limits) => {
        const cyclic = hasCycleOracle(
          tasks.map((t) => t.key),
          buildDeps(tasks),
        )
        fc.pre(cyclic) // only the cyclic graphs are relevant here
        // Even with the tightest possible limits, a cycle must be reported first.
        const tight: GraphLimits = { maxDepth: 0, maxTasks: 0 }
        expect(validateTaskGraph({ tasks }, tight)).toEqual({ ok: false, reason: 'cycle' })
        expect(validateTaskGraph({ tasks }, limits)).toEqual({ ok: false, reason: 'cycle' })
      }),
      { numRuns: 200 },
    )
  })

  // 4. ACYCLIC WITHIN-LIMIT ALWAYS PASSES, INCLUDING DISCONNECTED COMPONENTS (Req 2.6):
  //    a graph assembled from TWO independent chains (a guaranteed disconnected,
  //    acyclic graph) is accepted, with the reported depth/count equal to the truth.
  it('accepts acyclic disconnected-component graphs within limits, reporting the true depth and count', () => {
    const disconnectedArb = fc
      .record({ a: fc.integer({ min: 1, max: 5 }), b: fc.integer({ min: 1, max: 5 }) })
      .map(({ a, b }) => {
        const tasks: PlannedTask[] = []
        // Component A: a straight chain a0 ← a1 ← ... (each depends on the previous).
        for (let i = 0; i < a; i++) tasks.push(helper(`a${i}`, i === 0 ? [] : [`a${i - 1}`]))
        // Component B: a separate straight chain, no edges crossing to A.
        for (let i = 0; i < b; i++) tasks.push(helper(`b${i}`, i === 0 ? [] : [`b${i - 1}`]))
        return { tasks, expectedDepth: Math.max(a, b), expectedCount: a + b }
      })

    fc.assert(
      fc.property(disconnectedArb, ({ tasks, expectedDepth, expectedCount }) => {
        const result = validateTaskGraph({ tasks }, generousLimits)
        expect(result).toEqual({ ok: true, depth: expectedDepth, taskCount: expectedCount })
      }),
      { numRuns: 100 },
    )
  })
})

/** Build the `key → prerequisite-set` map the oracles read (existing-key edges only). */
function buildDeps(tasks: readonly PlannedTask[]): Map<string, Set<string>> {
  const present = new Set(tasks.map((t) => t.key))
  const deps = new Map<string, Set<string>>()
  for (const t of tasks) if (!deps.has(t.key)) deps.set(t.key, new Set<string>())
  for (const t of tasks) {
    const set = deps.get(t.key)!
    for (const d of t.dependsOn) if (present.has(d)) set.add(d)
  }
  return deps
}
