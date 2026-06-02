# Requirements Document

## Introduction

This spec covers **Wave 1** of the "Quiet Instrument" design system for SecondBrain Cloud — the design-system foundation that every later wave composes on top of. Wave 1 is the credibility layer: a compiled foundation token file, a font swap to Geist / Geist Mono, the broken active-nav fix, the primary-CTA fix, and the light-mode reconciliation. The work is **strictly additive** — it enhances the existing live Next.js application (deployed at secondbraincloud.com) without breaking the current dashboard, sidebar, marketing site, or any shipped surface.

Wave 1 carries one unresolved product decision that must be made explicit: the spec's cool-flat "Quiet Instrument" aesthetic (#0A0B0D base, no glass, no shadow, cool-grey light theme) deliberately conflicts with the warm Apple-silicon **glass** dashboard the user said they loved (`.sb-dashboard` tokens in `src/app/globals.css`). The recommended resolution is a **hybrid**: keep the glass surface skin the user loves while adopting every aesthetic-neutral discipline from the spec (accent/Ember scarcity, one-active-state law, confidence-as-left-edge, type-color triplet, typography scale, voice registers, honest-not-fake data, retrieval hierarchy). Requirements are framed so the disciplined upgrades land regardless of which surface skin is ultimately chosen.

Accessibility (WCAG 2.1 AA by construction, color-never-the-only-signal, keyboard navigation, reduced-motion) and responsive behavior are cross-cutting and must be built into each Wave 1 deliverable, not retrofitted.

**Source of truth for token values:** `docs/agent-stack/SPEC-NOTES.md` (design-system track, Phases 3–5, 7, 10, 15, 17, 28). All token values below are transcribed from that captured spec.

## Glossary

- **Design_System**: The compiled "Quiet Instrument" design-system foundation introduced in Wave 1.
- **Foundation_Token_File**: The single compiled CSS file holding all Quiet Instrument design tokens (color, type, spacing, radius, elevation, motion). Distinct from the existing `.sb-dashboard` glass token block.
- **Token**: A named CSS custom property (e.g. `--ember`, `--space-4`) defined in the Foundation_Token_File.
- **Ember**: The single warm accent of the Design_System, base value `#F26F28` (Ember 500). Reserved for scarce, high-meaning roles only.
- **Ember_Tint**: The low-opacity Ember fill `rgba(242, 111, 40, 0.14)` used for selected/active backgrounds instead of a full fill.
- **Type_Triplet**: The fixed mapping of knowledge-node type to color (Source, Concept, Pattern, Synthesis, Entity, Person, Topic, Decision, Collection).
- **Surface_Level**: An elevation tier expressed as surface lightness plus border (L0 canvas, L1 resting, L2 raised, L3 overlay), not as a drop shadow.
- **Typography_System**: The Geist (sans) and Geist Mono (mono) type scale with three weights (400/500/600).
- **Navigation_Sidebar**: The application sidebar component at `src/components/sidebar.tsx`, including its desktop, collapsed-rail, and mobile variants.
- **Active_Nav_Item**: The single navigation item that corresponds to the current route.
- **Primary_Button**: The single highest-emphasis call-to-action per view, rendered with the `.btn-primary` class (e.g. the "Initialize Ingest" action).
- **Light_Theme**: The Design_System rendering when `data-theme="light"` is set on the document root.
- **Dark_Theme**: The Design_System rendering when `data-theme="dark"` is set on the document root.
- **Surface_Skin**: The chosen visual treatment for surfaces — `glass` (current Apple-silicon frosted panels), `flat` (cool-flat per the spec), or `hybrid` (glass skin plus spec discipline).
- **Aesthetic_Neutral_Discipline**: The set of spec rules that are independent of Surface_Skin — Ember scarcity, one-active-state law, confidence-as-left-edge, Type_Triplet, typography scale, voice registers, honest data, retrieval hierarchy.
- **Reduced_Motion_Mode**: The state when the user's `prefers-reduced-motion` media query evaluates to `reduce`.
- **WCAG_AA**: WCAG 2.1 Level AA contrast and accessibility conformance (normal text contrast ratio ≥ 4.5:1, large text ≥ 3:1, non-text UI ≥ 3:1).

## Requirements

### Requirement 1: Compiled Foundation Token File

**User Story:** As a developer building later waves, I want a single compiled foundation token file with every Quiet Instrument color, type, spacing, radius, elevation, and motion token, so that all subsequent components compose from one consistent source.

#### Acceptance Criteria

