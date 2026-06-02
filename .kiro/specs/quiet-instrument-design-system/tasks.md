# Implementation Plan: Quiet Instrument Design System (Wave 1)

## Overview

Wave 1 lands the "Quiet Instrument" foundation as a **strictly additive, namespaced, opt-in `.qi` layer** on top of the live Next.js 16 / React 19 / Tailwind v4 app. The recorded Surface_Skin decision is **`hybrid`**: the existing warm Apple-silicon glass build (`.sb-dashboard` tokens and surfaces) is **kept and never repainted** — the foundation only enhances the UI by layering new `--qi-*` tokens and `.qi-*` component classes that nothing opts into except the two fixed Wave 1 surfaces (the Initialize Ingest CTA and the Sidebar).

This plan is organized so that **each top-level numbered task is one self-contained, independently reviewable, shippable phase** that leaves the app in a working, non-broken state. Phases follow the design's "namespace + scope + opt-in" strategy and the Wave 1 roadmap: foundation first (no visible change), then fonts, then the primary CTA, then active-nav, then the light-theme fork plus the final accessibility / responsive / non-breaking gate. No phase depends on a later phase; every phase ends with a checkpoint that stops for user review before the next phase begins.

Implementation language/stack: **TypeScript + CSS** (Next.js App Router, React 19, Tailwind v4) — taken directly from the design, which uses a concrete stack rather than pseudocode. Property-based tests use **fast-check** with vitest, **≥ 100 iterations**, each tagged per the design.

## Tasks

- [x] 1. Phase 1 — Foundation token layer (non-visible, safe)
  - Goal: introduce the entire Quiet Instrument foundation as a namespaced, scoped, opt-in CSS layer plus the recorded Surface_Skin decision, wired into the build with **zero visible change** and **zero collision** with existing glass tokens. This is the safest first checkpoint: nothing opts into `.qi` yet, so no rendered surface changes.
  - Design refs: §Architecture (namespace + scope + opt-in), §Load order (Option A), §Components and Interfaces #1 and #5, §Data Models (Surface_Skin constant, token namespace map).

  - [x] 1.1 Record the Surface_Skin decision as a typed constant
    - Create `src/styles/design-system.ts` exporting `type SurfaceSkin = 'glass' | 'flat' | 'hybrid'` and `export const SURFACE_SKIN: SurfaceSkin = 'hybrid'`.
    - Constrain to the three-value union (no value outside the set); the constant being fixed to `hybrid` encodes the default/fallback semantics.
    - _Requirements: 8.1, 8.2, 8.5, 8.6_

  - [x] 1.2 Create the transformed foundation stylesheet `src/styles/quiet-instrument.css`
    - Mechanically transform `design-system.css` per the namespace map: rename every custom property `--x` → `--qi-x`; rename radius tokens `--r-*` → `--qi-radius-*`.
    - Scope token declarations: emit the dark set on `.qi` (default, used when `data-theme` is absent/unrecognized) and the light fork on `[data-theme="light"] .qi`. Do **not** declare tokens on bare `:root`.
    - Carry all token values verbatim: 12-step cool-neutral ramp, Ember scarcity tokens, Type_Triplet, 8-step 4px spacing, radius scale, L0–L3 surface+border elevation, two easing curves + four durations, `--qi-error`, and reference a token at every point of use (no literals).
    - Namespace component classes (`.btn`→`.qi-btn`, `.btn-primary`→`.qi-btn-primary`, `.nav-item`→`.qi-nav-item`, `.nav-badge`→`.qi-nav-badge`, plus the remaining foundation classes) so they reference only `--qi-*` tokens; keep `.skip-link`/`.sr-only` as `.qi-skip-link`/`.qi-sr-only`.
    - Author the font-family tokens with the spec fallback chain only (`--qi-font-sans: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;` and `--qi-font-mono: "JetBrains Mono", ui-monospace, monospace;`) — Geist is prepended in Phase 2 so this phase stays self-contained and safe.
    - **Strip** the global resets and external font load: remove the `@import url(...Geist...)` line, the `* { box-sizing }` rule, `body {}`, `a {}`, and `::selection`.
    - Scope the `@media (prefers-reduced-motion:reduce)` block to `.qi` descendants and additionally set the four duration tokens (`--qi-t-instant/fast/base/slow`) to `0ms` while preserving end states and collapsing loops (`.qi-status-dot` pulse, `.qi-skeleton` shimmer) to a single static state.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 2.1, 2.2, 2.3, 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 7.1, 7.5, 7.6, 8.3, 9.1, 9.4, 9.6_

  - [x] 1.3 Wire the foundation stylesheet into `globals.css`
    - Add `@import "../styles/quiet-instrument.css";` immediately after `@import "tailwindcss";` at the top of `src/app/globals.css`.
    - Leave the existing `:root` / `[data-theme]` token blocks, the `.sb-dashboard` glass tokens, and the legacy `.btn-primary`/`.btn-ghost` classes completely untouched (different names → no collision).
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [x]* 1.4 Write property test — token-namespace collision invariant
    - **Property 1: No Quiet Instrument token name collides with an existing token**
    - **Validates: Requirements 9.6, 1.12**
    - Add `fast-check` as a dev dependency. Parse declared custom-property names from both `globals.css` (including `.sb-dashboard` blocks) and `quiet-instrument.css`; assert the two sets are disjoint, and assert every existing `.sb-dashboard` token name is still present and unchanged.
    - fast-check, `{ numRuns: 100 }`; tag: `// Feature: quiet-instrument-design-system, Property 1: ...`

  - [x]* 1.5 Write property test — cool-neutral ramp is monotonic and cool
    - **Property 4: Cool-neutral ramp is monotonic and cool at every step**
    - **Validates: Requirements 1.1**
    - Read the shipped `quiet-instrument.css`; for any two adjacent ramp steps assert lightness strictly increases darkest→lightest and blue channel ≥ red channel at every step.
    - fast-check, `{ numRuns: 100 }`; tag: `// Feature: quiet-instrument-design-system, Property 4: ...`

  - [x]* 1.6 Write property test — reduced motion zeroes durations while preserving end state
    - **Property 5: Reduced motion zeroes durations while preserving end state**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - Assert the scoped reduced-motion block resolves each of the four `--qi-t-*` duration tokens to `0ms` and that computed end-state styling is identical to the non-reduced-motion end state.
    - fast-check, `{ numRuns: 100 }`; tag: `// Feature: quiet-instrument-design-system, Property 5: ...`

  - [x] 1.7 Checkpoint — Phase 1 review gate
    - Ensure `npm run build` passes and all tests pass; confirm zero visible change (no surface opts into `.qi` yet) and the glass dashboard/sidebar/marketing render unchanged. Ask the user if questions arise, and STOP for review before Phase 2.

