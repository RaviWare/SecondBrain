import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import fc from 'fast-check'

/**
 * Property 1 — token-namespace collision invariant for the Quiet Instrument
 * foundation layer (Wave 1, Phase 1). Verifies the SHIPPED stylesheet artifacts
 * on disk, not a copy: the set of declared `--qi-*` token names emitted by
 * `src/styles/quiet-instrument.css` is DISJOINT from the set of declared custom
 * properties in `src/app/globals.css` (including the `.sb-dashboard` `--dash-*`
 * block), and the pre-existing globals/`.sb-dashboard` tokens are still present.
 *
 * Validates: Requirements 9.6, 1.12 (and 9.1, 9.4 for the unchanged-tokens check).
 */

const here = dirname(fileURLToPath(import.meta.url))
const QI_CSS_PATH = resolve(here, 'quiet-instrument.css')
const GLOBALS_CSS_PATH = resolve(here, '../app/globals.css')

/**
 * Extract the set of DECLARED CSS custom-property names from a stylesheet.
 * A declared custom property is the left-hand side of a `--name:` declaration.
 * The leading `(^|[\s;{])` boundary plus the trailing `\s*:` deliberately
 * excludes `var(--name)` references (which are preceded by `(` and followed
 * by `)` / a comma, never a colon).
 */
function declaredCustomProps(css: string): Set<string> {
  const names = new Set<string>()
  const re = /(^|[\s;{])(--[A-Za-z0-9-]+)\s*:/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) {
    names.add(m[2])
  }
  return names
}

const qiCss = readFileSync(QI_CSS_PATH, 'utf8')
const globalsCss = readFileSync(GLOBALS_CSS_PATH, 'utf8')

const qiNames = [...declaredCustomProps(qiCss)]
const qiSet = new Set(qiNames)
const globalsNames = declaredCustomProps(globalsCss)

describe('Quiet Instrument token-namespace collision invariant (Property 1)', () => {
  it('extracts a non-empty set of declared token names from each stylesheet', () => {
    // Guard against a silently-failing regex / empty file producing a vacuous pass.
    expect(qiNames.length).toBeGreaterThan(0)
    expect(globalsNames.size).toBeGreaterThan(0)
  })

  it('every Quiet Instrument declared token name is namespaced with --qi-', () => {
    const offenders = qiNames.filter((name) => !name.startsWith('--qi-'))
    expect(offenders).toEqual([])
  })

  // Belt-and-suspenders example check: the raw set intersection is empty.
  it('the QI token set and the globals.css token set are disjoint (intersection size === 0)', () => {
    const intersection = qiNames.filter((name) => globalsNames.has(name))
    expect(intersection).toEqual([])
    expect(intersection.length).toBe(0)
  })

  // Feature: quiet-instrument-design-system, Property 1: No Quiet Instrument token name collides with an existing token
  it('Property 1: no Quiet Instrument token name collides with an existing globals.css token', () => {
    fc.assert(
      fc.property(fc.constantFrom(...qiNames), (name) => !globalsNames.has(name)),
      { numRuns: 100 },
    )
  })

  it('pre-existing .sb-dashboard / globals token names are still present and unchanged (Req 9.1, 9.4)', () => {
    const mustExist = ['--dash-bg', '--dash-accent', '--surface-2', '--accent', '--text-primary']
    for (const token of mustExist) {
      expect(globalsNames.has(token)).toBe(true)
      // The same name must NOT have been pulled into the QI namespace.
      expect(qiSet.has(token)).toBe(false)
    }
  })
})
