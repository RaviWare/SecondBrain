'use client'

import { useEffect, useState, use, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { gsap } from 'gsap'
import { ArrowLeft, Edit3, Save, X, ExternalLink, Tag, Clock, Link2, Network } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'

const TYPE_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  'source-summary': { color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
  concept:          { color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20' },
  entity:           { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  synthesis:        { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  pattern:          { color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20' },
  'query-answer':   { color: 'text-zinc-400',    bg: 'bg-zinc-500/10',    border: 'border-zinc-500/20' },
}

function renderContent(content: string) {
  const stripped = content.replace(/^---[\s\S]*?---\n?/, '')
  const withLinks = stripped.replace(/\[\[([^\]]+)\]\]/g, (_, slug) =>
    `<a href="/app/wiki/${slug}" class="wiki-link">[[${slug}]]</a>`
  )
  return withLinks
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[huplb])(.+)$/gm, '$1')
    .replace(/(<\/li>\s*)+/g, '</li>')
}

export default function WikiPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    fetch(`/api/pages/${slug}`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        setEditContent(d.page?.content || '')
        setLoading(false)
      })
  }, [slug])

  useEffect(() => {
    if (!loading && contentRef.current) {
      gsap.from(contentRef.current, { opacity: 0, y: 20, duration: 0.5, ease: 'power2.out' })
    }
    if (!loading && sidebarRef.current) {
      gsap.from(sidebarRef.current, { opacity: 0, x: 16, duration: 0.5, delay: 0.15, ease: 'power2.out' })
    }
  }, [loading])

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/pages/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editContent }),
    })
    setSaving(false)
    setEditing(false)
    setData((prev: any) => ({ ...prev, page: { ...prev.page, content: editContent } }))
  }

  if (loading) return (
    <div className="flex gap-0 min-h-screen">
      <div className="flex-1 p-8 max-w-3xl animate-pulse">
        <div className="h-3 bg-white/5 rounded w-24 mb-8" />
        <div className="h-6 bg-white/5 rounded w-1/3 mb-4" />
        <div className="h-8 bg-white/5 rounded w-2/3 mb-8" />
        <div className="space-y-3">
          {[...Array(10)].map((_, i) => <div key={i} className={`h-3 bg-white/5 rounded ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />)}
        </div>
      </div>
    </div>
  )

  if (!data?.page) return (
    <div className="p-8 text-center">
      <p className="mono text-xs text-white/30 tracking-widest mb-4">PAGE NOT FOUND</p>
      <Link href="/app/wiki" className="mono text-xs text-violet-400 hover:text-violet-300 tracking-wider">← BACK TO WIKI</Link>
    </div>
  )

  const { page, backlinks = [] } = data
  const cfg = TYPE_CONFIG[page.type] || TYPE_CONFIG['query-answer']

  return (
    <div className="flex min-h-screen">
      {/* Main content */}
      <div ref={contentRef} className="flex-1 p-8 max-w-3xl min-w-0">
        {/* Nav bar */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 mono text-[10px] text-white/25 hover:text-white/50 tracking-widest transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            BACK
          </button>
          {editing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1.5 mono text-[10px] text-white/25 hover:text-white/50 tracking-wider px-3 py-1.5 rounded-lg glass border border-white/5 transition-all"
              >
                <X className="w-3 h-3" /> CANCEL
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 mono text-[10px] btn-primary px-3 py-1.5 rounded-lg tracking-wider"
              >
                <Save className="w-3 h-3" />
                {saving ? 'SAVING...' : 'SAVE'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 mono text-[10px] text-white/25 hover:text-white/50 tracking-wider px-3 py-1.5 rounded-lg glass border border-white/5 hover:border-white/10 transition-all"
            >
              <Edit3 className="w-3 h-3" /> EDIT
            </button>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className={cn('mono text-[9px] px-2.5 py-1 rounded border font-medium tracking-wider', cfg.color, cfg.bg, cfg.border)}>
            {page.type?.toUpperCase()}
          </span>
          {page.confidence && (
            <span className={cn('mono text-[9px] tracking-wider',
              page.confidence === 'high' ? 'text-emerald-400/70' :
              page.confidence === 'low'  ? 'text-rose-400/70' : 'text-white/25')}>
              {page.confidence.toUpperCase()} CONFIDENCE
            </span>
          )}
          <span className="mono text-[9px] text-white/20 flex items-center gap-1 tracking-wider ml-auto">
            <Clock className="w-3 h-3" />
            {timeAgo(page.updatedAt).toUpperCase()}
          </span>
        </div>

        <h1 className="text-3xl font-black text-white/90 mb-6 leading-tight">{page.title}</h1>

        {/* Tags */}
        {page.tags?.length > 0 && (
          <div className="flex items-center gap-2 mb-8 flex-wrap">
            <Tag className="w-3 h-3 text-white/20" />
            {page.tags.map((t: string) => (
              <span key={t} className="mono text-[9px] text-white/25 bg-white/3 border border-white/5 px-2 py-0.5 rounded tracking-wider">
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Separator */}
        <div className="h-px bg-gradient-to-r from-violet-500/20 via-white/5 to-transparent mb-8" />

        {/* Content */}
        {editing ? (
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            className="w-full h-[60vh] bg-black/30 border border-white/8 rounded-xl p-5 text-sm text-white/70 font-mono focus:outline-none focus:border-violet-500/50 resize-none leading-7"
          />
        ) : (
          <div
            className="wiki-content"
            dangerouslySetInnerHTML={{ __html: `<p>${renderContent(page.content)}</p>` }}
          />
        )}
      </div>

      {/* Right sidebar */}
      <div ref={sidebarRef} className="w-60 shrink-0 border-l border-white/5 p-6 sticky top-0 h-screen overflow-y-auto bg-[#06060f]">
        <p className="mono text-[9px] text-white/20 tracking-widest mb-5">CONNECTIONS</p>

        {/* Related */}
        {page.relatedSlugs?.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-1.5 mb-3">
              <Network className="w-3 h-3 text-white/20" />
              <p className="mono text-[9px] text-white/25 tracking-widest">RELATED</p>
            </div>
            <div className="space-y-1.5">
              {page.relatedSlugs.map((s: string) => (
                <Link
                  key={s}
                  href={`/app/wiki/${s}`}
                  className="block mono text-[10px] text-white/30 hover:text-violet-300 transition-colors truncate tracking-wide py-0.5"
                >
                  [[{s}]]
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-1.5 mb-3">
              <Link2 className="w-3 h-3 text-white/20" />
              <p className="mono text-[9px] text-white/25 tracking-widest">BACKLINKS</p>
            </div>
            <div className="space-y-1.5">
              {backlinks.map((b: any) => (
                <Link
                  key={b.slug}
                  href={`/app/wiki/${b.slug}`}
                  className="block text-[11px] text-white/30 hover:text-violet-300 transition-colors truncate py-0.5"
                >
                  {b.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Sources */}
        {page.sources?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <ExternalLink className="w-3 h-3 text-white/20" />
              <p className="mono text-[9px] text-white/25 tracking-widest">SOURCES</p>
            </div>
            <div className="space-y-1.5">
              {page.sources.map((s: string, i: number) => (
                <a
                  key={i}
                  href={s.startsWith('http') ? s : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mono text-[9px] text-white/20 hover:text-white/40 transition-colors truncate tracking-wide py-0.5"
                >
                  {s.length > 40 ? s.slice(0, 40) + '...' : s}
                </a>
              ))}
            </div>
          </div>
        )}

        {!page.relatedSlugs?.length && !backlinks.length && (
          <p className="mono text-[9px] text-white/15 tracking-wider leading-relaxed">
            NO CONNECTIONS YET. INGEST MORE SOURCES TO BUILD THE NETWORK.
          </p>
        )}
      </div>
    </div>
  )
}
