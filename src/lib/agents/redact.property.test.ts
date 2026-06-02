// Property-based tests for the secret-redaction log helper (task 2.13).
//
// Feature: hermes-agents, Property 20: Secrets are never present in emitted log output
// Validates: Requirements 11.4
//
// These complement the example/edge-case unit tests in `redact.test.ts` (task
// 2.6) by exercising the redaction guarantee across a wide input space with
// fast-check. The core invariant (design.md → Property 20):
//
//   For any brain token or BYO LLM key value, `redact()` produces output that
//   does not contain the secret as a substring.
//
// CONTRACT NOTE (mirrors src/lib/agents/redact.ts exactly — verified empirically
// before writing this test): `redact()` guarantees non-containment for a secret
// that is "mask-independent" — non-blank AND not a substring of the literal mask
// `[REDACTED]` AND containing neither mask bracket (`[` / `]`). Those degenerate
// cases are the ONLY ones where a 1–2 char "secret" can reappear, because the
// defensive shape-scrub re-emits the literal mask (e.g. the single char `R`
// lives inside `[REDACTED]`, and a fragment like `D[` / `]]` can straddle a mask
// boundary). No real brain token (`sb_…`) or BYO key (`sk-…`/`sk_…`/`AIza…`) is
// ever a substring of the mask or contains a bracket, so the production contract
// is never weakened. We therefore only assert non-containment for mask-
// independent secrets and, separately, assert the blank/whitespace pass-through
// branch — matching what the code actually promises rather than over-claiming.

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { redact } from './redact'

const MASK = '[REDACTED]'
const NUM_RUNS = 100

// ── Generators ───────────────────────────────────────────────────────────────

