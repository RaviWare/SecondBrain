// ── Mission Planner: Task_Graph builder + validator (PURE, total, deterministic) ──
// The planning core of the Mission Orchestrator. The Lead_Agent turns one Objective
// into a dependency-ordered Task_Graph; this module owns the PURE half of that work —
// normalizing the raw proposed nodes into a clean graph shape (`buildTaskGraph`) and
// validating that graph for the two things that must never reach execution: circular
// dependencies and an over-sized graph (`validateTaskGraph`). See design.md →
// "Components and Interfaces · 2. Planner" and Requirements 2.1, 2.2, 2.5, 2.6, 2.7,
// 5.1, 5.2, 6.1.
//
// WHY THIS FILE IS PURE: like `scheduler.ts`, `budget.ts`, and `lifecycle.ts`, this is
// a unit/property-testable decision core. It imports NO Mongoose model and performs NO
// I/O — no `connectDB`, no model reads, no clock. The one impure step in planning, the
// Lead_Agent model call (`decomposeObjective`), is a SEPARATE function added in task
// 3.1 with its LLM dependency injected; the role-fit assignment (`assignByRole`,
// task 1.5) and Lead_Agent auto-selection (`selectLeadAgent`, task 1.7) are likewise
// separate. This task implements ONLY `buildTaskGraph` + `validateTaskGraph` and the
// shared types; the rest is intentionally left as clean room.
//
// The planning route (task 3.1) composes the full pipeline:
//   decomposeObjective → buildTaskGraph → assignByRole → validateTaskGraph
// and on `{ ok: true }` persists the tasks + fires the FSM `decomposed-ok`, on failure
// records the reason + fires `decomposition-failed` (the graph never executes — Req
// 2.7, 5.2, 9.8).

// ── Shared planner types (declared here; consumed by the later planner tasks) ─────

/**
 * One node the Lead_Agent proposes, BEFORE assignment and validation. `key` is a
 * stable within-graph identifier (e.g. `'t1'`); `dependsOn` lists the keys of the
 * tasks whose output this one needs (each is a Task_Dependency edge); `roleHint` is
 * the advisory role the Lead_Agent thinks fits (consumed later by `assignByRole`).
 */
export interface RawTask {
  key: string
  description: string
  dependsOn: string[]
  roleHint?: string
}

/** The minimal Squad-member view the assigner reads — id + role only (Req 2.3). */
export interface SquadAgentRef {
  agentId: string
  role: string
}

/**
 * A fully-assigned, normalized task ready to persist as a `MissionTask`. `buildTaskGraph`
 * produces the structural fields (`key` / `description` / `dependsOn`); `assignByRole`
 * (task 1.5) fills `assignedAgentId` (best-fit by role, Lead_Agent on fallback — Req
 * 2.3, 2.4) and `assignmentFallback` (true when assigned to the Lead_Agent as a fallback).
 */
export interface PlannedTask {
  key: string
  description: string
  dependsOn: string[]
  assignedAgentId: string
  assignmentFallback: boolean
}

/** A Mission's Task_Graph — the dependency-ordered set of (assigned) tasks. */
export interface TaskGraph {
  tasks: PlannedTask[]
}

/** The Graph_Limit: the maximum permitted longest-chain depth and total task count (Req 5.1). */
export interface GraphLimits {
  maxDepth: number
  maxTasks: number
}

/**
 * The result of validating a Task_Graph. On success it reports the measured `depth`
 * (longest dependency chain) and `taskCount`; on failure it names the single first
 * reason the graph was rejected. The failure order is fixed: a cycle is reported
 * before any limit, and the depth limit before the count limit (see `validateTaskGraph`).
 */
export type GraphValidation =
  | { ok: true; depth: number; taskCount: number }
  | { ok: false; reason: 'cycle' } // Req 2.7, 6.1
  | { ok: false; reason: 'graph-limit-depth'; depth: number } // Req 5.2
  | { ok: false; reason: 'graph-limit-count'; taskCount: number } // Req 5.2

