// ── Trust engine ──────────────────────────────────────────────────────────────
// A per-Agent Trust_Score (0–100 integer) is an EARNED track record, not a user
// setting. It drives how much autonomy an Agent gets under Stakes_Scaling.
// See design.md → "Components and Interfaces · 4. Trust engine" and Requirement 4.
//
// PHASE NOTE: this file currently ships ONLY the pure `band()` helper, which the
// stakes classifier (`aegis/classify.ts`) needs for the Watch-band override
// (Req 4.11). The full `adjustTrust(score, event)` engine + `TrustEvent` union
// land in Phase 2 (task 2.1) and are ADDITIVE to this file — do not move `band`.

/** The named range a Trust_Score falls into (Req 4.9). */
export type TrustBand = 'trusted' | 'proving' | 'watch'

/**
 * The Trust_Score a freshly-created Agent starts with (Req 4.2): a value in the
 * Watch/Proving range, NEVER the Trusted band. We start in the **Watch** band
 * (0–39) — the most conservative posture — so that every knowledge-altering
 * action by a brand-new Agent requires explicit sign-off (Req 4.11) until the
 * Agent earns trust through a real track record. Single source of truth for the
 * `Agent.trustScore` model default and the Agent-creation route.
 */
export const INITIAL_TRUST_SCORE = 30

/**
 * Derive an Agent's Trust_Band from its Trust_Score (Req 4.9):
 *   80–100 → 'trusted', 40–79 → 'proving', 0–39 → 'watch'.
 *
 * TOTAL by construction: out-of-range and non-finite inputs are clamped to a
 * sensible band so this never throws and always returns one of the three values.
 *   - score > 100  → 'trusted'  (above the top band)
 *   - score < 0    → 'watch'    (below the bottom band)
 *   - NaN          → 'watch'    (treat unknown trust as least-privileged)
 */
export function band(score: number): TrustBand {
  if (Number.isNaN(score)) return 'watch'
  if (score >= 80) return 'trusted' // includes any value > 100 (clamped up)
  if (score >= 40) return 'proving'
  return 'watch' // includes any value < 0 (clamped down)
}

/**
 * A single track-record event that nudges an Agent's Trust_Score (Req 4.3–4.8).
 * Sourced from the Aegis layer (Proposal approve/dismiss/refine), `AgentRun`
 * outcomes (clean/violating dry-runs, in-scope runs), and the Content_Scanner
 * (injection detections). Wired up in Phase 2 (task 2.2 / 2.4); this file only
 * defines the pure adjustment math.
 *
 * Positive events (raise trust):
 *   - 'proposal-approved-clean' — a Proposal was approved without refinement (Req 4.3)
 *   - 'dry-run-clean'           — a Dry_Run finished with no Flagged_Content and no
 *                                 scope violation (Req 4.4)
 *   - 'in-scope-run'            — the Agent stayed within its Trust_Scope across a Run (Req 4.5)
 *
 * Negative events (lower trust):
 *   - 'proposal-dismissed'      — a Proposal was dismissed (Req 4.6)
 *   - 'proposal-heavily-refined'— a Proposal needed heavy refinement (Req 4.6)
 *   - 'scope-violation'         — the Agent attempted to act outside its Trust_Scope (Req 4.7).
 *                                 This is also the event a scope-violating Dry_Run emits, so
 *                                 such a Dry_Run can never raise trust (Req 4.4).
 *   - 'injection-detected'      — the Content_Scanner found an Injection_Attempt in
 *                                 content the Agent read (Req 4.8)
 */
export type TrustEvent =
  | 'proposal-approved-clean'
  | 'dry-run-clean'
  | 'in-scope-run'
  | 'proposal-dismissed'
  | 'proposal-heavily-refined'
  | 'scope-violation'
  | 'injection-detected'

/**
 * Per-event Trust_Score deltas (integers). Directions are fixed by Requirement 4
 * (positive events ≥ 0, negative events ≤ 0); magnitudes are a calibration choice.
 *
 * Trust is built slowly and lost quickly: a security-conscious posture where a
 * detected injection or scope violation costs far more than a single clean
 * approval earns. Every value is an integer so the result stays an integer
 * (Req 4.1, 4.12) without depending on the final clamp's rounding.
 */
const TRUST_DELTAS: Record<TrustEvent, number> = {
  // positive (never decrease — Property 3)
  'proposal-approved-clean': 5,
  'dry-run-clean': 4,
  'in-scope-run': 2,
  // negative (never increase — Property 3)
  'proposal-dismissed': -8,
  'proposal-heavily-refined': -5,
  'scope-violation': -15,
  'injection-detected': -20,
}

/**
 * Normalize any number into an integer in `[0,100]`.
 *   - NaN / non-finite → 0 (treat unknown trust as least-privileged)
 *   - rounds to the nearest integer, then clamps to the [0,100] bounds (Req 4.12).
 */
function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0
  const rounded = Math.round(n)
  if (rounded < 0) return 0
  if (rounded > 100) return 100
  return rounded
}

/**
 * Apply a single `TrustEvent` to a Trust_Score and return the new score.
 *
 * PURE, TOTAL, DETERMINISTIC. No I/O. PBT target (Properties 3 & 4, tasks 2.8/2.9).
 *
 * The starting score is first normalized into an integer in `[0,100]`, the
 * event's delta is applied, and the result is clamped again as the FINAL step.
 * Normalizing the input up front means the four invariants hold for ALL inputs —
 * including out-of-range or non-integer starting scores — relative to that
 * normalized baseline:
 *   - positive events never decrease the score (Property 3),
 *   - negative events never increase the score (Property 3),
 *   - a scope-violating dry-run (emitted as 'scope-violation') never increases it (Req 4.4),
 *   - every result is an integer in `[0,100]` (Property 4, Req 4.1, 4.12).
 */
export function adjustTrust(score: number, event: TrustEvent): number {
  const base = clampScore(score)
  return clampScore(base + TRUST_DELTAS[event])
}
