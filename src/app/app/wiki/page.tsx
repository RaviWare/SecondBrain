'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, BookOpen, Filter } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'

const TYPES = ['all', 'source-summary', 'concept', 'entity', 'synthesis', 'pattern', 'query-answer']

const TYPE_COLORS: Record<string, string> = {
  'source-summary': 'bg-blue-500/20 text-blue-300',
  concept:          'bg-violet-500/20 text-violet-300',
  entity:           'bg-emerald-500/20 text-emerald-300',
  synthesis:        'bg-amber-500/20 text-amber-300',
  pattern:          'bg-rose-500/20 text-rose-300',
  'query-answer':   'bg-zinc-500/20 text-zinc-300',
}

export default function WikiIndexPage() {
  const [pages, setPages] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (type !== 'all') params.set('type', type)
    if (search.trim()) params.set('search', search.trim())

    fetch(`/api/pages?${params}`)
      .then(r => r.json())
      .then(d => { setPages(d.pages || []); setLoading(false) })
  }, [type, search])

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Wiki</h1>
        <p className="text-zinc-500 text-sm mt-1">All knowledge pages in your second brain</p>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search pages..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2">
          <Filter className="w-3.5 h-3.5 text-zinc-500 ml-1" />
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="bg-transparent text-sm text-zinc-300 py-2 pl-1 pr-3 focus:outline-none cursor-pointer"
          >
            {TYPES.map(t => <option key={t} value={t} className="bg-zinc-900">{t === 'all' ? 'All types' : t}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-pulse">
              <div className="h-3 bg-zinc-800 rounded w-1/4 mb-3" />
              <div className="h-4 bg-zinc-800 rounded w-3/4 mb-2" />
              <div className="h-3 bg-zinc-800 rounded w-full" />
            </div>
          ))}
        </div>
      ) : pages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BookOpen className="w-10 h-10 text-zinc-700 mb-4" />
          <p className="text-zinc-500 text-sm">
            {search || type !== 'all' ? 'No pages match your search.' : 'Your wiki is empty. Ingest a source to get started.'}
          </p>
          {!search && type === 'all' && (
            <Link href="/app/ingest" className="mt-4 text-sm text-violet-400 hover:text-violet-300">
              Ingest your first source →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {pages.map(p => (
            <Link
              key={p.slug}
              href={`/app/wiki/${p.slug}`}
              className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 transition-all group"
            >
              <div className="flex items-center gap-2 mb-2.5">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TYPE_COLORS[p.type] || 'bg-zinc-700 text-zinc-300')}>
                  {p.type}
                </span>
                {p.confidence && (
                  <span className={cn('text-xs', p.confidence === 'high' ? 'text-emerald-500' : p.confidence === 'low' ? 'text-rose-500' : 'text-zinc-500')}>
                    {p.confidence} confidence
                  </span>
                )}
              </div>
              <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white mb-1.5 leading-snug">{p.title}</h3>
              {p.summary && <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">{p.summary}</p>}
              <div className="flex items-center gap-2 mt-3">
                {p.tags?.slice(0, 3).map((t: string) => (
                  <span key={t} className="text-xs text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">#{t}</span>
                ))}
                <span className="text-xs text-zinc-700 ml-auto">{timeAgo(p.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
