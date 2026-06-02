'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Search, BookOpen, ArrowRight, Plus, Star, Trash2, MoreHorizontal,
  LayoutGrid, Rows3, Undo2, FileText, Lightbulb, Box, Sparkles, GitBranch, MessageSquareText,
  type LucideIcon,
} from 'lucide-react'
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
  pinned?: boolean
  updatedAt: string | Date
}

type SortKey = 'recent' | 'pinned' | 'az' | 'confidence'
type Density = 'comfortable' | 'compact'

const TYPES = ['all', 'source-summary', 'concept', 'entity', 'synthesis', 'pattern', 'query-answer']

const TYPE_LABEL: Record<string, string> = {
  all: 'ALL',
  'source-summary': 'SOURCES',
  concept: 'CONCEPTS',
  entity: 'ENTITIES',
  synthesis: 'SYNTHESIS',
  pattern: 'PATTERNS',
  'query-answer': 'ANSWERS',
}

// Accent / silver only — no rainbow.
const TYPE_TONE: Record<string, 'accent' | 'silver'> = {
  'source-summary': 'silver',
  concept:          'accent',
  entity:           'silver',
  synthesis:        'accent',
  pattern:          'silver',
  'query-answer':   'silver',
}

// type → icon (the spec's type/color/icon triplet)
const TYPE_ICON: Record<string, LucideIcon> = {
  'source-summary': FileText,
  concept:          Lightbulb,
  entity:           Box,
  synthesis:        Sparkles,
  pattern:          GitBranch,
  'query-answer':   MessageSquareText,
}

const SILVER = '#c8c8cf'

function toneStyle(tone: 'accent' | 'silver') {
  return tone === 'accent'
    ? {
        color: 'var(--dash-accent)',
        background: 'var(--dash-accent-soft)',
        borderColor: 'var(--dash-border-glow)',
      }
    : {
        color: SILVER,
        background: 'color-mix(in srgb, #ffffff 4%, transparent)',
        borderColor: 'var(--dash-border)',
      }
}

const CONFIDENCE_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

