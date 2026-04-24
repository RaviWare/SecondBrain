'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, FileText, MessageSquare, Wrench, Clock, type LucideIcon } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

const SILVER = '#c8c8cf'

type LogEntry = {
  _id: string
  operation: string
  title?: string
  message?: string
  summary?: string
  createdAt: string | Date
  pagesAffected?: string[]
  tokensUsed?: number
}

const OP_CONFIG: Record<
  string,
  { icon: LucideIcon; tone: 'accent' | 'silver' | 'muted'; code: string }
> = {
  ingest: { icon: FileText,      tone: 'accent', code: 'INGEST' },
  query:  { icon: MessageSquare, tone: 'silver', code: 'QUERY'  },
  lint:   { icon: Wrench,        tone: 'muted',  code: 'LINT'   },
}

function toneColor(tone: 'accent' | 'silver' | 'muted') {
  if (tone === 'accent') return 'var(--accent-bright)'
  if (tone === 'silver') return SILVER
  return 'var(--text-muted)'
}

function toneChipStyle(tone: 'accent' | 'silver' | 'muted') {
  if (tone === 'accent')
    return {
      color: 'var(--accent-bright)',
      background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
      borderColor: 'color-mix(in srgb, var(--accent) 28%, transparent)',
    }
  if (tone === 'silver')
    return {
      color: SILVER,
      background: 'color-mix(in srgb, #ffffff 4%, transparent)',
      borderColor: 'var(--border)',
    }
  return {
    color: 'var(--text-muted)',
    background: 'var(--surface-2)',
    borderColor: 'var(--border)',
  }
}

export default function LogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => { if (!cancelled) setLogs(d.recentLogs || []) })
      .catch(() => { if (!cancelled) setLogs([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="p-8 max-w-3xl mx-auto text-[var(--text-primary)]">
      {/* Header */}
      <div className="mb-8">
        <p className="mono text-[10px] text-[var(--text-muted)] tracking-widest mb-2">
          SYSTEM LOG · TELEMETRY
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
        <p className="text-[var(--text-secondary)] text-sm mt-1">
          Every operation your second brain has performed
        </p>
      </div>

      {/* Stats bar */}
      {!loading && logs.length > 0 && (
        <div
          className="rounded-xl p-4 mb-6 flex items-center gap-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-bright)' }}
        >
          {Object.entries(OP_CONFIG).map(([op, cfg]) => {
            const count = logs.filter(l => l.operation === op).length
            return (
              <div key={op} className="flex items-center gap-2">
                <span
                  className="mono text-[9px] px-2 py-0.5 rounded border tracking-widest font-medium"
                  style={toneChipStyle(cfg.tone)}
                >
                  {cfg.code}
                </span>
                <span className="mono text-[10px] text-[var(--text-secondary)]">{count}</span>
              </div>
            )
          })}
          <span className="mono text-[9px] text-[var(--text-muted)] tracking-widest ml-auto">
            LAST {logs.length} EVENTS
          </span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-4 animate-pulse"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg" style={{ background: 'var(--surface-2)' }} />
                <div className="flex-1">
                  <div
                    className="h-2.5 rounded w-1/4 mb-2"
                    style={{ background: 'var(--surface-2)' }}
                  />
                  <div
                    className="h-3 rounded w-3/4"
                    style={{ background: 'var(--surface-2)' }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-bright)' }}
          >
            <Activity className="w-7 h-7 text-[var(--text-muted)]" />
          </div>
          <p className="mono text-[10px] text-[var(--text-muted)] tracking-widest mb-2">
            NO ACTIVITY YET
          </p>
          <p className="text-[var(--text-secondary)] text-sm">
            Ingest a source to begin logging.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log: LogEntry, idx: number) => {
            const cfg = OP_CONFIG[log.operation] || OP_CONFIG.ingest
            const Icon = cfg.icon
            return (
              <div
                key={log._id}
                className="rounded-xl p-4 flex items-start gap-4 relative overflow-hidden transition-colors"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-bright)',
                }}
              >
                {/* Timeline line */}
                {idx < logs.length - 1 && (
                  <div
                    className="absolute left-[27px] top-12 bottom-[-10px] w-px"
                    style={{ background: 'var(--border)' }}
                  />
                )}

                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative z-10"
                  style={toneChipStyle(cfg.tone)}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: toneColor(cfg.tone) }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="mono text-[9px] font-medium tracking-widest"
                      style={{ color: toneColor(cfg.tone) }}
                    >
                      {cfg.code}
                    </span>
                    <span className="mono text-[9px] text-[var(--text-muted)] tracking-wider flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {timeAgo(log.createdAt).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {log.summary}
                  </p>
                  {(log.pagesAffected?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {log.pagesAffected!.slice(0, 5).map((slug: string) => (
                        <Link
                          key={slug}
                          href={`/app/wiki/${slug}`}
                          className="mono text-[9px] px-1.5 py-0.5 rounded tracking-wider transition-colors"
                          style={{
                            color: 'var(--accent-bright)',
                            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
                          }}
                        >
                          {slug}
                        </Link>
                      ))}
                      {log.pagesAffected!.length > 5 && (
                        <span className="mono text-[9px] text-[var(--text-muted)]">
                          +{log.pagesAffected!.length - 5} MORE
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {(log.tokensUsed ?? 0) > 0 && (
                  <div className="shrink-0 text-right">
                    <p className="mono text-[9px] text-[var(--text-secondary)] tracking-wider">
                      {log.tokensUsed!.toLocaleString()}
                    </p>
                    <p className="mono text-[8px] text-[var(--text-muted)] tracking-widest">
                      TOKENS
                    </p>
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
