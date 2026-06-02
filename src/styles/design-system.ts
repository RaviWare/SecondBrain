/**
 * Quiet Instrument design-system — code-level constants.
 *
 * Wave 1 introduces no database schema; this file records the small,
 * typed decisions that drive how the design system composes with the
 * existing app. See `.kiro/specs/quiet-instrument-design-system/design.md`.
 */

/**
 * The chosen visual treatment for surfaces:
 * - `glass`  — the current Apple-silicon frosted `.sb-dashboard` panels.
 * - `flat`   — the cool-flat Quiet Instrument elevation (lightness + border).
 * - `hybrid` — keep the glass skin and layer the Quiet Instrument foundation
 *              as a namespaced, opt-in `.qi` layer.
 *
 * Constrained to exactly these three values (Requirement 8.1).
 */
export type SurfaceSkin = 'glass' | 'flat' | 'hybrid'

/**
 * Recorded Wave 1 Surface_Skin decision: `hybrid`.
 *
 * Rationale (design.md §Surface_Skin decision): keep the existing
 * `.sb-dashboard` glass skin the product owner approved, untouched, and
 * layer the Quiet Instrument foundation as a namespaced, opt-in `.qi`
 * layer rather than repainting every existing surface. This is the
 * strictly-additive, non-breaking posture.
 *
 * Fixing this constant to `hybrid` also encodes the default/fallback
 * semantics: when no Surface_Skin value is otherwise set, the system is
 * treated as `hybrid` (Requirements 8.2, 8.5, 8.6).
 */
export const SURFACE_SKIN: SurfaceSkin = 'hybrid'
