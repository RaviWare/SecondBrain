'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Plus, X, ArrowRight, ExternalLink, Sparkles,
  BookOpen, Search, Network, Table as TableIcon,
  ArrowUp, ArrowDown, Database, Orbit, Activity, Clock3, Filter, Zap,
  MousePointerClick, MoveDiagonal, Target, ChevronRight, Rows3, ScanSearch,
} from 'lucide-react'
import { KnowledgeGraph, GraphNode, GraphEdge } from '@/components/graph/KnowledgeGraph'
import { timeAgo } from '@/lib/utils'

const ACCENT = '#ff7a1f'
const SILVER = '#c8c8cf'
const MUTED = '#6e6e78'

const TYPE_COLOR: Record<string, string> = {
  concept: ACCENT,
  person: SILVER,
  organization: ACCENT,
  entity: SILVER,
  tool: ACCENT,
  synthesis: SILVER,
  pattern: ACCENT,
  event: SILVER,
  'source-summary': MUTED,
  'query-answer': MUTED,
}

const TYPE_LABEL: Record<string, string> = {
  concept: 'Concept',
  entity: 'Entity',
  synthesis: 'Synthesis',
  pattern: 'Pattern',
  'source-summary': 'Source',
  'query-answer': 'Answer',
}

const OP_COLOR: Record<string, string> = {
  ingest: 'text-[var(--accent-bright)]',
  query: 'text-[var(--text-primary)]',
  lint: 'text-[var(--text-muted)]',
}

