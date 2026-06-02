// ── Dry-run semantics (PURE summary counts + clean-completion gate) ───────────
// A Dry_Run executes an Agent once in PROPOSE-ONLY mode against the user's real
// vault data (design.md → "The propose-never-write data flow"; Requirements 7.6,
// 7.8). It writes NOTHING: the runner is structurally write-free (Property 1) and
// every effect it emits is a `DraftProposal` routed to the Aegis Queue / preview
// summary. After the run, two PURE decisions are made from the `RunOutput`:
//
//   1. `summarizeDryRun(output)` — the preview summary counts the user sees
//      (Req 7.7): how many sources the Agent WOULD ingest, how many it FILTERED
//      (held by the Content_Scanner), and the TOTAL it WOULD propose.
//
//   2. `isCleanDryRunCompletion(signals)` — whether the Dry_Run "completed
//      successfully" so the Agent becomes deploy-ELIGIBLE (Req 7.9, 7.10). A
//      clean completion sets `Agent.hadSuccessfulDryRun = true`; it does NOT
//      auto-deploy (deploy stays a separate, gated user action — see
//      `lifecycle.ts` `transition`).
//
// Both functions are PURE / TOTAL / DETERMINISTIC — no I/O, no clock, no
// randomness — so they are trivially testable with plain objects. The summary
// counter is the Property-22 "dry-run counts are accurate" target (task 4.9):
// each count EQUALS the obvious filter-and-count of the run's emitted proposals.
// Nothing is fabricated; an empty run yields all-zero counts.

import type { DraftProposal, RunOutput } from './runner/types'

// ── Proposal kinds (mirror DraftProposal['kind']) ────────────────────────────────
/** The kind of emitted proposal. Mirrors `DraftProposal['kind']`. */
export type ProposalKind = DraftProposal['kind']

/**
 * Proposals whose plan would actually CREATE or MERGE knowledge in the vault on
 * approval — the "would ingest" category (Req 7.7). Phase-1 ingest-class work
 * emits `kind: 'ingest'`; this set is the single source of truth so the count and
 * any future UI agree on what "ingest" means.
 */
const INGEST_KINDS: ReadonlySet<ProposalKind> = new Set<ProposalKind>(['ingest'])

/**
 * Proposals the Content_Scanner HELD for review instead of planning/ingesting —
 * the "filtered" category (Req 5.4–5.7, surfaced as Req 7.7 "sources it
 * filtered"). A flagged source is never silently ingested or discarded; it lands
 * as a `kind: 'flagged-content'` Proposal carrying the suspicious passages.
 */
const FILTERED_KINDS: ReadonlySet<ProposalKind> = new Set<ProposalKind>(['flagged-content'])

// ── Summary output ────────────────────────────────────────────────────────────
/**
 * The Dry_Run preview summary (Req 7.7) — REAL tallies of the run's emitted
 * proposals, never fabricated:
 *
 *   • `wouldIngest`  — # proposals that would create/merge knowledge (kind 'ingest')
 *   • `filtered`     — # sources the scanner held for review (kind 'flagged-content')
 *   • `wouldPropose` — TOTAL # proposals emitted this Dry_Run
 *
 * Invariants (hold for ANY RunOutput): every count is a non-negative integer,
 * `wouldIngest ≤ wouldPropose`, `filtered ≤ wouldPropose`, and
 * `wouldIngest + filtered ≤ wouldPropose` (the remainder are other non-flagged,
 * non-ingest proposals such as syntheses/connections).
 */
export interface DryRunSummary {
  wouldIngest: number
  filtered: number
  wouldPropose: number
}

/**
 * The minimal slice of a `RunOutput` the summary needs. Accepts the full
 * `RunOutput`, a lean fixture, or any object exposing `proposals` with a `kind`
 * (declared structurally so the pure layer stays DB-agnostic and import-light).
 */
export interface DryRunSummaryInput {
  proposals: ReadonlyArray<{ kind: ProposalKind }>
}

/**
 * Compute the Dry_Run preview summary from a run's emitted proposals. PURE,
 * TOTAL, DETERMINISTIC — same input ⇒ same output, no I/O.
 *
 * This is the Property-22 "dry-run counts are accurate" target (task 4.9): each
 * field is a literal count of matching proposals, so the summary the builder
 * renders can never diverge from what the run actually produced (Req 7.7, 7.8).
 */
export function summarizeDryRun(output: DryRunSummaryInput): DryRunSummary {
  const proposals = output?.proposals ?? []
  let wouldIngest = 0
  let filtered = 0
  for (const p of proposals) {
    if (INGEST_KINDS.has(p.kind)) wouldIngest += 1
    else if (FILTERED_KINDS.has(p.kind)) filtered += 1
  }
  return { wouldIngest, filtered, wouldPropose: proposals.length }
}

// ── Clean-completion gate (deploy eligibility, Req 7.9 / 7.10) ───────────────────
/**
 * The signals that decide whether a finished Dry_Run "completed successfully" and
 * therefore makes the Agent deploy-ELIGIBLE. Derived from the `AgentRun` terminal
 * state plus the scope-violation tally at the run-outcome call site.
 */
export interface DryRunCompletionSignals {
  /** Did the Run reach the clean `completed` terminal state (not failed/stopped/timeout)? */
  completed: boolean
  /** Did the Agent attempt to act outside its Trust_Scope this Run (Req 4.7, 7.9)? */
  scopeViolation: boolean
}

/**
 * Is this Dry_Run a CLEAN, successful completion that should set
 * `Agent.hadSuccessfulDryRun` and unlock the deploy gate (Req 7.9, 7.10)? PURE /
 * TOTAL / DETERMINISTIC.
 *
 * TRUE iff the Run `completed` AND there was NO scope violation. A failed,
 * budget-stopped, timed-out, or scope-violating Dry_Run returns FALSE — it must
 * NOT make the Agent deploy-eligible, and (separately, via `trust-events.ts`) a
 * scope-violating Dry_Run grants NO positive trust (Req 4.4). Setting the flag
 * only makes deploy POSSIBLE; it never auto-deploys (deploy is a separate gated
 * `transition`, see `lifecycle.ts`).
 */
export function isCleanDryRunCompletion(signals: DryRunCompletionSignals): boolean {
  return signals.completed === true && signals.scopeViolation !== true
}

// Re-export `RunOutput` is intentionally NOT done here to keep this module's
// surface small; callers import `RunOutput` from `./runner/types` directly. The
// `DryRunSummaryInput` structural type accepts a `RunOutput` without coupling.
export type { RunOutput }
