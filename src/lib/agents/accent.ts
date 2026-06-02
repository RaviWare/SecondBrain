// ── Status / Work_Board accent mapping ──────────────────────────────────────────
// Pure, total, deterministic helpers that decide WHERE the single reserved "warm
// accent" treatment may appear. The accent is the semantic review-state highlight
// (the glass theme's `--dash-accent` token); it is NOT a generic decoration.
//
// The one rule, enforced for ALL inputs (design.md → Property 17,
// Requirements 6.5, 6.6, 6.7, 8.3):
//
//   The warm accent applies IF AND ONLY IF the state is the awaiting-sign-off /
//   review state — i.e. Agent status === 'review', or Work_Board column === the
//   Review column. Every other status ('live'/'idle'/'paused'/'error') and every
//   other column (Queued/Reading/Connecting/Woven in) gets NO accent.
//
// These helpers return a DECISION (boolean) and/or the accent TOKEN NAME — never a
// raw color. The UI layer (Squad Dashboard, Phase 3; Work Board, Phase 5) applies
// the actual `--dash-*` token / CSS class from this decision so the "accent is
// reserved for review" invariant lives in exactly one place.
//
// TOTALITY: an unknown/garbage status or column returns the SAFE default (no
// accent). These functions never throw.

// ── Canonical unions + ordered constants (imported by Phase 3 / Phase 5) ─────────

/**
 * Agent status color language (Req 6.5):
 *   live → green · review → accent (the single reserved accent use) ·
 *   idle → grey · paused → disabled · error → red.
 */
export type AgentStatus = 'live' | 'review' | 'idle' | 'paused' | 'error'

/** All Agent statuses, for exhaustive iteration (e.g. property tests, legends). */
export const AGENT_STATUSES: readonly AgentStatus[] = [
  'live',
  'review',
  'idle',
  'paused',
  'error',
] as const

/**
 * Work_Board columns in pipeline order (Req 8.1):
 *   Queued → Reading → Connecting → Review → Woven in.
 * `'review'` is the Aegis_Gate column.
 */
export type WorkBoardColumn = 'queued' | 'reading' | 'connecting' | 'review' | 'woven-in'

/** Columns in their canonical left-to-right pipeline order (Req 8.1). */
export const WORK_BOARD_COLUMNS: readonly WorkBoardColumn[] = [
  'queued',
  'reading',
  'connecting',
  'review',
  'woven-in',
] as const

// ── The reserved accent token ────────────────────────────────────────────────────
// The glass theme's warm accent (see `.kiro/steering/glass-theme.md`). The UI binds
// this token (or its companion `.dash-accent-grad` / `--dash-accent-soft`) only
// when the decision below is `true`. No raw color is encoded here.
export const ACCENT_TOKEN = '--dash-accent' as const
export type AccentToken = typeof ACCENT_TOKEN

// The single status / column that owns the accent.
const REVIEW_STATUS: AgentStatus = 'review'
const REVIEW_COLUMN: WorkBoardColumn = 'review'

// ── Decisions ────────────────────────────────────────────────────────────────────

/**
 * Does the warm accent apply to this Agent status? TRUE iff the status is the
 * awaiting-sign-off / review state; FALSE for live/idle/paused/error and for any
 * unknown/garbage value (safe default — never throws). (Req 6.5, 6.6, 6.7)
 */
export function accentForStatus(status: AgentStatus): boolean {
  return status === REVIEW_STATUS
}

/**
 * Does the warm accent apply to this Work_Board column? TRUE iff the column is the
 * Review column (the Aegis_Gate); FALSE for Queued/Reading/Connecting/Woven in and
 * for any unknown/garbage value (safe default — never throws). (Req 8.3)
 */
export function accentForColumn(column: WorkBoardColumn): boolean {
  return column === REVIEW_COLUMN
}

// ── Token-name convenience (decision → token, still no raw colors) ───────────────

/**
 * The accent token NAME to bind for an Agent status, or `null` when no accent
 * applies. Lets a caller write `style={{ color: token ? `var(${token})` : ... }}`
 * without re-deriving the reservation rule.
 */
export function accentTokenForStatus(status: AgentStatus): AccentToken | null {
  return accentForStatus(status) ? ACCENT_TOKEN : null
}

/**
 * The accent token NAME to bind for a Work_Board column, or `null` when no accent
 * applies (every column except Review).
 */
export function accentTokenForColumn(column: WorkBoardColumn): AccentToken | null {
  return accentForColumn(column) ? ACCENT_TOKEN : null
}

// ── Full status color language (Req 6.5) — consumed by the dashboard Agent card ──
// Semantic color ROLES (the design's own color language terms), NOT raw colors.
// The UI maps each role to the concrete token / class. Only `'accent'` is the
// reserved warm accent, and it is returned for exactly one status: 'review'.
export type StatusColorRole = 'green' | 'accent' | 'grey' | 'disabled' | 'red'

const STATUS_COLOR_ROLE: Record<AgentStatus, StatusColorRole> = {
  live: 'green',
  review: 'accent',
  idle: 'grey',
  paused: 'disabled',
  error: 'red',
}

/**
 * The color-language role for an Agent status (Req 6.5). TOTAL: an unknown/garbage
 * status falls back to `'grey'` (the neutral idle treatment) and never the reserved
 * `'accent'`, preserving "accent === review only". Never throws.
 *
 * Invariant: `statusColorRole(s) === 'accent'` IFF `accentForStatus(s) === true`.
 */
export function statusColorRole(status: AgentStatus): StatusColorRole {
  return STATUS_COLOR_ROLE[status] ?? 'grey'
}
