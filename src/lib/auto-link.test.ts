import { describe, it, expect } from 'vitest'
import { extractWikiLinks } from './auto-link'

describe('extractWikiLinks (self-wiring graph)', () => {
  it('extracts simple [[slug]] refs', () => {
    expect(extractWikiLinks('Links to [[gtm-plan]] here.')).toEqual(['gtm-plan'])
  })

  it('normalizes titles to slugs', () => {
    expect(extractWikiLinks('See [[Product Strategy]].')).toEqual(['product-strategy'])
  })

  it('supports [[slug|alias]] piped syntax, keeping the slug', () => {
    expect(extractWikiLinks('Read [[gtm-plan|the GTM doc]].')).toEqual(['gtm-plan'])
  })

  it('dedupes repeated references', () => {
    expect(extractWikiLinks('[[a]] and [[a]] and [[a]]')).toEqual(['a'])
  })

  it('extracts multiple distinct refs in document order', () => {
    const md = '## Current Understanding\n[[pricing]] feeds [[gtm-plan]] and [[customer-insights]].'
    expect(extractWikiLinks(md)).toEqual(['pricing', 'gtm-plan', 'customer-insights'])
  })

  it('skips empty [[]] links', () => {
    expect(extractWikiLinks('text [[]] more')).toEqual([])
  })

  it('returns [] when there are no links', () => {
    expect(extractWikiLinks('Just plain prose with no links.')).toEqual([])
  })
})