// base64url-ish token body: the alphabet real brain tokens / API keys use.
const tokenBody = (minLength: number) =>
  fc.string({ unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'.split('')), minLength })

// A realistic secret in one of the known shapes, each at/above the minimum
// length its defensive pattern requires (sb_/sk-/sk_ ≥ 8 body chars, AIza ≥ 20).
const realisticSecretArb = fc.oneof(
  tokenBody(8).map((b) => `sb_${b}`),
  tokenBody(8).map((b) => `sk-${b}`),
  // sk_ pattern is [A-Za-z0-9]{8,} (no - or _ in the body)
  fc.string({ unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')), minLength: 8 }).map((b) => `sk_${b}`),
  tokenBody(20).map((b) => `AIza${b}`),
)

// A "mask-independent" secret: non-blank, not a substring of the mask, and free
// of the mask's brackets. This is exactly the precondition under which redact()
// guarantees non-containment (see CONTRACT NOTE above). Covers BOTH realistic
// tokens and fully-arbitrary non-empty strings.
const maskIndependent = (s: string) =>
  s.trim().length > 0 && !MASK.includes(s) && !s.includes('[') && !s.includes(']')

const maskIndependentSecretArb = fc
  .oneof(realisticSecretArb, fc.string({ minLength: 1 }))
  .filter(maskIndependent)

// Arbitrary surrounding text, occasionally seeded with shape-like tokens so the
// secret can sit adjacent to / overlapping other redaction targets.
const surroundingArb = fc.oneof(
  fc.string(),
  fc.constantFrom('sb_ABCDEFGH', 'sk-abcdefgh01', 'AIzaABCDEFGHIJKLMNOPQRSTUV', 'Bearer ', 'Authorization: ', ''),
)

// Embed `secret` at arbitrary positions within arbitrary text: start, middle,
// end, repeated, and adjacent (back-to-back) occurrences.
const embedArb = (secretArb: fc.Arbitrary<string>) =>
  fc.record({
    secret: secretArb,
    pre: surroundingArb,
    mid: surroundingArb,
    post: surroundingArb,
  }).map(({ secret, pre, mid, post }) => ({
    secret,
    // pre|secret|mid|secret|secret|post — start, middle, repeated, and adjacent.
    text: `${pre}${secret}${mid}${secret}${secret}${post}`,
  }))

// Arbitrary values of every shape redact() must tolerate (it is TOTAL).
const anyInputArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.bigInt(),
  fc.object(),
  fc.array(fc.anything()),
  fc.anything(),
)

// ── Property 20 ────────────────────────────────────────────────────────────────
describe('Property 20: Secrets are never present in emitted log output', () => {
  it('removes any mask-independent secret embedded anywhere in arbitrary text', () => {
    fc.assert(
      fc.property(embedArb(maskIndependentSecretArb), ({ secret, text }) => {
        const out = redact(text, [secret])
        // The secret must not survive as a substring of the emitted output.
        expect(out.includes(secret)).toBe(false)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('removes realistic brain-token / BYO-key secrets passed in the secrets list', () => {
    fc.assert(
      fc.property(embedArb(realisticSecretArb), ({ secret, text }) => {
        const out = redact(text, [secret])
        expect(out.includes(secret)).toBe(false)
        // A real token always triggers a mask in the output.
        expect(out).toContain(MASK)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('scrubs multiple distinct mask-independent secrets in a single pass', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(maskIndependentSecretArb, { minLength: 1, maxLength: 4 }),
        surroundingArb,
        (secrets, glue) => {
          const text = secrets.join(glue) + glue + secrets.join('')
          const out = redact(text, secrets)
          for (const s of secrets) {
            expect(out.includes(s)).toBe(false)
          }
        },
      ),
      { numRuns: NUM_RUNS },
    )
  })

  it('defensively scrubs known secret shapes even when NOT passed in the secrets list', () => {
    fc.assert(
      fc.property(embedArb(realisticSecretArb), ({ secret, text }) => {
        // No secrets handed in → relies purely on the defensive shape patterns.
        const out = redact(text)
        expect(out.includes(secret)).toBe(false)
        expect(out).toContain(MASK)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('honors the mask-collision guard: a secret that is a substring of the mask still does not survive', () => {
    // Degenerate "secrets" drawn from inside the literal mask (e.g. RED, ED, [,
    // ]) force the alternate-mask fallback. Even these must not reappear in the
    // output when surrounded by plain (mask-free) text.
    const maskSubstringArb = fc
      .integer({ min: 0, max: MASK.length - 1 })
      .chain((start) =>
        fc.integer({ min: start + 1, max: MASK.length }).map((end) => MASK.slice(start, end)),
      )
      .filter((s) => s.trim().length > 0)
    // Surrounding text deliberately free of '[' and ']' so the only source of
    // the secret would be an unsafe mask — which the guard prevents.
    const plainTextArb = fc.string({ unit: fc.constantFrom(...'abcXYZ012 _-.:/'.split('')) })
    fc.assert(
      fc.property(maskSubstringArb, plainTextArb, plainTextArb, (secret, pre, post) => {
        const text = `${pre}${secret}${post}${secret}`
        const out = redact(text, [secret])
        expect(out.includes(secret)).toBe(false)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('is TOTAL: never throws and always returns a string for any input type', () => {
    fc.assert(
      fc.property(anyInputArb, (input) => {
        const out = redact(input as unknown)
        expect(typeof out).toBe('string')
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('is TOTAL even with arbitrary (incl. nullish/blank) secret lists', () => {
    const secretEntryArb = fc.oneof(
      fc.string(),
      fc.constant(null),
      fc.constant(undefined),
      fc.constantFrom('', '   ', '\t', '\n'),
    )
    fc.assert(
      fc.property(anyInputArb, fc.array(secretEntryArb), (input, secrets) => {
        const out = redact(input as unknown, secrets as Array<string | null | undefined>)
        expect(typeof out).toBe('string')
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('passes input through unchanged when only blank/whitespace secrets are supplied', () => {
    // Mirrors the production contract: blank/whitespace-only secrets are ignored,
    // so for input text containing no shape-secrets the output equals the input.
    const blankSecretArb = fc.array(
      fc.oneof(fc.constant(null), fc.constant(undefined), fc.constantFrom('', ' ', '   ', '\t', '\n', '  \t ')),
      { minLength: 1, maxLength: 5 },
    )
    // Plain text with no characters that could form a shape-secret prefix run.
    const plainTextArb = fc.string({ unit: fc.constantFrom(...'abcXYZ012 .,:/!?'.split('')) })
    fc.assert(
      fc.property(plainTextArb, blankSecretArb, (text, secrets) => {
        const out = redact(text, secrets as Array<string | null | undefined>)
        expect(out).toBe(text)
      }),
      { numRuns: NUM_RUNS },
    )
  })
})