1. THE Foundation_Token_File SHALL define exactly 12 distinct, individually addressable cool-neutral ramp Tokens whose lightness increases monotonically from darkest to lightest step, with the blue channel greater than or equal to the red channel at every step.
2. THE Foundation_Token_File SHALL define the Ember scarcity tokens with the values `--ember` `#F26F28`, `--ember-hover` `#FB8138`, `--ember-press` `#DC5C18`, `--ember-ink` `#1B1205`, `--ember-ring` `rgba(242, 111, 40, 0.40)`, and `--ember-tint` `rgba(242, 111, 40, 0.14)`.
3. THE Foundation_Token_File SHALL define the Type_Triplet color tokens with the values Source `#3B8FE0`, Concept `#8A7CF0`, Pattern `#2FB39C`, Synthesis `#E368A6`, Entity `#7C8694`, Person `#35C07A`, Topic `#F26F28`, and Decision `#F5B341`.
4. THE Foundation_Token_File SHALL expose exactly the three font weights 400, 500, and 600 for Geist sans and Geist Mono, and SHALL NOT define any other font weight.
5. THE Foundation_Token_File SHALL define an 8-step spacing scale on a 4px rhythm with the values `--space-1` 4px, `--space-2` 8px, `--space-3` 12px, `--space-4` 16px, `--space-5` 24px, `--space-6` 32px, `--space-7` 48px, and `--space-8` 64px.
6. THE Foundation_Token_File SHALL define a radius scale with the values `--radius-sm` 6px, `--radius-md` 8px, `--radius-lg` 12px, `--radius-xl` 16px, and `--radius-full` 9999px.
7. THE Foundation_Token_File SHALL define surface-lightness elevation tokens for L0 canvas `#0A0B0D` with no border, L1 resting `#16181C` with border `#23262B`, L2 raised `#1D2024` with border `#2F3338`, and L3 overlay `#262A2F` with border `#3D424A`.
8. THE Foundation_Token_File SHALL define motion tokens for exactly two easing curves `--ease-out` `cubic-bezier(0.16, 1, 0.3, 1)` and `--ease-in-out` `cubic-bezier(0.45, 0, 0.2, 1)`, and four durations `--t-instant` 80ms, `--t-fast` 120ms, `--t-base` 180ms, and `--t-slow` 240ms.
9. THE Foundation_Token_File SHALL define an error token `--error` with the value `#F0524B`.
10. WHERE the document root carries a `data-theme` attribute set to `light` or `dark`, THE Foundation_Token_File SHALL resolve every token to the value set for that theme so that components inherit the full system from the root.
11. IF the document root carries no `data-theme` attribute or an unrecognized value, THEN THE Foundation_Token_File SHALL resolve every token to the Dark_Theme value set.
12. THE Foundation_Token_File SHALL reference every radius, spacing, color, and motion value through a Token at each point of use within the Design_System and SHALL NOT emit any literal value at those points of use.

### Requirement 2: Reduced-Motion Token Block

**User Story:** As a user who has reduced motion enabled, I want the design system to honor my preference, so that the interface presents state without animating.

#### Acceptance Criteria

1. WHILE Reduced_Motion_Mode is active, THE Foundation_Token_File SHALL resolve each of the four motion duration tokens `--t-instant`, `--t-fast`, `--t-base`, and `--t-slow` to 0ms so that Design_System transitions complete with no observable transition interval.
2. WHILE Reduced_Motion_Mode is active, THE Design_System SHALL render the end state of every transition identical to the end state it renders when Reduced_Motion_Mode is inactive, so that no state cue otherwise conveyed by motion is removed.
3. WHILE Reduced_Motion_Mode is active, THE Design_System SHALL present any continuous or looping animation as a single static state that conveys the same status, rather than as a repeating animation.

### Requirement 3: Typography Swap to Geist and Geist Mono

**User Story:** As a user reading the interface, I want the precise Geist and Geist Mono typefaces, so that the product reads as a calm, precise instrument.

#### Acceptance Criteria

