'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Edit3, Save, X, ExternalLink, Tag, Clock, Link2, Network } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

const SILVER = '#c8c8cf'

const TYPE_TONE: Record<string, 'accent' | 'silver'> = {
  'source-summary': 'silver',
  concept:          'accent',
  entity:           'silver',
  synthesis:        'accent',
  pattern:          'silver',
  'query-answer':   'silver',
}

function toneChipStyle(tone: 'accent' | 'silver') {
  return tone === 'accent'
    ? {
        color: 'var(--accent-bright)',
        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
        borderColor: 'color-mix(in srgb, var(--accent) 28%, transparent)',
      }
    : {
        color: SILVER,
        background: 'color-mix(in srgb, #ffffff 4%, transparent)',
        borderColor: 'var(--border)',
      }
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

type Page = {
  _id?: string
  slug: string
  title: string
  type: string
  summary?: string
  content?: string
  confidence?: string
  tags?: string[]
  relatedSlugs?: string[]
  sources?: string[]
  updatedAt?: string | Date
}
type Backlink = { slug: string; title: string }
type WikiData = { page?: Page; backlinks?: Backlink[] } | null

export default function WikiPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [data, setData] = useState<WikiData>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    fetch(`/api/pages/${slug}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setData(d)
        setEditContent(d.page?.content || '')
      })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
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
    setData((prev) => prev?.page ? { ...prev, page: { ...prev.page, content: editContent } } : prev)
  }

  if (loading) return (
    <div className="flex gap-0 min-h-screen text-[var(--text-primary)]">
      <div className="flex-1 p-8 max-w-3xl animate-pulse">
        <div className="h-3 rounded w-24 mb-8" style={{ background: 'var(--surface-2)' }} />
        <div className="h-6 rounded w-1/3 mb-4" style={{ background: 'var(--surface-2)' }} />
        <div className="h-8 rounded w-2/3 mb-8" style={{ background: 'var(--surface-2)' }} />
        <div className="space-y-3">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className={`h-3 rounded ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`}
              style={{ background: 'var(--surface-2)' }}
            />
          ))}
        </div>
      </div>
    </div>
  )

  if (!data?.page) return (
    <div className="p-8 text-center text-[var(--text-primary)]">
      <p className="mono text-xs text-[var(--text-muted)] tracking-widest mb-4">PAGE NOT FOUND</p>
      <Link
        href="/app/wiki"
        className="mono text-xs tracking-wider"
        style={{ color: 'var(--accent-bright)' }}
      >
        ← BACK TO WIKI
      </Link>
    </div>
  )

  const { page, backlinks = [] } = data
  const tone = TYPE_TONE[page.type] ?? 'silver'

  return (
    <div className="flex min-h-screen text-[var(--text-primary)]">
      {/* Main content */}
      <div className="flex-1 p-8 max-w-3xl min-w-0">
        {/* Nav bar */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 mono text-[10px] text-[var(--text-muted)] tracking-widest transition-colors hover:text-[var(--text-secondary)]"
          >
            <ArrowLeft className="w-3 h-3" />
            BACK
          </button>
          {editing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1.5 mono text-[10px] text-[var(--text-muted)] tracking-wider px-3 py-1.5 rounded-lg transition-all"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-bright)',
                }}
              >
                <X className="w-3 h-3" /> CANCEL
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 mono text-[10px] px-3 py-1.5 rounded-lg tracking-wider font-semibold"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                  color: '#0b0b0d',
                }}
              >
                <Save className="w-3 h-3" />
                {saving ? 'SAVING...' : 'SAVE'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 mono text-[10px] text-[var(--text-secondary)] tracking-wider px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-bright)',
              }}
            >
              <Edit3 className="w-3 h-3" /> EDIT
            </button>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span
            className="mono text-[9px] px-2.5 py-1 rounded border font-medium tracking-wider"
            style={toneChipStyle(tone)}
          >
            {page.type?.toUpperCase()}
          </span>
          {page.confidence && (
            <span
              className="mono text-[9px] tracking-wider"
              style={{
                color:
                  page.confidence === 'high'
                    ? 'var(--accent-bright)'
                    : 'var(--text-muted)',
              }}
            >
              {page.confidence.toUpperCase()} CONFIDENCE
            </span>
          )}
          <span className="mono text-[9px] text-[var(--text-muted)] flex items-center gap-1 tracking-wider ml-auto">
            <Clock className="w-3 h-3" />
            {timeAgo(page.updatedAt ?? new Date()).toUpperCase()}
          </span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-6 leading-tight">
          {page.title}
        </h1>

        {/* Tags */}
        {(page.tags?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2 mb-8 flex-wrap">
            <Tag className="w-3 h-3 text-[var(--text-muted)]" />
            {page.tags!.map((t: string) => (
              <span
                key={t}
                className="mono text-[9px] px-2 py-0.5 rounded tracking-wider"
                style={{
                  color: 'var(--text-muted)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                }}
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Separator */}
        <div
          className="h-px mb-8"
          style={{
            background:
              'linear-gradient(90deg, color-mix(in srgb, var(--accent) 24%, transparent), var(--border), transparent)',
          }}
        />

        {/* Content */}
        {editing ? (
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            className="w-full h-[60vh] rounded-xl p-5 text-sm font-mono focus:outline-none resize-none leading-7"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-bright)',
              color: 'var(--text-primary)',
            }}
          />
        ) : (
          <div
            className="wiki-content"
            dangerouslySetInnerHTML={{ __html: `<p>${renderContent(page.content ?? '')}</p>` }}
          />
        )}
      </div>

      {/* Right sidebar */}
      <div
        className="w-60 shrink-0 p-6 sticky top-0 h-screen overflow-y-auto"
        style={{
          borderLeft: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest mb-5">
          CONNECTIONS
        </p>

        {/* Related */}
        {(page.relatedSlugs?.length ?? 0) > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-1.5 mb-3">
              <Network className="w-3 h-3 text-[var(--text-muted)]" />
              <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest">RELATED</p>
            </div>
            <div className="space-y-1.5">
              {page.relatedSlugs!.map((s: string) => (
                <Link
                  key={s}
                  href={`/app/wiki/${s}`}
                  className="block mono text-[10px] transition-colors truncate tracking-wide py-0.5"
                  style={{ color: 'var(--accent-bright)' }}
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
              <Link2 className="w-3 h-3 text-[var(--text-muted)]" />
              <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest">BACKLINKS</p>
            </div>
            <div className="space-y-1.5">
              {backlinks.map((b: Backlink) => (
                <Link
                  key={b.slug}
                  href={`/app/wiki/${b.slug}`}
                  className="block text-[11px] text-[var(--text-secondary)] truncate py-0.5 transition-colors"
                >
                  {b.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Sources */}
        {(page.sources?.length ?? 0) > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
              <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest">SOURCES</p>
            </div>
            <div className="space-y-1.5">
              {page.sources!.map((s: string, i: number) => (
                <a
                  key={i}
                  href={s.startsWith('http') ? s : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mono text-[9px] text-[var(--text-muted)] transition-colors truncate tracking-wide py-0.5"
                >
                  {s.length > 40 ? s.slice(0, 40) + '...' : s}
                </a>
              ))}
            </div>
          </div>
        )}

        {!page.relatedSlugs?.length && !backlinks.length && (
          <p className="mono text-[9px] text-[var(--text-muted)] tracking-wider leading-relaxed">
            NO CONNECTIONS YET. INGEST MORE SOURCES TO BUILD THE NETWORK.
          </p>
        )}
      </div>
    </div>
  )
}
