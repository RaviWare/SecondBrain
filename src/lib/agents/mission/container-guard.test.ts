// Feature: mission-orchestrator, Property 14: Agent work runs only when all four container controls are enforced
// Validates: Requirements 12.7
//
// The universal invariant for the four-control container predicate
// (`containerControlsEnforced` + `evaluateContainerControls`) over EVERY combination of
// the four boolean controls — and over malformed / non-boolean / missing inputs. Agent
// work may execute IFF all four controls (non-root user, resource caps, network
// isolation, no host Docker socket) are enforced; if even one is not enforced the
// Mission fails and NO Agent work runs under a partial set of controls (Req 12.7). There
// is no "three of four": the predicate is all-or-nothing.
//
// Both targets are PURE / TOTAL / DETERMINISTIC (no I/O, no Docker import, no models), so
// they run directly with zero mocking and zero containers. The fail-closed contract from
// `container-guard.ts` is re-stated as an independent oracle below: a control is enforced
// ONLY when its field is the literal boolean `true`; ANYTHING else (`undefined`, `null`,
// `0`, `'true'`, `1`, `NaN`, an object, a missing field, or a null/undefined `controls`)
// is treated as NOT enforced. Because the oracle restates the CONTRACT (not the
// implementation), a divergence is a real bug, not a tautology.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  containerControlsEnforced,
  evaluateContainerControls,
  CONTAINER_CONTROL_KEYS,
  type ContainerControls,
} from './container-guard'

// ── Contract oracle (mirrors container-guard.ts's documented fail-closed convention) ──
// A control is ENFORCED only when its field is the literal boolean `true`. Independent of
// the SUT's internals, so the property can predict enforced/missing without calling it.
const isEnforcedOracle = (value: unknown): boolean => value === true

/** The keys (in CONTAINER_CONTROL_KEYS order) whose value is NOT the literal `true`. */
function expectedMissing(controls: unknown): (keyof ContainerControls)[] {
  const c = (controls ?? {}) as Partial<Record<keyof ContainerControls, unknown>>
  return CONTAINER_CONTROL_KEYS.filter((key) => !isEnforcedOracle(c[key]))
}

// ── Generators ───────────────────────────────────────────────────────────────────────
// A pool of NON-`true` values that must ALL fail closed to "not enforced". Mixes the
// obvious falsy values, the deceptive truthy-but-not-`true` values (`1`, `'true'`, the
// string, an object), and the absent-field sentinel `undefined`.
const NOT_ENFORCED_VALUES = [
  false,
  undefined,
  null,
  0,
  1,
  -1,
  Number.NaN,
  'true',
  'false',
  '',
  {},
  [],
] as const

// A single control field: either the literal `true` (the ONLY enforced value) or one of
// the not-enforced values above. Weighted so both branches are well represented.
const controlFieldArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 4, arbitrary: fc.constant(true) },
  { weight: 6, arbitrary: fc.constantFrom(...NOT_ENFORCED_VALUES) },
)

// A `controls`-shaped object whose four fields are each independently `true` or junk.
// Typed through `as` because the whole point is to inject non-boolean values past the
// compile-time `boolean` shape and prove the runtime stays fail-closed (totality).
const looseControlsArb: fc.Arbitrary<ContainerControls> = fc
  .record({
    nonRoot: controlFieldArb,
    resourceCapped: controlFieldArb,
    networkIsolated: controlFieldArb,
    noHostDockerSocket: controlFieldArb,
  })
  .map((o) => o as unknown as ContainerControls)

// A strict all-boolean `controls` (no junk) — for the clean 2⁴ semantics.
const boolControlsArb: fc.Arbitrary<ContainerControls> = fc.record({
  nonRoot: fc.boolean(),
  resourceCapped: fc.boolean(),
  networkIsolated: fc.boolean(),
  noHostDockerSocket: fc.boolean(),
})

