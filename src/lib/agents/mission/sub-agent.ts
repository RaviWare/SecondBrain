// ── Mission Sub_Agent spawn path (depth bound ON TOP of the verbatim spine) ───
// A Mission_Task's assigned Agent may spawn a bounded Sub_Agent for a focused
// sub-task (glossary "Sub_Agent"). The mission layer invents NO new spawn path,
// NO new scope logic, and NO new write path — it is a thin coordination tier on
// top of the existing Hermes spine. This module makes that explicit:
//
//   • It REUSES `spawnSubAgent(params, deps)` from `sub-agent.ts` VERBATIM. That
//     function already DELEGATES to `resolveSubScope` (via `resolveSubAgentScope`)
//     so the Sub_Agent's Trust_Scope is computed as scope ⊆ parent on every axis
//     (readable sources/collections ⊆ parent's, `webAccess ⇒ parent.webAccess`,
//     `perRunTokenBudget ≤ parent's`). We DO NOT re-resolve or re-clamp scope here;
//     re-implementing it would risk drifting from the audited resolver (which
//     carries the disjoint-clamp escalation fix). The mission path NEVER widens
//     scope (Req 10.5, 10.6 / design.md → "Least privilege").
//
//   • Every Sub_Agent write still flows through the SAME `applyProposal` Aegis
//     choke point as the parent: `spawnSubAgent` hands the runner only the
//     read-only `VaultTools` and persists emitted proposals as `pending`. There is
//     no alternate write path for mission Sub_Agent work (Req 10.6).
//
//   • The one — and ONLY — thing the mission layer ADDS is the nesting DEPTH BOUND
//     via `canSpawnSubAgent(currentDepth, graphLimitDepth)` (limits.ts): a spawn is
//     permitted IFF `currentDepth < graphLimitDepth`. A spawn that would reach or
//     exceed the Graph_Limit depth is REFUSED (and the refusal is recorded), while
//     a spawn within the depth is never refused on the depth basis (Req 6.2, 6.3).
//     This is the structural half of "missions cannot spawn agents forever".
//
// Design references: design.md → "Components and Interfaces · 4. Safety gate +
// Mission_Budget" (the `canSpawnSubAgent` note: "Mission Sub_Agents reuse
// resolveSubScope + spawnSubAgent verbatim … the Mission Orchestrator adds only
// the depth bound"); Requirements 6.2, 6.3, 10.5, 10.6, 12.9.
//
// TOTALITY: the depth-gate decision is synchronous and PURE (delegated to the
// pure `canSpawnSubAgent`); the spawn itself is async. This wrapper NEVER throws —
// the depth refusal and any spawn failure are both surfaced as structured result
// variants so callers branch on `status` instead of catching exceptions.

import { canSpawnSubAgent } from './limits'
import {
  spawnSubAgent,
  defaultSpawnDeps,
  type SpawnSubAgentParams,
  type SpawnSubAgentResult,
  type SpawnDeps,
} from '@/lib/agents/sub-agent'

// ── Parameters ────────────────────────────────────────────────────────────────
// We REUSE the existing `SpawnSubAgentParams` (parent, requestedScope, subAgentId,
// parentRunId, parentProposalId, objective, ingestInputs, skillIds) verbatim and
// add ONLY the two mission-specific depth coordinates the nesting bound needs. We
// do NOT redeclare `ParentAgentLike` / `TrustScope` / etc. — those flow in through
// the reused `SpawnSubAgentParams` so the mission path and the spine cannot drift.

export interface SpawnMissionSubAgentParams extends SpawnSubAgentParams {
  /**
   * The Sub_Agent's would-be nesting depth (how deep the spawn sits beneath the
   * Mission_Task's Lead/assigned Agent). Compared strictly against
   * `graphLimitDepth` by the pure `canSpawnSubAgent` (Req 6.2).
   */
  currentDepth: number
  /**
   * The Mission's Graph_Limit depth ceiling (`Mission.limits.maxGraphDepth`). A
   * spawn is permitted only while `currentDepth < graphLimitDepth` (Req 6.2, 6.3).
   * `0` / non-finite leaves no headroom and refuses every spawn (limits.ts).
   */
  graphLimitDepth: number
}

// ── Structured results (never throw — branch on `status`) ─────────────────────

/** The Sub_Agent was permitted and spawned; wraps the verbatim spine result. */
export interface MissionSubAgentSpawned {
  status: 'spawned'
  /** The unmodified `SpawnSubAgentResult` from the reused `spawnSubAgent`. */
  result: SpawnSubAgentResult
}