const TIME_FILTERS = [
  { label: 'All Time', value: 'all' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
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

function useCountUp(target: number, ms = 900) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setVal(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return val
}

function CountChip({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone: 'accent' | 'silver'
}) {
  const numeric = typeof value === 'number'
  const counted = useCountUp(numeric ? value : 0)
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
type RecentLog = { _id: string; operation: string; summary?: string; createdAt: string | Date }
type DashboardData = {
  vault?: Record<string, unknown> & {
    name?: string
    pageCount?: number
    sourceCount?: number
  }
  plan?: Record<string, unknown> & {
    plan?: string
    queriesThisMonth?: number
    ingestsThisMonth?: number
  }
  recentLogs?: RecentLog[]
  recentPages?: RecentPage[]
  graph?: { nodes: GraphNode[]; edges: GraphEdge[]; rebuiltAt?: string }
}

const SORT_LABEL: Record<SortKey, string> = {
  title: 'Title',
  type: 'Type',
  connections: 'Connections',
  updated: 'Updated',
}

function freshnessLabel(updatedAt?: string) {
  if (!updatedAt) return 'Untracked'
  const age = Date.now() - new Date(updatedAt).getTime()
  const days = age / (1000 * 60 * 60 * 24)
  if (days <= 7) return 'Fresh'
  if (days <= 30) return 'Active'
  return 'Aging'
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
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
        const res = await fetch('/api/dashboard')
        if (!res.ok) throw new Error(`dashboard ${res.status}`)
        const json = await res.json()
        if (!cancelled) setData(json)
      } catch (e: unknown) {
        if (!cancelled) {
          console.error('[dashboard] load failed', e)
          setError(e instanceof Error ? e.message : 'Failed to load dashboard')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const rawNodes: GraphNode[] = useMemo(() => data?.graph?.nodes ?? [], [data])
  const rawEdges: GraphEdge[] = useMemo(() => data?.graph?.edges ?? [], [data])

  const { nodes: filteredNodes, edges: filteredEdges } = useMemo(
    () => filterByTime(rawNodes, rawEdges, timeFilter),
    [rawNodes, rawEdges, timeFilter],
  )

  const searchedNodes = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q
      ? filteredNodes.filter(n =>
          n.title.toLowerCase().includes(q) ||
          (n.summary ?? '').toLowerCase().includes(q) ||
          (n.tags ?? []).some(tag => tag.toLowerCase().includes(q)))
      : filteredNodes
  }, [filteredNodes, search])

  const tableRows = useMemo(() => {
    const rows = [...searchedNodes]
    rows.sort((a, b) => {
      let av: string | number = 0
      let bv: string | number = 0
      switch (sortKey) {
        case 'title': av = a.title?.toLowerCase() ?? ''; bv = b.title?.toLowerCase() ?? ''; break
        case 'type': av = a.type ?? ''; bv = b.type ?? ''; break
        case 'connections': av = a.connectionCount ?? 0; bv = b.connectionCount ?? 0; break
        case 'updated': av = new Date(a.updatedAt ?? 0).getTime(); bv = new Date(b.updatedAt ?? 0).getTime(); break
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [searchedNodes, sortKey, sortDir])

  const handleNodeSelect = (node: GraphNode | null) => {
    setSelectedNode(node)
    if (node) {
      setPanelTab('node')
      setFocusId(node.id)
      setFocusNonce(x => x + 1)
    } else {
      setPanelTab('activity')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: 'var(--bg)' }}>
        <div className="text-center fade-up">
          <div
            className="w-8 h-8 rounded-full animate-spin mx-auto mb-4"
            style={{
              border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
              borderTopColor: 'var(--accent)',
            }}
          />
          <p className="mono text-[10px] text-[var(--text-muted)] tracking-widest">
            LOADING SECONDBRAIN COMMAND CENTER...
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
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
  }

  const { vault, plan, recentLogs = [], recentPages = [] } = data ?? {}
  const rebuiltAt = data?.graph?.rebuiltAt ?? ''
  const isDemo = rawNodes.length === 0
  const highlightId = search.trim() ? (searchedNodes[0]?.id ?? null) : null
  const rebuiltLabel = rebuiltAt
    ? new Date(rebuiltAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—'

  const nodesShown = searchedNodes.length
  const graphDensity = filteredNodes.length > 1
    ? Math.round((filteredEdges.length / filteredNodes.length) * 100) / 100
    : 0
  const connectedNodes = filteredNodes.filter(n => n.connectionCount > 0).length
  const coverage = filteredNodes.length > 0 ? Math.round((connectedNodes / filteredNodes.length) * 100) : 0
  const topNode = [...filteredNodes].sort((a, b) => (b.connectionCount ?? 0) - (a.connectionCount ?? 0))[0] ?? null
  const freshestNode = [...filteredNodes]
    .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())[0] ?? null
  const typeBreakdown = Object.entries(
    filteredNodes.reduce<Record<string, number>>((acc, node) => {
      acc[node.type] = (acc[node.type] ?? 0) + 1
      return acc
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
  const ingestsThisMonth = plan?.ingestsThisMonth ?? 0
  const freeIngestsLeft = Math.max(0, 25 - ingestsThisMonth)
  const planLabel = plan?.plan === 'pro' ? 'Pro' : 'Free'
  const vaultName = vault?.name || 'My Second Brain'
  const connectionMax = Math.max(...tableRows.map(node => node.connectionCount ?? 0), 1)

  const metrics = [
    {
      label: 'Pages',
      value: vault?.pageCount ?? 0,
      meta: `${nodesShown} visible in current view`,
      tone: 'accent' as const,
      icon: BookOpen,
    },
    {
      label: 'Sources',
      value: vault?.sourceCount ?? 0,
      meta: `${ingestsThisMonth} ingests this month`,
      tone: 'silver' as const,
      icon: Database,
    },
    {
      label: 'Graph Density',
      value: graphDensity.toFixed(2),
      meta: `${filteredEdges.length} live relationships`,
      tone: 'accent' as const,
      icon: Orbit,
    },
    {
      label: 'Coverage',
      value: `${coverage}%`,
      meta: topNode ? `Most connected: ${topNode.title}` : 'Waiting for first ingest',
      tone: 'silver' as const,
      icon: Sparkles,
    },
  ]

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(k)
      setSortDir(k === 'title' || k === 'type' ? 'asc' : 'desc')
    }
  }

  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--bg)' }}>
      <div className="p-5 md:p-6">
        <div className="mx-auto max-w-[1680px]">
          <section
            className="relative overflow-hidden rounded-[24px] border p-5 md:p-6"
            style={{
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface) 90%, transparent), color-mix(in srgb, var(--surface-2) 84%, transparent))',
              borderColor: 'var(--border-bright)',
              boxShadow: 'var(--shadow-2)',
            }}
          >
            <div className="absolute inset-0 grid-bg opacity-[0.09] pointer-events-none" />
            <div
              className="absolute -left-24 top-0 h-64 w-64 rounded-full blur-3xl pointer-events-none"
              style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
            />
            <div className="relative z-[1] space-y-5">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Pill tone="accent">SECONDBRAIN COMMAND CENTER</Pill>
                    <Pill tone="silver">{planLabel.toUpperCase()} PLAN</Pill>
                    <span className="mono text-[10px] text-[var(--text-muted)] tracking-widest">
                      REBUILT {rebuiltLabel}
                    </span>
                  </div>
                  <h1 className="text-2xl md:text-[2.2rem] font-semibold tracking-tight text-[var(--text-primary)] leading-tight">
                    {vaultName}
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm md:text-[15px] leading-7 text-[var(--text-secondary)]">
                    Review what your SecondBrain knows, how the graph is evolving, and where to add the next source.
                    The workspace below is tuned for scanning, drilling in, and moving between graph exploration and page-level action.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[500px]">
                  {metrics.map(metric => (
                    <MetricCard key={metric.label} {...metric} />
                  ))}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.3fr_0.9fr]">
                <div
                  className="rounded-2xl border p-4"
                  style={{
                    background: 'color-mix(in srgb, var(--surface) 74%, transparent)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <p className="mono text-[10px] tracking-widest text-[var(--text-muted)] mb-1">
                        LIVE WORKSPACE
                      </p>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        Graph and table stay in sync as you inspect the vault.
                      </p>
                    </div>
                    <div className="hidden md:flex items-center gap-2">
                      <CountChip label="VISIBLE" value={nodesShown} tone="accent" />
                      <CountChip label="EDGES" value={filteredEdges.length} tone="silver" />
                      <CountChip
                        label={plan?.plan === 'pro' ? 'PLAN' : 'FREE LEFT'}
                        value={plan?.plan === 'pro' ? '∞' : `${freeIngestsLeft}`}
                        tone="accent"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <QuickStrip
                      icon={Activity}
                      label="Recent activity"
                      value={recentLogs.length ? recentLogs[0]?.operation?.toUpperCase() : 'NONE'}
                      hint={recentLogs.length ? recentLogs[0]?.summary ?? 'Latest log recorded' : 'No operations yet'}
                    />
                    <QuickStrip
                      icon={Clock3}
                      label="Freshness"
                      value={recentPages[0]?.updatedAt ? timeAgo(recentPages[0].updatedAt).toUpperCase() : 'NEW'}
                      hint={recentPages[0]?.title ?? 'Your next ingest will create the first page'}
                    />
                    <QuickStrip
                      icon={Zap}
                      label="Focus node"
                      value={selectedNode ? TYPE_LABEL[selectedNode.type] ?? selectedNode.type : 'NONE'}
                      hint={selectedNode?.title ?? 'Select a node to open quick facts'}
                    />
                  </div>
                </div>

                <div
                  className="rounded-2xl border p-4"
                  style={{
                    background: 'color-mix(in srgb, var(--surface) 74%, transparent)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <p className="mono text-[10px] tracking-widest text-[var(--text-muted)] mb-1">
                        QUICK ACTIONS
                      </p>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        Jump into the next useful move.
                      </p>
                    </div>
                    <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-bright)' }} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <ActionLink
                      href="/app/ingest"
                      eyebrow="INGEST"
                      title="Add fresh context"
                      body="Bring in a source and let the vault expand itself."
                      accent
                    />
                    <ActionLink
                      href="/app/query"
                      eyebrow="QUERY"
                      title="Interrogate the graph"
                      body="Ask what the system already knows across pages."
                    />
                    <ActionLink
                      href="/app/wiki"
                      eyebrow="WIKI"
                      title="Browse the knowledge base"
                      body="Open the latest pages, concepts, and summaries."
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div
              className="overflow-hidden rounded-[24px] border"
              style={{
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface) 94%, transparent), color-mix(in srgb, var(--surface-2) 88%, transparent))',
                borderColor: 'var(--border-bright)',
                boxShadow: 'var(--shadow-2)',
              }}
            >
              <div className="border-b border-[var(--border)] px-5 py-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Pill tone="accent">{view === 'graph' ? 'GRAPH MODE' : 'TABLE MODE'}</Pill>
                      <Pill tone="silver">{nodesShown} NODES IN VIEW</Pill>
                      <span className="mono text-[10px] text-[var(--text-muted)] tracking-widest">
                        {view === 'graph'
                          ? 'PAN, ZOOM, DOUBLE-CLICK TO FOCUS'
                          : 'SORT, SCAN, CLICK ROW TO FOCUS'}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                      {view === 'graph' ? 'Knowledge Map' : 'Knowledge Index'}
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                      {view === 'graph'
                        ? 'Explore the structure of your SecondBrain as a live graph with focus, density, and relationship cues layered directly into the canvas.'
                        : 'Scan the vault as a ranked table with stronger row context, connection strength, freshness, and type-level detail.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      className="flex items-center gap-0.5 rounded-lg p-0.5"
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
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md mono text-[10px] font-medium transition-all"
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

                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
                      <input
                        ref={searchRef}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search titles, summaries, tags..."
                        className="rounded-lg pl-8 pr-3 py-2 text-xs outline-none transition-all w-60"
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>

                    <div
                      className="flex items-center gap-0.5 rounded-lg p-0.5"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                    >
                      {TIME_FILTERS.map(filter => {
                        const on = timeFilter === filter.value
                        return (
                          <button
                            key={filter.value}
                            onClick={() => setTimeFilter(filter.value)}
                            className="px-2.5 py-1.5 rounded-md mono text-[10px] font-medium transition-all"
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
                            {filter.label}
                          </button>
                        )
                      })}
                    </div>

                    <Link
                      href="/app/ingest"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
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
                </div>
              </div>

              <div className="border-b border-[var(--border)] px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <InlineMetric label="Nodes" value={filteredNodes.length} />
                  <InlineMetric label="Edges" value={filteredEdges.length} />
                  <InlineMetric label="Connected" value={`${coverage}%`} />
                  {search.trim() && <InlineMetric label="Search" value={search.trim()} icon={Search} />}
                  {timeFilter !== 'all' && <InlineMetric label="Window" value={TIME_FILTERS.find(f => f.value === timeFilter)?.label ?? timeFilter} icon={Filter} />}
                </div>
              </div>

              <div className="h-[calc(100vh-330px)] min-h-[640px] overflow-hidden">
                {view === 'graph' ? (
                  <div className="relative h-full">
                    <KnowledgeGraph
                      nodes={filteredNodes}
                      edges={filteredEdges}
                      selectedId={selectedNode?.id}
                      highlightId={highlightId}
                      focusNodeId={focusId}
                      focusNonce={focusNonce}
                      onNodeClick={handleNodeSelect}
                    />

                    <div className="pointer-events-none absolute left-4 top-4 flex max-w-[300px] flex-col gap-3">
                      <GraphOverlayCard
                        eyebrow="GRAPH TELEMETRY"
                        title={selectedNode ? selectedNode.title : topNode?.title ?? 'Viewport ready'}
                        body={
                          selectedNode
                            ? `${TYPE_LABEL[selectedNode.type] ?? selectedNode.type} node with ${selectedNode.connectionCount ?? 0} connections. Double-click any node to center it.`
                            : topNode
                              ? `Most connected node in view with ${topNode.connectionCount ?? 0} live links across the current window.`
                              : 'Ingest a source to replace the preview orbit with your real knowledge graph.'
                        }
                      >
                        <div className="flex flex-wrap gap-2">
                          <OverlayChip icon={Target} label="Focus" value={selectedNode ? 'Pinned' : 'Auto'} />
                          <OverlayChip icon={ScanSearch} label="Matches" value={search.trim() ? `${nodesShown}` : 'All'} />
                          <OverlayChip icon={Orbit} label="Density" value={graphDensity.toFixed(2)} />
                        </div>
                      </GraphOverlayCard>

                      <GraphOverlayCard
                        eyebrow="NODE MIX"
                        title="Types in view"
                        body="A quick read on what this slice of the vault is made of right now."
                      >
                        <div className="space-y-2">
                          {typeBreakdown.length === 0 ? (
                            <p className="text-[11px] leading-5 text-[var(--text-muted)]">
                              No node types to summarize yet.
                            </p>
                          ) : (
                            typeBreakdown.map(([type, count]) => (
                              <div key={type} className="flex items-center gap-3">
                                <span
                                  className="h-2 w-2 rounded-full shrink-0"
                                  style={{ background: TYPE_COLOR[type] ?? SILVER }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="mono text-[10px] tracking-widest text-[var(--text-secondary)]">
                                      {(TYPE_LABEL[type] ?? type).toUpperCase()}
                                    </span>
                                    <span className="mono text-[10px] text-[var(--text-primary)]">{count}</span>
                                  </div>
                                  <div
                                    className="mt-1 h-1.5 overflow-hidden rounded-full"
                                    style={{ background: 'color-mix(in srgb, var(--surface) 65%, transparent)' }}
                                  >
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${Math.max((count / Math.max(filteredNodes.length, 1)) * 100, 8)}%`,
                                        background: TYPE_COLOR[type] ?? SILVER,
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </GraphOverlayCard>
                    </div>

                    <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                      <div className="flex flex-wrap gap-2">
                        <GraphHint icon={MousePointerClick} label="Click to inspect" />
                        <GraphHint icon={MoveDiagonal} label="Drag canvas to pan" />
                        <GraphHint icon={Target} label="Double-click to focus" />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <GraphFooterStat label="Freshest node" value={freshestNode?.title ?? 'Waiting'} />
                        <GraphFooterStat label="Coverage" value={`${coverage}% linked`} />
                        <GraphFooterStat label="View window" value={TIME_FILTERS.find(f => f.value === timeFilter)?.label ?? 'All Time'} />
                      </div>
                    </div>

                    {isDemo && (
                      <>
                        <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
                          <Pill tone="accent">PREVIEW ORBIT</Pill>
                          <span className="mono text-[9px] text-[var(--text-muted)] tracking-widest">
                            INGEST A SOURCE TO POPULATE THE MAP
                          </span>
                        </div>
                        <Link
                          href="/app/ingest"
                          className="absolute bottom-5 right-5 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                          style={{
                            background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                            color: '#0b0b0d',
                            boxShadow: '0 12px 28px -12px color-mix(in srgb, var(--accent) 55%, transparent)',
                          }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add first source
                        </Link>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full flex-col">
                    <div className="border-b border-[var(--border)] px-5 py-3">
                      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                        <div
                          className="rounded-xl border px-4 py-3"
                          style={{
                            background: 'color-mix(in srgb, var(--surface-2) 52%, transparent)',
                            borderColor: 'var(--border)',
                          }}
                        >
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="mono text-[10px] tracking-widest text-[var(--text-muted)]">
                              TABLE READOUT
                            </span>
                            <Rows3 className="w-3.5 h-3.5" style={{ color: 'var(--accent-bright)' }} />
                          </div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {tableRows.length} rows sorted by {SORT_LABEL[sortKey]}
                          </p>
                          <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
                            {search.trim()
                              ? `Showing matches for "${search.trim()}" with selection synced back into the node inspector.`
                              : 'Use this mode when you want denser scanning, faster comparisons, and cleaner ranking by freshness or linkage.'}
                          </p>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                          <TableModeStat label="Top connector" value={topNode?.title ?? '—'} />
                          <TableModeStat label="Freshest page" value={freshestNode?.title ?? '—'} />
                          <TableModeStat label="Selected" value={selectedNode?.title ?? 'None'} />
                        </div>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1">
                      <NodeTable
                        rows={tableRows}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                        onSelect={handleNodeSelect}
                        selectedId={selectedNode?.id}
                        highlightId={highlightId}
                        isDemo={isDemo}
                        connectionMax={connectionMax}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <aside
              className="overflow-hidden rounded-[24px] border"
              style={{
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--surface) 94%, transparent), color-mix(in srgb, var(--surface-2) 88%, transparent))',
                borderColor: 'var(--border-bright)',
                boxShadow: 'var(--shadow-2)',
              }}
            >
              <div className="border-b border-[var(--border)] px-4 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Pill tone="silver">RIGHT RAIL</Pill>
                  <Pill tone={panelTab === 'node' ? 'accent' : 'silver'}>
                    {panelTab === 'node' ? 'NODE INSPECTOR' : 'ACTIVITY FEED'}
                  </Pill>
                </div>
                <div
                  className="flex items-center gap-0.5 rounded-lg p-0.5"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <button
                    onClick={() => setPanelTab('activity')}
                    className="flex-1 py-2 text-[10px] mono tracking-wider font-medium transition-colors rounded-md"
                    style={
                      panelTab === 'activity'
                        ? {
                            color: '#0b0b0d',
                            background: 'color-mix(in srgb, var(--accent) 70%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
                          }
                        : { color: 'var(--text-muted)', border: '1px solid transparent' }
                    }
                  >
                    ACTIVITY
                  </button>
                  <button
                    onClick={() => setPanelTab('node')}
                    className="flex-1 py-2 text-[10px] mono tracking-wider font-medium transition-colors rounded-md"
                    style={
                      panelTab === 'node'
                        ? {
                            color: '#0b0b0d',
                            background: 'color-mix(in srgb, var(--accent) 70%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
                          }
                        : { color: 'var(--text-muted)', border: '1px solid transparent' }
                    }
                  >
                    NODE INFO
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-330px)] min-h-[640px] overflow-y-auto p-4 space-y-4">
                {panelTab === 'activity' && (
                  <>
                    <PanelSection
                      eyebrow="LATEST PAGES"
                      title="Fresh additions"
                      actionHref="/app/wiki"
                      actionLabel="Open wiki"
                    >
                      {recentPages.length === 0 ? (
                        <EmptyPanel
                          icon={BookOpen}
                          title="No pages yet"
                          body="Ingest a source to generate the first wiki pages."
                        />
                      ) : (
                        <div className="space-y-2">
                          {recentPages.slice(0, 6).map(page => (
                            <Link
                              key={page.slug}
                              href={`/app/wiki/${page.slug}`}
                              className="flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors hover:bg-[var(--surface-2)]"
                              style={{ borderColor: 'var(--border)' }}
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: TYPE_COLOR[page.type] ?? SILVER }}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-[var(--text-primary)] truncate">{page.title}</p>
                                <p className="mono text-[9px] text-[var(--text-muted)] mt-1">
                                  {TYPE_LABEL[page.type] ?? page.type} · {timeAgo(page.updatedAt)}
                                </p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </PanelSection>

                    <PanelSection
                      eyebrow="SYSTEM LOG"
                      title="Recent operations"
                      actionHref="/app/log"
                      actionLabel="View log"
                    >
                      {recentLogs.length === 0 ? (
                        <EmptyPanel
                          icon={Activity}
                          title="No activity recorded"
                          body="Query and ingest operations will appear here as the vault starts moving."
                        />
                      ) : (
                        <div className="space-y-2">
                          {recentLogs.map(log => (
                            <div
                              key={log._id}
                              className="rounded-xl border px-3 py-3"
                              style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--surface-2) 45%, transparent)' }}
                            >
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <span className={`mono text-[9px] font-bold tracking-wider ${OP_COLOR[log.operation] ?? 'text-[var(--text-muted)]'}`}>
                                  {(log.operation ?? 'event').toUpperCase()}
                                </span>
                                <span className="mono text-[9px] text-[var(--text-muted)]">
                                  {timeAgo(log.createdAt)}
                                </span>
                              </div>
                              <p className="text-[11px] leading-6 text-[var(--text-secondary)]">
                                {log.summary}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </PanelSection>

                    <PanelSection eyebrow="NEXT MOVE" title="Keep the graph moving">
                      <ActionLink
                        href="/app/ingest"
                        eyebrow="INGEST"
                        title="Add to the knowledge base"
                        body="Drop a new source to deepen summaries and create fresh links."
                        accent
                      />
                    </PanelSection>
                  </>
                )}

                {panelTab === 'node' && !selectedNode && (
                  <EmptyPanel
                    icon={Orbit}
                    title="No node selected"
                    body="Click a node in the graph or a row in the table to inspect its summary, tags, and connections."
                  />
                )}

                {panelTab === 'node' && selectedNode && (
                  <>
                    <PanelSection eyebrow="NODE INSPECTOR" title={selectedNode.title}>
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 mono text-[9px] tracking-wider"
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
                            {(TYPE_LABEL[selectedNode.type] ?? selectedNode.type).toUpperCase()}
                          </span>
                          <p className="mono text-[9px] text-[var(--text-muted)] mt-2">
                            Updated {selectedNode.updatedAt ? timeAgo(selectedNode.updatedAt) : 'recently'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleNodeSelect(null)}
                          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--surface-2)]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {selectedNode.summary && (
                        <div
                          className="rounded-xl border p-3 mb-4"
                          style={{
                            background: 'color-mix(in srgb, var(--surface-2) 45%, transparent)',
                            borderColor: 'var(--border)',
                          }}
                        >
                          <p className="text-[12px] leading-6 text-[var(--text-secondary)]">
                            {selectedNode.summary}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <MiniStat label="Connections" value={selectedNode.connectionCount ?? 0} />
                        <MiniStat
                          label="Type"
                          value={TYPE_LABEL[selectedNode.type] ?? selectedNode.type}
                        />
                      </div>

                      {(selectedNode.tags ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {(selectedNode.tags ?? []).map(tag => (
                            <span
                              key={tag}
                              className="rounded-full border px-2 py-1 mono text-[9px]"
                              style={{
                                color: 'var(--text-secondary)',
                                borderColor: 'var(--border)',
                                background: 'var(--surface-2)',
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <Link
                        href={`/app/wiki/${selectedNode.id}`}
                        className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-medium"
                        style={{
                          border: '1px solid var(--border-bright)',
                          background: 'var(--surface-2)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open full wiki page
                      </Link>
                    </PanelSection>

                    <PanelSection eyebrow="CONNECTED PAGES" title={`Neighbors (${selectedNode.connectionCount ?? 0})`}>
                      {selectedNode.connectionCount === 0 ? (
                        <EmptyPanel
                          icon={Network}
                          title="No connections yet"
                          body="This page exists in the vault, but it has not been linked to related nodes yet."
                        />
                      ) : (
                        <div className="space-y-2">
                          {rawEdges
                            .filter(edge => edge.source === selectedNode.id || edge.target === selectedNode.id)
                            .slice(0, 8)
                            .map(edge => {
                              const relId = edge.source === selectedNode.id ? edge.target : edge.source
                              const rel = rawNodes.find(node => node.id === relId)
                              if (!rel) return null
                              return (
                                <button
                                  key={relId}
                                  onClick={() => handleNodeSelect(rel)}
                                  className="w-full rounded-xl border px-3 py-3 text-left transition-colors hover:bg-[var(--surface-2)]"
                                  style={{ borderColor: 'var(--border)' }}
                                >
                                  <div className="flex items-center gap-3">
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ background: TYPE_COLOR[rel.type] ?? SILVER }}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium text-[var(--text-primary)] truncate">{rel.title}</p>
                                      <p className="mono text-[9px] text-[var(--text-muted)] mt-1">
                                        {(TYPE_LABEL[rel.type] ?? rel.type).toUpperCase()} · {rel.connectionCount} links
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              )
                            })}
                        </div>
                      )}
                    </PanelSection>
                  </>
                )}
              </div>
            </aside>
          </section>
        </div>
      </div>
    </div>
  )
}

function Pill({ children, tone = 'silver' }: { children: React.ReactNode; tone?: 'accent' | 'silver' }) {
  const style =
    tone === 'accent'
      ? {
          color: 'var(--accent-bright)',
          background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
          borderColor: 'color-mix(in srgb, var(--accent) 24%, transparent)',
        }
      : {
          color: SILVER,
          background: 'color-mix(in srgb, #ffffff 4%, transparent)',
          borderColor: 'var(--border)',
        }
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 mono text-[9px] tracking-widest"
      style={style}
    >
      {children}
    </span>
  )
}

function MetricCard({
  label,
  value,
  meta,
  tone,
  icon: Icon,
}: {
  label: string
  value: number | string
  meta: string
  tone: 'accent' | 'silver'
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}) {
  const numeric = typeof value === 'number'
  const counted = useCountUp(numeric ? value : 0)
  const shown = numeric ? counted : value
  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: 'color-mix(in srgb, var(--surface) 76%, transparent)',
        borderColor: tone === 'accent'
          ? 'color-mix(in srgb, var(--accent) 18%, transparent)'
          : 'var(--border)',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="mono text-[10px] tracking-widest text-[var(--text-muted)]">{label.toUpperCase()}</span>
        <Icon className="w-4 h-4" style={{ color: tone === 'accent' ? 'var(--accent-bright)' : SILVER }} />
      </div>
      <div className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
        {shown}
      </div>
      <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
        {meta}
      </p>
    </div>
  )
}

function QuickStrip({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  hint: string
}) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{
        background: 'color-mix(in srgb, var(--surface-2) 52%, transparent)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="mono text-[9px] tracking-widest text-[var(--text-muted)]">
          {label.toUpperCase()}
        </span>
        <Icon className="w-3.5 h-3.5" style={{ color: 'var(--accent-bright)' }} />
      </div>
      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{value}</p>
      <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)] truncate">{hint}</p>
    </div>
  )
}

function InlineMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
      style={{
        borderColor: 'var(--border)',
        background: 'color-mix(in srgb, var(--surface-2) 55%, transparent)',
      }}
    >
      {Icon && <Icon className="w-3 h-3 text-[var(--text-muted)]" />}
      <span className="mono text-[9px] tracking-widest text-[var(--text-muted)]">{label.toUpperCase()}</span>
      <span className="mono text-[10px] text-[var(--text-primary)]">{value}</span>
    </div>
  )
}

function GraphOverlayCard({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl border p-3 backdrop-blur-md"
      style={{
        background: 'color-mix(in srgb, var(--surface) 84%, transparent)',
        borderColor: 'var(--border-bright)',
        boxShadow: 'var(--shadow-2)',
      }}
    >
      <p className="mono text-[9px] tracking-widest text-[var(--text-muted)] mb-1">{eyebrow}</p>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{body}</p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function OverlayChip({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1"
      style={{
        borderColor: 'var(--border)',
        background: 'color-mix(in srgb, var(--surface-2) 52%, transparent)',
      }}
    >
      <Icon className="w-3 h-3 text-[var(--accent-bright)]" />
      <span className="mono text-[9px] tracking-widest text-[var(--text-muted)]">{label.toUpperCase()}</span>
      <span className="mono text-[10px] text-[var(--text-primary)]">{value}</span>
    </div>
  )
}

function GraphHint({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
      }}
    >
      <Icon className="w-3 h-3 text-[var(--accent-bright)]" />
      <span className="mono text-[9px] tracking-widest text-[var(--text-secondary)]">{label.toUpperCase()}</span>
    </div>
  )
}

function GraphFooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5 backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        background: 'color-mix(in srgb, var(--surface) 82%, transparent)',
      }}
    >
      <p className="mono text-[9px] tracking-widest text-[var(--text-muted)] mb-1">{label.toUpperCase()}</p>
      <p className="text-[11px] leading-5 text-[var(--text-primary)] truncate">{value}</p>
    </div>
  )
}

function TableModeStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border px-3 py-3"
      style={{
        borderColor: 'var(--border)',
        background: 'color-mix(in srgb, var(--surface-2) 52%, transparent)',
      }}
    >
      <p className="mono text-[9px] tracking-widest text-[var(--text-muted)] mb-1">{label.toUpperCase()}</p>
      <p className="truncate text-xs font-medium text-[var(--text-primary)]">{value}</p>
    </div>
  )
}

function PanelSection({
  eyebrow,
  title,
  actionHref,
  actionLabel,
  children,
}: {
  eyebrow: string
  title: string
  actionHref?: string
  actionLabel?: string
  children: React.ReactNode
}) {
  return (
    <section
      className="rounded-2xl border p-4"
      style={{
        background: 'color-mix(in srgb, var(--surface) 74%, transparent)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="mono text-[9px] tracking-widest text-[var(--text-muted)] mb-1">{eyebrow}</p>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        </div>
        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="mono text-[9px] flex items-center gap-1"
            style={{ color: 'var(--accent-bright)' }}
          >
            {actionLabel} <ArrowRight className="w-2.5 h-2.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function EmptyPanel({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <Icon className="w-5 h-5 text-[var(--text-muted)]" />
      </div>
      <p className="text-sm text-[var(--text-primary)] font-medium mb-1">{title}</p>
      <p className="text-[11px] leading-6 text-[var(--text-muted)] max-w-[250px]">{body}</p>
    </div>
  )
}

function ActionLink({
  href,
  eyebrow,
  title,
  body,
  accent = false,
}: {
  href: string
  eyebrow: string
  title: string
  body: string
  accent?: boolean
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border px-4 py-4 transition-colors hover:bg-[var(--surface-2)]"
      style={{
        borderColor: accent ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'var(--border)',
        background: accent
          ? 'color-mix(in srgb, var(--accent) 6%, transparent)'
          : 'color-mix(in srgb, var(--surface-2) 45%, transparent)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="mono text-[9px] tracking-widest text-[var(--text-muted)] mb-1">{eyebrow}</p>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">{body}</p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: accent ? 'var(--accent-bright)' : 'var(--text-muted)' }} />
      </div>
    </Link>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="rounded-xl border px-3 py-3"
      style={{
        background: 'color-mix(in srgb, var(--surface-2) 45%, transparent)',
        borderColor: 'var(--border)',
      }}
    >
      <p className="mono text-[9px] tracking-widest text-[var(--text-muted)] mb-1">{label.toUpperCase()}</p>
      <p className="text-xs font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  )
}

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
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
  rows,
  sortKey,
  sortDir,
  onSort,
  onSelect,
  selectedId,
  highlightId,
  isDemo,
  connectionMax,
}: {
  rows: GraphNode[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  onSelect: (n: GraphNode) => void
  selectedId?: string
  highlightId?: string | null
  isDemo: boolean
  connectionMax: number
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
            background: 'color-mix(in srgb, var(--surface) 96%, transparent)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <tr>
            <th className="px-5 py-3 w-[44%]">
              <SortHeader label="TITLE" k="title" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            </th>
            <th className="px-3 py-3 w-[18%]">
              <SortHeader label="TYPE" k="type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            </th>
            <th className="px-3 py-3 w-[14%]">
              <SortHeader label="LINKS" k="connections" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            </th>
            <th className="px-5 py-3 w-[24%]">
              <SortHeader label="UPDATED" k="updated" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((node, i) => {
            const tone = TYPE_COLOR[node.type] ?? SILVER
            const isSelected = node.id === selectedId
            const isHighlight = node.id === highlightId
            const freshness = freshnessLabel(node.updatedAt)
            return (
              <tr
                key={node.id}
                onClick={() => onSelect(node)}
                className="cursor-pointer transition-colors"
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: isSelected
                    ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                    : isHighlight
                      ? 'color-mix(in srgb, var(--accent) 5%, transparent)'
                      : 'transparent',
                  animation: `fade-up 0.4s var(--ease-out-expo) ${Math.min(i * 0.02, 0.5)}s both`,
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
                      className="mono text-[9px] w-7 shrink-0 text-[var(--text-muted)]"
                      style={{ opacity: 0.8 }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: tone, boxShadow: `0 0 8px ${tone}60` }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs text-[var(--text-primary)] font-medium truncate">{node.title}</p>
                      {node.summary && (
                        <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5 max-w-[520px]">
                          {node.summary}
                        </p>
                      )}
                      {(node.tags ?? []).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(node.tags ?? []).slice(0, 2).map(tag => (
                            <span
                              key={tag}
                              className="rounded-full border px-1.5 py-0.5 mono text-[8px]"
                              style={{
                                color: 'var(--text-secondary)',
                                borderColor: 'var(--border)',
                                background: 'color-mix(in srgb, var(--surface-2) 65%, transparent)',
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-1.5">
                    <span
                      className="mono text-[9px] px-2 py-0.5 rounded border tracking-wider font-medium"
                      style={{
                        color: tone,
                        borderColor: `${tone}30`,
                        background: `${tone}10`,
                      }}
                    >
                      {(TYPE_LABEL[node.type] ?? node.type).toUpperCase()}
                    </span>
                    <span className="mono text-[8px] tracking-widest text-[var(--text-muted)]">
                      {freshness.toUpperCase()}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div
                      className="hidden sm:block h-1.5 w-14 overflow-hidden rounded-full"
                      style={{ background: 'color-mix(in srgb, var(--surface-2) 72%, transparent)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(((node.connectionCount ?? 0) / connectionMax) * 100, node.connectionCount ? 8 : 0)}%`,
                          background: tone,
                        }}
                      />
                    </div>
                    <span className="mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                      {node.connectionCount ?? 0}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    <div className="text-right">
                      <span className="block mono text-[10px] text-[var(--text-muted)]">
                        {node.updatedAt ? timeAgo(node.updatedAt) : '—'}
                      </span>
                      <span className="block mono text-[8px] tracking-widest text-[var(--text-secondary)] mt-1">
                        {freshness.toUpperCase()}
                      </span>
                    </div>
                    <ChevronRight
                      className="w-3.5 h-3.5"
                      style={{ color: isSelected ? 'var(--accent-bright)' : 'var(--text-muted)' }}
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