// Junk top-level `controls` inputs (not a well-formed object) — for totality of the
// container input itself: null / undefined / primitives / arrays.
const junkControlsArb: fc.Arbitrary<unknown> = fc.constantFrom(
  null,
  undefined,
  0,
  1,
  'true',
  '',
  false,
  true,
  Number.NaN,
  [],
  [true, true, true, true],
)

// ── Exhaustive 2⁴ enumeration of the four booleans ─────────────────────────────────────
const ALL_16_COMBINATIONS: ContainerControls[] = (() => {
  const combos: ContainerControls[] = []
  for (let mask = 0; mask < 16; mask++) {
    combos.push({
      nonRoot: Boolean(mask & 0b0001),
      resourceCapped: Boolean(mask & 0b0010),
      networkIsolated: Boolean(mask & 0b0100),
      noHostDockerSocket: Boolean(mask & 0b1000),
    })
  }
  return combos
})()

describe('Property 14: Agent work runs only when all four container controls are enforced', () => {
  // 0. EXHAUSTIVE: walk all 2⁴ = 16 combinations explicitly. Agent work is permitted IFF
  //    all four are enforced; any other combination is refused and names exactly the
  //    not-enforced controls (Req 12.7).
  it('over all 16 boolean combinations: enforced IFF all four true; missing lists exactly the not-enforced controls', () => {
    expect(ALL_16_COMBINATIONS).toHaveLength(16)

    let permittedCount = 0
    for (const controls of ALL_16_COMBINATIONS) {
      const allFour =
        controls.nonRoot &&
        controls.resourceCapped &&
        controls.networkIsolated &&
        controls.noHostDockerSocket

      const enforced = containerControlsEnforced(controls)
      const evaluation = evaluateContainerControls(controls)

      // Agent work permitted IFF every control is enforced.
      expect(enforced).toBe(allFour)
      expect(evaluation.enforced).toBe(allFour)
      // The structured result agrees with the predicate.
      expect(evaluation.enforced).toBe(enforced)
      // `missing` lists exactly the not-enforced controls, in canonical order.
      expect(evaluation.missing).toEqual(expectedMissing(controls))
      // Permitted ⟺ nothing missing.
      expect(evaluation.missing.length === 0).toBe(enforced)

      if (enforced) permittedCount++
    }

    // Exactly ONE of the 16 combinations (all-true) permits Agent work — all-or-nothing.
    expect(permittedCount).toBe(1)
  })

  // 1. CORE INVARIANT (Req 12.7): for any all-boolean controls, permitted IFF all four
  //    enforced — never on three-of-four.
  it('permits Agent work iff all four boolean controls are enforced (no partial credit)', () => {
    fc.assert(
      fc.property(boolControlsArb, (controls) => {
        const allFour =
          controls.nonRoot &&
          controls.resourceCapped &&
          controls.networkIsolated &&
          controls.noHostDockerSocket
        expect(containerControlsEnforced(controls)).toBe(allFour)
      }),
      { numRuns: 100 },
    )
  })

  // 2. MISSING NAMES EXACTLY THE FAILED CONTROLS (Req 12.7): a refused Mission records
  //    precisely which control(s) could not be enforced, in canonical order, and the
  //    `missing` list is empty IFF the predicate permitted Agent work.
  it('evaluateContainerControls().missing lists exactly the not-enforced controls in canonical order', () => {
    fc.assert(
      fc.property(looseControlsArb, (controls) => {
        const evaluation = evaluateContainerControls(controls)
        expect(evaluation.missing).toEqual(expectedMissing(controls))
        // `enforced` ⟺ nothing missing.
        expect(evaluation.enforced).toBe(evaluation.missing.length === 0)
      }),
      { numRuns: 100 },
    )
  })

  // 3. PREDICATE / STRUCTURED RESULT AGREE (Req 12.7): `containerControlsEnforced` is the
  //    boolean projection of `evaluateContainerControls().enforced` — they can never
  //    disagree, for any input.
  it('containerControlsEnforced agrees with evaluateContainerControls().enforced for all inputs', () => {
    fc.assert(
      fc.property(looseControlsArb, (controls) => {
        expect(containerControlsEnforced(controls)).toBe(evaluateContainerControls(controls).enforced)
      }),
      { numRuns: 100 },
    )
  })

  // 4. FAIL-CLOSED TOTALITY (Req 12.7): non-boolean / missing fields injected via `as`
  //    casts (`undefined`, `null`, `0`, `'true'`, `1`, NaN, objects, …) are treated as
  //    NOT enforced — a control counts ONLY when it is the literal boolean `true`. So a
  //    mission is permitted under malformed input IFF every field is exactly `true`.
  //    Never throws.
  it('is fail-closed and total: only literal `true` counts as enforced; junk fields are not enforced; never throws', () => {
    fc.assert(
      fc.property(looseControlsArb, (controls) => {
        let enforced!: boolean
        expect(() => {
          enforced = containerControlsEnforced(controls)
        }).not.toThrow()

        const allLiteralTrue =
          (controls as Record<keyof ContainerControls, unknown>).nonRoot === true &&
          (controls as Record<keyof ContainerControls, unknown>).resourceCapped === true &&
          (controls as Record<keyof ContainerControls, unknown>).networkIsolated === true &&
          (controls as Record<keyof ContainerControls, unknown>).noHostDockerSocket === true

        expect(enforced).toBe(allLiteralTrue)
      }),
      { numRuns: 100 },
    )
  })

  // 5. A SINGLE non-`true` value in ANY one of the four slots fails the whole mission —
  //    pins the all-or-nothing boundary one control at a time across all not-enforced
  //    values.
  it('any single non-`true` control (any not-enforced value) refuses Agent work and names that control', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CONTAINER_CONTROL_KEYS),
        fc.constantFrom(...NOT_ENFORCED_VALUES),
        (brokenKey, badValue) => {
          // Start from a fully-enforced set, then break exactly one control.
          const controls = {
            nonRoot: true,
            resourceCapped: true,
            networkIsolated: true,
            noHostDockerSocket: true,
          } as Record<keyof ContainerControls, unknown>
          controls[brokenKey] = badValue

          const evaluation = evaluateContainerControls(controls as unknown as ContainerControls)
          expect(containerControlsEnforced(controls as unknown as ContainerControls)).toBe(false)
          expect(evaluation.enforced).toBe(false)
          // Exactly the broken control is reported missing — and nothing else.
          expect(evaluation.missing).toEqual([brokenKey])
        },
      ),
      { numRuns: 100 },
    )
  })

  // 6. NULL / UNDEFINED / JUNK top-level `controls` (Req 12.7): a missing controls object
  //    returns false / all-missing — the worst-case fail-closed default. Never throws.
  it('a null / undefined / non-object controls input returns false and reports all four missing, never throws', () => {
    fc.assert(
      fc.property(junkControlsArb, (controls) => {
        let enforced!: boolean
        let missing!: (keyof ContainerControls)[]
        expect(() => {
          enforced = containerControlsEnforced(controls as unknown as ContainerControls)
          missing = evaluateContainerControls(controls as unknown as ContainerControls).missing
        }).not.toThrow()

        // An array element could be `true` only via index keys, never the named control
        // keys, so every junk input fails closed to "all four missing".
        expect(enforced).toBe(false)
        expect(missing).toEqual([...CONTAINER_CONTROL_KEYS])
      }),
      { numRuns: 100 },
    )
  })

  // 7. EXPLICIT null / undefined: the documented totality anchors — a null/undefined
  //    `controls` returns false and lists all four controls as missing.
  it('explicit null and undefined controls return false / all-four-missing', () => {
    for (const input of [null, undefined]) {
      expect(containerControlsEnforced(input)).toBe(false)
      expect(evaluateContainerControls(input)).toEqual({
        enforced: false,
        missing: [...CONTAINER_CONTROL_KEYS],
      })
    }
  })
})