// ── buildTaskGraph — normalize the raw proposed nodes ─────────────────────────────

/**
 * Normalize a Lead_Agent's raw `RawTask[]` into a clean graph shape. PURE, TOTAL,
 * DETERMINISTIC — never throws. Three normalizations, in order (design.md §2):
 *
 *   1. DEDUPE KEYS — when two raw tasks share a `key`, the FIRST occurrence wins and
 *      later duplicates are dropped, so every key in the result is unique.
 *   2. DROP SELF-DEPS — a task that lists its own key as a dependency has that edge
 *      removed (a task never depends on itself).
 *   3. DROP DANGLING DEPS — a dependency pointing at a key that is not present in the
 *      (deduped) task set is removed, so every remaining edge resolves to a real node.
 *
 * Duplicate edges to the same dependency are also collapsed so the downstream cycle
 * check counts each edge once. Malformed input is handled defensively for totality: a
 * non-array argument, null/non-object entries, non-string or empty keys, and non-string
 * dependency entries are skipped rather than throwing.
 *
 * Returns the structural fields only (`key` / `description` / `dependsOn`); assignment
 * is layered on later by `assignByRole` (task 1.5), hence the `Omit`.
 */
export function buildTaskGraph(
  raw: RawTask[],
): { tasks: Array<Omit<PlannedTask, 'assignedAgentId' | 'assignmentFallback'>> } {
  if (!Array.isArray(raw)) return { tasks: [] }

  // Pass 1 — dedupe keys (first occurrence wins) and collect a normalized node per key,
  // preserving the original order of first appearance for a deterministic result.
  const byKey = new Map<string, { description: string; dependsOn: string[] }>()
  const order: string[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const key = (entry as RawTask).key
    if (typeof key !== 'string' || key.length === 0) continue
    if (byKey.has(key)) continue // dedupe: a repeated key keeps the first occurrence
    const description =
      typeof (entry as RawTask).description === 'string' ? (entry as RawTask).description : ''
    const rawDeps = Array.isArray((entry as RawTask).dependsOn) ? (entry as RawTask).dependsOn : []
    byKey.set(key, {
      description,
      dependsOn: rawDeps.filter((d): d is string => typeof d === 'string'),
    })
    order.push(key)
  }

  // Pass 2 — drop self-deps + dangling deps, and collapse duplicate edges. Done after
  // pass 1 so "present" is judged against the FULL deduped key set.
  const tasks = order.map((key) => {
    const node = byKey.get(key)!
    const seen = new Set<string>()
    const dependsOn: string[] = []
    for (const dep of node.dependsOn) {
      if (dep === key) continue // self-dependency
      if (!byKey.has(dep)) continue // dangling: points at a key not in the graph
      if (seen.has(dep)) continue // duplicate edge
      seen.add(dep)
      dependsOn.push(dep)
    }
    return { key, description: node.description, dependsOn }
  })

  return { tasks }
}

// ── validateTaskGraph — cycles + Graph_Limit only ─────────────────────────────────

