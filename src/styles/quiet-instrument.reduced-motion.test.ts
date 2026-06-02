import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import fc from 'fast-check'

/**
 * Property 5 — reduced motion zeroes durations while preserving end state, for
 * the Quiet Instrument foundation layer (Wave 1, Phase 1). Verifies the SHIPPED
 * stylesheet artifact on disk, not a copy.
 *
 * jsdom/CSSOM cannot evaluate `@media (prefers-reduced-motion)` here (the default
 * vitest environment is `node`), so this verifies the artifact STRUCTURALLY by
 * parsing the CSS text: the scoped reduced-motion block sets each of the four
 * `--qi-t-*` duration tokens to `0ms` (Req 2.1) and collapses looping animations
 * to a single static state that still conveys status (Req 2.2, 2.3), while the
 * normal `.qi` block outside the media query keeps the non-zero durations.
 *
 * Validates: Requirements 2.1, 2.2, 2.3
 */

const here = dirname(fileURLToPath(import.meta.url))
const QI_CSS_PATH = resolve(here, 'quiet-instrument.css')

const qiCss = readFileSync(QI_CSS_PATH, 'utf8')

/** The four Quiet Instrument motion duration token names (Req 2.1). */
const DURATION_TOKENS = ['--qi-t-instant', '--qi-t-fast', '--qi-t-base', '--qi-t-slow'] as const

/** Normal (non-reduced-motion) values for each duration token, per Req 1.8. */
const NORMAL_VALUES: Record<(typeof DURATION_TOKENS)[number], string> = {
  '--qi-t-instant': '80ms',
  '--qi-t-fast': '120ms',
  '--qi-t-base': '180ms',
  '--qi-t-slow': '240ms',
}

/**
 * Extract the body of the `@media (prefers-reduced-motion:reduce)` block by
 * brace-matching from the block's opening `{` to its matching close, so nested
 * rule blocks inside the media query are included.
 */
function extractReducedMotionBlock(css: string): string {
  const header = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/.exec(css)
  if (!header) return ''
  const open = css.indexOf('{', header.index + header[0].length)
  if (open === -1) return ''
  let depth = 0
  for (let i = open; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  return ''
}

const reducedBlock = extractReducedMotionBlock(qiCss)
/** Everything OUTSIDE the reduced-motion block — used for the sanity check. */
const outsideReducedBlock = qiCss.replace(reducedBlock, '')

describe('Quiet Instrument reduced-motion durations + end-state (Property 5)', () => {
  it('locates a non-empty @media (prefers-reduced-motion:reduce) block', () => {
    // Guard against a silently-failing extractor producing a vacuous pass.
    expect(qiCss.length).toBeGreaterThan(0)
    expect(reducedBlock.trim().length).toBeGreaterThan(0)
  })

  // Feature: quiet-instrument-design-system, Property 5: Reduced motion zeroes durations while preserving end state
  it('Property 5: any motion duration token resolves to 0ms inside the reduced-motion block (Req 2.1)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...DURATION_TOKENS), (name) => {
        const re = new RegExp(name.replace(/-/g, '\\-') + '\\s*:\\s*0ms')
        return re.test(reducedBlock)
      }),
      { numRuns: 100 },
    )
  })

  it('collapses looping animations to a single static state — skeleton + live status-dot (Req 2.3)', () => {
    // Skeleton shimmer loop collapses to a static state...
    expect(/\.qi-skeleton\b[^}]*animation\s*:\s*none/.test(reducedBlock)).toBe(true)
    // ...and the live agent status-dot pulse loop collapses to a static state.
    expect(/\.qi-status-dot\b[^}]*animation\s*:\s*none/.test(reducedBlock)).toBe(true)
  })

  it('preserves the end state — skeleton keeps a visible static surface fallback (Req 2.2)', () => {
    // The skeleton still conveys "loading geometry" via a static surface fill,
    // so the end state is not lost when the shimmer is removed.
    expect(/\.qi-skeleton\b[^}]*background\s*:\s*var\(--qi-surface-2\)/.test(reducedBlock)).toBe(true)
  })

  it('only zeroes durations under reduced motion — normal .qi block keeps non-zero values (Req 2.1 sanity)', () => {
    for (const token of DURATION_TOKENS) {
      const normal = NORMAL_VALUES[token]
      const re = new RegExp(token.replace(/-/g, '\\-') + '\\s*:\\s*' + normal)
      // Defined to its normal non-zero value outside the reduced-motion block.
      expect(re.test(outsideReducedBlock)).toBe(true)
      // And that normal value is genuinely non-zero.
      expect(normal).not.toBe('0ms')
    }
  })
})
