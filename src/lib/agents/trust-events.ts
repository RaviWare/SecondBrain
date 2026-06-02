// ── Trust event persistence ───────────────────────────────────────────────────
// The bridge between the pure `adjustTrust` engine (trust.ts, task 2.1) and the
// `Agent.trustScore` column. Every track-record event sourced from the Aegis
// layer (approve / dismiss / heavy-refine) and the AgentRun outcome path
// (clean / scope-violating dry-runs, in-scope runs, injection detections) routes
// through here: read the Agent's CURRENT `trustScore`, fold the event(s) through
// `adjustTrust` (which clamps to an integer in [0,100] — Req 4.12), and save the
// result back. See design.md → "Trust score storage + adjustment" and Req 4.3–4.8.
//
// STRICTLY ADDITIVE SIDE EFFECT: persisting trust is a *consequence* of an
// already-completed decision/run. It must NEVER break the core propose-never-
// write semantics (an approved write, a dismissal, a refine child) — so failures
// here are caught, logged through the redaction-guarded `agentLog`, and
// swallowed. The caller's return value (the Proposal / run result) is unchanged.

import { connectDB } from '@/lib/mongodb'
import { Agent } from '@/lib/models'
import { adjustTrust, type TrustEvent } from './trust'
import { agentLog } from './redact'

/** One event, or an ordered list folded left-to-right through `adjustTrust`. */
export type TrustEventInput = TrustEvent | TrustEvent[]

/**
 * Signals from a finished Run that determine its trust impact. All derived from
 * the `AgentRun` outcome + the `RunOutput` (scan results / emitted proposals) at
 * the run-outcome call site — see `runOutcomeTrustEvents`.
 */
export interface RunOutcomeSignals {
  /** Was this a Dry_Run (Req 4.4) vs a real (manual/scheduled/reactive) Run (Req 4.5)? */
  dryRun: boolean
  /** Did the Run reach a clean `completed` terminal state? */
  completed: boolean
  /** The Content_Scanner detected an Injection_Attempt in content the Agent read (Req 4.8). */
  injectionDetected: boolean
  /** Any Flagged_Content surfaced this Run (broader than injection — Req 4.4 "no Flagged_Content"). */
  flaggedContent: boolean
  /** The Agent attempted to act outside its Trust_Scope this Run (Req 4.7, 4.4). */
  scopeViolation: boolean
}

/**
 * Map a finished Run's outcome to the ordered list of `TrustEvent`s it should
 * emit (Req 4.4–4.8). PURE / TOTAL / DETERMINISTIC — no I/O; same input ⇒ same
 * output. The persistence wrapper (`recordTrustEvents`) folds the result through
 * `adjustTrust`, so the directional guarantees (negative never raises, etc.) are
 * the engine's; this function only decides WHICH events fire.
 *
 * Rules:
 *  - `injection-detected` (negative, Req 4.8) fires whenever the scanner flagged
 *    an Injection_Attempt — regardless of how the Run terminated (the Agent still
 *    read the poisoned content).
 *  - `scope-violation` (negative, Req 4.7) fires whenever the Agent attempted to
 *    act out of scope — regardless of termination. Because it short-circuits the
 *    positive events below, a scope-violating Dry_Run can NEVER raise trust
 *    (Req 4.4); `adjustTrust` also guarantees the `scope-violation` event itself
 *    never increases the score.
 *  - Positive events fire ONLY on a clean `completed` Run with no scope violation:
 *      • Dry_Run with no Flagged_Content and no scope violation → `dry-run-clean` (Req 4.4)
 *      • real Run that stayed in scope → `in-scope-run` (Req 4.5)
 */
export function runOutcomeTrustEvents(signals: RunOutcomeSignals): TrustEvent[] {
  const events: TrustEvent[] = []

  // Negative events fire regardless of how the Run terminated.
  if (signals.injectionDetected) events.push('injection-detected')
  if (signals.scopeViolation) events.push('scope-violation')

  // Positive events require a clean completion AND no scope violation (Req 4.4):
  // a scope-violating Dry_Run grants no positive trust.
  if (signals.completed && !signals.scopeViolation) {
    if (signals.dryRun) {
      if (!signals.flaggedContent) events.push('dry-run-clean')
    } else {
      events.push('in-scope-run')
    }
  }

  return events
}

/**
 * Apply one or more `TrustEvent`s to an Agent's `trustScore` and persist the
 * clamped result.
 *
 * Reads the Agent's current `trustScore`, folds each event through `adjustTrust`
 * (positive events never decrease, negative events never increase, every result
 * an integer in [0,100]), and saves the new value back to `Agent.trustScore`. A
 * no-op (no net change) skips the write.
 *
 * DEFENSIVE / TOTAL: never throws. Returns the new score on success, or `null`
 * when there is nothing to do or the persistence could not be completed (missing
 * agentId, Agent not found, model/DB unavailable). A `null` return means trust
 * was left untouched — it is NOT an error the caller needs to handle.
 *
 * @param agentId  the originating Agent's id (`Proposal.agentId` / `Agent._id`)
 * @param events   the event(s) to apply, in order
 * @param opts     optional `userId` to scope the lookup to the owning user
 */
export async function recordTrustEvents(
  agentId: unknown,
  events: TrustEventInput,
  opts?: { userId?: string },
): Promise<number | null> {
  const list = (Array.isArray(events) ? events : [events]).filter(Boolean) as TrustEvent[]
  if (!agentId || list.length === 0) return null

  try {
    await connectDB()
    // In some unit/property tests the `@/lib/models` module is mocked without an
    // `Agent` export; guard so a missing model degrades to a no-op rather than a
    // throw (this side effect must never destabilize the caller).
    if (!Agent || typeof Agent.findOne !== 'function') return null

    const filter: Record<string, unknown> = { _id: agentId }
    if (opts?.userId) filter.userId = opts.userId

    const agent = await Agent.findOne(filter)
    if (!agent) return null

    let score = agent.trustScore
    for (const event of list) score = adjustTrust(score, event)

    if (score !== agent.trustScore) {
      agent.trustScore = score
      await agent.save()
    }
    return score
  } catch (err) {
    // Trust persistence is best-effort: log (secrets scrubbed) and move on so the
    // decision/run that triggered it still succeeds.
    agentLog.error('[agents/trust] failed to persist trust event(s)', err)
    return null
  }
}
