// ── Four-control container guard (the "Agent work may execute" predicate) ────────
// Pure, total, deterministic decision core for Req 12.6 / 12.7: a Mission may run
// Agent work in a container ONLY when ALL FOUR container security controls are
// enforced simultaneously. If even one cannot be enforced, the predicate is FALSE so
// the orchestration layer FAILS THE ENTIRE MISSION and runs NO Agent work under a
// partial set of controls. There is no "three out of four" — security here is all or
// nothing (Req 12.7).
//
// See design.md → "Error Handling" ("Container controls cannot all be enforced → Fail
// the entire Mission; never execute Agent work under a partial set of controls") and
// **Property 14** ("Agent work runs only when all four container controls are
// enforced"). The fast-check property test is task 3.7 (separate); this module is
// built so that EVERY combination of the four booleans satisfies it.
//
// ── Why this module is PURE (no Docker import, no I/O) ────────────────────────────
// Like every other core under `src/lib/agents/mission/` (`lifecycle.ts`, `limits.ts`,
// `planner.ts`, …), this file imports NO Mongoose model, NO `dockerode`, and performs
// NO I/O. It is a pure DECISION core over four plain booleans. The boundary that
// actually knows about Docker — the async orchestration / route layer (Phase 3/4) —
// inspects the real provisioner `HostConfig` and maps it down to these four booleans,
// then calls this predicate. Keeping the decision pure is what lets Property 14 drive
// it directly over all 2⁴ combinations with zero containers and zero mocking.
//
// ── How the four booleans map to the provisioner `HostConfig` ─────────────────────
// The existing `DockerProvisioner.provision` (`src/lib/agent-provisioner.ts`) already
// pins these four controls; the orchestration layer derives each boolean from it:
//
//   1. nonRoot            ← the container runs as a NON-ROOT user (the Hermes image's
//                           USER + `SecurityOpt: ['no-new-privileges']`, so it cannot
//                           escalate back to root).
//   2. resourceCapped     ← CPU / memory / pid caps are set
//                           (`NanoCpus`, `Memory`, `PidsLimit`).
//   3. networkIsolated    ← `NetworkMode` is the isolated agent network
//                           (`AGENT_NETWORK`), not the host network.
//   4. noHostDockerSocket ← the host Docker socket (`/var/run/docker.sock`) is NEVER
//                           bound into the container — the documented provisioner
//                           invariant ("the host docker socket is NEVER mounted").
//
// This module does NOT re-derive those booleans (that would require a Docker import);
// it only decides, given them, whether Agent work may execute.
//
// TOTALITY / FAIL-CLOSED: a missing or non-boolean field is treated as NOT enforced
// (false). A control is "enforced" ONLY when its field is the literal boolean `true`;
// anything else (`undefined`, `null`, `1`, `'true'`, `0`, `NaN`, an object) fails
// closed to "not enforced". These functions never throw.

// ── The four controls ─────────────────────────────────────────────────────────────

/**
 * The four container security controls the orchestration layer derives from the real
 * provisioner `HostConfig` (see the module header for the precise `HostConfig`
 * mapping). Each is `true` IFF that control is actually enforced for the container the
 * Mission would run Agent work in.
 *
 * The orchestration / route layer is responsible for inspecting the provisioner and
 * populating these booleans honestly; this pure core only decides over them.
 */
export interface ContainerControls {
  /** Control 1 — the container runs as a NON-ROOT user (Req 12.6). */
  nonRoot: boolean
  /** Control 2 — CPU / memory / pid resource caps are set (`NanoCpus`/`Memory`/`PidsLimit`) (Req 12.6). */
  resourceCapped: boolean
  /** Control 3 — the container is on the isolated agent network, not host networking (Req 12.6). */
  networkIsolated: boolean
  /** Control 4 — the host Docker socket is NOT mounted into the container (Req 12.6). */
  noHostDockerSocket: boolean
}

/**
 * The canonical four control keys, in a fixed deterministic order. Used both to
 * evaluate every control exhaustively and to name precisely which one(s) are missing
 * so the Mission's failure record can state exactly what could not be enforced
 * (Req 12.7). The order is stable so the reported `missing` list is deterministic.
 */
