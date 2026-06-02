// Feature: quiet-instrument-design-system, Phase 2 — font wiring & fallback chain (Task 2.3)
//
// Unit test (not a correctness Property — no tag required). Verifies the SHIPPED
// artifacts on disk, not copies:
//   1. src/styles/quiet-instrument.css — the dark `.qi { ... }` block binds the
//      family tokens to the next/font Geist variables ahead of the declared
//      fallback chain (Req 3.1, 3.2, 3.7, 3.8).
//   2. src/app/layout.tsx — Geist + Geist_Mono are loaded via next/font/google
//      with the `--font-geist` / `--font-geist-mono` variables and display:'swap',
//      their variables are present on <html>, AND the pre-existing Inter /
//      JetBrains_Mono fonts are preserved so glass surfaces are unchanged (Req 9.5).
//   3. src/styles/quiet-instrument.css — only the three weights 400/500/600 are
//      used anywhere (Req 3.3).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const QI_CSS_PATH = resolve(here, 'quiet-instrument.css')
const LAYOUT_PATH = resolve(here, '../app/layout.tsx')

const qiCss = readFileSync(QI_CSS_PATH, 'utf8')
const layoutSrc = readFileSync(LAYOUT_PATH, 'utf8')

/**
 * Isolate the DARK token block: the first `.qi { ... }` rule declared at the
 * start of a line. The light fork is `[data-theme="light"] .qi { ... }` (".qi"
 * is not at line-start there) and `.qi-*` component classes have a "-" after
 * "qi", so neither is matched here.
 */
function extractDarkQiBlock(source: string): string {
  const m = source.match(/(?:^|\n)\.qi\s*\{([^}]*)\}/)
  if (!m) throw new Error('Could not locate the dark `.qi { ... }` token block')
  return m[1]
}

/** Pull a single custom-property's declared value (everything up to the `;`). */
function tokenValue(block: string, name: string): string {
  const re = new RegExp(`${name}\\s*:\\s*([^;]+);`)
  const m = block.match(re)
  if (!m) throw new Error(`Token ${name} not declared in the dark .qi block`)
  return m[1].trim()
}

const darkBlock = extractDarkQiBlock(qiCss)

describe('Quiet Instrument font tokens — Geist primary + declared fallback chain (Req 3.1, 3.2, 3.7, 3.8)', () => {
  const sans = tokenValue(darkBlock, '--qi-font-sans')
  const mono = tokenValue(darkBlock, '--qi-font-mono')

  it('--qi-font-sans starts with var(--font-geist) so Geist is the primary sans', () => {
    expect(sans.startsWith('var(--font-geist)')).toBe(true)
  })

  it('--qi-font-sans declares the Inter + sans-serif fallbacks behind Geist', () => {
    expect(sans).toContain('"Inter"')
    expect(sans).toContain('sans-serif')
  })

  it('--qi-font-mono starts with var(--font-geist-mono) so Geist Mono is the primary mono', () => {
    expect(mono.startsWith('var(--font-geist-mono)')).toBe(true)
  })

  it('--qi-font-mono declares the JetBrains Mono + monospace fallbacks behind Geist Mono', () => {
    expect(mono).toContain('"JetBrains Mono"')
    expect(mono).toContain('monospace')
  })
})

