'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Edit3, Save, X, ExternalLink, Tag, Clock, Link2 } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'

const TYPE_COLORS: Record<string, string> = {
  'source-summary': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  concept:          'bg-violet-500/20 text-violet-300 border-violet-500/30',
  entity:           'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  synthesis:        'bg-amber-500/20 text-amber-300 border-amber-500/30',
  pattern:          'bg-rose-500/20 text-rose-300 border-rose-500/30',
  'query-answer':   'bg-zinc-700/50 text-zinc-300 border-zinc-600',
}

function renderContent(content: string) {
  // Strip YAML frontmatter
  const stripped = content.replace(/^---[\s\S]*?---\n?/, '')

  // Replace [[wikilink]] with clickable spans
  const withLinks = stripped.replace(/\[\[([^\]]+)\]\]/g, (_, slug) =>
    `<a href="/app/wiki/${slug}" class="wiki-link">[[${slug}]]</a>`
  )

  // Basic markdown rendering
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
    <div className="p-8 max-w-4xl mx-auto animate-pulse">
      <div className="h-4 bg-zinc-800 rounded w-32 mb-8" />
      <div className="h-8 bg-zinc-800 rounded w-2/3 mb-4" />
      <div className="space-y-3">
        {[...Array(8)].map((_, i) => <div key={i} className="h-3 bg-zinc-800 rounded" />)}
      </div>
    </div>
  )

  if (!data?.page) return (
    <div className="p-8 text-center">
      <p className="text-zinc-500">Page not found.</p>
      <Link href="/app/wiki" className="text-violet-400 text-sm mt-2 block">← Back to wiki</Link>
    </div>
  )

  const { page, backlinks = [] } = data

  return (
    <div className="flex gap-0 min-h-screen">
      {/* Main content */}
      <div className="flex-1 p-8 max-w-3xl">
        {/* Back + actions */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          {editing ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(false)} className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm px-3 py-1.5 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors">
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', TYPE_COLORS[page.type] || 'bg-zinc-700 text-zinc-300 border-zinc-600')}>
            {page.type}
          </span>
          {page.confidence && (
            <span className={cn('text-xs font-medium',
              page.confidence === 'high' ? 'text-emerald-400' :
              page.confidence === 'low'  ? 'text-rose-400' : 'text-zinc-500')}>
              {page.confidence} confidence
            </span>
          )}
          <span className="text-xs text-zinc-600 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Updated {timeAgo(page.updatedAt)}
          </span>
        </div>

        <h1 className="text-3xl font-bold text-zinc-100 mb-6 leading-tight">{page.title}</h1>

        {/* Tags */}
        {page.tags?.length > 0 && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <Tag className="w-3.5 h-3.5 text-zinc-600" />
            {page.tags.map((t: string) => (
              <span key={t} className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">#{t}</span>
            ))}
          </div>
        )}

        {/* Content */}
        {editing ? (
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            className="w-full h-[60vh] bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-200 font-mono focus:outline-none focus:border-violet-500 resize-none leading-7"
          />
        ) : (
          <div
            className="wiki-content"
            dangerouslySetInnerHTML={{ __html: `<p>${renderContent(page.content)}</p>` }}
          />
        )}
      </div>

      {/* Right sidebar */}
      <div className="w-64 shrink-0 border-l border-zinc-800 p-6 sticky top-0 h-screen overflow-y-auto">
        {/* Related */}
        {page.relatedSlugs?.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <ExternalLink className="w-3 h-3" /> Related
            </h3>
            <div className="space-y-1.5">
              {page.relatedSlugs.map((s: string) => (
                <Link key={s} href={`/app/wiki/${s}`}
                  className="block text-sm text-zinc-400 hover:text-violet-300 transition-colors truncate">
                  [[{s}]]
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Link2 className="w-3 h-3" /> Backlinks
            </h3>
            <div className="space-y-1.5">
              {backlinks.map((b: any) => (
                <Link key={b.slug} href={`/app/wiki/${b.slug}`}
                  className="block text-sm text-zinc-400 hover:text-violet-300 transition-colors truncate">
                  {b.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {!page.relatedSlugs?.length && !backlinks.length && (
          <p className="text-xs text-zinc-700">No connections yet. Ingest more sources to build the network.</p>
        )}
      </div>
    </div>
  )
}
