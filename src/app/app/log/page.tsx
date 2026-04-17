'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import { Activity, FileText, MessageSquare, Wrench, Clock } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

const OP_CONFIG: Record<string, { icon: any; color: string; bg: string; border: string; code: string }> = {
  ingest: { icon: FileText,      color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', code: 'INGEST' },
  query:  { icon: MessageSquare, color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20',   code: 'QUERY'  },
  lint:   { icon: Wrench,        color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  code: 'LINT'   },
}

export default function LogPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        setLogs(d.recentLogs || [])
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!loading && listRef.current) {
      gsap.from(listRef.current.children, {
        opacity: 0, x: -12, duration: 0.4, stagger: 0.06, ease: 'power2.out'
      })
    }
  }, [loading])

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8 fade-up">
        <p className="mono text-[10px] text-white/25 tracking-widest mb-2">SYSTEM LOG · TELEMETRY</p>
        <h1 className="text-2xl font-black text-white/90">Activity Log</h1>
        <p className="text-white/30 text-sm mt-1">Every operation your second brain has performed</p>
      </div>

      {/* Stats bar */}
      {!loading && logs.length > 0 && (
        <div className="glass border border-white/5 rounded-xl p-4 mb-6 fade-up flex items-center gap-6">
          {Object.entries(OP_CONFIG).map(([op, cfg]) => {
            const count = logs.filter(l => l.operation === op).length
            return (
              <div key={op} className="flex items-center gap-2">
                <span className={`mono text-[9px] px-2 py-0.5 rounded border tracking-widest font-medium ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                  {cfg.code}
                </span>
                <span className="mono text-[10px] text-white/40">{count}</span>
              </div>
            )
          })}
          <span className="mono text-[9px] text-white/15 tracking-widest ml-auto">LAST {logs.length} EVENTS</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="glass border border-white/5 rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/5" />
                <div className="flex-1">
                  <div className="h-2.5 bg-white/5 rounded w-1/4 mb-2" />
                  <div className="h-3 bg-white/5 rounded w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="w-16 h-16 rounded-2xl glass border border-white/5 flex items-center justify-center mb-6">
            <Activity className="w-7 h-7 text-white/15" />
          </div>
          <p className="mono text-[10px] text-white/25 tracking-widest mb-2">NO ACTIVITY YET</p>
          <p className="text-white/30 text-sm">Ingest a source to begin logging.</p>
        </div>
      ) : (
        <div ref={listRef} className="space-y-2">
          {logs.map((log: any, idx: number) => {
            const cfg = OP_CONFIG[log.operation] || OP_CONFIG.ingest
            const Icon = cfg.icon
            return (
              <div
                key={log._id}
                className="glass border border-white/5 hover:border-white/8 rounded-xl p-4 flex items-start gap-4 transition-colors group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/3 to-transparent" />

                {/* Timeline line */}
                {idx < logs.length - 1 && (
                  <div className="absolute left-[27px] top-12 bottom-[-10px] w-px bg-white/5" />
                )}

                <div className={`w-8 h-8 rounded-lg ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0 relative z-10`}>
                  <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`mono text-[9px] font-medium tracking-widest ${cfg.color}`}>
                      {cfg.code}
                    </span>
                    <span className="mono text-[9px] text-white/15 tracking-wider flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {timeAgo(log.createdAt).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-white/50 group-hover:text-white/70 transition-colors leading-relaxed">
                    {log.summary}
                  </p>
                  {log.pagesAffected?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {log.pagesAffected.slice(0, 5).map((slug: string) => (
                        <Link
                          key={slug}
                          href={`/app/wiki/${slug}`}
                          className="mono text-[9px] text-violet-400 hover:text-violet-300 bg-violet-500/8 border border-violet-500/15 px-1.5 py-0.5 rounded tracking-wider transition-colors"
                        >
                          {slug}
                        </Link>
                      ))}
                      {log.pagesAffected.length > 5 && (
                        <span className="mono text-[9px] text-white/20">+{log.pagesAffected.length - 5} MORE</span>
                      )}
                    </div>
                  )}
                </div>

                {log.tokensUsed > 0 && (
                  <div className="shrink-0 text-right">
                    <p className="mono text-[9px] text-white/20 tracking-wider">
                      {log.tokensUsed.toLocaleString()}
                    </p>
                    <p className="mono text-[8px] text-white/10 tracking-widest">TOKENS</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
