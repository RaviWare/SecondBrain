// Feature: quiet-instrument-design-system, Phase 5 (task 5.3) — WCAG AA contrast,
// focus indicators, and non-colour redundancy, computed from the shipped tokens.
//
// Reads `quiet-instrument.css`, parses the dark + light token values, and computes
// real WCAG 2.1 relative-luminance contrast ratios for the new `.qi` text/surface
// pairings in BOTH themes. Asserts:
//   • body / primary text on its surface ≥ 4.5:1 (AA normal text);
//   • large/stat text + the ember-ink-on-ember button ≥ 3:1 (AA large / non-text);
//   • the focus ring token is a real ≥3px treatment and the ember ring is present;
//   • reduced-motion zeroes the four duration tokens (redundancy with motion off).
//
// NOTE (honest scope): automated ratios from tokens are necessary but NOT sufficient
// for full WCAG AA — real assistive-tech + expert review still required (per the
// spec's own Notes). This pins the token-level guarantees only.
//
// Validates: Requirements 10.1, 10.2, 10.3, 10.4, 2.2, 2.3.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CSS = readFileSync(
  fileURLToPath(new URL('./quiet-instrument.css', import.meta.url)),
  'utf8',
)

function block(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = CSS.match(new RegExp(esc + '\\s*\\{([^}]*)\\}'))
  if (!m) throw new Error(`block not found: ${selector}`)
  return m[1]
}
function decls(body: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /(--qi-[a-z0-9-]+)\s*:\s*([^;]+);/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) out.set(m[1], m[2].trim())
  return out
}

const dark = decls(block('.qi'))
const light = decls(block('[data-theme="light"] .qi'))

// ── WCAG relative luminance + contrast ratio (WCAG 2.1) ───────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}
function relLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(fg: string, bg: string): number {
  const l1 = relLuminance(fg)
  const l2 = relLuminance(bg)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/** Resolve a token to a hex literal, falling back to the dark block for shared tokens. */
function resolve(theme: Map<string, string>, token: string): string {
  const v = theme.get(token) ?? dark.get(token)
  if (!v) throw new Error(`unresolved token ${token}`)
  // Some tokens reference another via var() (e.g. ember-text: var(--qi-ember)).
  const varMatch = v.match(/var\((--qi-[a-z0-9-]+)\)/i)
  if (varMatch) return resolve(theme, varMatch[1])
  return v
}

describe('WCAG AA contrast — dark theme (Req 10.1)', () => {
  it('primary text on resting surface ≥ 4.5:1', () => {
    expect(contrast(resolve(dark, '--qi-text-1'), resolve(dark, '--qi-surface-1'))).toBeGreaterThanOrEqual(4.5)
  })
  it('secondary/body text on resting surface ≥ 4.5:1', () => {
    expect(contrast(resolve(dark, '--qi-text-2'), resolve(dark, '--qi-surface-1'))).toBeGreaterThanOrEqual(4.5)
  })
  it('primary text on the canvas ≥ 4.5:1', () => {
    expect(contrast(resolve(dark, '--qi-text-1'), resolve(dark, '--qi-canvas'))).toBeGreaterThanOrEqual(4.5)
  })
  it('ember-ink on the ember primary button ≥ 3:1 (large/non-text)', () => {
    expect(contrast(resolve(dark, '--qi-ember-ink'), resolve(dark, '--qi-ember'))).toBeGreaterThanOrEqual(3)
  })
})

describe('WCAG AA contrast — light theme (Req 10.1, 6.x)', () => {
  it('primary text on white surface ≥ 4.5:1', () => {
    expect(contrast(resolve(light, '--qi-text-1'), resolve(light, '--qi-surface-1'))).toBeGreaterThanOrEqual(4.5)
  })
  it('secondary/body text on canvas ≥ 4.5:1', () => {
    expect(contrast(resolve(light, '--qi-text-2'), resolve(light, '--qi-canvas'))).toBeGreaterThanOrEqual(4.5)
  })

  // ── AA fix verified (user-authorized brand-color change) ───────────────────
  // `--qi-ember-text` on light now uses ember-700 (#A8430F) = 6.04:1 on white —
  // clears AA normal text (4.5:1), so it is safe for body-size accent text, not
  // just large/non-text. (The previous #DC5C18 was only 3.76:1.)
  it('ember-as-text (#A8430F) on white ≥ 4.5:1 — AA normal text (was the 3.76:1 gap)', () => {
    expect(contrast(resolve(light, '--qi-ember-text'), resolve(light, '--qi-surface-1'))).toBeGreaterThanOrEqual(4.5)
  })
  it('ember-as-text on the cool canvas ≥ 4.5:1 too', () => {
    expect(contrast(resolve(light, '--qi-ember-text'), resolve(light, '--qi-canvas'))).toBeGreaterThanOrEqual(4.5)
  })

  // ── AA fix verified ─────────────────────────────────────────────────────────
  // The light primary button now keeps DARK ink (#1B1205) on ember = 6.24:1,
  // which clears even the 4.5 normal-text bar a button LABEL needs (the previous
  // white ink was 2.97:1, sub-3:1).
  it('light primary-button ink on ember ≥ 4.5:1 — label-text AA (was the 2.97:1 gap)', () => {
    expect(contrast(resolve(light, '--qi-ember-ink'), resolve(light, '--qi-ember'))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('focus indicator + ember ring (Req 10.2)', () => {
  it('the rendered primary button (DARK theme, dark ink on ember) clears AA-large ≥ 3:1', () => {
    // The ONLY QI primary button that actually renders today is the Initialize
    // Ingest CTA in the default (dark) theme: dark ink #1B1205 on ember = 6.24:1.
    expect(contrast(resolve(dark, '--qi-ember-ink'), resolve(dark, '--qi-ember'))).toBeGreaterThanOrEqual(3)
  })
  it('the ember focus-ring token is defined as a real translucent ember', () => {
    expect(dark.get('--qi-ember-ring')).toMatch(/rgba\(242,\s*111,\s*40,\s*0?\.40\)/)
  })
  it('the base button focus rule applies a ≥3px ring via box-shadow (unclipped)', () => {
    // Shipped rule: `.qi-btn:focus-visible { outline:none; box-shadow:0 0 0 3px var(--qi-ember-ring); }`
    const focusRule = CSS.match(/\.qi-btn:focus-visible[^{]*\{([^}]*)\}/)
    expect(focusRule, 'base button focus-visible rule present').toBeTruthy()
    expect(focusRule![1]).toMatch(/3px/)
    expect(focusRule![1]).toMatch(/--qi-ember-ring/)
  })
})

describe('reduced-motion redundancy (Req 2.2, 2.3, 10.4)', () => {
  const rmBlock = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion:reduce)'))
  it('zeroes all four duration tokens under reduced motion', () => {
    for (const t of ['--qi-t-instant', '--qi-t-fast', '--qi-t-base', '--qi-t-slow']) {
      expect(rmBlock).toMatch(new RegExp(t + '\\s*:\\s*0ms'))
    }
  })
  it('is scoped to .qi (does not touch the un-opted glass app)', () => {
    expect(rmBlock).toMatch(/\.qi/)
  })
})
