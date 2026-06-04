import { describe, it, expect } from 'vitest'
import {
  mintLinkCode,
  extractLinkCode,
  isCodeValid,
  telegramDeepLink,
  LINK_CODE_TTL_MS,
} from './link-code'

describe('mintLinkCode', () => {
  it('produces an sb- prefixed code with a future expiry', () => {
    const now = 1_000_000
    const { code, expiresAt } = mintLinkCode(now)
    expect(code.startsWith('sb-')).toBe(true)
    expect(code.length).toBeGreaterThanOrEqual(9)
    expect(expiresAt).toBe(now + LINK_CODE_TTL_MS)
  })

  it('produces distinct codes (entropy)', () => {
    const a = mintLinkCode().code
    const b = mintLinkCode().code
    expect(a).not.toBe(b)
  })
})

describe('extractLinkCode', () => {
  it('extracts a bare code', () => {
    expect(extractLinkCode('sb-abc123')).toBe('sb-abc123')
  })
  it('extracts from a /start deep-link payload', () => {
    expect(extractLinkCode('/start sb-Xy12Z9')).toBe('sb-xy12z9')
  })
  it('extracts from surrounding text and lowercases', () => {
    expect(extractLinkCode('here is my code SB-ABC999 thanks')).toBe('sb-abc999')
  })
  it('returns null when no code present', () => {
    expect(extractLinkCode('hello there')).toBeNull()
    expect(extractLinkCode('')).toBeNull()
    expect(extractLinkCode(null)).toBeNull()
    expect(extractLinkCode(undefined)).toBeNull()
  })
})

describe('isCodeValid', () => {
  const now = 1_000_000
  it('valid when matching and unexpired', () => {
    expect(isCodeValid('sb-abc123', 'sb-abc123', now + 1000, now)).toBe(true)
  })
  it('case-insensitive match', () => {
    expect(isCodeValid('SB-ABC123', 'sb-abc123', now + 1000, now)).toBe(true)
  })
  it('invalid when expired', () => {
    expect(isCodeValid('sb-abc123', 'sb-abc123', now - 1, now)).toBe(false)
  })
  it('invalid when mismatched', () => {
    expect(isCodeValid('sb-abc123', 'sb-zzz999', now + 1000, now)).toBe(false)
  })
  it('invalid when either side is empty', () => {
    expect(isCodeValid('', 'sb-abc123', now + 1000, now)).toBe(false)
    expect(isCodeValid('sb-abc123', null, now + 1000, now)).toBe(false)
    expect(isCodeValid('sb-abc123', 'sb-abc123', null, now)).toBe(false)
  })
  it('accepts a Date expiry', () => {
    expect(isCodeValid('sb-abc123', 'sb-abc123', new Date(now + 1000), now)).toBe(true)
  })
})

describe('telegramDeepLink', () => {
  it('builds a t.me start link, stripping a leading @', () => {
    expect(telegramDeepLink('@MyBot', 'sb-abc123')).toBe('https://t.me/MyBot?start=sb-abc123')
    expect(telegramDeepLink('MyBot', 'sb-abc123')).toBe('https://t.me/MyBot?start=sb-abc123')
  })
  it('returns null without a bot username', () => {
    expect(telegramDeepLink(null, 'sb-abc123')).toBeNull()
    expect(telegramDeepLink('', 'sb-abc123')).toBeNull()
  })
})
