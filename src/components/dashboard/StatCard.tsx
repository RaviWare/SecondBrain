'use client'

import type { LucideIcon } from 'lucide-react'
import { TrendingUp } from 'lucide-react'
import { useCountUp } from '@/lib/use-count-up'
import { useSpotlight } from '@/lib/use-spotlight'
import { cn } from '@/lib/utils'

const toneClass = {
  violet: 'text-orange-500 dark:text-orange-300',
  purple: 'text-violet-500 dark:text-violet-300',
  blue: 'text-sky-500 dark:text-sky-300',
  green: 'text-emerald-500 dark:text-emerald-300',
  orange: 'text-orange-500 dark:text-orange-300',
}

const toneStroke = {
  violet: '#ff7a1f',
  purple: '#a78bfa',
  blue: '#38bdf8',
  green: '#34d399',
  orange: '#ff7a1f',
}

function Sparkline({ data, color }: { data: readonly number[]; color: string }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 64
  const h = 22
  const step = w / (data.length - 1)
  const points = data.map((v, i) => {
    const x = i * step
    const y = h - ((v - min) / range) * h
    return [x, y] as const
  })
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${w} ${h} L0 ${h} Z`
  const gid = `spark-${color.replace('#', '')}`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2" fill={color} />
    </svg>
  )
}

export function StatCardSkeleton() {
  return (
    <article className="dash-panel p-3 2xl:p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-[var(--dash-soft)] 2xl:h-9 2xl:w-9" />
        <span className="h-[22px] w-16 animate-pulse rounded bg-[var(--dash-soft)]" />
      </div>
      <span className="mt-2.5 block h-6 w-16 animate-pulse rounded bg-[var(--dash-soft)]" />
      <span className="mt-2 block h-3 w-12 animate-pulse rounded bg-[var(--dash-soft)]" />
      <span className="mt-2 block h-2.5 w-20 animate-pulse rounded bg-[var(--dash-soft)]" />
    </article>
  )
}

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  tone,
  trend,
}: {
  label: string
  value: number
  delta: string
  icon: LucideIcon
  tone: keyof typeof toneClass
  trend: readonly number[]
}) {
  const { value: animated, ref } = useCountUp(value)
  const spotlight = useSpotlight<HTMLElement>()

  // Merge the count-up IntersectionObserver ref and the spotlight ref onto one node.
  const setRefs = (node: HTMLElement | null) => {
    ;(ref as React.MutableRefObject<HTMLElement | null>).current = node
    spotlight.ref.current = node
  }

  return (
    <article
      ref={setRefs}
      onMouseMove={spotlight.onMouseMove}
      className="dash-panel dash-grain dash-spotlight dash-interactive group p-3 2xl:p-3.5"
    >
      <span className="dash-spotlight-glow" aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-soft)] backdrop-blur 2xl:h-9 2xl:w-9',
            toneClass[tone]
          )}
        >
          <Icon className="h-[15px] w-[15px] 2xl:h-4 2xl:w-4" />
        </span>
        <span className="opacity-70 transition-opacity duration-300 group-hover:opacity-100">
          <Sparkline data={trend} color={toneStroke[tone]} />
        </span>
      </div>

      <p className="mt-2.5 text-xl font-semibold leading-none tracking-tight text-[var(--dash-text-strong)] [font-variant-numeric:tabular-nums] 2xl:text-2xl">
        {animated.toLocaleString()}
      </p>
      <p className="mt-1 text-[11px] font-medium text-[var(--dash-muted)] 2xl:text-xs">{label}</p>
      <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-emerald-500 dark:text-emerald-400">
        <TrendingUp className="h-3 w-3" />
        <span className="truncate text-[var(--dash-subtle)]">{delta}</span>
      </p>
    </article>
  )
}
