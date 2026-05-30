import { describe, it, expect } from 'vitest'
import { slugify, wordCount, timeAgo } from './utils'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Product Strategy V2')).toBe('product-strategy-v2')
  })
  it('strips punctuation', () => {
    expect(slugify('What did we decide?!')).toBe('what-did-we-decide')
  })
  it('collapses repeated spaces and dashes', () => {
    expect(slugify('a   b---c')).toBe('a-b-c')
  })
  it('caps length at 80 chars', () => {
    expect(slugify('x'.repeat(200)).length).toBeLessThanOrEqual(80)
  })
})

describe('wordCount', () => {
  it('counts words separated by whitespace', () => {
    expect(wordCount('the quick brown fox')).toBe(4)
  })
  it('handles empty / whitespace-only', () => {
    expect(wordCount('   ')).toBe(0)
  })
})

describe('timeAgo', () => {
  it('returns "just now" for very recent times', () => {
    expect(timeAgo(new Date())).toBe('just now')
  })
  it('formats minutes', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 60_000))).toBe('5m ago')
  })
  it('formats hours', () => {
    expect(timeAgo(new Date(Date.now() - 3 * 3_600_000))).toBe('3h ago')
  })
  it('formats days', () => {
    expect(timeAgo(new Date(Date.now() - 2 * 86_400_000))).toBe('2d ago')
  })
})
