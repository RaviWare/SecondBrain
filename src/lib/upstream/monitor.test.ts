import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { diffUpstream, EMPTY_MARKER, type UpstreamState, type SeenMarker } from './monitor'

function state(partial: Partial<UpstreamState> = {}): UpstreamState {
  return {
    releaseTag: null,
    releaseName: null,
    releasePublishedAt: null,
    releaseUrl: null,
    commitSha: null,
    commitDate: null,
    commitSummary: null,
    ...partial,
  }
}

describe('diffUpstream — first run baseline', () => {
  it('adopts a baseline silently on the first ever run (no alert)', () => {
    const d = diffUpstream(EMPTY_MARKER, state({ releaseTag: 'v1.0.0', commitSha: 'abc1234' }))
    expect(d.changed).toBe(false)
    expect(d.nextMarker).toEqual({ releaseTag: 'v1.0.0', commitSha: 'abc1234' })
  })

  it('respects an explicit isFirstRun flag even when a marker exists', () => {
    const seen: SeenMarker = { releaseTag: 'v1.0.0', commitSha: 'abc1234' }
    const d = diffUpstream(seen, state({ releaseTag: 'v2.0.0', commitSha: 'def5678' }), { isFirstRun: true })
    expect(d.changed).toBe(false)
    expect(d.nextMarker).toEqual({ releaseTag: 'v2.0.0', commitSha: 'def5678' })
  })
})

describe('diffUpstream — change detection', () => {
  const baseline: SeenMarker = { releaseTag: 'v1.0.0', commitSha: 'abc1234' }

  it('detects a new release', () => {
    const d = diffUpstream(baseline, state({ releaseTag: 'v2.0.0', commitSha: 'abc1234' }))
    expect(d.changed).toBe(true)
    expect(d.kinds).toEqual(['release'])
    expect(d.title).toContain('v2.0.0')
  })

  it('detects a new commit', () => {
    const d = diffUpstream(baseline, state({ releaseTag: 'v1.0.0', commitSha: 'zzz9999', commitSummary: 'fix things' }))
    expect(d.changed).toBe(true)
    expect(d.kinds).toEqual(['commit'])
    expect(d.title).toContain('zzz9999'.slice(0, 7))
  })

  it('detects both at once', () => {
    const d = diffUpstream(baseline, state({ releaseTag: 'v3.0.0', commitSha: 'new0000' }))
    expect(d.changed).toBe(true)
    expect(d.kinds).toEqual(['release', 'commit'])
  })

  it('reports no change when nothing advanced', () => {
    const d = diffUpstream(baseline, state({ releaseTag: 'v1.0.0', commitSha: 'abc1234' }))
    expect(d.changed).toBe(false)
    expect(d.kinds).toEqual([])
  })

  it('treats whitespace-only/empty values as null (no false positive)', () => {
    const d = diffUpstream(baseline, state({ releaseTag: '   ', commitSha: '' }))
    expect(d.changed).toBe(false)
    // marker keeps the previous non-null values
    expect(d.nextMarker).toEqual(baseline)
  })
})

describe('diffUpstream — properties', () => {
  const tag = fc.option(fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0), { nil: null })
  const hex = (min: number, max: number) =>
    fc.string({ unit: fc.constantFrom(...'0123456789abcdef'.split('')), minLength: min, maxLength: max })
  const sha = fc.option(hex(7, 40), { nil: null })

  it('is idempotent: re-diffing against the produced marker never re-alerts', () => {
    fc.assert(
      fc.property(tag, sha, tag, sha, (st, ss, nt, ns) => {
        const seen: SeenMarker = { releaseTag: st, commitSha: ss }
        const fresh = state({ releaseTag: nt, commitSha: ns })
        const first = diffUpstream(seen, fresh)
        // Feeding the produced marker back with the SAME fresh state must be stable.
        const second = diffUpstream(first.nextMarker, fresh)
        expect(second.changed).toBe(false)
      }),
    )
  })

  it('never alerts on the first run regardless of input', () => {
    fc.assert(
      fc.property(tag, sha, (nt, ns) => {
        const d = diffUpstream(EMPTY_MARKER, state({ releaseTag: nt, commitSha: ns }))
        expect(d.changed).toBe(false)
      }),
    )
  })

  it('nextMarker never regresses a known value to null', () => {
    fc.assert(
      fc.property(tag, sha, tag, sha, (st, ss, nt, ns) => {
        const seen: SeenMarker = { releaseTag: st, commitSha: ss }
        const d = diffUpstream(seen, state({ releaseTag: nt, commitSha: ns }))
        if (st !== null) expect(d.nextMarker.releaseTag).not.toBeNull()
        if (ss !== null) expect(d.nextMarker.commitSha).not.toBeNull()
      }),
    )
  })

  it('changed is true iff at least one non-null field advanced (post-baseline)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim().length > 0),
        hex(7, 12),
        fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim().length > 0),
        hex(7, 12),
        (st, ss, nt, ns) => {
          const seen: SeenMarker = { releaseTag: st, commitSha: ss }
          const d = diffUpstream(seen, state({ releaseTag: nt, commitSha: ns }))
          const expected = nt !== st || ns !== ss
          expect(d.changed).toBe(expected)
        },
      ),
    )
  })
})
