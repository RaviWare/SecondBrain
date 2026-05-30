'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Network } from 'lucide-react'
import { useDashboardData, useGraph } from '@/components/dashboard/DashboardData'

const TYPE_HEX: Record<string, string> = {
  concept: '#ff7a1f',
  entity: '#34d399',
  'source-summary': '#38bdf8',
  synthesis: '#a78bfa',
  pattern: '#fb923c',
  'query-answer': '#60a5fa',
}

type Placed = { slug: string; title: string; type: string; x: number; y: number }

export function KnowledgeGraph() {
  const { loading } = useDashboardData()
  const graph = useGraph()

  // Pick the most-connected node as center, then up to 6 neighbours around it.
  const { center, satellites } = useMemo(() => {
    const nodes = [...graph.nodes].sort((a, b) => b.connectionCount - a.connectionCount)
    if (nodes.length === 0) return { center: null as Placed | null, satellites: [] as Placed[] }
    const c = nodes[0]
    const rest = nodes.slice(1, 7)
    const sats: Placed[] = rest.map((n, i) => {
      const angle = (-90 + (360 / Math.max(1, rest.length)) * i) * (Math.PI / 180)
      return {
        slug: n.id,
        title: n.title,
        type: n.type,
        x: 50 + 36 * Math.cos(angle),
        y: 50 + 36 * Math.sin(angle),
      }
    })
    return { center: { slug: c.id, title: c.title, type: c.type, x: 50, y: 50 }, satellites: sats }
  }, [graph.nodes])

  const [selected, setSelected] = useState<string | null>(null)
  const activeSlug = selected ?? center?.slug ?? null
  const activeTitle = [center, ...satellites].find(n => n?.slug === activeSlug)?.title ?? '—'

  return (
    <section id="knowledge-graph" className="dash-panel dash-grain p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--dash-text-strong)] 2xl:text-[15px]">Knowledge graph</h2>
        <Link href="/app/wiki?view=graph" className="group inline-flex items-center gap-0.5 text-[13px] font-medium text-[var(--dash-accent)] transition hover:opacity-80">
          View full graph
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>

      {loading ? (
        <div className="mx-auto aspect-square max-w-[300px] animate-pulse rounded-full bg-[var(--dash-soft)]" />
      ) : !center ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--dash-border)] bg-[var(--dash-soft)] text-[var(--dash-accent)]">
            <Network className="h-5 w-5" />
          </span>
          <p className="text-[12px] text-[var(--dash-subtle)]">Connections appear as your wiki grows.</p>
          <Link href="/app/ingest" className="text-[12px] font-medium text-[var(--dash-accent)] hover:opacity-80">
            Add a source
          </Link>
        </div>
      ) : (
        <>
          <div className="relative mx-auto aspect-square max-w-[300px]">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
              <defs>
                <filter id="kg-soft" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="0.8" />
                </filter>
              </defs>

              <circle cx="50" cy="50" r="38" fill="none" stroke="var(--dash-border)" strokeDasharray="1 2" />
              <circle cx="50" cy="50" r="25" fill="none" stroke="color-mix(in srgb, var(--dash-accent) 22%, transparent)" strokeDasharray="1 2" />

              {satellites.map(node => {
                const active = activeSlug === node.slug || activeSlug === center.slug
                return (
                  <g key={node.slug}>
                    <line
                      x1="50"
                      y1="50"
                      x2={node.x}
                      y2={node.y}
                      stroke={active ? 'color-mix(in srgb, var(--dash-accent) 55%, transparent)' : 'var(--dash-border-bright)'}
                      strokeWidth={active ? 0.8 : 0.5}
                      filter="url(#kg-soft)"
                    />
                    <circle r="0.9" fill="var(--dash-accent)">
                      <animateMotion dur="3s" repeatCount="indefinite" path={`M50 50 L${node.x} ${node.y}`} />
                      <animate attributeName="opacity" values="0;1;0" dur="3s" repeatCount="indefinite" />
                    </circle>
                  </g>
                )
              })}
            </svg>

            <GraphNode node={center} center selected={activeSlug === center.slug} onSelect={setSelected} />
            {satellites.map(node => (
              <GraphNode key={node.slug} node={node} selected={activeSlug === node.slug} onSelect={setSelected} />
            ))}
          </div>

          <div className="dash-inset mt-3 rounded-xl px-3 py-2 text-xs text-[var(--dash-muted)]">
            Selected memory: <span className="font-semibold text-[var(--dash-text-strong)]">{activeTitle}</span>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2 text-xs text-[var(--dash-muted)]">
            <Legend color="bg-orange-500" label="Topics" />
            <Legend color="bg-emerald-500" label="People" />
            <Legend color="bg-sky-500" label="Sources" />
            <Legend color="bg-violet-500" label="Synthesis" />
          </div>
        </>
      )}
    </section>
  )
}

function GraphNode({
  node,
  center,
  selected,
  onSelect,
}: {
  node: Placed
  center?: boolean
  selected: boolean
  onSelect: (slug: string) => void
}) {
  const hex = TYPE_HEX[node.type] ?? '#ff7a1f'
  const short = node.title.length > 16 ? `${node.title.slice(0, 15)}…` : node.title

  return (
    <Link
      href={`/app/wiki/${node.slug}`}
      onMouseEnter={() => onSelect(node.slug)}
      onFocus={() => onSelect(node.slug)}
      title={node.title}
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full text-center font-medium transition-all duration-300 hover:scale-110 ${
        center
          ? 'dash-accent-grad grid h-[84px] w-[84px] place-items-center px-2 text-[11px] leading-tight text-white shadow-[0_18px_44px_-10px_rgba(255,102,0,0.7)]'
          : 'border px-2.5 py-1.5 text-[11px] backdrop-blur'
      } ${selected && !center ? 'scale-105' : ''}`}
      style={{
        left: `${node.x}%`,
        top: `${node.y}%`,
        ...(center
          ? {}
          : {
              color: hex,
              borderColor: selected ? hex : 'var(--dash-border)',
              background: 'var(--dash-card-strong)',
              boxShadow: selected ? `0 0 0 2px ${hex}40, 0 8px 22px -8px ${hex}` : 'var(--dash-shadow-sm)',
            }),
      }}
    >
      {center && (
        <span className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.4),transparent_45%)]" />
      )}
      <span className="relative leading-tight">{short}</span>
    </Link>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  )
}
