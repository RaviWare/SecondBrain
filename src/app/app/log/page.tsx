'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Activity, FileText, MessageSquare, Wrench, Clock, Download, Trash2, Filter,
  ChevronDown, Loader2, Undo2, type LucideIcon,
} from 'lucide-react'
import { timeAgo } from '@/lib/utils'

const SILVER = '#c8c8cf'

type LogEntry = {
  _id: string
  operation: string
  summary?: string
  createdAt: string | Date
  pagesAffected?: string[]
  tokensUsed?: number
}

const OP_CONFIG: Record<string, { icon: LucideIcon; tone: 'accent' | 'silver' | 'muted'; code: string }> = {
  ingest: { icon: FileText,      tone: 'accent', code: 'INGEST' },
  query:  { icon: MessageSquare, tone: 'silver', code: 'QUERY'  },
  lint:   { icon: Wrench,        tone: 'muted',  code: 'LINT'   },
}

function toneColor(tone: 'accent' | 'silver' | 'muted') {
  if (tone === 'accent') return 'var(--dash-accent)'
  if (tone === 'silver') return SILVER
  return 'var(--dash-subtle)'
}
function toneChipStyle(tone: 'accent' | 'silver' | 'muted') {
  if (tone === 'accent') return { color: 'var(--dash-accent)', background: 'var(--dash-accent-soft)', borderColor: 'var(--dash-border-glow)' }
  if (tone === 'silver') return { color: SILVER, background: 'color-mix(in srgb, #ffffff 4%, transparent)', borderColor: 'var(--dash-border)' }
  return { color: 'var(--dash-subtle)', background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border)' }
}

// Menu surface tokens — root-level (NOT --dash-*) so Radix portals render solid.
const MENU_STYLE: React.CSSProperties = {
  background: 'var(--bg-elev-3, #1c1c1f)',
  border: '1px solid var(--border-bright)',
  boxShadow: 'var(--shadow-3), 0 24px 60px -20px rgba(0,0,0,0.7)',
  backdropFilter: 'blur(24px) saturate(150%)',
  WebkitBackdropFilter: 'blur(24px) saturate(150%)',
}

const OP_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'ingest', label: 'Ingest' },
  { key: 'query', label: 'Query' },
  { key: 'lint', label: 'Lint' },
]

