'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Brain, FileText, MessageSquare, Zap, Clock, ArrowRight, Plus, BookOpen } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

const TYPE_COLORS: Record<string, string> = {
  'source-summary': 'bg-blue-500/20 text-blue-300',
  concept:          'bg-violet-500/20 text-violet-300',
  entity:           'bg-emerald-500/20 text-emerald-300',
  synthesis:        'bg-amber-500/20 text-amber-300',
  pattern:          'bg-rose-500/20 text-rose-300',
  'query-answer':   'bg-zinc-500/20 text-zinc-300',
}

const OP_COLORS: Record<string, string> = {
  ingest: 'text-violet-400',
  query:  'text-blue-400',
  lint:   'text-amber-400',
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vault/ensure', { method: 'POST' })
      .then(() => fetch('/api/dashboard'))
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex items-center gap-3 text-zinc-500">
        <Brain className="w-5 h-5 animate-pulse text-violet-500" />
        <span className="text-sm">Loading your brain...</span>
      </div>
    </div>
  )

  const { vault, plan, recentLogs = [], recentPages = [] } = data || {}

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">Your second brain at a glance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Wiki Pages',    value: vault?.pageCount ?? 0,   icon: BookOpen,      color: 'text-violet-400' },
          { label: 'Sources',       value: vault?.sourceCount ?? 0, icon: FileText,      color: 'text-blue-400' },
          { label: 'Queries Used',  value: plan?.queriesThisMonth ?? 0, icon: MessageSquare, color: 'text-emerald-400' },
          { label: 'Plan',          value: plan?.plan === 'pro' ? 'Pro' : 'Free', icon: Zap, color: 'text-amber-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold text-zinc-100">{value}</p>
            {label === 'Plan' && plan?.plan === 'free' && (
              <Link href="/app/settings" className="text-xs text-violet-400 hover:text-violet-300 mt-1 block">Upgrade →</Link>
            )}
          </div>
        ))}
      </div>

      {/* Quick Ingest */}
      <div className="bg-gradient-to-r from-violet-600/10 to-blue-600/10 border border-violet-500/20 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-zinc-100 font-semibold mb-1">Add to your brain</h2>
            <p className="text-zinc-500 text-sm">Paste a URL or text — Claude will read, summarize, and connect it to your wiki.</p>
          </div>
          <Link
            href="/app/ingest"
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ingest Source
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Pages */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-200">Recent Wiki Pages</h2>
            <Link href="/app/wiki" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentPages.length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-8">No pages yet. Ingest a source to get started.</p>
          ) : (
            <div className="space-y-2">
              {recentPages.map((p: any) => (
                <Link key={p.slug} href={`/app/wiki/${p.slug}`}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-800 transition-colors group">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${TYPE_COLORS[p.type] || 'bg-zinc-700 text-zinc-300'}`}>
                    {p.type}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200 group-hover:text-white truncate font-medium">{p.title}</p>
                    <p className="text-xs text-zinc-600 mt-0.5">{timeAgo(p.updatedAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Activity Log */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-200">Activity Log</h2>
            <Link href="/app/log" className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentLogs.length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-8">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {recentLogs.map((log: any) => (
                <div key={log._id} className="flex items-start gap-3 p-3 rounded-lg">
                  <Clock className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-400 truncate">{log.summary}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs font-medium ${OP_COLORS[log.operation]}`}>{log.operation}</span>
                      <span className="text-zinc-700 text-xs">{timeAgo(log.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
