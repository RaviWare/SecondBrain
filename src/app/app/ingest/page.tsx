'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Link2, FileText, CheckCircle2, AlertCircle, Loader2, ArrowRight, Zap, Brain, Upload, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'url' | 'text' | 'file'

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB — practical ceiling for pdfjs/mammoth in-browser
const ACCEPTED_EXT = ['.pdf', '.docx', '.md', '.txt'] as const
type Status = 'idle' | 'loading' | 'success' | 'error'

interface IngestResult {
  pages: Array<{ slug: string; title: string; type: string }>
  tokensUsed: number
}

const SILVER = '#c8c8cf'

/** Node-type chip palette — accent / silver only. */
const TYPE_TONE: Record<string, 'accent' | 'silver'> = {
  concept: 'accent',
  entity: 'silver',
  synthesis: 'accent',
  pattern: 'silver',
  'source-summary': 'silver',
}

const STEPS = [
  { label: 'Fetching source content',    code: 'FETCH' },
  { label: 'Analyzing with Claude AI',   code: 'ANALYZE' },
  { label: 'Writing wiki pages',         code: 'WRITE' },
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
  // File-tab state: we parse to text client-side then POST as `type:'text'`.
  // Each entry stores filename + size + its own extracted text so the user
  // can drop individual files from the list and keep the rest. On submit we
  // concat all extracted text with source-title separators so Claude can
  // still tell pieces apart when writing timeline entries.
  const [fileMetas, setFileMetas] = useState<Array<{ name: string; size: number; text: string }>>([])
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const router = useRouter()

  // ── File parsers ──────────────────────────────────────────────────────────
  // Client-side extraction avoids a multipart backend and any blob storage.
  // pdfjs-dist + mammoth are dynamic-imported so the ingest page's main
  // bundle stays small; they only load when the user picks that tab.
  async function parseOneFile(f: File): Promise<string> {
    if (f.size > MAX_FILE_BYTES) {
      throw new Error(`${f.name}: too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 50 MB.`)
    }
    const name = f.name.toLowerCase()
    const ext = ACCEPTED_EXT.find(e => name.endsWith(e))
    if (!ext) throw new Error(`${f.name}: unsupported type. Use ${ACCEPTED_EXT.join(', ')}.`)

    let extracted = ''
    if (ext === '.txt' || ext === '.md') {
      extracted = await f.text()
    } else if (ext === '.pdf') {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
      const buf = await f.arrayBuffer()
      const doc = await pdfjs.getDocument({ data: buf }).promise
      const parts: string[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const content = await page.getTextContent()
        parts.push(
          content.items
            .map(it => ('str' in it ? (it as { str: string }).str : ''))
            .join(' '),
        )
      }
      extracted = parts.join('\n\n')
    } else if (ext === '.docx') {
      const mammoth = await import('mammoth')
      const buf = await f.arrayBuffer()
      const { value } = await mammoth.extractRawText({ arrayBuffer: buf })
      extracted = value
    }
    extracted = extracted.trim()
    if (extracted.length < 50) {
      throw new Error(`${f.name}: less than 50 characters extracted — likely scanned/image-only.`)
    }
    return extracted
  }

  async function parseFiles(files: FileList) {
    setParseError('')
    setParsing(true)
    const added: typeof fileMetas = []
    const errors: string[] = []
    for (const f of Array.from(files)) {
      // Skip files we already hold (by name + size) — the native input doesn't
      // dedupe across picks, so without this the same file gets appended twice.
      if (fileMetas.some(m => m.name === f.name && m.size === f.size)) continue
      try {
        const text = await parseOneFile(f)
        added.push({ name: f.name, size: f.size, text })
      } catch (e) {
        errors.push(e instanceof Error ? e.message : `${f.name}: parse failed`)
      }
    }
    if (added.length) {
      setFileMetas(prev => {
        const next = [...prev, ...added]
        // Keep the concatenated text in sync so Initialize Ingest can POST it.
        setText(joinFileText(next))
        return next
      })
      if (!title) {
        setTitle(added.length === 1
          ? added[0].name.replace(/\.[^.]+$/, '')
          : `${added[0].name.replace(/\.[^.]+$/, '')} + ${added.length - 1} more`)
      }
    }
    if (errors.length) setParseError(errors.join(' · '))
    setParsing(false)
  }

  function joinFileText(list: Array<{ name: string; text: string }>) {
    return list
      .map(m => `# ${m.name}\n\n${m.text}`)
      .join('\n\n---\n\n')
  }

  function removeFile(name: string, size: number) {
    setFileMetas(prev => {
      const next = prev.filter(m => !(m.name === name && m.size === size))
      setText(next.length ? joinFileText(next) : '')
      return next
    })
  }

  function clearAllFiles() {
    setFileMetas([])
    setText('')
    setParseError('')
  }

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
      // Backend has two branches (url/text). File tab reuses the text branch
      // since parsing already happened client-side; title defaults differ.
      const body = tab === 'url'
        ? { type: 'url', url, title: title || undefined }
        : {
          type: 'text',
          text,
          title: title || (tab === 'file'
            ? (fileMetas[0]?.name ?? 'Uploaded File')
            : 'Pasted Note'),
        }

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
      setFileMetas([])
    } catch {
      clearInterval(timer)
      setError('Network error. Please try again.')
      setStatus('error')
    }
  }

  const canSubmit =
    tab === 'url'  ? url.trim().startsWith('http') :
    tab === 'text' ? text.trim().length > 50 :
    /* file */       fileMetas.length > 0 && text.trim().length > 50 && !parsing

  return (
    <div className="p-8 max-w-2xl mx-auto text-[var(--text-primary)]">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <p className="mono text-[10px] text-[var(--text-muted)] tracking-widest mb-2">
            INGEST ENGINE · READY
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Add to Knowledge Base</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">
            Paste a URL or text — Claude reads, structures, and cross-links it automatically.
          </p>
        </div>

        {/* Tabs */}
        <div
          className="rounded-xl p-1 flex gap-1"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {([
            { key: 'url',  label: 'FROM URL',    Icon: Link2 },
            { key: 'text', label: 'PASTE TEXT',  Icon: FileText },
            { key: 'file', label: 'UPLOAD FILE', Icon: Upload },
          ] as const).map(({ key, label, Icon }) => {
            const on = tab === key
            return (
              <button
                key={key}
                onClick={() => { setTab(key); setStatus('idle'); setResult(null) }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200'
                )}
                style={
                  on
                    ? {
                        background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                        color: '#0b0b0d',
                        boxShadow: '0 8px 20px -8px color-mix(in srgb, var(--accent) 45%, transparent)',
                      }
                    : { color: 'var(--text-secondary)' }
                }
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="mono tracking-wider">{label}</span>
              </button>
            )
          })}
        </div>

        {/* Inputs */}
        <div
          className="rounded-xl p-6 space-y-4"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-bright)',
            boxShadow: 'var(--shadow-1)',
          }}
        >
          {tab === 'file' ? (
            <Field label="UPLOAD FILE">
              <label
                className={cn(
                  'block rounded-lg border-2 border-dashed px-5 py-7 text-center cursor-pointer transition-colors',
                  parsing && 'opacity-60 cursor-wait',
                )}
                style={{
                  background: 'var(--surface-2)',
                  borderColor: parseError ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--border)',
                }}
              >
                <input
                  type="file"
                  multiple
                  accept={ACCEPTED_EXT.join(',')}
                  className="sr-only"
                  disabled={parsing}
                  onChange={e => {
                    const fs = e.target.files
                    if (fs && fs.length) parseFiles(fs)
                    // reset so selecting same file again re-triggers onChange
                    e.target.value = ''
                  }}
                />
                {fileMetas.length > 0 ? (
                  <div className="flex flex-col gap-2 text-left">
                    {fileMetas.map(m => {
                      const words = m.text.trim().split(/\s+/).filter(Boolean).length
                      return (
                        <div
                          key={`${m.name}-${m.size}`}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                        >
                          <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-bright)' }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-[var(--text-primary)] font-medium truncate">{m.name}</p>
                            <p className="mono text-[10px] text-[var(--text-muted)] tracking-widest">
                              {(m.size / 1024).toFixed(1)} KB · {words} WORDS
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={e => { e.preventDefault(); e.stopPropagation(); removeFile(m.name, m.size) }}
                            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[var(--surface-2)] transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                    <div className="flex items-center justify-between mt-1 mono text-[10px] tracking-widest">
                      <span style={{ color: 'var(--accent-bright)' }}>
                        + ADD MORE FILES
                      </span>
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); clearAllFiles() }}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        CLEAR ALL
                      </button>
                    </div>
                  </div>
                ) : parsing ? (
                  <div className="flex items-center justify-center gap-2 text-[var(--text-secondary)]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="mono text-[10px] tracking-widest">PARSING…</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-[var(--text-secondary)]">
                    <Upload className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm">
                      Click to choose files
                    </p>
                    <p className="mono text-[10px] text-[var(--text-muted)] tracking-widest">
                      PDF · DOCX · MD · TXT · MULTI-SELECT · UP TO 50 MB EACH
                    </p>
                  </div>
                )}
              </label>
              {parseError && (
                <p className="mono text-[10px] mt-2 tracking-wider" style={{ color: 'var(--accent-bright)' }}>
                  {parseError}
                </p>
              )}
            </Field>
          ) : tab === 'url' ? (
            <Field label="SOURCE URL">
              <div className="relative">
                <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full rounded-lg pl-10 pr-4 py-3 text-sm transition-colors focus:outline-none"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </Field>
          ) : (
            <Field label="CONTENT">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Paste any text, notes, article content, or research…"
                rows={8}
                className="w-full rounded-lg px-4 py-3 text-sm transition-colors focus:outline-none resize-none leading-relaxed"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <p className="mono text-[10px] text-[var(--text-muted)] mt-1.5">
                {text.trim().split(/\s+/).filter(Boolean).length} WORDS
              </p>
            </Field>
          )}

          <Field label={<>TITLE <span className="text-[var(--text-muted)]">· OPTIONAL</span></>}>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={tab === 'url' ? 'Auto-detected from page' : 'Give this a title'}
              className="w-full rounded-lg px-4 py-3 text-sm transition-colors focus:outline-none"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </Field>

          <button
            onClick={handleIngest}
            disabled={!canSubmit || status === 'loading'}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-opacity hover:opacity-95"
            style={{
              background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
              color: '#0b0b0d',
              boxShadow: '0 10px 24px -10px color-mix(in srgb, var(--accent) 50%, transparent)',
            }}
          >
            {status === 'loading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="mono tracking-wider">{STEPS[currentStep]?.code}…</span>
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
          <div
            className="rounded-xl p-5 relative overflow-hidden"
            style={{
              background: 'var(--surface)',
              border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
              boxShadow: 'var(--shadow-1)',
            }}
          >
            <p className="mono text-[10px] tracking-widest mb-4" style={{ color: 'var(--accent-bright)' }}>
              PROCESSING PIPELINE
            </p>
            <div className="space-y-3">
              {STEPS.map((step, i) => {
                const done = i < currentStep
                const active = i === currentStep
                return (
                  <div
                    key={step.code}
                    className={cn('flex items-center gap-3 transition-all duration-500', done || active ? 'opacity-100' : 'opacity-35')}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all"
                      style={
                        done
                          ? {
                              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                              border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                            }
                          : active
                            ? {
                                background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
                              }
                            : {
                                background: 'var(--surface-2)',
                                border: '1px solid var(--border)',
                              }
                      }
                    >
                      {done ? (
                        <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--accent-bright)' }} />
                      ) : active ? (
                        <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-bright)' }} />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-muted)' }} />
                      )}
                    </div>
                    <span
                      className="mono text-[10px] tracking-wider flex-1"
                      style={{
                        color: done
                          ? 'var(--accent-bright)'
                          : active
                            ? 'var(--text-primary)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {step.label.toUpperCase()}
                    </span>
                    {done && (
                      <span
                        className="mono text-[9px]"
                        style={{ color: 'var(--accent-bright)' }}
                      >
                        DONE
                      </span>
                    )}
                    {active && (
                      <span
                        className="w-1.5 h-1.5 rounded-full pulse-dot"
                        style={{ background: 'var(--accent)' }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            {/* Progress bar */}
            <div className="mt-5 h-px rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div
                className="h-full transition-all duration-700"
                style={{
                  width: `${((currentStep + 1) / STEPS.length) * 100}%`,
                  background: 'linear-gradient(90deg, var(--accent-bright), var(--accent))',
                }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div
            className="rounded-xl p-5"
            style={{
              background: 'var(--surface)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            }}
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-bright)' }} />
              <div>
                <p className="mono text-[10px] tracking-widest mb-1" style={{ color: 'var(--accent-bright)' }}>
                  ERROR · INGEST FAILED
                </p>
                <p className="text-sm text-[var(--text-primary)]">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success */}
        {status === 'success' && result && (
          <div
            className="rounded-xl p-5 relative overflow-hidden"
            style={{
              background: 'var(--surface)',
              border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
              boxShadow: 'var(--shadow-1)',
            }}
          >
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
                  }}
                >
                  <Brain className="w-4 h-4" style={{ color: 'var(--accent-bright)' }} />
                </div>
                <div>
                  <p className="mono text-[10px] tracking-widest" style={{ color: 'var(--accent-bright)' }}>
                    INGEST COMPLETE
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {result.pages.length} pages · {result.tokensUsed.toLocaleString()} tokens
                  </p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                {result.pages.map(p => {
                  const tone = TYPE_TONE[p.type] ?? 'silver'
                  const chipStyle =
                    tone === 'accent'
                      ? {
                          color: 'var(--accent-bright)',
                          background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                          borderColor: 'color-mix(in srgb, var(--accent) 28%, transparent)',
                        }
                      : {
                          color: SILVER,
                          background: 'color-mix(in srgb, #ffffff 4%, transparent)',
                          borderColor: 'var(--border)',
                        }
                  return (
                    <button
                      key={p.slug}
                      onClick={() => router.push(`/app/wiki/${p.slug}`)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg transition-all group text-left"
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <span
                        className="mono text-[9px] px-2 py-0.5 rounded border font-medium shrink-0 tracking-wider"
                        style={chipStyle}
                      >
                        {p.type?.toUpperCase().slice(0, 8)}
                      </span>
                      <span className="text-xs text-[var(--text-primary)] flex-1 truncate">{p.title}</span>
                      <ArrowRight className="w-3 h-3 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    </button>
                  )
                })}
              </div>

              <button
                onClick={() => { setStatus('idle'); setResult(null) }}
                className="w-full mono text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] tracking-widest transition-colors py-2"
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

/* ═══════════════════════════════════════════════════════ */
function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="mono text-[10px] text-[var(--text-muted)] tracking-widest block mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}
