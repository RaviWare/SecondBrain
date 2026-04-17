'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { gsap } from 'gsap'
import { Link2, FileText, CheckCircle2, AlertCircle, Loader2, ArrowRight, Zap, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'url' | 'text'
type Status = 'idle' | 'loading' | 'success' | 'error'

interface IngestResult {
  pages: Array<{ slug: string; title: string; type: string }>
  tokensUsed: number
}

const TYPE_COLORS: Record<string, string> = {
  'source-summary': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  concept:          'text-violet-400 bg-violet-500/10 border-violet-500/20',
  entity:           'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  synthesis:        'text-amber-400 bg-amber-500/10 border-amber-500/20',
  pattern:          'text-rose-400 bg-rose-500/10 border-rose-500/20',
}

const STEPS = [
  { label: 'Fetching source content',     code: 'FETCH' },
  { label: 'Analyzing with Claude AI',    code: 'ANALYZE' },
  { label: 'Writing wiki pages',          code: 'WRITE' },
  { label: 'Updating cross-references',  code: 'LINK' },
  { label: 'Indexing knowledge graph',   code: 'INDEX' },
]

export default function IngestPage() {
  const [tab, setTab] = useState<Tab>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<IngestResult | null>(null)
  const [error, setError] = useState('')
  const [currentStep, setCurrentStep] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!containerRef.current) return
    gsap.from(containerRef.current.children, {
      opacity: 0, y: 24, duration: 0.5, stagger: 0.08, ease: 'power2.out'
    })
  }, [])

  async function handleIngest() {
    setStatus('loading')
    setResult(null)
    setError('')
    setCurrentStep(0)

    let step = 0
    const timer = setInterval(() => {
      step = Math.min(step + 1, STEPS.length - 1)
      setCurrentStep(step)
    }, 2200)

    try {
      const body = tab === 'url'
        ? { type: 'url', url, title: title || undefined }
        : { type: 'text', text, title: title || 'Pasted Note' }

      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      clearInterval(timer)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setStatus('error')
        return
      }

      setCurrentStep(STEPS.length - 1)
      setResult(data)
      setStatus('success')
      setUrl('')
      setText('')
      setTitle('')
    } catch {
      clearInterval(timer)
      setError('Network error. Please try again.')
      setStatus('error')
    }
  }

  const canSubmit = tab === 'url' ? url.trim().startsWith('http') : text.trim().length > 50

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div ref={containerRef} className="space-y-6">
        {/* Header */}
        <div>
          <p className="mono text-[10px] text-white/25 tracking-widest mb-2">INGEST ENGINE · READY</p>
          <h1 className="text-2xl font-black text-white/90">Add to Knowledge Base</h1>
          <p className="text-white/30 text-sm mt-1">Paste a URL or text — Claude reads, structures, and cross-links it automatically.</p>
        </div>

        {/* Tabs */}
        <div className="glass border border-white/5 rounded-xl p-1 flex gap-1">
          {(['url', 'text'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setStatus('idle'); setResult(null) }}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200',
                tab === t
                  ? 'bg-violet-600/80 text-white border border-violet-500/30 shadow-lg shadow-violet-500/20'
                  : 'text-white/30 hover:text-white/60'
              )}
            >
              {t === 'url' ? <Link2 className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
              <span className="mono tracking-wider">{t === 'url' ? 'FROM URL' : 'PASTE TEXT'}</span>
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="glass border border-white/5 rounded-xl p-6 space-y-4">
          {tab === 'url' ? (
            <div>
              <label className="mono text-[10px] text-white/30 tracking-widest block mb-2">SOURCE URL</label>
              <div className="relative">
                <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full bg-black/30 border border-white/8 rounded-lg pl-10 pr-4 py-3 text-sm text-white/80 placeholder-white/15 focus:outline-none focus:border-violet-500/50 transition-colors"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="mono text-[10px] text-white/30 tracking-widest block mb-2">CONTENT</label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Paste any text, notes, article content, or research..."
                rows={8}
                className="w-full bg-black/30 border border-white/8 rounded-lg px-4 py-3 text-sm text-white/80 placeholder-white/15 focus:outline-none focus:border-violet-500/50 transition-colors resize-none leading-relaxed"
              />
              <p className="mono text-[10px] text-white/20 mt-1.5">
                {text.trim().split(/\s+/).filter(Boolean).length} WORDS
              </p>
            </div>
          )}

          <div>
            <label className="mono text-[10px] text-white/30 tracking-widest block mb-2">
              TITLE <span className="text-white/15">· OPTIONAL</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={tab === 'url' ? 'Auto-detected from page' : 'Give this a title'}
              className="w-full bg-black/30 border border-white/8 rounded-lg px-4 py-3 text-sm text-white/80 placeholder-white/15 focus:outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>

          <button
            onClick={handleIngest}
            disabled={!canSubmit || status === 'loading'}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed relative overflow-hidden"
          >
            {status === 'loading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="mono tracking-wider">{STEPS[currentStep]?.code}...</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Initialize Ingest
              </>
            )}
          </button>
        </div>

        {/* Progress Steps */}
        {status === 'loading' && (
          <div className="glass border border-violet-500/15 rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600/3 to-transparent" />
            <p className="mono text-[10px] text-violet-300/60 tracking-widest mb-4">PROCESSING PIPELINE</p>
            <div className="space-y-3">
              {STEPS.map((step, i) => {
                const done = i < currentStep
                const active = i === currentStep
                return (
                  <div key={step.code} className={cn(
                    'flex items-center gap-3 transition-all duration-500',
                    done ? 'opacity-100' : active ? 'opacity-100' : 'opacity-25'
                  )}>
                    <div className={cn('w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all',
                      done ? 'bg-emerald-500/20 border border-emerald-500/40' :
                      active ? 'bg-violet-500/20 border border-violet-500/40' :
                      'bg-white/5 border border-white/10')}>
                      {done ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : active ? (
                        <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                      )}
                    </div>
                    <span className={cn('mono text-[10px] tracking-wider flex-1',
                      done ? 'text-emerald-400' : active ? 'text-violet-300' : 'text-white/30')}>
                      {step.label.toUpperCase()}
                    </span>
                    {done && <span className="mono text-[9px] text-emerald-400/60">DONE</span>}
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 pulse-dot" />}
                  </div>
                )
              })}
            </div>
            {/* Progress bar */}
            <div className="mt-5 h-px bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-700"
                style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="glass border border-red-500/20 rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="mono text-[10px] text-red-400/60 tracking-widest mb-1">ERROR · INGEST FAILED</p>
                <p className="text-sm text-red-300/80">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success */}
        {status === 'success' && result && (
          <div className="glass border border-emerald-500/20 rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/5 to-transparent" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="mono text-[10px] text-emerald-400/70 tracking-widest">INGEST COMPLETE</p>
                  <p className="text-xs text-white/50">{result.pages.length} pages · {result.tokensUsed.toLocaleString()} tokens</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {result.pages.map(p => (
                  <button
                    key={p.slug}
                    onClick={() => router.push(`/app/wiki/${p.slug}`)}
                    className="w-full flex items-center gap-3 p-3 glass border border-white/5 hover:border-violet-500/20 rounded-lg transition-all group text-left"
                  >
                    <span className={cn('mono text-[9px] px-2 py-0.5 rounded border font-medium shrink-0 tracking-wider',
                      TYPE_COLORS[p.type] || 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20')}>
                      {p.type?.toUpperCase().slice(0, 8)}
                    </span>
                    <span className="text-xs text-white/60 group-hover:text-white/90 flex-1 truncate transition-colors">{p.title}</span>
                    <ArrowRight className="w-3 h-3 text-white/20 group-hover:text-violet-400 transition-colors shrink-0" />
                  </button>
                ))}
              </div>

              <button
                onClick={() => { setStatus('idle'); setResult(null) }}
                className="w-full mono text-[10px] text-white/20 hover:text-white/50 tracking-widest transition-colors py-2"
              >
                INGEST ANOTHER SOURCE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