/**
 * Validate a Task_Graph for the two conditions that must never reach execution, and
 * NOTHING else. PURE, TOTAL, DETERMINISTIC — never throws (Req 2.6, 2.7, 5.1, 5.2, 6.1).
 *
 * Checks, in this FIXED order, returning the FIRST failure:
 *   1. CYCLE — via Kahn's algorithm: repeatedly remove zero-in-degree nodes; if any
 *      node remains, the graph contains a circular dependency → `{ ok:false,
 *      reason:'cycle' }` (Req 2.7, 6.1). A task that depends on itself is a 1-cycle and
 *      is correctly reported here.
 *   2. DEPTH — only computed once the graph is known acyclic (longest path is undefined
 *      on a cyclic graph). `depth` is the number of nodes in the longest dependency
 *      chain: a lone task has depth 1, `A → B` has depth 2, the empty graph has depth 0.
 *      `depth > limits.maxDepth` → `{ ok:false, reason:'graph-limit-depth', depth }`.
 *   3. COUNT — `taskCount > limits.maxTasks` → `{ ok:false, reason:'graph-limit-count',
 *      taskCount }`.
 *
 * Validation is STRUCTURAL only: it rejects circular dependencies and over-limit graphs.
 * Every other shape passes — in particular DISCONNECTED COMPONENTS (multiple independent
 * roots) are valid and MUST pass (Req 2.6).
 *
 * Robust to a not-yet-normalized input as well as the normalized output of
 * `buildTaskGraph`: only the `key` / `dependsOn` fields are read; dependency entries
 * that reference a key not present in the graph are ignored (so a dangling edge can
 * never masquerade as an unsatisfiable in-degree and be mis-reported as a cycle), and
 * duplicate edges are collapsed. A non-finite `maxDepth` / `maxTasks` is treated as
 * unlimited.
 */
export function validateTaskGraph(graph: TaskGraph, limits: GraphLimits): GraphValidation {
  const tasks = graph && Array.isArray(graph.tasks) ? graph.tasks : []

  // Build the unique node set, then each node's dependency set restricted to EXISTING
  // keys. Self-deps are preserved (so a self-loop is seen as a cycle); dangling deps are
  // dropped (so they cannot inflate an in-degree that nothing can ever decrement).
  const deps = new Map<string, Set<string>>()
  for (const t of tasks) {
    if (!t || typeof t.key !== 'string' || t.key.length === 0) continue
    if (!deps.has(t.key)) deps.set(t.key, new Set<string>())
  }
  for (const t of tasks) {
    if (!t || typeof t.key !== 'string') continue
    const set = deps.get(t.key)
    if (!set) continue
    const raw = Array.isArray(t.dependsOn) ? t.dependsOn : []
    for (const d of raw) {
      if (typeof d === 'string' && deps.has(d)) set.add(d)
    }
  }

  const taskCount = deps.size

  // ── 1) Cycle check — Kahn's algorithm ───────────────────────────────────────────
  // Edge orientation: a prerequisite (dependency) must be processed before its
  // dependent, so `inDegree(node)` = the number of dependencies it has, and
  // `dependents(dep)` = the nodes that list `dep` in their `dependsOn`. We peel off
  // zero-in-degree nodes; if fewer than `taskCount` are peeled, a cycle remains.
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  for (const [key, set] of deps) {
    inDegree.set(key, set.size)
    if (!dependents.has(key)) dependents.set(key, [])
  }
  for (const [key, set] of deps) {
    for (const dep of set) dependents.get(dep)!.push(key)
  }

  const queue: string[] = []
  for (const [key, degree] of inDegree) if (degree === 0) queue.push(key)
  let removed = 0
  while (queue.length > 0) {
    const node = queue.shift()!
    removed++
    for (const dependent of dependents.get(node)!) {
      const next = (inDegree.get(dependent) ?? 0) - 1
      inDegree.set(dependent, next)
      if (next === 0) queue.push(dependent)
    }
  }
  if (removed < taskCount) return { ok: false, reason: 'cycle' }

  // ── 2) Depth check — longest dependency chain (in nodes) ─────────────────────────
  // Safe to compute now that the graph is known acyclic. Memoized so each node's depth
  // is resolved once; recursion terminates because the graph has no cycles.
  const depthMemo = new Map<string, number>()
  const depthOf = (key: string): number => {
    const cached = depthMemo.get(key)
    if (cached !== undefined) return cached
    let best = 1
    for (const dep of deps.get(key)!) {
      const candidate = 1 + depthOf(dep)
      if (candidate > best) best = candidate
    }
    depthMemo.set(key, best)
    return best
  }
  let depth = 0
  for (const key of deps.keys()) {
    const d = depthOf(key)
    if (d > depth) depth = d
  }

  const maxDepth = Number.isFinite(limits?.maxDepth) ? limits.maxDepth : Infinity
  if (depth > maxDepth) return { ok: false, reason: 'graph-limit-depth', depth }

  // ── 3) Count check ───────────────────────────────────────────────────────────────
  const maxTasks = Number.isFinite(limits?.maxTasks) ? limits.maxTasks : Infinity
  if (taskCount > maxTasks) return { ok: false, reason: 'graph-limit-count', taskCount }

  return { ok: true, depth, taskCount }
}

