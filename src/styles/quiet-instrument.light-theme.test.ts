// Feature: quiet-instrument-design-system, Phase 5 (task 5.2) — light-theme token
// values + dark/light parity.
//
// Reads the SHIPPED `quiet-instrument.css` and asserts:
//   1. the `[data-theme="light"] .qi` fork resolves the Requirement 6 colour values
//      (canvas #F6F7F9, white base/surface-1, the cool-grey surfaces/borders, the
//      text triplet, ember-text #DC5C18, white primary-button ink, the single
//      permitted overlay-shadow colour);
//   2. THEME PARITY — every NON-colour token (spacing, radius, motion, type families,
//      layout widths) is declared only once in the dark `.qi` block and is NOT
//      overridden in the light fork, so the two themes differ in colour ONLY.
//
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CSS = readFileSync(
  fileURLToPath(new URL('./quiet-instrument.css', import.meta.url)),
  'utf8',
)

/** Extract the body of a `<selector> { ... }` block (first match). */
function block(selector: string): string {
  // Escape regex specials in the selector.
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(esc + '\\s*\\{([^}]*)\\}')
  const m = CSS.match(re)
  if (!m) throw new Error(`block not found: ${selector}`)
  return m[1]
}

/** Map of `--qi-foo: value;` declarations within a block body. */
function decls(body: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /(--qi-[a-z0-9-]+)\s*:\s*([^;]+);/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) out.set(m[1], m[2].trim())
  return out
}

const darkBody = block('.qi')
const lightBody = block('[data-theme="light"] .qi')
const dark = decls(darkBody)
const light = decls(lightBody)

describe('light-theme fork — Req 6 colour values', () => {
  const expected: Record<string, string> = {
    '--qi-canvas': '#F6F7F9',
    '--qi-base': '#FFFFFF',
    '--qi-surface-1': '#FFFFFF',
    '--qi-surface-2': '#F1F3F6',
    '--qi-surface-3': '#E8EBEF',
    '--qi-text-1': '#14161A',
    '--qi-text-2': '#565C66',
    '--qi-text-3': '#878D97',
    '--qi-ember-ink': '#1B1205', // AA fix: light primary button keeps dark ink (6.24:1), not white (2.97:1)
    '--qi-ember-text': '#A8430F', // AA fix: ember-700 darker step (6.04:1 on white), was #DC5C18 (3.76:1)
  }
  for (const [token, value] of Object.entries(expected)) {
    it(`${token} resolves to ${value}`, () => {
      expect(light.get(token)?.toUpperCase()).toBe(value.toUpperCase())
    })
  }

  it('is never cream — canvas/base carry a cool (blue ≥ red) or neutral undertone', () => {
    // #F6F7F9: r=0xF6 g=0xF7 b=0xF9 → blue ≥ red (cool), not cream (cream is r>b).
    const canvas = light.get('--qi-canvas')!
    const r = parseInt(canvas.slice(1, 3), 16)
    const b = parseInt(canvas.slice(5, 7), 16)
    expect(b).toBeGreaterThanOrEqual(r)
  })

  it('defines exactly one permitted overlay shadow colour for the light fork', () => {
    expect(light.get('--qi-shadow-overlay')).toMatch(/rgba\(20,\s*22,\s*26,\s*0?\.14\)/)
  })
})

describe('theme parity — light fork forks COLOUR ONLY (Req 6.8)', () => {
  // Non-colour tokens that MUST NOT be redeclared in the light fork.
  const NON_COLOUR = [
    '--qi-space-1', '--qi-space-4', '--qi-space-8',
    '--qi-radius-sm', '--qi-radius-md', '--qi-radius-lg', '--qi-radius-xl', '--qi-radius-full',
    '--qi-t-instant', '--qi-t-fast', '--qi-t-base', '--qi-t-slow',
    '--qi-ease-out', '--qi-ease-in-out',
    '--qi-font-sans', '--qi-font-mono',
    '--qi-nav-w', '--qi-nav-w-rail',
  ]

  it('declares every non-colour token in the dark block', () => {
    for (const t of NON_COLOUR) expect(dark.has(t), `dark missing ${t}`).toBe(true)
  })

  it('does NOT redeclare any non-colour token in the light fork', () => {
    for (const t of NON_COLOUR) {
      expect(light.has(t), `light fork must not override ${t}`).toBe(false)
    }
  })

  it('the light fork only declares colour tokens (no spacing/radius/motion/type/layout)', () => {
    const forbiddenPrefixes = ['--qi-space-', '--qi-radius-', '--qi-t-', '--qi-ease-', '--qi-font-', '--qi-nav-']
    for (const token of light.keys()) {
      for (const pre of forbiddenPrefixes) {
        expect(token.startsWith(pre), `light fork leaked non-colour token ${token}`).toBe(false)
      }
    }
  })
})
