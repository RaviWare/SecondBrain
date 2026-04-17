'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import { Plus, ArrowRight, Activity, Database, Zap, BookOpen } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

const TYPE_COLORS: Record<string, string> = {
  'source-summary': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  concept:          'text-violet-400 bg-violet-500/10 border-violet-500/20',
  entity:           'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  synthesis:        'text-amber-400 bg-amber-500/10 border-amber-500/20',
  pattern:          'text-rose-400 bg-rose-500/10 border-rose-500/20',
  'query-answer':   'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
}

const OP_COLORS: Record<string, string> = {
  ingest: 'text-violet-400',
  query:  'text-cyan-400',
  lint:   'text-amber-400',
}

function StatCard({ label, value, icon: Icon, color, sub, delay }: any) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    gsap.from(ref.current, { opacity: 0, y: 20, duration: 0.5, delay, ease: 'power2.out' })
  }, [delay])

  return (
    <div ref={ref} className="glass border border-white/5 rounded-xl p-5 card-hover relative overflow-hidden group">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex items-start justify-between mb-4">
        <p className={`mono text-[10px] tracking-widest ${color} opacity-70`}>{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color.replace('text-', 'bg-').replace('400', '500/10')}`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
      </div>
      <p className="text-3xl font-black text-white/90 mb-1">{value}</p>
      {sub && <p className="mono text-[10px] text-white/20 tracking-wider">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/vault/ensure', { method: 'POST' })
      .then(() => fetch('/api/dashboard'))
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="w-8 h-8 border border-violet-500/30 border-t-violet-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="mono text-xs text-white/20 tracking-widest">LOADING NEURAL NETWORK...</p>
      </div>
    </div>
  )

  const { vault, plan, recentLogs = [], recentPages = [] } = data || {}

  return (
    <div ref={containerRef} className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-10 fade-up">
        <div>
          <p className="mono text-[10px] text-white/25 tracking-widest mb-2">SYSTEM · DASHBOARD</p>
          <h1 className="text-2xl font-black text-white/90">Knowledge Base</h1>
          <p className="text-white/30 text-sm mt-1">Your second brain status overview</p>
        </div>
        <Link href="/app/ingest"
          className="btn-primary flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg relative z-10">
          <Plus className="w-3.5 h-3.5" />
          Ingest Source
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="WIKI PAGES"    value={vault?.pageCount ?? 0}      icon={BookOpen}  color="text-violet-400" sub="IN KNOWLEDGE BASE" delay={0.1} />
        <StatCard label="SOURCES"       value={vault?.sourceCount ?? 0}    icon={Database}  color="text-blue-400"   sub="INGESTED SOURCES"  delay={0.2} />
        <StatCard label="QUERIES"       value={plan?.queriesThisMonth ?? 0} icon={Zap}       color="text-cyan-400"   sub="THIS MONTH"        delay={0.3} />
        <StatCard label="PLAN"          value={plan?.plan === 'pro' ? 'PRO' : 'FREE'} icon={Activity} color="text-emerald-400" sub={plan?.plan === 'free' ? `${25 - (plan?.ingestsThisMonth ?? 0)} INGESTS LEFT` : 'UNLIMITED'} delay={0.4} />
      </div>

      {/* Quick ingest */}
      <div className="fade-up-delay-2 glass border border-violet-500/15 rounded-xl p-6 mb-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-transparent" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 pulse-dot" />
              <p className="mono text-[10px] text-violet-300/70 tracking-widest">INGEST ENGINE · READY</p>
            </div>
            <h2 className="text-white/90 font-bold mb-1">Add to your knowledge base</h2>
            <p className="text-white/35 text-xs">Paste a URL or text — Claude reads, structures, and cross-links it automatically.</p>
          </div>
          <Link href="/app/ingest"
            className="btn-primary flex items-center gap-2 text-xs font-semibold px-5 py-3 rounded-lg relative z-10 shrink-0 ml-6">
            Initialize ingest
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Recent pages */}
        <div className="col-span-3 glass border border-white/5 rounded-xl p-5 fade-up-delay-3">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="mono text-[10px] text-white/25 tracking-widest mb-1">WIKI INDEX</p>
              <h2 className="text-sm font-bold text-white/80">Recent Pages</h2>
            </div>
            <Link href="/app/wiki" className="mono text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1 tracking-wider">
              VIEW ALL <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentPages.length === 0 ? (
            <div className="py-12 text-center">
              <BookOpen className="w-8 h-8 text-white/10 mx-auto mb-3" />
              <p className="mono text-xs text-white/20 tracking-wider">NO PAGES YET</p>
              <p className="text-white/30 text-xs mt-1">Ingest your first source to begin</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentPages.map((p: any) => (
                <Link key={p.slug} href={`/app/wiki/${p.slug}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/3 transition-colors group border border-transparent hover:border-white/5">
                  <span className={`mono text-[9px] px-2 py-0.5 rounded border font-medium shrink-0 tracking-wider ${TYPE_COLORS[p.type] || 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20'}`}>
                    {p.type?.toUpperCase().slice(0, 8)}
                  </span>
                  <p className="text-xs text-white/60 group-hover:text-white/90 flex-1 truncate transition-colors font-medium">{p.title}</p>
                  <p className="mono text-[9px] text-white/20 shrink-0">{timeAgo(p.updatedAt)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Activity log */}
        <div className="col-span-2 glass border border-white/5 rounded-xl p-5 fade-up-delay-4">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="mono text-[10px] text-white/25 tracking-widest mb-1">SYSTEM LOG</p>
              <h2 className="text-sm font-bold text-white/80">Activity</h2>
            </div>
            <Link href="/app/log" className="mono text-[10px] text-violet-400 hover:text-violet-300 tracking-wider">
              ALL →
            </Link>
          </div>

          {recentLogs.length === 0 ? (
            <div className="py-12 text-center">
              <Activity className="w-8 h-8 text-white/10 mx-auto mb-3" />
              <p className="mono text-xs text-white/20 tracking-wider">NO ACTIVITY</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentLogs.map((log: any) => (
                <div key={log._id} className="flex items-start gap-3 py-2 border-b border-white/3 last:border-0">
                  <span className={`mono text-[9px] font-medium shrink-0 mt-0.5 tracking-wider ${OP_COLORS[log.operation]}`}>
                    {log.operation?.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-white/40 truncate leading-relaxed">{log.summary}</p>
                    <p className="mono text-[9px] text-white/20 mt-0.5">{timeAgo(log.createdAt)}</p>
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