// ── assignByRole — best-fit Squad assignment with Lead_Agent fallback ─────────────

/**
 * Assign every task to a best-fit Squad Agent by role, falling back to the Lead_Agent
 * when no Squad member fits. PURE, TOTAL, DETERMINISTIC — never throws (Req 2.3, 2.4;
 * design.md → "Components and Interfaces · 2. Planner").
 *
 * The Lead_Agent (`assignByRole` step) reads each task's advisory role hint and matches
 * it against the squad's roles:
 *
 *   • ROLE MATCH (Req 2.3) — when a task's role hint equals a Squad Agent's role, the
 *     task is assigned to that Agent and `assignmentFallback` is `false`. Matching is
 *     case-insensitive and whitespace-insensitive (both sides are trimmed + lower-cased),
 *     which is the reasonable, deterministic notion of "fit" between a free-text hint and
 *     a free-text role.
 *   • LEAD FALLBACK (Req 2.4) — when NO Squad Agent fits a task (no hint, an unknown
 *     role, or an empty squad), the task is assigned to `leadAgentId` and
 *     `assignmentFallback` is set `true`, recording that the Lead_Agent took it as a
 *     fallback. With an empty squad EVERY task therefore falls back to the lead.
 *
 * TOTALITY GUARANTEE: every well-formed task ends up with EXACTLY ONE `assignedAgentId`
 * (a squad fit or the lead) and exactly one `assignmentFallback` flag — there is no
 * "unassigned" outcome. The result is deterministic: the FIRST Squad member for a given
 * normalized role wins (a stable best-fit), and tasks keep their input order.
 *
 * On `roleHint`: it is advisory and is intentionally NOT part of the structural shape
 * `buildTaskGraph` emits (which carries only `key` / `description` / `dependsOn`), so the
 * signature here uses `ReturnType<typeof buildTaskGraph>['tasks']` verbatim. The hint is
 * read DEFENSIVELY at runtime — a task that carries one (e.g. a plan node constructed
 * with its `RawTask.roleHint` preserved) is matched; a task without one simply has no fit
 * and falls back to the lead. This keeps the function total against either input shape.
 *
 * Defensive normalization mirrors `buildTaskGraph`: a non-array `tasks`/`squad`, null or
 * non-object entries, non-string or empty keys/ids, and non-string roles/deps are skipped
 * rather than throwing, so the function is total on arbitrary input.
 */