export const CONTAINER_CONTROL_KEYS: readonly (keyof ContainerControls)[] = [
  'nonRoot',
  'resourceCapped',
  'networkIsolated',
  'noHostDockerSocket',
] as const

/** The structured result of {@link evaluateContainerControls}. */
export interface ContainerControlsEvaluation {
  /** `true` IFF ALL FOUR controls are enforced — Agent work may execute (Req 12.7). */
  enforced: boolean
  /**
   * The control keys that are NOT enforced, in {@link CONTAINER_CONTROL_KEYS} order.
   * Empty IFF `enforced === true`. The orchestrator records this on the Mission so the
   * failure names exactly which control(s) were missing (Req 12.7).
   */
  missing: (keyof ContainerControls)[]
}

// ── Fail-closed boolean reader ──────────────────────────────────────────────────────

/**
 * Read one control as "enforced". FAIL-CLOSED: a control counts as enforced ONLY when
 * its field is the literal boolean `true`. A missing / non-boolean / falsy value
 * (`undefined`, `null`, `0`, `'true'`, `1`, `NaN`, an object, …) is treated as NOT
 * enforced. This is what makes the predicate total over malformed input and biased
 * toward safety: when in doubt, the control is NOT enforced and Agent work is refused.
 */
function isEnforced(value: unknown): boolean {
  return value === true
}

// ── evaluateContainerControls ───────────────────────────────────────────────────────

/**
 * Evaluate the four container controls and report WHICH (if any) are not enforced.
 * PURE, TOTAL, DETERMINISTIC. No I/O. No Docker import.
 *
 * Returns `{ enforced, missing }` where `enforced` is `true` IFF ALL FOUR controls are
 * the literal boolean `true`, and `missing` lists every control that is not enforced
 * (in {@link CONTAINER_CONTROL_KEYS} order). `missing` is empty IFF `enforced` is true.
 *
 * This is the structured form the orchestrator uses so that, when a control cannot be
 * enforced, it can FAIL THE ENTIRE MISSION and record EXACTLY which control(s) were
 * missing — never running Agent work under a partial set of controls (Req 12.7).
 *
 * FAIL-CLOSED + TOTAL: a `null` / `undefined` / non-object `controls`, or any field
 * that is missing or not the literal `true`, contributes that control to `missing`.
 * The worst case (all four missing) returns `{ enforced: false, missing: [all four] }`.
 * Never throws.
 */
export function evaluateContainerControls(controls: ContainerControls | null | undefined): ContainerControlsEvaluation {
  // Treat a missing / non-object input as "no controls supplied at all" — every
  // control then falls through `isEnforced` to NOT enforced (fail-closed totality).
  const c = (controls ?? {}) as Partial<Record<keyof ContainerControls, unknown>>

  const missing = CONTAINER_CONTROL_KEYS.filter((key) => !isEnforced(c[key]))

  return { enforced: missing.length === 0, missing }
}

// ── containerControlsEnforced ─────────────────────────────────────────────────────────

/**
 * The four-control predicate — "Agent work may execute". PURE, TOTAL, DETERMINISTIC.
 * No I/O. No Docker import. PBT target (Property 14, task 3.7).
 *
 * Returns `true` IFF ALL FOUR container controls are enforced:
 *   1. non-root user            (`nonRoot`)
 *   2. resource caps cpu/mem/pid (`resourceCapped`)
 *   3. network isolation        (`networkIsolated`)
 *   4. no host Docker socket     (`noHostDockerSocket`)
 *
 * If ANY control cannot be enforced the predicate is `false`, so the orchestration
 * layer fails the entire Mission and runs NO Agent work under a partial set of
 * controls (Req 12.6, 12.7). There is no partial credit: three-of-four is `false`.
 *
 * Defined as the boolean projection of {@link evaluateContainerControls} so the
 * predicate and the structured "which are missing" result can never disagree. The same
 * fail-closed totality applies: a missing / non-boolean field is NOT enforced, and a
 * `null` / `undefined` input is `false`. Never throws.
 */
export function containerControlsEnforced(controls: ContainerControls | null | undefined): boolean {
  return evaluateContainerControls(controls).enforced
}
