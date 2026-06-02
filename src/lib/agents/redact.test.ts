// Unit tests for the secret-redaction log helper (task 2.6).
//
// Validates: Requirements 11.4, 11.5 (and the invariant behind design.md
// Property 20 — "Secrets are never present in emitted log output"). The
// dedicated property-based test for Property 20 is task 2.13; these are the
// example/edge-case unit tests that pin the concrete behavior.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { redact, agentLog } from './redact'

const MASK = '[REDACTED]'
const BRAIN_TOKEN = 'sb_AbCdEf0123456789AbCdEf0123456789AbCdEf01234'
const BYO_KEY = 'sk-ant-api03-ABCdef0123456789ABCdef0123456789'

describe('redact — exact secret values', () => {
  it('scrubs a brain token passed as a secret', () => {
    const out = redact(`token=${BRAIN_TOKEN} done`, [BRAIN_TOKEN])
    expect(out).not.toContain(BRAIN_TOKEN)
    expect(out).toContain(MASK)
  })

  it('scrubs a BYO LLM key passed as a secret', () => {
    const out = redact(`Authorization: Bearer ${BYO_KEY}`, [BYO_KEY])
    expect(out).not.toContain(BYO_KEY)
  })

  it('redacts ALL occurrences (global), including mid-string', () => {
    const input = `a${BRAIN_TOKEN}b ${BRAIN_TOKEN} c-${BRAIN_TOKEN}-d`
    const out = redact(input, [BRAIN_TOKEN])
    expect(out).not.toContain(BRAIN_TOKEN)
  })

  it('scrubs multiple distinct secrets in one pass', () => {
    const out = redact(`${BRAIN_TOKEN} and ${BYO_KEY}`, [BRAIN_TOKEN, BYO_KEY])
    expect(out).not.toContain(BRAIN_TOKEN)
    expect(out).not.toContain(BYO_KEY)
  })

  it('ignores nullish/blank entries in the secret set', () => {
    const out = redact('nothing secret here', [null, undefined, '   ', ''])
    expect(out).toBe('nothing secret here')
  })
})

describe('redact — defensive shape patterns (value not passed in)', () => {
  it('scrubs an sb_ brain token by shape', () => {
    const out = redact(`leaked ${BRAIN_TOKEN}`)
    expect(out).not.toContain(BRAIN_TOKEN)
    expect(out).toContain(MASK)
  })

  it('scrubs an sk- API key by shape', () => {
    const out = redact(`leaked ${BYO_KEY}`)
    expect(out).not.toContain(BYO_KEY)
  })

  it('scrubs a Google AIza key by shape', () => {
    const key = 'AIzaSyD-ABCdef0123456789ABCdef0123456789x'
    const out = redact(`google ${key}`)
    expect(out).not.toContain(key)
  })

  it('does not over-redact ordinary short text resembling a prefix', () => {
    expect(redact('use sk- prefix and sb_ ids')).toBe('use sk- prefix and sb_ ids')
  })
})

describe('redact — total function (never throws on odd input)', () => {
  it('handles empty string', () => {
    expect(redact('')).toBe('')
  })

  it('handles null and undefined', () => {
    expect(redact(null)).toBe('')
    expect(redact(undefined)).toBe('')
  })

  it('stringifies objects and scrubs secrets inside them', () => {
    const out = redact({ header: `Bearer ${BRAIN_TOKEN}`, n: 1 }, [BRAIN_TOKEN])
    expect(out).not.toContain(BRAIN_TOKEN)
    expect(out).toContain('header')
  })

  it('scrubs secrets embedded in an Error message and stack', () => {
    const err = new Error(`request failed with key ${BYO_KEY}`)
    const out = redact(err, [BYO_KEY])
    expect(out).not.toContain(BYO_KEY)
  })

  it('handles circular objects without throwing', () => {
    const obj: Record<string, unknown> = { token: BRAIN_TOKEN }
    obj.self = obj
    const out = redact(obj, [BRAIN_TOKEN])
    expect(out).not.toContain(BRAIN_TOKEN)
    expect(out).toContain('[Circular]')
  })

  it('handles numbers, booleans, and bigints', () => {
    expect(redact(42)).toBe('42')
    expect(redact(true)).toBe('true')
    expect(redact(10n)).toBe('10')
  })

  it('never reintroduces the secret through the mask itself', () => {
    // A degenerate "secret" that is a substring of the default mask forces the
    // alternate mask; the result must still not contain the secret.
    const out = redact('value RED here', ['RED'])
    expect(out).not.toContain('RED')
  })
})

describe('agentLog — routes every argument through redact', () => {
  afterEach(() => vi.restoreAllMocks())

  it('scrubs secrets from console.error output', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    agentLog.error('[agents/run] failed', new Error(`boom ${BRAIN_TOKEN}`), [BRAIN_TOKEN])
    const logged = spy.mock.calls.flat().join(' ')
    expect(logged).not.toContain(BRAIN_TOKEN)
  })

  it('scrubs leaked-by-shape secrets even without the value passed', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    agentLog.warn('[agents] suspicious', `saw ${BYO_KEY}`)
    const logged = spy.mock.calls.flat().join(' ')
    expect(logged).not.toContain(BYO_KEY)
  })
})