export function assignByRole(
  tasks: ReturnType<typeof buildTaskGraph>['tasks'],
  squad: SquadAgentRef[],
  leadAgentId: string,
): PlannedTask[] {
  // The fallback target. Coerced defensively so a malformed lead id can never throw;
  // an empty string still satisfies "exactly one assignedAgentId" for totality.
  const lead = typeof leadAgentId === 'string' ? leadAgentId : ''

  // Build a normalized-role → agentId lookup over the squad. Roles are trimmed +
  // lower-cased so matching is case-insensitive/whitespace-insensitive. The FIRST squad
  // member for a given normalized role wins (deterministic best-fit); duplicates and
  // members with a non-string id, a non-string role, or an empty normalized role are
  // skipped (they can never be a meaningful fit).
  const byRole = new Map<string, string>()
  if (Array.isArray(squad)) {
    for (const member of squad) {
      if (!member || typeof member !== 'object') continue
      const agentId = (member as SquadAgentRef).agentId
      const role = (member as SquadAgentRef).role
      if (typeof agentId !== 'string' || agentId.length === 0) continue
      if (typeof role !== 'string') continue
      const norm = role.trim().toLowerCase()
      if (norm.length === 0) continue
      if (!byRole.has(norm)) byRole.set(norm, agentId)
    }
  }

  const list = Array.isArray(tasks) ? tasks : []
  const planned: PlannedTask[] = []
  for (const task of list) {
    if (!task || typeof task.key !== 'string' || task.key.length === 0) continue

    // roleHint is advisory and not part of the structural type, so read it defensively.
    const hintRaw = (task as { roleHint?: unknown }).roleHint
    const hint = typeof hintRaw === 'string' ? hintRaw.trim().toLowerCase() : ''
    const fit = hint.length > 0 ? byRole.get(hint) : undefined

    // A squad fit wins; otherwise the Lead_Agent takes it as a recorded fallback.
    planned.push({
      key: task.key,
      description: typeof task.description === 'string' ? task.description : '',
      dependsOn: Array.isArray(task.dependsOn)
        ? task.dependsOn.filter((d): d is string => typeof d === 'string')
        : [],
      assignedAgentId: fit ?? lead,
      assignmentFallback: fit === undefined,
    })
  }

  return planned
}

// ── selectLeadAgent — auto-select a Lead-eligible Squad Agent by role fit ─────────

/**
 * Auto-select a Lead_Agent from the user's Squad by role fit, returning the chosen
 * member or `null` when none is eligible. PURE, TOTAL, DETERMINISTIC — never throws
 * (Req 1.4, 1.8; design.md → "Components and Interfaces · 2. Planner").
 *
 * WHY THIS IS A SELF-CONTAINED PURE FUNCTION (Req 1.8): the creation route must be able
 * to run auto-selection INDEPENDENTLY of the two other Mission-creation checks — the
 * Objective validation (Req 1.6) and the Lead-eligibility validation (Req 1.5). Keeping
 * this a standalone, side-effect-free, model-free function means the route can call it
 * in isolation: auto-selection proceeds and yields its result on its own, even when one
 * of the other validations would reject the Mission. It reads ONLY the squad it is
 * handed (id + role per member) — no DB, no clock, no Objective, no eligibility verdict.
 *
 * LEAD-ELIGIBILITY RULE (the deterministic notion of "role fit" for leadership): a Squad
 * member is Lead-eligible when its `role`, once trimmed and lower-cased, CONTAINS any of
 * the lead-indicating keywords below. Using a substring ("contains") rather than an exact
 * match is the robust, real-world reading of "role fit": free-text roles like
 * `'Team Lead'`, `'Engineering Manager'`, `'Lead Researcher'`, or `'Squad Coordinator'`
 * all clearly indicate leadership and must qualify, not just the bare keyword on its own.
 * Matching is case-insensitive and whitespace-insensitive, mirroring `assignByRole`.
 *
 *   LEAD_KEYWORDS = ['lead', 'leader', 'orchestrator', 'coordinator', 'manager']
 *
 * (`'lead'` is itself a substring of `'leader'`, so the latter is redundant under the
 * contains check; it is listed explicitly to document the intended vocabulary.)
 *
 * SELECTION & DETERMINISM: when MULTIPLE members are eligible, the FIRST in squad order
 * wins — a stable, deterministic choice (the same squad always yields the same lead),
 * matching the "first member wins" discipline already used in `assignByRole`. When NO
 * member has a lead-indicating role (including an empty or absent squad), the function
 * returns `null` — the signal the route uses to enforce Req 1.5 ("no eligible Lead_Agent
 * ⇒ reject the Mission, create no record").
 *
 * Defensive normalization mirrors the rest of the planner: a non-array `squad`, null or
 * non-object entries, and members with a non-string/empty `agentId` or a non-string
 * `role` are skipped rather than throwing, so the function is total on arbitrary input.
 * The returned value is the matched `SquadAgentRef` (the existing exported type) exactly
 * as it appeared in the squad, or `null`.
 */
