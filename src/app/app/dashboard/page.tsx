'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  Plus, X, ArrowRight, ExternalLink,
  BookOpen, Search, Network, Table as TableIcon,
  ArrowUp, ArrowDown,
} from 'lucide-react'
import { KnowledgeGraph, GraphNode, GraphEdge } from '@/components/graph/KnowledgeGraph'
import { timeAgo } from '@/lib/utils'

const ACCENT = '#ff7a1f'
const SILVER = '#c8c8cf'
const MUTED  = '#6e6e78'

const TYPE_COLOR: Record<string, string> = {
  concept:          ACCENT,
  person:           SILVER,
  organization:     ACCENT,
  entity:           SILVER,
  tool:             ACCENT,
  synthesis:        SILVER,
  pattern:          ACCENT,
  event:            SILVER,
  'source-summary': MUTED,
  'query-answer':   MUTED,
}

const OP_COLOR: Record<string, string> = {
  ingest: 'text-[var(--accent-bright)]',
  query:  'text-[var(--text-primary)]',
  lint:   'text-[var(--text-muted)]',
}

const TIME_FILTERS = [
  { label: 'All Time', value: 'all' },
  { label: '7 Days',   value: '7d' },
  { label: '30 Days',  value: '30d' },
  { label: '90 Days',  value: '90d' },
]

function filterByTime(nodes: GraphNode[], edges: GraphEdge[], filter: string) {
  if (filter === 'all') return { nodes, edges }
  const days = filter === '7d' ? 7 : filter === '30d' ? 30 : 90
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const kept = new Set(nodes.filter(n => new Date(n.updatedAt ?? 0).getTime() >= cutoff).map(n => n.id))
  return {
    nodes: nodes.filter(n => kept.has(n.id)),
    edges: edges.filter(e => kept.has(e.source) && kept.has(e.target)),
  }
}

/** Smoothly counts from 0 up to `target` over `ms` using rAF. */
function useCountUp(target: number, ms = 900) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const from = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setVal(Math.round(from + (target - from) * eased))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return val
}

function CountChip({
  label, value, tone,
}: { label: string; value: number | string; tone: 'accent' | 'silver' }) {
  const numeric = typeof value === 'number'
  // Always call the hook (Rules of Hooks). Render numeric-or-string below.
  const counted = useCountUp(numeric ? (value as number) : 0)
  const shown = numeric ? counted : value
  const style =
    tone === 'accent'
      ? {
          color: 'var(--accent-bright)',
          background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
          borderColor: 'color-mix(in srgb, var(--accent) 22%, transparent)',
        }
      : {
          color: SILVER,
          background: 'color-mix(in srgb, #ffffff 4%, transparent)',
          borderColor: 'var(--border)',
        }
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border mono text-[10px]"
      style={style}
    >
      <span className="opacity-60">{label}</span>
      <span className="font-bold tabular-nums">{shown}</span>
    </div>
  )
}

type SortKey = 'title' | 'type' | 'connections' | 'updated'
type SortDir = 'asc' | 'desc'

