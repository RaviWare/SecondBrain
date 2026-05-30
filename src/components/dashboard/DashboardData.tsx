'use client'

import { createContext, useContext } from 'react'
import {
  BookOpen,
  CheckCircle2,
  FileText,
  Link2,
  MessageSquareText,
  Network,
  Phone,
  Search,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useDashboard, type DashboardState } from '@/lib/use-dashboard'
import { timeAgo } from '@/lib/utils'

const Ctx = createContext<DashboardState | null>(null)

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const state = useDashboard()
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

export function useDashboardData(): DashboardState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDashboardData must be used inside <DashboardDataProvider>')
  return ctx
}

// ── View-model derivations ─────────────────────────────────────────────────

const TONES = ['violet', 'blue', 'green', 'orange', 'purple'] as const

/** Build a representative 8-point trend ending at the weekly delta. */
function buildTrend(week: number): number[] {
  const peak = Math.max(week, 3)
  return Array.from({ length: 8 }, (_, i) => {
    const t = i / 7
    const eased = Math.pow(t, 1.4)
    const jitter = i % 2 === 0 ? 0 : peak * 0.08
    return Math.max(1, Math.round(eased * peak + jitter))
  })
}

export type StatVM = {
  label: string
  value: number
  delta: string
  icon: LucideIcon
  tone: (typeof TONES)[number]
  trend: number[]
}

export function useStatCards(): StatVM[] {
  const { data } = useDashboardData()
  const s = data?.stats
  const mk = (label: string, pair: { total: number; week: number } | undefined, icon: LucideIcon, tone: StatVM['tone']): StatVM => ({
    label,
    value: pair?.total ?? 0,
    delta: pair ? `+${pair.week} this week` : '—',
    icon,
    tone,
    trend: buildTrend(pair?.week ?? 0),
  })
  return [
    mk('Sources', s?.sources, FileText, 'violet'),
    mk('Notes', s?.notes, BookOpen, 'blue'),
    mk('Topics', s?.topics, Network, 'green'),
    mk('Decisions', s?.decisions, CheckCircle2, 'orange'),
    mk('AI Answers', s?.aiAnswers, Search, 'purple'),
  ]
}

// type → icon/tone for sources & activity
const TYPE_ICON: Record<string, LucideIcon> = {
  'source-summary': FileText,
  concept: Network,
  entity: Users,
  synthesis: CheckCircle2,
  pattern: Sparkles,
  'query-answer': MessageSquareText,
}

const TYPE_TONE: Record<string, 'red' | 'green' | 'amber' | 'blue' | 'sky'> = {
  'source-summary': 'blue',
  concept: 'green',
  entity: 'amber',
  synthesis: 'green',
  pattern: 'sky',
  'query-answer': 'amber',
}

const OP_ICON = { ingest: FileText, query: Sparkles, lint: CheckCircle2 } as const
const OP_TONE = { ingest: 'blue', query: 'orange', lint: 'green' } as const

export type ActivityVM = { title: string; meta: string; icon: LucideIcon; tone: 'green' | 'blue' | 'amber' | 'orange' | 'red'; href: string }

export function useRecentActivity(): ActivityVM[] {
  const { data } = useDashboardData()
  return (data?.recentLogs ?? []).slice(0, 5).map(log => {
    const firstSlug = log.pagesAffected?.[0]
    return {
      title: cleanSummary(log.summary),
      meta: `${cap(log.operation)} · ${timeAgo(log.createdAt)}`,
      icon: OP_ICON[log.operation] ?? FileText,
      tone: (OP_TONE[log.operation] ?? 'blue') as ActivityVM['tone'],
      href: firstSlug ? `/app/wiki/${firstSlug}` : '/app/log',
    }
  })
}

export type SourceVM = { title: string; meta: string; time: string; icon: LucideIcon; tone: 'red' | 'green' | 'amber' | 'blue' | 'sky'; href: string }

export function useRecentSources(): SourceVM[] {
  const { data } = useDashboardData()
  return (data?.recentPages ?? []).slice(0, 5).map(p => ({
    title: p.title,
    meta: `${labelType(p.type)}${p.summary ? '' : ''}`,
    time: timeAgo(p.updatedAt),
    icon: TYPE_ICON[p.type] ?? FileText,
    tone: TYPE_TONE[p.type] ?? 'blue',
    href: `/app/wiki/${p.slug}`,
  }))
}

export function useMemoryOverview() {
  const { data } = useDashboardData()
  return {
    mostUsedSources: (data?.mostUsedSources ?? []).map(s => ({
      label: s.title,
      value: s.refs > 0 ? `${s.refs} link${s.refs === 1 ? '' : 's'}` : 'source',
      href: `/app/wiki/${s.slug}`,
    })),
    topTopics: (data?.topTopics ?? []).map(t => ({ label: t.title, value: t.weight, href: `/app/wiki/${t.slug}` })),
    recentDecisions: (data?.recentDecisions ?? []).map(d => ({
      label: d.title,
      value: timeAgo(d.updatedAt),
      href: `/app/wiki/${d.slug}`,
    })),
    aiAnswers: (data?.aiAnswers ?? []).map(a => ({ label: cleanSummary(a.summary), value: timeAgo(a.createdAt), href: '/app/query' })),
  }
}

export function useGraph() {
  const { data } = useDashboardData()
  return data?.graph ?? { nodes: [], edges: [] }
}

// re-export icons consumers may want
export { Link2, Phone }

// ── helpers ────────────────────────────────────────────────────────────────
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function labelType(t: string) {
  return t
    .split('-')
    .map(cap)
    .join(' ')
}
function cleanSummary(s: string) {
  // Query logs look like: Query: "..." (n sub-queries, ...) → show the quoted part.
  const m = s.match(/"([^"]+)"/)
  if (m) return m[1]
  return s.replace(/\s*\([^)]*\)\s*$/, '')
}
