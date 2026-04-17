'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import { Search, BookOpen, ArrowRight, Plus } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'

const TYPES = ['all', 'source-summary', 'concept', 'entity', 'synthesis', 'pattern', 'query-answer']

const TYPE_CONFIG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  'source-summary': { color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',   dot: 'bg-blue-400' },
  concept:          { color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20', dot: 'bg-violet-400' },
  entity:           { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20',dot: 'bg-emerald-400' },
  synthesis:        { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',  dot: 'bg-amber-400' },
  pattern:          { color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',   dot: 'bg-rose-400' },
  'query-answer':   { color: 'text-zinc-400',    bg: 'bg-zinc-500/10',    border: 'border-zinc-500/20',   dot: 'bg-zinc-400' },
}

export default function WikiIndexPage() {
  const [pages, setPages] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [loading, setLoading] = useState(true)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (type !== 'all') params.set('type', type)
    if (search.trim()) params.set('search', search.trim())

    fetch(`/api/pages?${params}`)
      .then(r => r.json())
      .then(d => {
        setPages(d.pages || [])
        setLoading(false)
      })
  }, [type, search])

  useEffect(() => {
    if (!loading && gridRef.current) {
      gsap.from(gridRef.current.children, {
        opacity: 0, y: 16, duration: 0.4, stagger: 0.05, ease: 'power2.out'
      })
    }
  }, [loading, pages])

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 fade-up">
        <div>
          <p className="mono text-[10px] text-white/25 tracking-widest mb-2">WIKI INDEX · KNOWLEDGE BASE</p>
          <h1 className="text-2xl font-black text-white/90">Wiki</h1>
          <p className="text-white/30 text-sm mt-1">All knowledge pages in your second brain</p>
        </div>
        <Link href="/app/ingest"
          className="btn-primary flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg">
          <Plus className="w-3.5 h-3.5" />
          Add Source
        </Link>
      </div>

      {/* Search + Filter */}
      <div className="glass border border-white/5 rounded-xl p-4 mb-6 fade-up">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search knowledge base..."
              className="w-full bg-black/30 border border-white/8 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white/80 placeholder-white/15 focus:outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>
          <div className="flex gap-1 p-1 bg-black/30 border border-white/8 rounded-lg">
            {TYPES.slice(0, 5).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  'mono text-[9px] px-2.5 py-1.5 rounded tracking-wider font-medium transition-all',
                  type === t
                    ? 'bg-violet-600/70 text-white border border-violet-500/30'
                    : 'text-white/25 hover:text-white/50'
                )}
              >
                {t === 'all' ? 'ALL' : t.replace('-', ' ').toUpperCase().slice(0, 7)}
              </button>
            ))}
          </div>
        </div>
        {pages.length > 0 && (
          <p className="mono text-[9px] text-white/20 tracking-widest mt-3">
            {pages.length} PAGE{pages.length !== 1 ? 'S' : ''} {type !== 'all' ? `· TYPE: ${type.toUpperCase()}` : ''} {search ? `· QUERY: "${search}"` : ''}
          </p>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="glass border border-white/5 rounded-xl p-5 animate-pulse">
              <div className="h-2 bg-white/5 rounded w-1/4 mb-4" />
              <div className="h-4 bg-white/5 rounded w-3/4 mb-3" />
              <div className="h-3 bg-white/5 rounded w-full mb-2" />
              <div className="h-3 bg-white/5 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="w-16 h-16 rounded-2xl glass border border-white/5 flex items-center justify-center mb-6">
            <BookOpen className="w-7 h-7 text-white/15" />
          </div>
          <p className="mono text-[10px] text-white/25 tracking-widest mb-2">NO PAGES FOUND</p>
          <p className="text-white/30 text-sm mb-6">
            {search || type !== 'all' ? 'No pages match your search.' : 'Your wiki is empty.'}
          </p>
          {!search && type === 'all' && (
            <Link href="/app/ingest"
              className="btn-primary flex items-center gap-2 text-xs font-semibold px-5 py-2.5 rounded-lg">
              Ingest your first source
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      ) : (
        <div ref={gridRef} className="grid grid-cols-3 gap-3">
          {pages.map(p => {
            const cfg = TYPE_CONFIG[p.type] || TYPE_CONFIG['query-answer']
            return (
              <Link
                key={p.slug}
                href={`/app/wiki/${p.slug}`}
                className="glass border border-white/5 hover:border-white/10 rounded-xl p-5 card-hover group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                <div className={cn('absolute top-0 left-0 w-0.5 h-full rounded-r opacity-0 group-hover:opacity-100 transition-opacity', cfg.dot)} />

                <div className="flex items-center gap-2 mb-3">
                  <span className={cn('mono text-[9px] px-2 py-0.5 rounded border font-medium tracking-wider', cfg.color, cfg.bg, cfg.border)}>
                    {p.type?.toUpperCase().slice(0, 10)}
                  </span>
                  {p.confidence && (
                    <span className={cn('mono text-[9px]',
                      p.confidence === 'high' ? 'text-emerald-400/60' :
                      p.confidence === 'low'  ? 'text-rose-400/60' : 'text-white/20')}>
                      {p.confidence.toUpperCase()}
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-white/70 group-hover:text-white/90 mb-2 leading-snug transition-colors line-clamp-2">
                  {p.title}
                </h3>

                {p.summary && (
                  <p className="text-[11px] text-white/30 line-clamp-2 leading-relaxed mb-3">{p.summary}</p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  {p.tags?.slice(0, 2).map((t: string) => (
                    <span key={t} className="mono text-[9px] text-white/20 bg-white/3 border border-white/5 px-1.5 py-0.5 rounded tracking-wider">
                      #{t}
                    </span>
                  ))}
                  <span className="mono text-[9px] text-white/15 ml-auto">{timeAgo(p.updatedAt)}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
