'use client'

import { useState } from 'react'
import Link from 'next/link'
import { graphNodes } from '@/lib/dashboard-data'

const toneClass = {
  purple: 'bg-[linear-gradient(135deg,var(--dash-accent-2),var(--dash-accent))] text-white shadow-[0_18px_40px_rgba(255,102,0,0.24)]',
  green: 'bg-emerald-100 text-emerald-700',
  sky: 'bg-sky-100 text-sky-700',
  blue: 'bg-blue-100 text-blue-700',
  orange: 'bg-orange-100 text-orange-700',
  violet: 'bg-violet-100 text-violet-700',
}

export function KnowledgeGraph() {
  const center = graphNodes[0]
  const satellites = graphNodes.slice(1)
  const [selected, setSelected] = useState<string>(center.label)

  return (
    <section id="knowledge-graph" className="rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-5 shadow-[var(--dash-shadow-sm)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--dash-text)]">Knowledge graph</h2>
        <Link href="/app/wiki?view=graph" className="text-sm text-[var(--dash-accent-2)] transition hover:opacity-80">
          View full graph
        </Link>
      </div>

      <div className="relative mx-auto aspect-square max-w-[340px]">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="38" fill="none" stroke="var(--dash-border)" />
          <circle cx="50" cy="50" r="25" fill="none" stroke="color-mix(in srgb, var(--dash-accent-2) 18%, transparent)" />
          {satellites.map(node => (
            <line
              key={node.label}
              x1="50"
              y1="50"
              x2={node.x}
              y2={node.y}
              stroke="color-mix(in srgb, var(--dash-accent-2) 34%, transparent)"
              strokeWidth="0.7"
            />
          ))}
          {[18, 32, 68, 78, 42, 59, 86, 28].map((x, i) => (
            <circle key={`${x}-${i}`} cx={x} cy={(i * 13 + 21) % 80 + 10} r="1.4" fill="#ede9fe" />
          ))}
        </svg>

        <GraphNode label={center.label} x={center.x} y={center.y} size="lg" tone={center.tone} selected={selected === center.label} onSelect={setSelected} />
        {satellites.map(node => (
          <GraphNode key={node.label} {...node} selected={selected === node.label} onSelect={setSelected} />
        ))}
      </div>

      <div className="mt-2 rounded-xl bg-[var(--dash-soft)] px-3 py-2 text-xs text-[var(--dash-muted)]">
        Selected memory: <span className="font-semibold text-[var(--dash-text)]">{selected}</span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-xs text-[var(--dash-muted)]">
        <Legend color="bg-orange-500" label="Topics" />
        <Legend color="bg-emerald-500" label="People" />
        <Legend color="bg-blue-500" label="Sources" />
        <Legend color="bg-orange-500" label="Decisions" />
      </div>
    </section>
  )
}

function GraphNode({
  label,
  x,
  y,
  size,
  tone,
  selected,
  onSelect,
}: {
  label: string
  x: number
  y: number
  size: 'sm' | 'lg'
  tone: keyof typeof toneClass
  selected: boolean
  onSelect: (label: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(label)}
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full text-center font-medium transition hover:scale-105 ${toneClass[tone]} ${
        size === 'lg' ? 'grid h-24 w-24 place-items-center text-sm' : 'px-3 py-1.5 text-xs'
      } ${selected ? 'ring-4 ring-[color-mix(in_srgb,var(--dash-accent)_20%,transparent)]' : ''}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {label}
    </button>
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