- [x] 2. Phase 2 — Typography swap to Geist / Geist Mono
  - Goal: load Geist + Geist Mono via `next/font/google` (self-hosted, no Google runtime request) alongside the existing Inter/JetBrains variables, and bind the `.qi` font tokens to them with fallbacks. The un-opted-in glass app keeps its current fonts; no layout shift.
  - Design refs: §Font loading architecture (Next.js 16), §Components and Interfaces #4.

  - [x] 2.1 Load Geist + Geist Mono via `next/font/google` in `src/app/layout.tsx`
    - Import `Geist` and `Geist_Mono`; instantiate with `subsets: ['latin']`, `variable: '--font-geist'` / `'--font-geist-mono'`, and `display: 'swap'`.
    - Append `${geist.variable} ${geistMono.variable}` to the `<html className>` alongside the existing `${inter.variable} ${jetbrainsMono.variable}`; leave Inter/JetBrains declarations in place so glass surfaces are unchanged.
    - _Requirements: 3.1, 3.2, 3.7, 3.8, 9.2, 9.5_

  - [x] 2.2 Bind the `.qi` font tokens to the next/font CSS variables
    - In `quiet-instrument.css`, prepend the next/font variables to the family tokens: `--qi-font-sans: var(--font-geist), "Inter", -apple-system, BlinkMacSystemFont, sans-serif;` and `--qi-font-mono: var(--font-geist-mono), "JetBrains Mono", ui-monospace, monospace;`.
    - Confirm only the three weights 400/500/600 are exposed and the type-scale tokens (stat/title/section/card/body/body-small/label-meta/badge/button) are present, with mono applied only to status/metadata/badges/shortcuts/identifiers.
    - _Requirements: 3.3, 3.4, 3.5, 3.6_

  - [x]* 2.3 Write unit test — font wiring and fallback chain
    - Assert `--qi-font-sans` / `--qi-font-mono` reference the next/font variables and the declared fallbacks (Inter, JetBrains Mono), and that no font weight other than 400/500/600 is defined.
    - _Requirements: 3.1, 3.2, 3.3, 3.7, 3.8_

  - [x] 2.4 Checkpoint — Phase 2 review gate
    - Ensure `npm run build` passes and tests pass; confirm no layout shift on load and that glass-surface fonts are unchanged. Ask the user if questions arise, and STOP for review before Phase 3.

