'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, FileText, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'url' | 'text'
type Status = 'idle' | 'loading' | 'success' | 'error'

interface IngestResult {
  pages: Array<{ slug: string; title: string; type: string }>
  tokensUsed: number
}

const TYPE_COLORS: Record<string, string> = {
  'source-summary': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  concept:          'bg-violet-500/20 text-violet-300 border-violet-500/30',
  entity:           'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  synthesis:        'bg-amber-500/20 text-amber-300 border-amber-500/30',
  pattern:          'bg-rose-500/20 text-rose-300 border-rose-500/30',
}

export default function IngestPage() {
  const [tab, setTab] = useState<Tab>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<IngestResult | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const router = useRouter()

  const steps = [
    'Fetching source content...',
    'Reading and analyzing with Claude...',
    'Writing wiki pages...',
    'Updating cross-references...',
    'Done!',
  ]

  async function handleIngest() {
    setStatus('loading')
    setResult(null)
    setError('')

    let step = 0
    setProgress(steps[0])
    const timer = setInterval(() => {
      step = Math.min(step + 1, steps.length - 2)
      setProgress(steps[step])
    }, 2500)

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

      setProgress(steps[steps.length - 1])
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Ingest Source</h1>
        <p className="text-zinc-500 text-sm mt-1">Add a URL or paste text — Claude builds wiki pages automatically.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800 mb-6">
        {(['url', 'text'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setStatus('idle'); setResult(null) }}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors',
              tab === t ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            {t === 'url' ? <Link2 className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            {t === 'url' ? 'From URL' : 'Paste Text'}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tab === 'url' ? (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Content</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste any text, notes, article content, or research..."
              rows={8}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors resize-none"
            />
            <p className="text-xs text-zinc-600 mt-1">{text.trim().split(/\s+/).filter(Boolean).length} words</p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Title <span className="text-zinc-600">(optional)</span></label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={tab === 'url' ? 'Auto-detected from page' : 'Give this a title'}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        <button
          onClick={handleIngest}
          disabled={!canSubmit || status === 'loading'}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors"
        >
          {status === 'loading' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {progress}
            </>
          ) : 'Ingest & Build Wiki Pages'}
        </button>
      </div>

      {/* Progress Steps */}
      {status === 'loading' && (
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="space-y-3">
            {steps.slice(0, -1).map((step, i) => {
              const currentIdx = steps.indexOf(progress)
              const done = i < currentIdx
              const active = i === currentIdx
              return (
                <div key={step} className={cn('flex items-center gap-3 text-sm transition-colors',
                  done ? 'text-emerald-400' : active ? 'text-violet-300' : 'text-zinc-600')}>
                  {done ? <CheckCircle2 className="w-4 h-4 shrink-0" /> :
                   active ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> :
                   <div className="w-4 h-4 rounded-full border border-zinc-700 shrink-0" />}
                  {step}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="mt-6 flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Success */}
      {status === 'success' && result && (
        <div className="mt-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <p className="text-sm font-medium text-emerald-300">
              Created {result.pages.length} wiki pages · {result.tokensUsed.toLocaleString()} tokens used
            </p>
          </div>
          <div className="space-y-2">
            {result.pages.map(p => (
              <button
                key={p.slug}
                onClick={() => router.push(`/app/wiki/${p.slug}`)}
                className="w-full flex items-center gap-3 p-3 bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors text-left group"
              >
                <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium shrink-0', TYPE_COLORS[p.type] || 'bg-zinc-700 text-zinc-300 border-zinc-600')}>
                  {p.type}
                </span>
                <span className="text-sm text-zinc-200 group-hover:text-white flex-1 truncate">{p.title}</span>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400" />
              </button>
            ))}
          </div>
          <button
            onClick={() => { setStatus('idle'); setResult(null) }}
            className="mt-4 w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Ingest another source
          </button>
        </div>
      )}
    </div>
  )
}