1. THE Typography_System SHALL load Geist as the sans typeface with Inter as the declared fallback.
2. THE Typography_System SHALL load Geist Mono as the monospace typeface with JetBrains Mono as the declared fallback.
3. THE Typography_System SHALL expose only the three font weights 400, 500, and 600.
4. THE Typography_System SHALL define the type scale tokens Stat-numeral 30px/600/-0.02em with tabular numerals, Page-title 28px/600/-0.02em, Section 18px/600/-0.01em, Card-title 15px/600/-0.005em, Body 14px/400, Body-small 13px/400, Label-meta mono 12px/500/+0.08em, Badge-tag mono 11px/500, and Button 14px/500/+0.01em.
5. THE Typography_System SHALL apply Geist Mono only to status lines, metadata, badges and tags, keyboard shortcuts, and identifiers or code.
6. THE Typography_System SHALL apply Geist sans as the default family for all interface text except the surfaces assigned to Geist Mono in criterion 5.
7. IF Geist or Geist Mono fails to load within 3 seconds, THEN THE Typography_System SHALL render the corresponding declared fallback typeface while retaining the same weights, type-scale metrics, and layout so that text remains rendered and readable.
8. WHILE Geist or Geist Mono is still loading, THE Typography_System SHALL render text in the declared fallback typeface rather than hiding the text.

### Requirement 4: Single Active Navigation State

**User Story:** As a user navigating the app, I want exactly one navigation item to read as active, so that I can answer "where am I?" at a glance.

#### Acceptance Criteria

1. WHEN a route that corresponds to a navigation item is displayed, THE Navigation_Sidebar SHALL mark exactly that one item as the Active_Nav_Item and SHALL NOT mark any other item as active.
2. THE Navigation_Sidebar SHALL set the `aria-current` attribute to `page` on the Active_Nav_Item and SHALL NOT set it on any other item.
3. WHILE a navigation item is in the rest state (neither active nor hovered), THE Navigation_Sidebar SHALL render the item label in the secondary text color with no Ember.
4. WHILE the pointer hovers a non-active navigation item, THE Navigation_Sidebar SHALL raise the item to the L1 resting Surface_Level and the primary text color with no Ember.
5. WHERE a navigation item is the Active_Nav_Item, THE Navigation_Sidebar SHALL render an Ember_Tint background, the primary text color, an Ember-colored icon, and a 3px Ember left bar.
6. THE Navigation_Sidebar SHALL render the desktop navigation at a 240px width and the collapsed rail at a 64px width.
7. WHERE the navigation is in the collapsed rail state, THE Navigation_Sidebar SHALL render the Active_Nav_Item with the Ember_Tint background and 3px Ember left bar.
8. WHILE the Inbox unread count is greater than zero, THE Navigation_Sidebar SHALL render an Ember badge displaying the actual unread count, displaying `99+` when the count exceeds 99.
9. IF the Inbox unread count is zero, THEN THE Navigation_Sidebar SHALL render no Inbox badge.
10. WHILE the navigation is in the collapsed rail state, WHEN a navigation item receives pointer hover or keyboard focus, THE Navigation_Sidebar SHALL display the item label through a tooltip.
11. IF the displayed route corresponds to no navigation item, THEN THE Navigation_Sidebar SHALL mark no item as active and SHALL set `aria-current="page"` on no item.

### Requirement 5: Primary Call-to-Action Button

**User Story:** As a user adding a source, I want the primary action to read as bright and clickable, so that the main action never looks disabled.

#### Acceptance Criteria

1. THE Primary_Button SHALL render with an Ember background and the dark ink color `#1B1205` for its label.
2. THE Primary_Button SHALL render at a 38px default height with a `--radius-md` 8px corner radius, a 32px height for the small size, and a 44px height for the large size.
3. WHEN the pointer hovers the Primary_Button, THE Primary_Button SHALL render the `--ember-hover` background `#FB8138`.
4. WHILE the Primary_Button is pressed, THE Primary_Button SHALL render the `--ember-press` background `#DC5C18` and SHALL apply a `scale(0.98)` transform.
5. WHEN the Primary_Button receives keyboard focus, THE Primary_Button SHALL render a 3px focus ring in the `--ember-ring` color `rgba(242, 111, 40, 0.40)`, fully visible and unclipped.
6. WHILE the Primary_Button is disabled, THE Primary_Button SHALL render the L2 raised surface background `#1D2024` with the disabled text color, and SHALL NOT render the Ember background, hover, press, or focus-ring treatments.
7. THE Design_System SHALL render at most one Primary_Button per rendered route view.
8. WHILE the Primary_Button is in a loading state, THE Primary_Button SHALL retain the pixel width it held immediately before entering the loading state, replace its label with a progress indicator, and set `aria-busy` to `true`.
9. IF the Primary_Button is activated while disabled or loading, THEN THE Primary_Button SHALL NOT trigger its action and SHALL preserve its current state.

### Requirement 6: Light-Theme Reconciliation to Cool Grey