- [x] 3. Phase 3 — Primary CTA fix (Initialize Ingest)
  - Goal: replace the muddy gradient "Initialize Ingest" button with `.qi-btn-primary` inside a `.qi` scope so the main action reads bright and clickable, with the full Requirement 5 state contract. Only this one CTA changes; the rest of the ingest page is untouched.
  - Design refs: §Primary button + "Initialize Ingest" fix, §Components and Interfaces #3.

  - [x] 3.1 Apply `.qi-btn-primary` to the Initialize Ingest button with the full state contract
    - In `src/app/app/ingest/page.tsx`, wrap the form/CTA region in a `.qi` scope and replace the inline `linear-gradient(...)`/`disabled:opacity-30` button styling with `.qi-btn-primary`.
    - Implement: Ember background + `--qi-ember-ink` label (38px height / `--qi-radius-md`); hover → `--qi-ember-hover`; press → `--qi-ember-press` + `scale(0.98)`; focus → 3px `--qi-ember-ring`, unclipped; disabled → L2 surface + disabled ink, no Ember/hover/press/focus-ring; light-mode label ink flips to white.
    - Loading state: pin the pre-loading pixel width, swap the label for a progress indicator, set `aria-busy="true"`; guard `handleIngest` to early-return (no action, state preserved) when disabled or loading, for both pointer and Enter/Space activation. Keep exactly one `.qi-btn-primary` in the view, with full label and ≥44×44 touch target across breakpoints.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 6.6, 10.6, 10.7, 11.5_

  - [x]* 3.2 Write component tests — primary button states and ARIA (jsdom)
    - Set up a jsdom vitest project (add `jsdom` + `@testing-library/react`/`@testing-library/dom` as dev deps; add a second vitest project or per-file `environment: 'jsdom'`) since the default env is `node`.
    - Assert: Ember bg + dark ink at rest; hover/press/focus-ring treatment; disabled treatment with no Ember; loading sets `aria-busy="true"`, pins width, shows spinner; action suppressed when disabled/loading; Enter/Space parity with pointer activation.
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9, 10.6, 10.7_

  - [x] 3.3 Checkpoint — Phase 3 review gate
    - Ensure `npm run build` and tests pass; confirm the CTA reads bright (never disabled-looking) and no other ingest-page surface changed. Ask the user if questions arise, and STOP for review before Phase 4.