// Build a few recent month options (YYYY-MM) for the period filter.
function recentMonths(n: number) {
  const out: { value: string; label: string }[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1))
    out.push({
      value: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`,
      label: dt.toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    })
  }
  return out
}

export default function LogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [op, setOp] = useState('all')
  const [period, setPeriod] = useState<{ kind: 'all' | 'month'; value?: string; label: string }>({ kind: 'all', label: 'All time' })
  const [busy, setBusy] = useState(false)
  const [retention, setRetention] = useState<{ days: number; olderCount: number; recentCount: number }>({ days: 14, olderCount: 0, recentCount: 0 })
  const [undo, setUndo] = useState<{ entries: LogEntry[]; label: string; timer: ReturnType<typeof setTimeout> } | null>(null)

  const months = recentMonths(12)

  const queryString = useCallback((extra?: Record<string, string>) => {
    const p = new URLSearchParams()
    if (op !== 'all') p.set('op', op)
    if (period.kind === 'month' && period.value) p.set('month', period.value)
    if (extra) for (const [k, v] of Object.entries(extra)) p.set(k, v)
    return p.toString()
  }, [op, period])

  const load = useCallback(async (pageNum: number, append: boolean) => {
    // Defer the loading flag to a microtask so it isn't a synchronous setState
    // inside the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => setLoading(true))
    try {
      const r = await fetch(`/api/logs?${queryString({ page: String(pageNum), pageSize: '30' })}`)
      const d = await r.json()
      if (r.ok) {
        setLogs(prev => append ? [...prev, ...(d.logs || [])] : (d.logs || []))
        setTotal(d.total || 0)
        setHasMore(Boolean(d.hasMore))
        setPage(d.page || pageNum)
        if (d.retention) setRetention(d.retention)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [queryString])

  useEffect(() => {
    let cancelled = false
    // Wrap in a microtask so the effect body itself performs no synchronous
    // setState (react-hooks/set-state-in-effect); load() guards its own state.
    queueMicrotask(() => { if (!cancelled) load(1, false) })
    return () => { cancelled = true }
  }, [load])

  function exportLogs(format: 'csv' | 'json') {
    window.open(`/api/logs?${queryString({ export: format })}`, '_blank')
  }

  async function deleteByFilter(label: string, body: Record<string, unknown>) {
    setBusy(true)
    try {
      const r = await fetch('/api/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) await load(1, false)
    } catch { /* ignore */ }
    finally { setBusy(false) }
  }

  // Single-entry delete uses an optimistic undo window (forgiveness layer).
  function deleteEntry(entry: LogEntry) {
    setLogs(prev => prev.filter(l => l._id !== entry._id))
    setTotal(t => Math.max(0, t - 1))
    if (undo) clearTimeout(undo.timer)
    const timer = setTimeout(() => {
      fetch('/api/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [entry._id] }),
      }).catch(() => {})
      setUndo(null)
    }, 6000)
    setUndo({ entries: [entry], label: 'Log entry deleted', timer })
  }

  function undoDelete() {
    if (!undo) return
    clearTimeout(undo.timer)
    load(1, false)
    setUndo(null)
  }

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-3xl p-4 sm:p-6 md:p-8">
        {/* Header */}
        <header className="dash-rise mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mono text-[10px] uppercase text-[var(--dash-subtle)] tracking-widest mb-2">
              System log · Telemetry
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="dash-metallic-text">Activity Log</span>
            </h1>
            <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
              {total.toLocaleString()} operation{total !== 1 ? 's' : ''} recorded
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Export */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--dash-border)] px-3 text-xs font-medium text-[var(--dash-text)] transition hover:border-[var(--dash-border-glow)] outline-none">
                  <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12} className="z-50 w-44 rounded-2xl p-1.5" style={MENU_STYLE}>
                  <DropdownMenu.Item onSelect={() => exportLogs('csv')} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] outline-none transition data-[highlighted]:bg-[var(--surface-2)]" style={{ color: 'var(--text-primary)' }}>
                    <FileText className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} /> Export as CSV
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => exportLogs('json')} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] outline-none transition data-[highlighted]:bg-[var(--surface-2)]" style={{ color: 'var(--text-primary)' }}>
                    <FileText className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} /> Export as JSON
                  </DropdownMenu.Item>
                  <p className="px-2.5 pt-1.5 pb-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>Exports the current filter</p>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            {/* Manage / delete */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--dash-border)] px-3 text-xs font-medium text-[var(--dash-text)] transition hover:border-[var(--dash-border-glow)] outline-none disabled:opacity-50" disabled={busy}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Manage <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12} className="z-50 w-60 rounded-2xl p-1.5" style={MENU_STYLE}>
                  {period.kind === 'month' && period.value && (
                    <DropdownMenu.Item
                      onSelect={() => deleteByFilter(period.label, { month: period.value })}
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] outline-none transition data-[highlighted]:bg-[color-mix(in_srgb,#f0524b_15%,transparent)]"
                      style={{ color: '#f0746b' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete {period.label}
                    </DropdownMenu.Item>
                  )}
                  {op !== 'all' && (
                    <DropdownMenu.Item
                      onSelect={() => deleteByFilter(op, { op })}
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] outline-none transition data-[highlighted]:bg-[color-mix(in_srgb,#f0524b_15%,transparent)]"
                      style={{ color: '#f0746b' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete all {op.toUpperCase()} logs
                    </DropdownMenu.Item>
                  )}
                  {retention.olderCount > 0 && (
                    <DropdownMenu.Item
                      onSelect={() => { if (confirm(`Clear ${retention.olderCount.toLocaleString()} entries older than 14 days? Your last 14 days (${retention.recentCount.toLocaleString()} entries) will be kept. This cannot be undone.`)) deleteByFilter('all', { all: true }) }}
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] outline-none transition data-[highlighted]:bg-[color-mix(in_srgb,#f0524b_15%,transparent)]"
                      style={{ color: '#f0746b' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Clear history (keep last 14 days)…
                    </DropdownMenu.Item>
                  )}
                  {/* Force-delete the protected window unlocks ONLY after older
                      history is already cleared and only the last 14 days remain. */}
                  {retention.olderCount === 0 && retention.recentCount > 0 && (
                    <DropdownMenu.Item
                      onSelect={() => {
                        if (!confirm(`Delete the last 14 days (${retention.recentCount.toLocaleString()} entries)? This is the protected window — this cannot be undone.`)) return
                        if (!confirm('Are you absolutely sure? This permanently erases your entire remaining activity history with no recovery.')) return
                        deleteByFilter('all-force', { all: true, force: true })
                      }}
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] outline-none transition data-[highlighted]:bg-[color-mix(in_srgb,#f0524b_15%,transparent)]"
                      style={{ color: '#f0746b' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete last 14 days too…
                    </DropdownMenu.Item>
                  )}
                  <p className="px-2.5 pt-1.5 pb-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {retention.olderCount > 0
                      ? 'The last 14 days are always kept by default'
                      : retention.recentCount > 0
                        ? 'Only the protected last-14-days remain'
                        : 'Filter by type/period to scope a delete'}
                  </p>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        {/* Filters */}
        <div className="dash-panel dash-rise mb-6 flex flex-wrap items-center gap-3 rounded-2xl p-3" style={{ animationDelay: '0.05s' }}>
          <span className="mono text-[9px] text-[var(--dash-subtle)] tracking-widest flex items-center gap-1.5">
            <Filter className="h-3 w-3" /> FILTER
          </span>
          {/* Operation chips */}
          <div className="flex flex-wrap gap-1.5">
            {OP_FILTERS.map(f => {
              const active = op === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setOp(f.key)}
                  className="mono text-[9px] px-2.5 py-1.5 rounded-lg tracking-wider font-medium transition-all"
                  style={active
                    ? { background: 'var(--dash-accent-soft)', color: 'var(--dash-accent)', border: '1px solid var(--dash-border-glow)' }
                    : { color: 'var(--dash-subtle)', background: 'transparent', border: '1px solid var(--dash-border)' }}
                >
                  {f.label.toUpperCase()}
                </button>
              )
            })}
          </div>

          {/* Period select */}
          <div className="ml-auto">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--dash-border)] px-2.5 mono text-[10px] tracking-wider text-[var(--dash-muted)] transition hover:border-[var(--dash-border-glow)] outline-none">
                  <Clock className="h-3 w-3" /> {period.label.toUpperCase()} <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12} className="z-50 max-h-72 w-52 overflow-y-auto rounded-2xl p-1.5" style={MENU_STYLE}>
                  <DropdownMenu.Item onSelect={() => setPeriod({ kind: 'all', label: 'All time' })} className="flex cursor-pointer items-center rounded-xl px-2.5 py-2 text-[13px] outline-none transition data-[highlighted]:bg-[var(--surface-2)]" style={{ color: 'var(--text-primary)' }}>
                    All time
                  </DropdownMenu.Item>
                  {months.map(m => (
                    <DropdownMenu.Item key={m.value} onSelect={() => setPeriod({ kind: 'month', value: m.value, label: m.label })} className="flex cursor-pointer items-center rounded-xl px-2.5 py-2 text-[13px] outline-none transition data-[highlighted]:bg-[var(--surface-2)]" style={{ color: 'var(--text-primary)' }}>
                      {m.label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>

        {/* List */}
        {loading && logs.length === 0 ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="dash-panel rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg animate-pulse bg-[var(--dash-soft)]" />
                  <div className="flex-1">
                    <div className="h-2.5 rounded w-1/4 mb-2 animate-pulse bg-[var(--dash-soft)]" />
                    <div className="h-3 rounded w-3/4 animate-pulse bg-[var(--dash-soft)]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="dash-panel w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
              <Activity className="w-7 h-7 text-[var(--dash-subtle)]" />
            </div>
            <p className="mono text-[10px] text-[var(--dash-subtle)] tracking-widest mb-2">
              {op !== 'all' || period.kind !== 'all' ? 'NO MATCHING EVENTS' : 'NO ACTIVITY YET'}
            </p>
            <p className="text-[var(--dash-muted)] text-sm">
              {op !== 'all' || period.kind !== 'all' ? 'Try a different filter.' : 'Ingest a source to begin logging.'}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {logs.map((log, idx) => {
                const cfg = OP_CONFIG[log.operation] || OP_CONFIG.ingest
                const Icon = cfg.icon
                return (
                  <div key={log._id} className="dash-panel group relative flex items-start gap-3 overflow-hidden rounded-2xl p-3 transition-colors sm:gap-4 sm:p-4">
                    {idx < logs.length - 1 && (
                      <div className="absolute left-[23px] top-12 bottom-[-10px] w-px sm:left-[27px]" style={{ background: 'var(--dash-border)' }} />
                    )}
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative z-10 border" style={toneChipStyle(cfg.tone)}>
                      <Icon className="w-3.5 h-3.5" style={{ color: toneColor(cfg.tone) }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="mono text-[9px] font-medium tracking-widest" style={{ color: toneColor(cfg.tone) }}>{cfg.code}</span>
                        <span className="mono text-[9px] text-[var(--dash-subtle)] tracking-wider flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {timeAgo(log.createdAt).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--dash-muted)] leading-relaxed">{log.summary}</p>
                      {(log.pagesAffected?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {log.pagesAffected!.slice(0, 5).map(slug => (
                            <Link key={slug} href={`/app/wiki/${slug}`} className="mono text-[9px] px-1.5 py-0.5 rounded tracking-wider transition-colors" style={{ color: 'var(--dash-accent)', background: 'var(--dash-accent-soft)', border: '1px solid var(--dash-border-glow)' }}>
                              {slug}
                            </Link>
                          ))}
                          {log.pagesAffected!.length > 5 && (
                            <span className="mono text-[9px] text-[var(--dash-subtle)]">+{log.pagesAffected!.length - 5} MORE</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(log.tokensUsed ?? 0) > 0 && (
                        <div className="text-right">
                          <p className="mono text-[9px] text-[var(--dash-muted)] tracking-wider">{log.tokensUsed!.toLocaleString()}</p>
                          <p className="mono text-[8px] text-[var(--dash-subtle)] tracking-widest">TOKENS</p>
                        </div>
                      )}
                      <button
                        onClick={() => deleteEntry(log)}
                        aria-label="Delete entry"
                        className="grid h-7 w-7 place-items-center rounded-lg opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[color-mix(in_srgb,#f0524b_12%,transparent)]"
                        style={{ color: '#f0746b' }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {hasMore && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => load(page + 1, true)}
                  disabled={loading}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--dash-border)] px-4 text-xs font-medium text-[var(--dash-muted)] transition hover:border-[var(--dash-border-glow)] hover:text-[var(--dash-text)] disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Load more · {logs.length} of {total.toLocaleString()}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Undo toast */}
      {undo && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm" role="status" aria-live="polite" style={MENU_STYLE}>
            <span style={{ color: 'var(--text-primary)' }}>{undo.label}</span>
            <button onClick={undoDelete} className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--accent)' }}>
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