export function selectLeadAgent(squad: SquadAgentRef[]): SquadAgentRef | null {
  // The lead-indicating role vocabulary. A member is eligible when its normalized role
  // contains any of these tokens (see the eligibility rule documented above).
  const LEAD_KEYWORDS = ['lead', 'leader', 'orchestrator', 'coordinator', 'manager']

  if (!Array.isArray(squad)) return null

  for (const member of squad) {
    if (!member || typeof member !== 'object') continue
    const agentId = (member as SquadAgentRef).agentId
    const role = (member as SquadAgentRef).role
    // Skip members the route could never assign as a lead: an absent/empty id can't be
    // recorded, and a non-string role can't be matched.
    if (typeof agentId !== 'string' || agentId.length === 0) continue
    if (typeof role !== 'string') continue

    const norm = role.trim().toLowerCase()
    if (norm.length === 0) continue

    // FIRST eligible member in squad order wins — deterministic best-fit.
    if (LEAD_KEYWORDS.some((keyword) => norm.includes(keyword))) {
      return member
    }
  }

  // No member carries a lead-indicating role ⇒ no eligible Lead_Agent (Req 1.5).
  return null
}

// ── decomposeObjective — the ONE injectable model call in the planner ─────────────

/**
 * Build the decomposition prompt the Lead_Agent's model is asked to answer. PURE +
 * total — a tiny string builder kept separate from the I/O so the prompt shape is
 * obvious and unit-checkable (design.md → "Components and Interfaces · 2. Planner").
 *
 * It hands the model exactly what it needs to propose a dependency-ordered plan:
 *   • the Objective (the user-stated goal — Req 2.1),
 *   • the optional user-supplied context, when present,
 *   • the Squad roster as `agentId + role` lines, so the model can attach an advisory
 *     `roleHint` that `assignByRole` later resolves to a best-fit Agent (Req 2.3, 2.4),
 * and pins the OUTPUT CONTRACT: a JSON object `{ "tasks": [...] }` whose entries carry
 * `key` / `description` / `dependsOn` (keys of prerequisite tasks) / optional `roleHint`,
 * dependency-ordered and acyclic. The contract is advisory only — `decomposeObjective`
 * re-normalizes whatever actually comes back, and the route's `buildTaskGraph` +
 * `validateTaskGraph` are the real structural guarantees, so a sloppy model can never
 * push an unsafe graph downstream.
 *
 * NOTE the roster lists `agentId + role` ONLY (the same minimal view `assignByRole`
 * reads) — no trust scope, no tokens, no secrets. The Objective/context are the user's
 * own words placed verbatim INTO the prompt for the model, never emitted to a log.
 */
