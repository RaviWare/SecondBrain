'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, BookOpen, ArrowRight, Plus } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

type WikiPage = {
  _id?: string
  slug: string
  title: string
  type: string
  summary?: string
  excerpt?: string
  confidence?: string
  tags?: string[]
  updatedAt: string | Date
}

const TYPES = ['all', 'source-summary', 'concept', 'entity', 'synthesis', 'pattern', 'query-answer']

// Accent / silver only — no rainbow.
const TYPE_TONE: Record<string, 'accent' | 'silver'> = {
  'source-summary': 'silver',
  concept:          'accent',
  entity:           'silver',
  synthesis:        'accent',
  pattern:          'silver',
  'query-answer':   'silver',
}

function toneStyle(tone: 'accent' | 'silver') {
  return tone === 'accent'
    ? {
        color: 'var(--accent-bright)',
        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
        borderColor: 'color-mix(in srgb, var(--accent) 28%, transparent)',
      }
    : {
        color: '#c8c8cf',
        background: 'color-mix(in srgb, #ffffff 4%, transparent)',
        borderColor: 'var(--border)',
      }
}

export default function WikiIndexPage() {
  const [pages, setPages] = useState<WikiPage[]>([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Avoid a synchronous setState in the effect body (eslint react-hooks/set-state-in-effect).
    // Defer to microtask so React can batch with the fetch start.
    queueMicrotask(() => { if (!cancelled) setLoading(true) })
    const params = new URLSearchParams()
    if (type !== 'all') params.set('type', type)
    if (search.trim()) params.set('search', search.trim())

    fetch(`/api/pages?${params}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setPages(d.pages || [])
      })
      .catch(() => { if (!cancelled) setPages([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [type, search])

  return (
    <div className="p-8 max-w-6xl mx-auto text-[var(--text-primary)]">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="mono text-[10px] text-[var(--text-muted)] tracking-widest mb-2">
            WIKI INDEX · KNOWLEDGE BASE
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Wiki</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">
            All knowledge pages in your second brain
          </p>
        </div>
        <Link
          href="/app/ingest"
          className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg mono tracking-widest"
          style={{
            background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
            color: '#0b0b0d',
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          ADD SOURCE
        </Link>
      </div>

      {/* Search + Filter */}
      <div
        className="rounded-xl p-4 mb-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-bright)' }}
      >
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search knowledge base..."
              className="w-full rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div
            className="flex gap-1 p-1 rounded-lg"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            {TYPES.slice(0, 5).map(t => {
              const active = type === t
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className="mono text-[9px] px-2.5 py-1.5 rounded tracking-wider font-medium transition-all"
                  style={
                    active
                      ? {
                          background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                          color: '#0b0b0d',
                        }
                      : { color: 'var(--text-muted)', background: 'transparent' }
                  }
                >
                  {t === 'all' ? 'ALL' : t.replace('-', ' ').toUpperCase().slice(0, 7)}
                </button>
              )
            })}
          </div>
        </div>
        {pages.length > 0 && (
          <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest mt-3">
            {pages.length} PAGE{pages.length !== 1 ? 'S' : ''}
            {type !== 'all' ? ` · TYPE: ${type.toUpperCase()}` : ''}
            {search ? ` · QUERY: "${search}"` : ''}
          </p>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[...Array(9)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-5 animate-pulse"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="h-2 rounded w-1/4 mb-4" style={{ background: 'var(--surface-2)' }} />
              <div className="h-4 rounded w-3/4 mb-3" style={{ background: 'var(--surface-2)' }} />
              <div className="h-3 rounded w-full mb-2" style={{ background: 'var(--surface-2)' }} />
              <div className="h-3 rounded w-2/3" style={{ background: 'var(--surface-2)' }} />
            </div>
          ))}
        </div>
      ) : pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-bright)' }}
          >
            <BookOpen className="w-7 h-7 text-[var(--text-muted)]" />
          </div>
          <p className="mono text-[10px] text-[var(--text-muted)] tracking-widest mb-2">NO PAGES FOUND</p>
          <p className="text-[var(--text-secondary)] text-sm mb-6">
            {search || type !== 'all' ? 'No pages match your search.' : 'Your wiki is empty.'}
          </p>
          {!search && type === 'all' && (
            <Link
              href="/app/ingest"
              className="flex items-center gap-2 text-xs font-semibold px-5 py-2.5 rounded-lg mono tracking-widest"
              style={{
                background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                color: '#0b0b0d',
              }}
            >
              INGEST YOUR FIRST SOURCE
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {pages.map(p => {
            const tone = TYPE_TONE[p.type] ?? 'silver'
            return (
              <Link
                key={p.slug}
                href={`/app/wiki/${p.slug}`}
                className="rounded-xl p-5 group relative overflow-hidden transition-colors"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-bright)',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="mono text-[9px] px-2 py-0.5 rounded border font-medium tracking-wider"
                    style={toneStyle(tone)}
                  >
                    {p.type?.toUpperCase().slice(0, 10)}
                  </span>
                  {p.confidence && (
                    <span
                      className="mono text-[9px]"
                      style={{
                        color:
                          p.confidence === 'high'
                            ? 'var(--accent-bright)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {p.confidence.toUpperCase()}
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2 leading-snug line-clamp-2">
                  {p.title}
                </h3>

                {p.summary && (
                  <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed mb-3">
                    {p.summary}
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  {p.tags?.slice(0, 2).map((t: string) => (
                    <span
                      key={t}
                      className="mono text-[9px] px-1.5 py-0.5 rounded tracking-wider"
                      style={{
                        color: 'var(--text-muted)',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      #{t}
                    </span>
                  ))}
                  <span className="mono text-[9px] text-[var(--text-muted)] ml-auto">
                    {timeAgo(p.updatedAt)}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