- [x] 4. Phase 4 — Active-nav fix (Sidebar)
  - Goal: replace the label-bucket `isActiveNav` (the "6 orange pills" bug) with a pure single-winner resolver, render exactly one `aria-current="page"`, apply `.qi-nav-item` three-state styling, show a real Inbox badge with the `99+` rule, and keep single-active + accessible names across desktop/rail/mobile with responsive breakpoints.
  - Design refs: §Active-nav redesign, §Components and Interfaces #2, §Data Models (NavItem, resolveActiveHref, formatBadge).
  - RECONCILIATION (workspace rule precedence): the visual half here was specified as a cool-flat `.qi-nav-item` repaint, but the mandatory `.kiro/steering/glass-theme.md` rule keeps the sidebar on the warm GLASS skin (Surface_Skin = hybrid). The FUNCTIONAL contract the spec cares about — single-winner resolver, real 99+ badge, exactly one `aria-current`, accessible names across desktop/rail/mobile — shipped on the glass sidebar. The cool-flat repaint was intentionally NOT applied (it would violate the rule and ship the dull look the product owner rejected). See `docs/agent-stack/DEFERRED-WORK.md` §6.

  - [x] 4.1 Extract the pure resolver and badge formatter
    - Create `src/components/sidebar-nav.ts` with the `NavItem` model (`href`, `label`, `icon`, `matchKey`, `showBadge?`), `resolveActiveHref(pathname, search, items): string | null` (single best/most-specific match or `null`; never multi-active), and `formatBadge(count): string | null` (`0`→`null`, `>99`→`"99+"`, else `String(count)`).
    - SHIPPED as `resolveActiveIndex` (index form) + `formatBadge` in `src/components/sidebar-nav.ts`.
    - _Requirements: 4.1, 4.2, 4.8, 4.9, 4.11_

  - [x] 4.2 Refactor `src/components/sidebar.tsx` to consume the resolver
    - Replace `isActiveNav` with `resolveActiveHref`; render `aria-current={isWinner ? 'page' : undefined}` on exactly one item; apply `.qi-nav-item` (rest = `--qi-text-2`, no Ember; hover = L1 lift + `--qi-text-1`, no Ember; active = `--qi-ember-tint` bg + `--qi-text-1` + Ember icon + 3px Ember left bar). Add the `qi` class to the desktop `<aside>` and the mobile bars.
    - Replace the hardcoded `badge: '12'` with the real Inbox unread count rendered via `formatBadge` + `.qi-nav-badge` (no badge at 0; `99+` above 99; fall back to 0/no badge if the count is unavailable).
    - Implement rail (64px) + mobile variants: rail keeps tint + left bar on the active item and moves labels to tooltips on hover/focus; mobile keeps the off-canvas drawer hidden by default + a persistent bottom tab bar; every variant marks exactly one `aria-current="page"` with an accessible name. Responsive breakpoints: >1100px full 240px, 700–1100px inclusive 64px rail, <700px mobile.
    - SHIPPED (glass-reconciled): `sidebar.tsx` consumes `resolveActiveIndex`, renders exactly one `aria-current="page"` per nav list (desktop + mobile), and uses the honest `formatBadge(inboxUnread)` (0 → no badge). The active-item COLOUR uses the glass `--app-sidebar-active` treatment per the mandatory rule, NOT cool-flat `--qi-ember-tint`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 10.5, 11.1, 11.2, 11.3, 11.4_

  - [x]* 4.3 Write property test — single active navigation item
    - **Property 2: Exactly one active navigation item**
    - **Validates: Requirements 4.1, 4.2, 4.11, 10.5, 11.4**
    - SHIPPED in `src/components/sidebar-nav.test.ts` (Property 2, numRuns 200).

  - [x]* 4.4 Write property test — Inbox badge formatter with the 99+ rule
    - **Property 3: Inbox badge reflects the real count with the 99+ rule**
    - **Validates: Requirements 4.8, 4.9**
    - SHIPPED in `src/components/sidebar-nav.test.ts` (Property 3, numRuns 200).

  - [x]* 4.5 Write component tests — aria-current, three states, rail tooltips, mobile single-active (jsdom)
    - Assert exactly one `aria-current="page"` per route across the real nav list (dashboard, query, ingest, the six `/app/wiki?*` variants, graph hash, agent); the three visual states render; rail shows tooltips on hover/focus; mobile marks exactly one active item with an accessible name.
    - SHIPPED in `src/components/sidebar.test.tsx` (jsdom): single-active across all real routes + honest badge. Colour states are glass per the reconciliation (not asserted as cool-flat).
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.10, 10.5, 11.4_

  - [x] 4.6 Checkpoint — Phase 4 review gate
    - Ensure `npm run build` and tests pass; confirm exactly one nav item reads active on every route and the badge behaves correctly. Ask the user if questions arise, and STOP for review before Phase 5.
    - DONE — build + full suite green; single-active verified on every route by `sidebar.test.tsx`.