/**
 * The spawn was REFUSED by the mission depth bound (Req 6.3): the request would
 * reach or exceed the Graph_Limit depth. No `spawnSubAgent` call is made, so no
 * run is opened and no scope is resolved. The depth coordinates are echoed back so
 * the caller can record the refusal (Req 6.3 "record the refusal").
 */
export interface MissionSubAgentRefusedDepth {
  status: 'refused-depth'
  currentDepth: number
  graphLimitDepth: number
}

/**
 * The depth bound permitted the spawn, but the delegated async `spawnSubAgent`
 * threw (e.g. a persistence/runner fault). Surfaced as a structured variant to
 * keep this wrapper TOTAL — it never propagates an exception. The bounded-scope
 * and propose-never-write guarantees are unaffected: nothing widened, and any
 * proposals already persisted remain `pending` for the Aegis gate.
 */
export interface MissionSubAgentFailed {
  status: 'failed'
  /** A non-secret message describing the failure (never includes a token). */
  error: string
}

/** The total result space of a mission Sub_Agent spawn attempt. */
export type SpawnMissionSubAgentResult =
  | MissionSubAgentSpawned
  | MissionSubAgentRefusedDepth
  | MissionSubAgentFailed

// ── spawnMissionSubAgent ──────────────────────────────────────────────────────

/**
 * Spawn ONE bounded mission Sub_Agent — depth-gated, then delegated to the spine.
 *
 * Flow (the entire mission-specific contribution is step 1; step 2 is verbatim):
 *
 *   1. DEPTH BOUND (Req 6.2, 6.3) — synchronous, PURE. Evaluate
 *      `canSpawnSubAgent(currentDepth, graphLimitDepth)`. If it returns `false`,
 *      REFUSE: return `{ status: 'refused-depth', currentDepth, graphLimitDepth }`
 *      and DO NOT call `spawnSubAgent` (no run opened, no scope resolved). The
 *      mission path adds ONLY this bound; it never widens scope.
 *
 *   2. DELEGATE (Req 10.5, 10.6) — if permitted, call `spawnSubAgent(params,
 *      deps ?? defaultSpawnDeps())` VERBATIM. That call already:
 *        • resolves the Sub_Agent scope via `resolveSubScope` (scope ⊆ parent —
 *          never widened), and
 *        • routes every emitted write through the SAME `applyProposal` Aegis gate
 *          as the parent (proposals persisted `pending`; no alternate write path).
 *      We wrap its `SpawnSubAgentResult` as `{ status: 'spawned', result }`.
 *
 * Brain token minting (Req 12.9): `spawnSubAgent` does NOT mint a brain token (the
 * runner proposes only and never writes via a token; `ctx.scopedToken` is empty).
 * IF a caller/route needs to mint a brain token for this Sub_Agent, it MUST use the
 * existing `mintScopedAgentToken` (scope.ts) with the RESOLVED Sub_Agent
 * Trust_Scope — never broader than the Sub_Agent's scope — and MUST NEVER log the
 * plaintext token (AGENTS.md security rules). This wiring does not need a token, so
 * token minting is deliberately left to the route; this comment is the contract.
 *
 * TOTAL: never throws. The depth refusal and any delegated-spawn fault are both
 * returned as structured `status` variants. `deps` is optional so production
 * callers get the Mongoose-backed `defaultSpawnDeps()` while tests inject spies;
 * `defaultSpawnDeps()` is resolved LAZILY (only after the gate permits) so the
 * pure depth-refusal path stays DB-free.
 */
export async function spawnMissionSubAgent(
  params: SpawnMissionSubAgentParams,
  deps?: SpawnDeps,
): Promise<SpawnMissionSubAgentResult> {
  const { currentDepth, graphLimitDepth } = params

  // 1. The ONLY mission-specific control: the nesting depth bound (Req 6.2, 6.3).
  //    Pure + total — delegated to `canSpawnSubAgent`. Refuse before any I/O so a
  //    refused spawn opens no run and resolves no scope.
  if (!canSpawnSubAgent(currentDepth, graphLimitDepth)) {
    return { status: 'refused-depth', currentDepth, graphLimitDepth }
  }

  // 2. Permitted → delegate to the spine VERBATIM. `spawnSubAgent` already clamps
  //    scope ⊆ parent (resolveSubScope) and routes writes through applyProposal;
  //    we add nothing to that path. Resolve production deps lazily.
  try {
    const result = await spawnSubAgent(params, deps ?? defaultSpawnDeps())
    return { status: 'spawned', result }
  } catch (err) {
    // Keep the wrapper total: surface the fault as a structured result rather than
    // throwing. The message is non-secret (never carries a token or BYO key).
    const error = err instanceof Error ? err.message : String(err)
    return { status: 'failed', error }
  }
}
