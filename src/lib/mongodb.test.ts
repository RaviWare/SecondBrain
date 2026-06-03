// Unit tests for normalizeMongoUri — the defensive cleaner that fixes the most
// common production misconfig: MONGODB_URI pasted with wrapping quotes or stray
// whitespace, which made mongoose throw "Invalid scheme … mongodb://" on every
// DB call. Pure function, no I/O.

import { describe, it, expect } from 'vitest'
import { normalizeMongoUri } from './mongodb'

const VALID = 'mongodb+srv://user:pass@cluster.abc.mongodb.net/secondbrain'
const VALID_PLAIN = 'mongodb://localhost:27017/secondbrain'

describe('normalizeMongoUri', () => {
  it('passes a clean srv URI through unchanged', () => {
    expect(normalizeMongoUri(VALID)).toBe(VALID)
  })

  it('passes a clean mongodb:// URI through unchanged', () => {
    expect(normalizeMongoUri(VALID_PLAIN)).toBe(VALID_PLAIN)
  })

  it('strips surrounding double quotes (the #1 Coolify/Vercel paste mistake)', () => {
    expect(normalizeMongoUri(`"${VALID}"`)).toBe(VALID)
  })

  it('strips surrounding single quotes', () => {
    expect(normalizeMongoUri(`'${VALID}'`)).toBe(VALID)
  })

  it('strips leading/trailing whitespace and newlines', () => {
    expect(normalizeMongoUri(`  ${VALID}\n`)).toBe(VALID)
    expect(normalizeMongoUri(`\t${VALID}  `)).toBe(VALID)
  })

  it('strips quotes AND whitespace together', () => {
    expect(normalizeMongoUri(`  "${VALID}"\n`)).toBe(VALID)
  })

  it('returns undefined for missing / blank values', () => {
    expect(normalizeMongoUri(undefined)).toBeUndefined()
    expect(normalizeMongoUri('')).toBeUndefined()
    expect(normalizeMongoUri('   ')).toBeUndefined()
    expect(normalizeMongoUri('""')).toBeUndefined()
    expect(normalizeMongoUri('  ""  ')).toBeUndefined()
  })

  it('throws a CLEAR error (not mongoose cryptic) for a genuinely wrong scheme', () => {
    expect(() => normalizeMongoUri('https://cluster.mongodb.net')).toThrow(/invalid scheme/i)
    expect(() => normalizeMongoUri('postgres://x')).toThrow(/mongodb\+srv/)
  })

  it('does not leak the secret in the error (only a short prefix)', () => {
    const secret = 'XXXXuser:supersecretpassword@cluster.net'
    try {
      normalizeMongoUri(secret)
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).not.toContain('supersecretpassword')
    }
  })

  it('only strips ONE pair of quotes (a real key never has wrapping quotes anyway)', () => {
    // An inner unmatched quote stays — and since it no longer starts with a valid
    // scheme, it throws clearly rather than silently mangling.
    expect(() => normalizeMongoUri('"\'mongodb://x\'"')).toThrow(/invalid scheme/i)
  })
})