**User Story:** As a user in light mode, I want a cool-grey tint of the dark theme instead of a warm cream world, so that light and dark feel like one system with identical hierarchy.

#### Acceptance Criteria

1. WHILE Light_Theme is active, THE Design_System SHALL render the canvas `#F6F7F9`, surface-1 `#FFFFFF`, surface-2 `#F1F3F6`, and surface-3 `#E8EBEF`.
2. WHILE Light_Theme is active, THE Design_System SHALL render the L1 resting border `#E9ECF0`, the L2 raised border `#DCE0E6`, and the L3 overlay border `#C8CDD6`.
3. WHILE Light_Theme is active, THE Design_System SHALL render the primary text token `#14161A`, the secondary text token `#565C66`, and the tertiary text token `#878D97`.
4. WHILE Light_Theme is active, WHERE Ember is used as text, THE Design_System SHALL render the accent-text token `--ember-text` `#DC5C18`.
5. WHILE Light_Theme is active, WHERE Ember is used as a fill, THE Design_System SHALL render the Ember 500 value `#F26F28`.
6. WHILE Light_Theme is active, THE Primary_Button SHALL render its label in white `#FFFFFF` ink.
7. WHILE Light_Theme is active, WHERE an L3 overlay sits above a scrim, THE Design_System SHALL render the single permitted overlay shadow defined in Requirement 7 using the color `rgba(20, 22, 26, 0.14)`.
8. THE Design_System SHALL render Light_Theme and Dark_Theme with an identical component set, DOM structure, element layout positions, and identical spacing, radius, and typography token values, differing only in the resolved color token values, so that a side-by-side comparison reveals no difference in any dimension other than color.

### Requirement 7: Elevation Without Shadow

**User Story:** As a user, I want depth expressed through surface lightness and borders, so that the interface reads as calm and precise rather than decorated.

#### Acceptance Criteria

1. THE Design_System SHALL express elevation across the four named tiers L0, L1, L2, and L3 through Surface_Level lightness and border color rather than drop shadow.
2. WHEN an interactive Surface_Level element below L3 is hovered, THE Design_System SHALL raise the element by one Surface_Level.
3. IF an interactive Surface_Level element already at L3 is hovered, THEN THE Design_System SHALL retain it at L3.
4. WHEN the pointer leaves a previously hovered interactive Surface_Level element, THE Design_System SHALL return the element to its resting Surface_Level lightness and border.
5. WHERE an L3 overlay sits above a scrim (a full-viewport dimming layer rendered behind the overlay), THE Design_System SHALL apply the single permitted shadow `0 16px 40px -12px rgba(0, 0, 0, 0.7)` in Dark_Theme.
6. THE Design_System SHALL NOT apply drop shadows to surfaces other than L3 overlays above a scrim.

> **Note:** Requirement 7 states the spec's flat-elevation rule. Its application is conditioned by the Surface_Skin decision in Requirement 8 — under a `glass` or `hybrid` skin, the glass elevation treatment the user loves is retained and Requirement 7 applies only to net-new Quiet Instrument surfaces.

### Requirement 8: Aesthetic Surface-Skin Decision Point

**User Story:** As the product owner, I want the glass-versus-flat aesthetic conflict surfaced as an explicit, recorded decision, so that Wave 1 ships the disciplined upgrades without silently overriding the glass look I approved.

> **Decision Point (unresolved):** The cool-flat "Quiet Instrument" aesthetic (`#0A0B0D` base, no glass, no shadow, cool-grey light theme) conflicts with the warm Apple-silicon glass dashboard the user explicitly said they loved (`.sb-dashboard` glass tokens, frosted panels, spotlight FX, grain, cream light theme). The three resolutions are `flat`, `glass`, and `hybrid`. **Recommended resolution: `hybrid`** — keep the glass surface skin and adopt all Aesthetic_Neutral_Discipline. This requirement records the decision; the chosen Surface_Skin value drives Requirements 6 and 7.

#### Acceptance Criteria

