'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, FileText, MessageSquare, Wrench } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

const OP_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  ingest: { icon: FileText,      color: 'text-violet-400', bg: 'bg-violet-500/10' },
  query:  { icon: MessageSquare, color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  lint:   { icon: Wrench,        color: 'text-amber-400',  bg: 'bg-amber-500/10' },
}

export default function LogPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        setLogs(d.recentLogs || [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Activity Log</h1>
        <p className="text-zinc-500 text-sm mt-1">Every operation your second brain has performed</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse">
              <div className="h-3 bg-zinc-800 rounded w-1/4 mb-2" />
              <div className="h-4 bg-zinc-800 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-24">
          <Clock className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
          <p className="text-zinc-500 text-sm">No activity yet. Ingest a source to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log: any) => {
            const cfg = OP_CONFIG[log.operation] || OP_CONFIG.ingest
            const Icon = cfg.icon
            return (
              <div key={log._id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-start gap-4">
                <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300">{log.summary}</p>
                  {log.pagesAffected?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {log.pagesAffected.slice(0, 5).map((slug: string) => (
                        <Link key={slug} href={`/app/wiki/${slug}`}
                          className="text-xs text-violet-400 hover:text-violet-300 bg-violet-500/10 px-1.5 py-0.5 rounded transition-colors">
                          {slug}
                        </Link>
                      ))}
                      {log.pagesAffected.length > 5 && (
                        <span className="text-xs text-zinc-600">+{log.pagesAffected.length - 5} more</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-zinc-600">{timeAgo(log.createdAt)}</p>
                  {log.tokensUsed > 0 && (
                    <p className="text-xs text-zinc-700 mt-0.5">{log.tokensUsed.toLocaleString()} tokens</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