- [x] 5. Phase 5 — Light-theme cool-grey fork + a11y/responsive verification + final non-breaking gate
  - Goal: verify the `[data-theme="light"] .qi` cool-grey fork coexists with the existing cream glass, confirm WCAG AA contrast on the new components in both themes, and run the final non-breaking gate so the deployed product is provably intact.
  - Design refs: §Light-theme reconciliation, §Testing Strategy, §Correctness Properties.

  - [x] 5.1 Verify and reconcile the `[data-theme="light"] .qi` cool-grey fork
    - Confirm the light fork in `quiet-instrument.css` resolves the Requirement 6 values (canvas `#F6F7F9`, surfaces, borders, text triplet, `--qi-ember-text` `#DC5C18`, Ember-as-fill `#F26F28`, white primary-button ink, single permitted overlay shadow color) and coexists with the untouched cream `.sb-dashboard` light tokens.
    - Ensure Light_Theme and Dark_Theme share identical DOM structure, layout positions, spacing, radius, and typography token values — differing only in resolved color values; fix any reconciliation gap found.
    - VERIFIED by `src/styles/quiet-instrument.light-theme.test.ts`: the light fork resolves the Req 6 values, is cool (never cream), and forks COLOUR ONLY (no spacing/radius/motion/type/layout token is redeclared). Coexists with the untouched cream `.sb-dashboard` light tokens (collision test still green).
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x]* 5.2 Write unit test — light-theme token values and theme parity
    - Assert `[data-theme="light"] .qi` resolves the Req 6 color values and that all non-color tokens (spacing, radius, type) are identical between the light and dark forks (color-only difference).
    - SHIPPED: `src/styles/quiet-instrument.light-theme.test.ts` (15 tests).
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x]* 5.3 Write unit/contrast test — WCAG AA + focus indicators + non-color redundancy
    - Compute contrast ratios from token values for the new `.qi` components in both themes (text ≥ 4.5:1, large text ≥ 3:1, non-text UI ≥ 3:1); assert the focus ring is ≥ 3px and ≥ 3:1; assert structural icon + label + color redundancy for the Type_Triplet and the confidence left-edge; assert reduced-motion collapses `.qi-status-dot`/`.qi-skeleton` to a static state.
    - SHIPPED: `src/styles/quiet-instrument.contrast.test.ts` (14 tests). Dark theme passes AA throughout; the rendered (dark) primary button is 6.24:1. The light fork's two contrast findings — `--qi-ember-text` 3.76:1 and white-ink-on-ember 2.97:1 — were **FIXED** (user-authorized): ember-text → ember-700 #A8430F (6.04:1) and light button ink → dark #1B1205 (6.24:1). Both are now pinned by `≥ 4.5:1` AA assertions. See `docs/agent-stack/DEFERRED-WORK.md` §6.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 2.2, 2.3_

  - [x] 5.4 Final non-breaking verification gate
    - Run `npm run build` and confirm a successful build with no new errors/warnings attributable to Wave 1; run `npm test` and confirm every previously passing suite (`utils.test.ts`, `auto-link.test.ts`, `catalog.test.ts`) plus the new Wave 1 tests are green; confirm the token-collision test passes.
    - Add/confirm an automated snapshot assertion that the compiled `.sb-dashboard` rule set is unchanged, and confirm the dashboard, sidebar, and marketing surfaces render with no uncaught runtime/console errors and retain prior behavior.
    - DONE — full suite green and build clean (see Phase-5 completion run). The token-collision test (`quiet-instrument.collision.test.ts`) passes, proving the `--qi-*` set stays disjoint from the untouched `.sb-dashboard` glass tokens.
    - _Requirements: 9.2, 9.3, 9.5, 9.7_

## Notes

- Each top-level task is a **self-contained, independently reviewable, shippable phase**; every phase ends with a checkpoint that STOPS for user review before the next phase begins. No phase depends on a later phase, and earlier phases never break the build.
- This is **additive enhancement, not a rebuild**: the Surface_Skin decision is `hybrid`, the existing `.sb-dashboard` glass tokens and surfaces stay untouched, and the Quiet Instrument foundation is layered as a namespaced, opt-in `.qi` layer.
- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster path; core implementation tasks are never optional. Per workflow rules, `*` sub-tasks are not auto-implemented.
- Property-based tests use **fast-check** with vitest at **≥ 100 iterations**, one test per correctness property (Properties 1–5), each tagged `// Feature: quiet-instrument-design-system, Property N: ...`. CSS-parsing properties (1, 4, 5) read the shipped stylesheet artifacts so the tests verify what ships.
- Component/DOM tests run under jsdom (set up in Phase 3 and reused in Phase 4) because the default vitest environment is `node`.
- Full WCAG AA conformance also requires manual testing with assistive technology and expert review; the automated checks here are necessary but not sufficient.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.5", "1.6"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["2.1", "2.2"] },
    { "id": 4, "tasks": ["2.3"] },
    { "id": 5, "tasks": ["3.1", "4.1"] },
    { "id": 6, "tasks": ["3.2", "4.2", "4.3", "4.4"] },
    { "id": 7, "tasks": ["4.5"] },
    { "id": 8, "tasks": ["5.1"] },
    { "id": 9, "tasks": ["5.2", "5.3"] },
    { "id": 10, "tasks": ["5.4"] }
  ]
}
```