describe('layout.tsx loads Geist via next/font/google and preserves the glass fonts (Req 3.7, 3.8, 9.5)', () => {
  // The single `import { ... } from 'next/font/google'` statement.
  const importMatch = layoutSrc.match(/import\s*\{([^}]*)\}\s*from\s*['"]next\/font\/google['"]/)

  it('imports a font set from next/font/google', () => {
    expect(importMatch).not.toBeNull()
  })

  it('imports Geist and Geist_Mono from next/font/google', () => {
    const imported = importMatch![1]
    expect(imported).toMatch(/\bGeist\b/)
    expect(imported).toMatch(/\bGeist_Mono\b/)
  })

  it('still imports Inter and JetBrains_Mono from next/font/google (glass fonts preserved)', () => {
    const imported = importMatch![1]
    expect(imported).toMatch(/\bInter\b/)
    expect(imported).toMatch(/\bJetBrains_Mono\b/)
  })

  it("instantiates Geist with variable '--font-geist' and display 'swap'", () => {
    // `\bGeist\s*\(` matches the `Geist(` call but not `Geist_Mono(` (followed by `_`).
    const call = layoutSrc.match(/\bGeist\s*\(\s*\{([^}]*)\}\s*\)/)
    expect(call).not.toBeNull()
    const args = call![1]
    // `'--font-geist'` (closing quote) excludes `'--font-geist-mono'`.
    expect(args).toMatch(/variable:\s*'--font-geist'/)
    expect(args).toMatch(/display:\s*'swap'/)
  })

  it("instantiates Geist_Mono with variable '--font-geist-mono' and display 'swap'", () => {
    const call = layoutSrc.match(/\bGeist_Mono\s*\(\s*\{([^}]*)\}\s*\)/)
    expect(call).not.toBeNull()
    const args = call![1]
    expect(args).toMatch(/variable:\s*'--font-geist-mono'/)
    expect(args).toMatch(/display:\s*'swap'/)
  })

  it('still instantiates Inter and JetBrains_Mono (glass fonts preserved)', () => {
    expect(layoutSrc).toMatch(/\bInter\s*\(/)
    expect(layoutSrc).toMatch(/\bJetBrains_Mono\s*\(/)
  })

  describe('the <html> className', () => {
    const htmlClass = layoutSrc.match(/<html[\s\S]*?className=\{`([^`]*)`\}/)

    it('is a template-string className on <html>', () => {
      expect(htmlClass).not.toBeNull()
    })

    it('includes ${geist.variable} and ${geistMono.variable}', () => {
      const cls = htmlClass![1]
      expect(cls).toContain('${geist.variable}')
      expect(cls).toContain('${geistMono.variable}')
    })

    it('still includes ${inter.variable} and ${jetbrainsMono.variable} (glass fonts preserved)', () => {
      const cls = htmlClass![1]
      expect(cls).toContain('${inter.variable}')
      expect(cls).toContain('${jetbrainsMono.variable}')
    })
  })
})

describe('Quiet Instrument uses only the three weights 400 / 500 / 600 (Req 3.3)', () => {
  const ALLOWED = new Set(['400', '500', '600'])

  /**
   * Collect every numeric font-weight in the stylesheet:
   *  - `font:` shorthand — the weight is the LEADING 3-digit token (e.g.
   *    `font:600 30px/1 ...`). `\bfont\s*:` matches `font:` but NOT `font-size:`
   *    / `font-family:` / `font-feature-settings:` (a `-` follows `font` there),
   *    so font-size and line-height numbers are never captured.
   *  - explicit `font-weight:` declarations (none today, but future-proofed).
   */
  function collectFontWeights(css: string): string[] {
    const weights: string[] = []
    const shorthand = /\bfont\s*:\s*(\d{3})\b/g
    const longhand = /font-weight\s*:\s*(\d{3})\b/g
    let m: RegExpExecArray | null
    while ((m = shorthand.exec(css)) !== null) weights.push(m[1])
    while ((m = longhand.exec(css)) !== null) weights.push(m[1])
    return weights
  }

  const weights = collectFontWeights(qiCss)

  it('finds font weights to check (guards against a vacuous pass)', () => {
    expect(weights.length).toBeGreaterThan(0)
  })

  it('every declared font weight is one of 400 / 500 / 600', () => {
    const offenders = [...new Set(weights)].filter((w) => !ALLOWED.has(w))
    expect(offenders).toEqual([])
  })

  it('all three permitted weights (400, 500, 600) are actually used', () => {
    const used = new Set(weights)
    expect(used).toEqual(ALLOWED)
  })
})