1. THE Design_System SHALL record exactly one Surface_Skin value, constrained to the set {`glass`, `flat`, `hybrid`}, and SHALL NOT accept any value outside that set.
2. THE Design_System SHALL apply every Aesthetic_Neutral_Discipline rule regardless of the recorded Surface_Skin value and regardless of whether a value has yet been recorded.
3. WHERE the recorded Surface_Skin value is `glass` or `hybrid`, THE Design_System SHALL retain the existing `.sb-dashboard` glass tokens and surfaces without removing, renaming, or altering their values, and SHALL NOT apply the Requirement 7 flat Surface_Level treatment to those surfaces.
4. WHERE the recorded Surface_Skin value is `flat`, THE Design_System SHALL render all surfaces, including those currently styled by the `.sb-dashboard` glass tokens, using the Surface_Level lightness-and-border treatment from Requirement 7.
5. THE Design_System SHALL, before any Wave 1 implementation task begins, document in the design document the recorded Surface_Skin value together with a written rationale stating why that value was chosen over the other two resolutions.
6. IF no Surface_Skin value has been recorded, THEN THE Design_System SHALL treat the Surface_Skin value as `hybrid`.

### Requirement 9: Additive, Non-Breaking Integration

**User Story:** As the owner of a live application, I want the design-system foundation added without breaking anything that already works, so that the deployed product stays functional throughout Wave 1.

#### Acceptance Criteria

1. THE Design_System SHALL introduce the Foundation_Token_File without removing or renaming the existing `.sb-dashboard` glass tokens in `src/app/globals.css`.
2. WHEN Wave 1 changes are applied, THE existing dashboard, Navigation_Sidebar, and marketing surfaces SHALL render with no uncaught runtime or console errors and SHALL retain the interactive behavior they had before Wave 1.
3. WHEN the project build is run, THE application SHALL report a successful build status with no new compilation errors or warnings attributable to Wave 1 changes.
4. WHERE an existing component references a legacy token, THE Design_System SHALL preserve that token or provide an alias that resolves to the same computed value the legacy token resolved to before Wave 1, so that the component renders unchanged.
5. THE Design_System SHALL limit visual changes to those explicitly specified by Requirements 1 through 8, 10, and 11, and SHALL NOT alter the visual presentation of any other surface.
6. THE Foundation_Token_File token names SHALL NOT collide with any existing `.sb-dashboard` token name.
7. WHEN the automated test suite is run after Wave 1 changes, THE suite SHALL pass every test that passed before Wave 1.

### Requirement 10: Accessibility by Construction

**User Story:** As a user relying on assistive technology or keyboard navigation, I want every Wave 1 surface to meet WCAG AA from the start, so that the interface is usable without retrofitting.

#### Acceptance Criteria

1. THE Design_System SHALL render text at a contrast ratio of at least 4.5:1, large text at at least 3:1, and non-text UI elements at at least 3:1 against their adjacent background, in both Light_Theme and Dark_Theme.
2. THE Design_System SHALL convey every distinction that uses the Type_Triplet through a type-specific icon and a text label in addition to color, such that the distinction remains identifiable when hue is removed.
3. THE Design_System SHALL convey confidence level through a left-edge marker and an adjacent text-rendered confidence value that remains identifiable when hue is removed.
4. WHEN an interactive element receives keyboard focus, THE Design_System SHALL render a focus indicator at least 3px thick with a contrast ratio of at least 3:1 against its adjacent colors.
5. THE Navigation_Sidebar SHALL present a focus order that matches its top-to-bottom visual order, SHALL make every navigation item reachable by sequential keyboard navigation, and SHALL mark the Active_Nav_Item with `aria-current="page"`.
6. WHILE the Primary_Button is loading, THE Design_System SHALL set `aria-busy` to `true` to expose the busy state to assistive technology.
7. WHEN a focused interactive element is activated via the Enter or Space key, THE Design_System SHALL trigger the same action it triggers on pointer activation, without requiring pointer input.

### Requirement 11: Responsive Behavior by Construction

**User Story:** As a user on any screen size, I want each Wave 1 surface to adapt to my viewport, so that the layout works on desktop, tablet, and mobile.

#### Acceptance Criteria

1. WHILE the viewport width is greater than 1100px, THE Navigation_Sidebar SHALL render the full 240px desktop layout.
2. WHILE the viewport width is from 700px to 1100px inclusive, THE Navigation_Sidebar SHALL render the collapsed 64px rail layout.
3. WHILE the viewport width is less than 700px, THE Navigation_Sidebar SHALL render the mobile layout with the off-canvas drawer hidden by default and the bottom tab bar persistently visible.
4. WHILE the Navigation_Sidebar is in the collapsed rail or mobile layout, THE Navigation_Sidebar SHALL mark exactly one Active_Nav_Item with `aria-current="page"` and expose an accessible name for that item.
5. THE Primary_Button SHALL retain its full text label, a minimum touch target of 44px by 44px, and its full state styling across the desktop, tablet, and mobile layouts.