export default function WikiIndexPage() {
  const [pages, setPages] = useState<WikiPage[]>([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [density, setDensity] = useState<Density>('comfortable')
  const [loading, setLoading] = useState(true)
  // Undo buffer for deletes — the "forgiveness layer" (soft delete in the UI
  // until the toast expires, then commit the DELETE to the server).
  const [undo, setUndo] = useState<{ page: WikiPage; timer: ReturnType<typeof setTimeout> } | null>(null)

  useEffect(() => {
    let cancelled = false
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

  // Client-side sort (the API already returns pinned-first / recent).
  const sorted = useMemo(() => {
    const list = [...pages]
    switch (sort) {
      case 'az':
        list.sort((a, b) => a.title.localeCompare(b.title)); break
      case 'confidence':
        list.sort((a, b) => (CONFIDENCE_RANK[a.confidence ?? 'medium'] ?? 1) - (CONFIDENCE_RANK[b.confidence ?? 'medium'] ?? 1)); break
      case 'pinned':
        list.sort((a, b) => Number(b.pinned) - Number(a.pinned)); break
      case 'recent':
      default:
        list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    }
    return list
  }, [pages, sort])

  const highCount = useMemo(() => pages.filter(p => p.confidence === 'high').length, [pages])

  async function togglePin(page: WikiPage, e?: React.MouseEvent) {
    e?.preventDefault(); e?.stopPropagation()
    const next = !page.pinned
    setPages(prev => prev.map(p => p.slug === page.slug ? { ...p, pinned: next } : p))
    try {
      await fetch(`/api/pages/${page.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: next }),
      })
    } catch {
      // revert on failure
      setPages(prev => prev.map(p => p.slug === page.slug ? { ...p, pinned: !next } : p))
    }
  }

  function requestDelete(page: WikiPage, e?: React.MouseEvent) {
    e?.preventDefault(); e?.stopPropagation()
    // Optimistically remove from the list; commit after the undo window.
    setPages(prev => prev.filter(p => p.slug !== page.slug))
    if (undo) clearTimeout(undo.timer)
    const timer = setTimeout(() => {
      fetch(`/api/pages/${page.slug}`, { method: 'DELETE' }).catch(() => {})
      setUndo(null)
    }, 6000)
    setUndo({ page, timer })
  }

  function undoDelete() {
    if (!undo) return
    clearTimeout(undo.timer)
    setPages(prev => [undo.page, ...prev])
    setUndo(null)
  }

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <header className="dash-rise mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between" style={{ animationDelay: '0s' }}>
          <div>
            <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
              Wiki index · Knowledge base
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="dash-metallic-text">Memory</span>
            </h1>
            <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
              All knowledge pages in your second brain
            </p>
          </div>
          <Link
            href="/app/ingest"
            className="dash-accent-grad relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 text-sm font-semibold text-white shadow-[0_16px_36px_-10px_rgba(255,102,0,0.6)] transition hover:-translate-y-0.5"
          >
            <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.35),transparent_45%)]" />
            <Plus className="relative h-4 w-4" />
            <span className="relative">Add source</span>
          </Link>
        </header>

        {/* Search + Filter panel */}
        <div className="dash-panel dash-rise rounded-2xl p-4 mb-6" style={{ animationDelay: '0.06s' }}>
          <div className="grid gap-3 lg:flex lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--dash-subtle)]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search knowledge base..."
                className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm bg-[var(--dash-card-solid)] border border-[var(--dash-border)] text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-subtle)] focus:border-[var(--dash-border-glow)] focus:shadow-[0_0_0_3px_var(--dash-accent-soft)]"
              />
            </div>

            {/* Sort */}
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              aria-label="Sort pages"
              className="rounded-xl px-3 py-2.5 text-xs mono tracking-wider bg-[var(--dash-card-solid)] border border-[var(--dash-border)] text-[var(--dash-muted)] outline-none focus:border-[var(--dash-border-glow)]"
            >
              <option value="recent">RECENT</option>
              <option value="pinned">PINNED FIRST</option>
              <option value="az">A–Z</option>
              <option value="confidence">CONFIDENCE</option>
            </select>

            {/* Density toggle */}
            <div className="flex rounded-xl p-1 bg-[var(--dash-card-solid)] border border-[var(--dash-border)]">
              {([['comfortable', LayoutGrid], ['compact', Rows3]] as const).map(([key, Icon]) => {
                const on = density === key
                return (
                  <button
                    key={key}
                    onClick={() => setDensity(key)}
                    aria-label={key}
                    aria-pressed={on}
                    className="grid h-8 w-8 place-items-center rounded-lg transition"
                    style={on
                      ? { background: 'var(--dash-accent-soft)', color: 'var(--dash-accent)' }
                      : { color: 'var(--dash-subtle)' }}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Type filters — all of them */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {TYPES.map(t => {
              const active = type === t
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className="mono text-[9px] px-2.5 py-1.5 rounded-lg tracking-wider font-medium transition-all"
                  style={active
                    ? { background: 'var(--dash-accent-soft)', color: 'var(--dash-accent)', border: '1px solid var(--dash-border-glow)' }
                    : { color: 'var(--dash-subtle)', background: 'transparent', border: '1px solid var(--dash-border)' }}
                >
                  {TYPE_LABEL[t] ?? t.toUpperCase()}
                </button>
              )
            })}
          </div>

          {/* Real count summary */}
          {!loading && (
            <p className="mono text-[9px] text-[var(--dash-subtle)] tracking-widest mt-3">
              {pages.length} PAGE{pages.length !== 1 ? 'S' : ''}
              {highCount > 0 ? ` · ${highCount} HIGH-CONFIDENCE` : ''}
              {type !== 'all' ? ` · ${TYPE_LABEL[type] ?? type.toUpperCase()}` : ''}
              {search ? ` · "${search}"` : ''}
            </p>
          )}
        </div>

        {/* Grid / list */}
        {loading ? (
          <div className={density === 'comfortable' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-2'}>
            {[...Array(9)].map((_, i) => (
              <div key={i} className="dash-panel rounded-2xl p-5">
                <div className="h-2 rounded w-1/4 mb-4 animate-pulse bg-[var(--dash-soft)]" />
                <div className="h-4 rounded w-3/4 mb-3 animate-pulse bg-[var(--dash-soft)]" />
                <div className="h-3 rounded w-full mb-2 animate-pulse bg-[var(--dash-soft)]" />
                <div className="h-3 rounded w-2/3 animate-pulse bg-[var(--dash-soft)]" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="dash-panel w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
              <BookOpen className="w-7 h-7 text-[var(--dash-subtle)]" />
            </div>
            <p className="mono text-[10px] text-[var(--dash-subtle)] tracking-widest mb-2">NO PAGES FOUND</p>
            <p className="text-[var(--dash-muted)] text-sm mb-6">
              {search || type !== 'all' ? 'No pages match your search.' : 'Your wiki is empty.'}
            </p>
            {!search && type === 'all' && (
              <Link
                href="/app/ingest"
                className="dash-accent-grad inline-flex items-center gap-2 text-xs font-semibold px-5 py-2.5 rounded-2xl text-white"
              >
                Ingest your first source
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        ) : (
          <WikiSections
            pages={sorted}
            density={density}
            onPin={togglePin}
            onDelete={requestDelete}
          />
        )}
      </div>

      {/* Undo toast — the forgiveness layer */}
      {undo && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="dash-menu flex items-center gap-3 rounded-2xl px-4 py-3 text-sm" role="status" aria-live="polite">
            <span className="text-[var(--dash-text)]">
              Deleted “{undo.page.title.length > 32 ? undo.page.title.slice(0, 32) + '…' : undo.page.title}”
            </span>
            <button
              onClick={undoDelete}
              className="inline-flex items-center gap-1.5 font-semibold text-[var(--dash-accent)] hover:text-[var(--dash-accent-2)] transition-colors"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

/* ── Sections: Pinned group above All ─────────────────────── */
function WikiSections({
  pages, density, onPin, onDelete,
}: {
  pages: WikiPage[]
  density: Density
  onPin: (p: WikiPage, e?: React.MouseEvent) => void
  onDelete: (p: WikiPage, e?: React.MouseEvent) => void
}) {
  const pinned = pages.filter(p => p.pinned)
  const rest = pages.filter(p => !p.pinned)

  const renderGroup = (items: WikiPage[]) =>
    density === 'comfortable' ? (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(p => (
          <WikiCard key={p.slug} page={p} onPin={onPin} onDelete={onDelete} />
        ))}
      </div>
    ) : (
      <div className="dash-panel rounded-2xl overflow-hidden">
        {items.map((p, i) => (
          <WikiRow key={p.slug} page={p} last={i === items.length - 1} onPin={onPin} onDelete={onDelete} />
        ))}
      </div>
    )

  // No pinned items → single ungrouped list (no empty "Pinned" header).
  if (pinned.length === 0) return renderGroup(rest)

  return (
    <div className="space-y-8">
      <section>
        <SectionLabel icon={<Star className="h-3 w-3" style={{ fill: 'var(--dash-accent)' }} />} text="Pinned" count={pinned.length} accent />
        {renderGroup(pinned)}
      </section>
      {rest.length > 0 && (
        <section>
          <SectionLabel text="All pages" count={rest.length} />
          {renderGroup(rest)}
        </section>
      )}
    </div>
  )
}

function SectionLabel({ icon, text, count, accent }: { icon?: React.ReactNode; text: string; count: number; accent?: boolean }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <span className="mono text-[10px] uppercase tracking-widest font-medium" style={{ color: accent ? 'var(--dash-accent)' : 'var(--dash-subtle)' }}>
        {text}
      </span>
      <span className="mono text-[10px] tracking-widest text-[var(--dash-subtle)]">· {count}</span>
      <span className="ml-1 h-px flex-1" style={{ background: 'var(--dash-border)' }} />
    </div>
  )
}

/* ── Comfortable card ─────────────────────────────────────── */
function WikiCard({
  page: p, onPin, onDelete,
}: {
  page: WikiPage
  onPin: (p: WikiPage, e?: React.MouseEvent) => void
  onDelete: (p: WikiPage, e?: React.MouseEvent) => void
}) {
  const tone = TYPE_TONE[p.type] ?? 'silver'
  const TypeIcon = TYPE_ICON[p.type] ?? FileText
  // Confidence as a left edge — the spec's signature channel.
  const edge = p.confidence === 'high' ? 'var(--dash-accent)' : p.confidence === 'medium' ? 'var(--dash-border-bright)' : 'transparent'

  return (
    <Link
      href={`/app/wiki/${p.slug}`}
      className="dash-panel dash-interactive group relative overflow-hidden rounded-2xl p-5 transition"
      style={{
        borderLeft: `3px solid ${edge}`,
        // Pinned cards earn a faint warm wash so they read as special at a glance.
        ...(p.pinned ? { boxShadow: 'inset 0 0 0 1px var(--dash-border-glow), inset 0 28px 60px -40px var(--dash-accent)' } : {}),
      }}
    >
      <div className="relative">
        {/* top row: type badge + confidence (left) · star + menu (right) */}
        <div className="flex items-center gap-2 mb-3">
          <span className="mono inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded border font-medium tracking-wider" style={toneStyle(tone)}>
            <TypeIcon className="h-2.5 w-2.5" />
            {(TYPE_LABEL[p.type] ?? p.type)?.toUpperCase().slice(0, 10)}
          </span>
          {p.confidence && (
            <span className="mono text-[9px]" style={{ color: p.confidence === 'high' ? 'var(--dash-accent)' : 'var(--dash-subtle)' }}>
              {p.confidence.toUpperCase()}
            </span>
          )}

          {/* Right-aligned controls: ONE star (always shown when pinned, on hover
              otherwise) + a portal-rendered actions menu that floats above the
              card (never overlaps the title / never clipped). */}
          <div className="ml-auto flex items-center gap-0.5">
            <button
              onClick={e => onPin(p, e)}
              aria-label={p.pinned ? 'Unpin' : 'Pin'}
              aria-pressed={p.pinned}
              className={`grid h-7 w-7 place-items-center rounded-lg transition hover:bg-[var(--dash-soft)] ${p.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
              style={{ color: p.pinned ? 'var(--dash-accent)' : 'var(--dash-subtle)' }}
            >
              <Star className="h-3.5 w-3.5" style={p.pinned ? { fill: 'var(--dash-accent)' } : undefined} />
            </button>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation() }}
                  aria-label="More actions"
                  className="grid h-7 w-7 place-items-center rounded-lg opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 hover:bg-[var(--dash-soft)] outline-none"
                  style={{ color: 'var(--dash-subtle)' }}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  collisionPadding={12}
                  onClick={e => { e.preventDefault(); e.stopPropagation() }}
                  className="z-50 w-44 rounded-2xl p-1.5 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1"
                  style={{
                    // Portal renders at <body>, OUTSIDE the .sb-dashboard scope,
                    // so --dash-* tokens don't resolve here. Use root tokens +
                    // a SOLID surface so card text never bleeds through.
                    background: 'var(--bg-elev-3, #1c1c1f)',
                    border: '1px solid var(--border-bright)',
                    boxShadow: 'var(--shadow-3), 0 24px 60px -20px rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(24px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(150%)',
                  }}
                >
                  <DropdownMenu.Item
                    onSelect={() => onPin(p)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] outline-none transition data-[highlighted]:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)]" style={{ color: 'var(--accent)' }}>
                      <Star className="h-3 w-3" style={p.pinned ? { fill: 'var(--accent)' } : undefined} />
                    </span>
                    {p.pinned ? 'Unpin' : 'Pin to top'}
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className="my-1 h-px" style={{ background: 'var(--border)' }} />

                  <DropdownMenu.Item
                    onSelect={() => onDelete(p)}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] outline-none transition data-[highlighted]:bg-[color-mix(in_srgb,#f0524b_15%,transparent)]"
                    style={{ color: '#f0746b' }}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border bg-[color-mix(in_srgb,#f0524b_10%,transparent)]" style={{ borderColor: 'color-mix(in srgb, #f0524b 24%, transparent)' }}>
                      <Trash2 className="h-3 w-3" />
                    </span>
                    Delete
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>

        <h3 className="text-[15px] font-semibold text-[var(--dash-text)] mb-1.5 leading-snug line-clamp-2 tracking-[-0.01em]">
          {p.title}
        </h3>

        {p.summary && (
          <p className="text-[12px] text-[var(--dash-muted)] line-clamp-2 leading-relaxed mb-4">
            {p.summary}
          </p>
        )}

        <div className="flex items-center gap-1.5 flex-wrap pt-3 border-t border-[var(--dash-border)]">
          {p.tags?.slice(0, 2).map(t => (
            <span key={t} className="mono text-[9px] px-1.5 py-0.5 rounded tracking-wider" style={{ color: 'var(--dash-subtle)', background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
              #{t}
            </span>
          ))}
          <span className="mono text-[9px] text-[var(--dash-subtle)] ml-auto">
            {timeAgo(p.updatedAt)}
          </span>
        </div>
      </div>
    </Link>
  )
}

/* ── Compact row ──────────────────────────────────────────── */
function WikiRow({
  page: p, last, onPin, onDelete,
}: {
  page: WikiPage
  last: boolean
  onPin: (p: WikiPage, e?: React.MouseEvent) => void
  onDelete: (p: WikiPage, e?: React.MouseEvent) => void
}) {
  const tone = TYPE_TONE[p.type] ?? 'silver'
  const dot = tone === 'accent' ? 'var(--dash-accent)' : SILVER
  return (
    <Link
      href={`/app/wiki/${p.slug}`}
      className="group flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--dash-soft)]"
      style={{ borderBottom: last ? 'none' : '1px solid var(--dash-border)' }}
    >
      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: dot }} />
      <span className="text-sm text-[var(--dash-text)] truncate flex-1">{p.title}</span>
      {p.pinned && <Star className="h-3 w-3 shrink-0" style={{ color: 'var(--dash-accent)', fill: 'var(--dash-accent)' }} />}
      <span className="mono text-[9px] text-[var(--dash-subtle)] shrink-0 hidden sm:inline">{p.type?.toUpperCase().slice(0, 8)}</span>
      <span className="mono text-[9px] text-[var(--dash-subtle)] shrink-0">{timeAgo(p.updatedAt)}</span>
      <button
        onClick={e => onPin(p, e)}
        aria-label={p.pinned ? 'Unpin' : 'Pin'}
        className="grid h-7 w-7 place-items-center rounded-lg opacity-0 transition group-hover:opacity-100 hover:bg-[var(--dash-card-solid)]"
        style={{ color: p.pinned ? 'var(--dash-accent)' : 'var(--dash-subtle)' }}
      >
        <Star className="h-3.5 w-3.5" style={p.pinned ? { fill: 'var(--dash-accent)' } : undefined} />
      </button>
      <button
        onClick={e => onDelete(p, e)}
        aria-label="Delete"
        className="grid h-7 w-7 place-items-center rounded-lg opacity-0 transition group-hover:opacity-100 hover:bg-[color-mix(in_srgb,#f0524b_12%,transparent)]"
        style={{ color: '#f0746b' }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </Link>
  )
}