function buildDecompositionPrompt(input: {
  objective: string
  context?: string
  squad: SquadAgentRef[]
  leadAgentId: string
}): string {
  const objective = typeof input.objective === 'string' ? input.objective : ''
  const context = typeof input.context === 'string' ? input.context.trim() : ''

  // Roster lines — id + role only, skipping malformed members (same discipline as the
  // rest of the planner). Roles are the hint vocabulary the model attaches per task.
  const rosterLines = (Array.isArray(input.squad) ? input.squad : [])
    .filter(
      (m): m is SquadAgentRef =>
        Boolean(m) &&
        typeof m === 'object' &&
        typeof (m as SquadAgentRef).agentId === 'string' &&
        (m as SquadAgentRef).agentId.length > 0 &&
        typeof (m as SquadAgentRef).role === 'string',
    )
    .map((m) => `  - agentId: ${m.agentId} | role: ${m.role}`)
  const roster = rosterLines.length > 0 ? rosterLines.join('\n') : '  (no squad members available)'

  // The model is the Lead_Agent decomposing the Objective into a Task_Graph. We ask for
  // a strict JSON object so the parse below is deterministic; everything is re-validated
  // downstream regardless of what the model returns.
  return [
    'You are the Lead_Agent of a squad. Decompose the user\'s Objective into a',
    'dependency-ordered list of concrete, individually-runnable tasks (a Task_Graph).',
    '',
    'Objective:',
    objective,
    ...(context ? ['', 'Context:', context] : []),
    '',
    'Squad (assign each task to a role that fits one of these members):',
    roster,
    '',
    'Return ONLY a JSON object of the form:',
    '{ "tasks": [',
    '  { "key": "t1", "description": "...", "dependsOn": [], "roleHint": "<a squad role>" },',
    '  { "key": "t2", "description": "...", "dependsOn": ["t1"], "roleHint": "<a squad role>" }',
    '] }',
    '',
    'Rules: every task needs a short description; "dependsOn" lists the keys of the',
    'tasks whose output it needs; the graph MUST be acyclic; "roleHint" is advisory.',
  ].join('\n')
}

/**
 * Coerce one unknown candidate entry from the model into a clean `RawTask`, or `null`
 * when it is too malformed to use. PURE + total — never throws.
 *
 * `fallbackKey` is supplied by the caller (e.g. `'t3'`) and used only when the entry
 * carries no usable `key` of its own, so every surviving task gets a STABLE key even
 * when the model omitted one. A task with no usable `description` is DROPPED (returns
 * `null`) — a task graph node with nothing to do is not a task. `dependsOn` is coerced
 * to a string[] (non-arrays → `[]`, non-string members filtered out) and `roleHint` is
 * carried through only when it is a non-empty string. No structural normalization
 * (dedupe / self-dep / dangling-dep / cycle / limit) happens here — that is the job of
 * `buildTaskGraph` + `validateTaskGraph` in the route pipeline; this only shapes a
 * single node into the `RawTask` contract.
 */
function coerceRawTask(entry: unknown, fallbackKey: string): RawTask | null {
  if (!entry || typeof entry !== 'object') return null
  const obj = entry as Record<string, unknown>

  // description is mandatory — drop a node that has nothing to do.
  const description = typeof obj.description === 'string' ? obj.description.trim() : ''
  if (description.length === 0) return null

  // key: prefer the model's own stable key, else fall back to the supplied positional key.
  const ownKey = typeof obj.key === 'string' ? obj.key.trim() : ''
  const key = ownKey.length > 0 ? ownKey : fallbackKey

  // dependsOn: tolerate a missing/garbage value; keep only string entries.
  const dependsOn = Array.isArray(obj.dependsOn)
    ? obj.dependsOn.filter((d): d is string => typeof d === 'string')
    : []

  // roleHint is advisory — carry it only when it is a usable, non-empty string.
  const hint = typeof obj.roleHint === 'string' ? obj.roleHint.trim() : ''

  const task: RawTask = { key, description, dependsOn }
  if (hint.length > 0) task.roleHint = hint
  return task
}

