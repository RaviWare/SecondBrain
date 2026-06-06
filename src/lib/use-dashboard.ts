'use client'

import { useEffect, useState } from 'react'

// ── API response shapes (from /api/dashboard) ──────────────────────────────
type StatPair = { total: number; week: number }

export type DashboardApi = {
  vault: { name?: string; pageCount?: number; sourceCount?: number } | null
  plan: { plan?: 'free' | 'pro' } | null
  recentLogs: Array<{
    _id?: string
    operation: 'ingest' | 'query' | 'lint'
    summary: string
    pagesAffected?: string[]
    createdAt: string
  }>
  recentPages: Array<{
    slug: string
    title: string
    type: string
    summary?: string
    updatedAt: string
    createdAt: string
  }>
  stats: {
    sources: StatPair
    notes: StatPair
    topics: StatPair
    decisions: StatPair
    aiAnswers: StatPair
  }
  /** Real daily-count trends (one point per day, oldest → newest) for the sparklines. */
  trends?: {
    sources: number[]
    notes: number[]
    topics: number[]
    decisions: number[]
    aiAnswers: number[]
  }
  topTopics: Array<{ slug: string; title: string; weight: number }>
  mostUsedSources: Array<{ slug: string; title: string; refs: number }>
  recentDecisions: Array<{ slug: string; title: string; updatedAt: string }>
  aiAnswers: Array<{ summary: string; createdAt: string }>
  graph: {
    nodes: Array<{ id: string; title: string; type: string; connectionCount: number }>
    edges: Array<{ source: string; target: string }>
  }
}

export type DashboardState = {
  data: DashboardApi | null
  loading: boolean
  error: string | null
  isEmpty: boolean
}

export function useDashboard(): DashboardState {
  const [data, setData] = useState<DashboardApi | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`)
        return r.json()
      })
      .then((d: DashboardApi) => {
        if (!cancelled) setData(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isEmpty = !!data && (data.recentPages?.length ?? 0) === 0 && (data.stats?.notes.total ?? 0) === 0

  return { data, loading, error, isEmpty }
}