type RecentPage = { slug: string; title: string; type: string; updatedAt: string | Date }
type RecentLog  = { _id: string; operation: string; title?: string; message?: string; summary?: string; createdAt: string | Date }
type DashboardData = {
  vault?: Record<string, unknown> & { name?: string; nodeCount?: number; edgeCount?: number; pageCount?: number; sourceCount?: number }
  plan?: Record<string, unknown> & { tier?: string; plan?: string; limit?: number; used?: number; queriesThisMonth?: number; ingestsThisMonth?: number }
  recentLogs?: RecentLog[]
  recentPages?: RecentPage[]
  graph?: { nodes: GraphNode[]; edges: GraphEdge[]; rebuiltAt?: string }
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  // focusId drives animated pan/zoom in the graph — a single render-count
  // bump per select so back-to-back clicks on the same row re-trigger.
  const [focusId, setFocusId] = useState<string | null>(null)
  const [focusNonce, setFocusNonce] = useState(0)
  const [timeFilter, setTimeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [panelTab, setPanelTab] = useState<'node' | 'activity'>('activity')
  const [view, setView] = useState<'graph' | 'table'>('graph')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ensure = await fetch('/api/vault/ensure', { method: 'POST' })
        if (!ensure.ok) throw new Error(`vault/ensure ${ensure.status}`)
        const r = await fetch('/api/dashboard')
        if (!r.ok) throw new Error(`dashboard ${r.status}`)
        const d = await r.json()
        if (cancelled) return
        setData(d)
      } catch (e: unknown) {
        if (cancelled) return
        console.error('[dashboard] load failed', e)
        setError(e instanceof Error ? e.message : 'Failed to load dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleNodeClick = useCallback((node: GraphNode | null) => {
    setSelectedNode(node)
    if (node) setPanelTab('node')
    else setPanelTab('activity')
  }, [])

  // Derive everything we need for the table BEFORE any early return so that
  // the hook order stays identical across loading / error / loaded renders.
  const rawNodes: GraphNode[] = useMemo(() => data?.graph?.nodes ?? [], [data])
  const rawEdges: GraphEdge[] = useMemo(() => data?.graph?.edges ?? [], [data])

  const { nodes: filteredNodes, edges: filteredEdges } = useMemo(
    () => filterByTime(rawNodes, rawEdges, timeFilter),
    [rawNodes, rawEdges, timeFilter],
  )

  const searchedNodes = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q
      ? filteredNodes.filter(n => n.title.toLowerCase().includes(q))
      : filteredNodes
  }, [filteredNodes, search])

  const tableRows = useMemo(() => {
    const rows = [...searchedNodes]
    rows.sort((a, b) => {
      let av: string | number = 0
      let bv: string | number = 0
      switch (sortKey) {
        case 'title':       av = a.title?.toLowerCase() ?? ''; bv = b.title?.toLowerCase() ?? ''; break
        case 'type':        av = a.type ?? ''; bv = b.type ?? ''; break
        case 'connections': av = a.connectionCount ?? 0; bv = b.connectionCount ?? 0; break
        case 'updated':     av = new Date(a.updatedAt ?? 0).getTime(); bv = new Date(b.updatedAt ?? 0).getTime(); break
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [searchedNodes, sortKey, sortDir])

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ background: 'var(--bg)' }}>
      <div className="text-center fade-up">
        <div
          className="w-8 h-8 rounded-full animate-spin mx-auto mb-4"
          style={{
            border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
            borderTopColor: 'var(--accent)',
          }}
        />
        <p className="mono text-[10px] text-[var(--text-muted)] tracking-widest">LOADING KNOWLEDGE GRAPH...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-full" style={{ background: 'var(--bg)' }}>
      <div
        className="text-center max-w-md mx-auto p-6 rounded-2xl fade-up"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-bright)' }}
      >
        <p className="mono text-[10px] tracking-widest mb-2" style={{ color: 'var(--accent-bright)' }}>
          DASHBOARD · UNAVAILABLE
        </p>
        <p className="text-sm text-[var(--text-primary)] mb-2">Couldn&apos;t reach the vault.</p>
        <p className="mono text-[11px] text-[var(--text-muted)] mb-4">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); location.reload() }}
          className="px-4 py-2 rounded-lg text-xs font-semibold"
          style={{
            background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
            color: '#0b0b0d',
          }}
        >
          Retry
        </button>
      </div>
    </div>
  )

  const { vault, plan, recentLogs = [], recentPages = [] } = data ?? {}
  const rebuiltAt = data?.graph?.rebuiltAt ?? ''

  const highlightId = search.trim() ? (searchedNodes[0]?.id ?? null) : null

  const isDemo = rawNodes.length === 0
  const rebuiltLabel = rebuiltAt
    ? new Date(rebuiltAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—'

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir(k === 'title' || k === 'type' ? 'asc' : 'desc') }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Top command bar ─────────────────────────────────── */}
      <div
        className="shrink-0 px-5 py-3 border-b border-[var(--border)] flex items-center gap-4 fade-up"
        style={{ background: 'var(--surface)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest leading-none mb-0.5">COMMAND CENTER</p>
            <h1 className="text-sm font-bold text-[var(--text-primary)] leading-none">Knowledge Graph</h1>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[10px] mono text-[var(--text-muted)] ml-2 fade-up-delay-1">
            <span className="tabular-nums">{filteredNodes.length} <span className="opacity-60">nodes</span></span>
            <span className="opacity-50">·</span>
            <span className="tabular-nums">{filteredEdges.length} <span className="opacity-60">edges</span></span>
            <span className="opacity-50">·</span>
            <span className="tabular-nums">{vault?.sourceCount ?? 0} <span className="opacity-60">sources</span></span>
            {rebuiltAt && (
              <>
                <span className="opacity-50">·</span>
                <span className="opacity-60">rebuilt {rebuiltLabel}</span>
              </>
            )}
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2 mx-2 fade-up-delay-2">
          <CountChip label="PAGES"   value={vault?.pageCount ?? 0}       tone="accent" />
          <CountChip label="SOURCES" value={vault?.sourceCount ?? 0}     tone="silver" />
          <CountChip label="QUERIES" value={plan?.queriesThisMonth ?? 0} tone="silver" />
          <CountChip
            label={plan?.plan === 'pro' ? 'PRO' : 'FREE'}
            value={plan?.plan === 'free'
              ? `${Math.max(0, 25 - (plan?.ingestsThisMonth ?? 0))} left`
              : '∞'}
            tone="accent"
          />
        </div>

        <div className="flex-1" />

        {/* View toggle: Graph / Table */}
        <div
          className="flex items-center gap-0.5 rounded-lg p-0.5 fade-up-delay-2"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          {([
            { value: 'graph', label: 'GRAPH', Icon: Network },
            { value: 'table', label: 'TABLE', Icon: TableIcon },
          ] as const).map(opt => {
            const on = view === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setView(opt.value)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md mono text-[10px] font-medium transition-all"
                style={
                  on
                    ? {
                        background: 'color-mix(in srgb, var(--accent) 70%, transparent)',
                        color: '#0b0b0d',
                        border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
                      }
                    : { color: 'var(--text-muted)', border: '1px solid transparent' }
                }
              >
                <opt.Icon className="w-3 h-3" />
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative fade-up-delay-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)] pointer-events-none" />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search nodes…"
            className="rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none transition-all w-40 focus:w-52"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div
          className="flex items-center gap-0.5 rounded-lg p-0.5 fade-up-delay-3"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          {TIME_FILTERS.map(f => {
            const on = timeFilter === f.value
            return (
              <button
                key={f.value}
                onClick={() => setTimeFilter(f.value)}
                className="px-2.5 py-1 rounded-md mono text-[10px] font-medium transition-all"
                style={
                  on
                    ? {
                        background: 'color-mix(in srgb, var(--accent) 70%, transparent)',
                        color: '#0b0b0d',
                        border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
                      }
                    : { color: 'var(--text-muted)', border: '1px solid transparent' }
                }
              >
                {f.label}
              </button>
            )
          })}
        </div>

        <Link
          href="/app/ingest"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all fade-up-delay-4"
          style={{
            background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
            color: '#0b0b0d',
            boxShadow: '0 8px 20px -8px color-mix(in srgb, var(--accent) 55%, transparent)',
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Ingest
        </Link>
      </div>

      {/* ── Main: (Graph or Table) + Right Panel ────────────── */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Left canvas */}
        <div
          key={view}
          className="flex-1 relative overflow-hidden fade-up-delay-1"
        >
          {view === 'graph' ? (
            <>
              <KnowledgeGraph
                nodes={filteredNodes}
                edges={filteredEdges}
                selectedId={selectedNode?.id}
                highlightId={highlightId}
                focusNodeId={focusId}
                focusNonce={focusNonce}
                onNodeClick={handleNodeClick}
              />

              {isDemo && (
                <>
                  {/* Header chip — labels the orbit as a preview without
                      covering it, so the graph itself is the empty state. */}
                  <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none fade-up-delay-2">
                    <span
                      className="mono text-[9px] px-2 py-1 rounded tracking-widest"
                      style={{
                        color: 'var(--accent-bright)',
                        background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--accent) 24%, transparent)',
                      }}
                    >
                      PREVIEW · ORBIT
                    </span>
                    <span className="mono text-[9px] text-[var(--text-muted)] tracking-widest">
                      INGEST A SOURCE TO POPULATE
                    </span>
                  </div>

                  {/* Compact CTA pinned bottom-right so the orbit reads cleanly. */}
                  <Link
                    href="/app/ingest"
                    className="absolute bottom-5 right-5 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 pointer-events-auto fade-up-delay-3"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                      color: '#0b0b0d',
                      boxShadow: '0 12px 28px -12px color-mix(in srgb, var(--accent) 55%, transparent)',
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add first source
                  </Link>
                </>
              )}

              {!isDemo && (
                <div className="absolute bottom-4 left-4 mono text-[9px] text-[var(--text-muted)] tracking-widest pointer-events-none">
                  SCROLL ZOOM · DRAG NODE · DOUBLE-CLICK FOCUS · CLICK TABLE ROW TO SYNC
                </div>
              )}
            </>
          ) : (
            <NodeTable
              rows={tableRows}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              onSelect={n => {
                setSelectedNode(n); setPanelTab('node')
                // Mirror the selection in the graph viewport so a row-click
                // in the table pans the canvas to the same node.
                setFocusId(n.id); setFocusNonce(x => x + 1)
              }}
              selectedId={selectedNode?.id}
              highlightId={highlightId}
              isDemo={isDemo}
            />
          )}
        </div>

        {/* ── Right panel ─────────────────────────────────── */}
        <div
          className="w-80 shrink-0 border-l border-[var(--border)] flex flex-col overflow-hidden fade-up-delay-2"
          style={{ background: 'var(--surface)' }}
        >

          <div className="shrink-0 flex items-center border-b border-[var(--border)]">
            <button
              onClick={() => setPanelTab('activity')}
              className="flex-1 py-3 text-[10px] mono tracking-wider font-medium transition-colors"
              style={
                panelTab === 'activity'
                  ? { color: 'var(--text-primary)', borderBottom: '1px solid var(--accent)' }
                  : { color: 'var(--text-muted)', borderBottom: '1px solid transparent' }
              }
            >
              ACTIVITY
            </button>
            <button
              onClick={() => setPanelTab('node')}
              className="flex-1 py-3 text-[10px] mono tracking-wider font-medium transition-colors"
              style={
                panelTab === 'node'
                  ? { color: 'var(--text-primary)', borderBottom: '1px solid var(--accent)' }
                  : { color: 'var(--text-muted)', borderBottom: '1px solid transparent' }
              }
            >
              NODE INFO
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {panelTab === 'activity' && (
              <div className="p-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest">RECENT PAGES</p>
                    <Link
                      href="/app/wiki"
                      className="mono text-[9px] flex items-center gap-0.5 transition-colors"
                      style={{ color: 'var(--accent-bright)' }}
                    >
                      ALL <ArrowRight className="w-2.5 h-2.5" />
                    </Link>
                  </div>
                  {recentPages.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] py-4 text-center">No pages yet</p>
                  ) : (
                    <div className="space-y-1">
                      {recentPages.slice(0, 5).map((p: RecentPage, i: number) => (
                        <Link
                          key={p.slug}
                          href={`/app/wiki/${p.slug}`}
                          className="flex items-center gap-2 p-2 rounded-lg transition-colors group hover:bg-[var(--surface-2)]"
                          style={{ animation: `fade-up 0.5s var(--ease-out-expo) ${0.15 + i * 0.05}s both` }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: TYPE_COLOR[p.type] ?? SILVER }}
                          />
                          <p className="text-[11px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] flex-1 truncate transition-colors font-medium">{p.title}</p>
                          <p className="mono text-[9px] text-[var(--text-muted)] shrink-0">{timeAgo(p.updatedAt)}</p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-[var(--border)] pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest">SYSTEM LOG</p>
                    <Link href="/app/log" className="mono text-[9px]" style={{ color: 'var(--accent-bright)' }}>ALL →</Link>
                  </div>
                  {recentLogs.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] py-4 text-center">No activity yet</p>
                  ) : (
                    <div className="space-y-2">
                      {recentLogs.map((log: RecentLog, i: number) => (
                        <div
                          key={log._id}
                          className="flex items-start gap-2 py-1.5 border-b border-[var(--border)] last:border-0"
                          style={{ animation: `fade-up 0.5s var(--ease-out-expo) ${0.3 + i * 0.05}s both` }}
                        >
                          <span className={`mono text-[9px] font-bold shrink-0 mt-0.5 tracking-wider ${OP_COLOR[log.operation] ?? 'text-[var(--text-muted)]'}`}>
                            {log.operation?.toUpperCase().slice(0, 6)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-[var(--text-secondary)] truncate leading-relaxed">{log.summary}</p>
                            <p className="mono text-[9px] text-[var(--text-muted)] mt-0.5">{timeAgo(log.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-[var(--border)] pt-4">
                  <Link
                    href="/app/ingest"
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all group"
                    style={{
                      border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
                      background: 'color-mix(in srgb, var(--accent) 5%, transparent)',
                    }}
                  >
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-primary)] transition-colors">Add to knowledge base</p>
                      <p className="mono text-[9px] text-[var(--text-muted)] mt-0.5">URL or text → wiki pages</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" style={{ color: 'var(--accent-bright)' }} />
                  </Link>
                </div>
              </div>
            )}

            {panelTab === 'node' && !selectedNode && (
              <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <BookOpen className="w-5 h-5 text-[var(--text-muted)]" />
                </div>
                <p className="text-xs text-[var(--text-secondary)] font-medium mb-1">No node selected</p>
                <p className="text-[11px] text-[var(--text-muted)]">Click any node in the graph or a row in the table to inspect.</p>
              </div>
            )}

            {panelTab === 'node' && selectedNode && (
              <div key={selectedNode.id} className="p-4 fade-up">
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div className="flex-1 min-w-0">
                    <div
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border mono text-[9px] font-bold tracking-wider mb-2"
                      style={{
                        color: TYPE_COLOR[selectedNode.type] ?? SILVER,
                        borderColor: `${TYPE_COLOR[selectedNode.type] ?? SILVER}30`,
                        background: `${TYPE_COLOR[selectedNode.type] ?? SILVER}10`,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: TYPE_COLOR[selectedNode.type] ?? SILVER }}
                      />
                      {selectedNode.type?.toUpperCase()}
                    </div>
                    <h2 className="text-sm font-bold text-[var(--text-primary)] leading-snug">{selectedNode.title}</h2>
                  </div>
                  <button
                    onClick={() => { setSelectedNode(null); setPanelTab('activity') }}
                    className="w-6 h-6 flex items-center justify-center rounded-md transition-colors shrink-0 hover:bg-[var(--surface-2)]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {selectedNode.updatedAt && (
                  <p className="mono text-[9px] text-[var(--text-muted)] mb-3">
                    Updated {timeAgo(selectedNode.updatedAt)}
                    {selectedNode.createdAt && ` · Created ${timeAgo(selectedNode.createdAt)}`}
                  </p>
                )}

                {(selectedNode.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {(selectedNode.tags ?? []).map((tag: string) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded text-[10px] mono"
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {selectedNode.summary && (
                  <div
                    className="mb-4 p-3 rounded-xl"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{selectedNode.summary}</p>
                  </div>
                )}

                <div className="mb-4">
                  <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest mb-2">
                    CONNECTIONS ({selectedNode.connectionCount})
                  </p>
                  {selectedNode.connectionCount === 0 ? (
                    <p className="text-[11px] text-[var(--text-muted)]">No connections yet</p>
                  ) : (
                    <div className="space-y-1">
                      {rawEdges
                        .filter((e: GraphEdge) => e.source === selectedNode.id || e.target === selectedNode.id)
                        .slice(0, 8)
                        .map((e: GraphEdge) => {
                          const relId = e.source === selectedNode.id ? e.target : e.source
                          const rel = rawNodes.find((n: GraphNode) => n.id === relId)
                          if (!rel) return null
                          return (
                            <button
                              key={relId}
                              onClick={() => {
                                setSelectedNode(rel); setPanelTab('node')
                                setFocusId(rel.id); setFocusNonce(x => x + 1)
                              }}
                              className="w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left group hover:bg-[var(--surface-2)]"
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: TYPE_COLOR[rel.type] ?? SILVER }}
                              />
                              <span className="text-[11px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] flex-1 truncate transition-colors">{rel.title}</span>
                            </button>
                          )
                        })}
                    </div>
                  )}
                </div>

                {!isDemo && (
                  <Link
                    href={`/app/wiki/${selectedNode.id}`}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl transition-all text-xs font-medium"
                    style={{
                      border: '1px solid var(--border-bright)',
                      background: 'var(--surface-2)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open full wiki page
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Table view — sortable, row-stagger animated
   ══════════════════════════════════════════════════════════ */

function SortHeader({
  label, k, sortKey, sortDir, onSort, align = 'left',
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const on = sortKey === k
  return (
    <button
      onClick={() => onSort(k)}
      className="mono text-[9px] tracking-widest flex items-center gap-1 w-full transition-colors"
      style={{
        color: on ? 'var(--accent-bright)' : 'var(--text-muted)',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      {label}
      {on && (sortDir === 'asc'
        ? <ArrowUp className="w-2.5 h-2.5" />
        : <ArrowDown className="w-2.5 h-2.5" />)}
    </button>
  )
}

function NodeTable({
  rows, sortKey, sortDir, onSort, onSelect, selectedId, highlightId, isDemo,
}: {
  rows: GraphNode[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  onSelect: (n: GraphNode) => void
  selectedId?: string
  highlightId?: string | null
  isDemo: boolean
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <TableIcon className="w-5 h-5 text-[var(--text-muted)]" />
        </div>
        <p className="text-sm text-[var(--text-primary)] font-medium mb-1">
          {isDemo ? 'No nodes yet' : 'No rows match your filters'}
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">
          {isDemo
            ? 'Ingest your first source to populate the table.'
            : 'Try clearing the search or widening the time window.'}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full text-left" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead
          className="sticky top-0 z-10"
          style={{
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <tr>
            <th className="px-5 py-3 w-[46%]">
              <SortHeader label="TITLE" k="title" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            </th>
            <th className="px-3 py-3 w-[18%]">
              <SortHeader label="TYPE" k="type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            </th>
            <th className="px-3 py-3 w-[14%]">
              <SortHeader label="CONNECTIONS" k="connections" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            </th>
            <th className="px-5 py-3 w-[22%]">
              <SortHeader label="UPDATED" k="updated" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n, i) => {
            const tone = TYPE_COLOR[n.type] ?? SILVER
            const isSelected = n.id === selectedId
            const isHighlight = n.id === highlightId
            return (
              <tr
                key={n.id}
                onClick={() => onSelect(n)}
                className="cursor-pointer transition-colors"
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: isSelected
                    ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                    : isHighlight
                      ? 'color-mix(in srgb, var(--accent) 5%, transparent)'
                      : 'transparent',
                  animation: `fade-up 0.4s var(--ease-out-expo) ${Math.min(i * 0.02, 0.6)}s both`,
                }}
                onMouseEnter={e => {
                  if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)'
                }}
                onMouseLeave={e => {
                  if (!isSelected) {
                    e.currentTarget.style.background = isHighlight
                      ? 'color-mix(in srgb, var(--accent) 5%, transparent)'
                      : 'transparent'
                  }
                }}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: tone, boxShadow: `0 0 8px ${tone}60` }}
                    />
                    <span className="text-xs text-[var(--text-primary)] font-medium truncate">
                      {n.title}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span
                    className="mono text-[9px] px-2 py-0.5 rounded border tracking-wider font-medium"
                    style={{
                      color: tone,
                      borderColor: `${tone}30`,
                      background: `${tone}10`,
                    }}
                  >
                    {n.type?.toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-3 text-right">
                  <span className="mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                    {n.connectionCount ?? 0}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <span className="mono text-[10px] text-[var(--text-muted)]">
                    {n.updatedAt ? timeAgo(n.updatedAt) : '—'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