/**
 * Ask the Lead_Agent's model to decompose the Objective into a `RawTask[]`. This is the
 * ONLY I/O in the planner (design.md → "Components and Interfaces · 2. Planner"), and
 * the model call is INJECTED as `deps.llm` so it is trivially stubbed in tests — this
 * function imports no LLM SDK, opens no model client, and reads no env.
 *
 * It produces a PLAN, NOT KNOWLEDGE: there is NO vault write here, no DB access, no
 * Proposal, no `applyProposal`. It only builds a prompt (`buildDecompositionPrompt`),
 * calls `deps.llm(prompt)`, and normalizes the `unknown` result into `RawTask[]`. The
 * planning ROUTE (task 4.3) composes the full pipeline — `decomposeObjective →
 * buildTaskGraph → assignByRole → validateTaskGraph` — and on `{ ok:true }` persists the
 * tasks + fires the FSM `decomposed-ok`, on failure records the reason + fires
 * `decomposition-failed` (Req 9.3, 9.8). This function therefore intentionally does the
 * decompose step ONLY; it never calls the pure graph helpers itself.
 *
 * DEFENSIVE PARSING — the model output is untrusted `unknown`. We tolerate three shapes:
 *   1. a JSON STRING (parsed once; a parse failure yields `[]`, never a throw),
 *   2. an OBJECT with a `tasks` array (`{ tasks: [...] }`, the requested contract),
 *   3. an ARRAY of task entries directly.
 * Anything else (a bare number, a `null`, an object without a `tasks` array, etc.)
 * normalizes to `[]`. Each candidate entry is shaped by `coerceRawTask`; malformed
 * entries are DROPPED. Every surviving task gets a STABLE key: the model's own `key`
 * when present, otherwise a positional `t1` / `t2` … assigned here, de-collided against
 * keys already taken so two tasks never share a generated key (`buildTaskGraph` would
 * otherwise dedupe-drop one).
 *
 * NEVER THROWS / NEVER LOGS SECRETS: on an unparseable or empty result it returns `[]`
 * (the route then fires `decomposition-failed`). The Objective/context flow into the
 * prompt for the model but are never written to any log here (AGENTS.md: never leak the
 * user's content/secrets), and any error from `deps.llm` is swallowed into `[]`.
 */
export async function decomposeObjective(
  input: { objective: string; context?: string; squad: SquadAgentRef[]; leadAgentId: string },
  deps: { llm: (prompt: string) => Promise<unknown> },
): Promise<RawTask[]> {
  // Guard the injected dependency itself — a missing/!invalid llm can never throw here.
  if (!deps || typeof deps.llm !== 'function') return []

  const prompt = buildDecompositionPrompt(input)

  // The single model call. Any rejection/throw is contained: planning failing closed to
  // an empty graph is safe (the route fires `decomposition-failed`); it must never crash
  // the request, and it must never surface the user's Objective/context to a log.
  let result: unknown
  try {
    result = await deps.llm(prompt)
  } catch {
    return []
  }

  // Resolve the result to a candidate array, tolerating the three accepted shapes.
  let entries: unknown[]
  if (typeof result === 'string') {
    // Shape 1 — a JSON string. Parse once; a bad parse fails closed to [].
    let parsed: unknown
    try {
      parsed = JSON.parse(result)
    } catch {
      return []
    }
    if (Array.isArray(parsed)) {
      entries = parsed
    } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { tasks?: unknown }).tasks)) {
      entries = (parsed as { tasks: unknown[] }).tasks
    } else {
      return []
    }
  } else if (Array.isArray(result)) {
    // Shape 3 — an array of entries directly.
    entries = result
  } else if (result && typeof result === 'object' && Array.isArray((result as { tasks?: unknown }).tasks)) {
    // Shape 2 — an object carrying a `tasks` array.
    entries = (result as { tasks: unknown[] }).tasks
  } else {
    return []
  }

  // Shape each entry into a RawTask, dropping malformed ones and assigning a stable,
  // collision-free positional key to any entry the model left keyless.
  const used = new Set<string>()
  let autoIndex = 1
  const nextFallbackKey = (): string => {
    let candidate = `t${autoIndex}`
    while (used.has(candidate)) {
      autoIndex += 1
      candidate = `t${autoIndex}`
    }
    return candidate
  }

  const tasks: RawTask[] = []
  for (const entry of entries) {
    const task = coerceRawTask(entry, nextFallbackKey())
    if (!task) continue
    // De-collide generated keys: if the model reused a key we already emitted, the
    // downstream `buildTaskGraph` would dedupe-drop it, so leave de-duplication to it
    // but still track every key we have handed out for the fallback generator.
    used.add(task.key)
    tasks.push(task)
  }

  return tasks
}
