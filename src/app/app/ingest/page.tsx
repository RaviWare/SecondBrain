'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Link2, FileText, CheckCircle2, AlertCircle, Loader2, ArrowRight, Zap, Brain, Upload, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSpotlight } from '@/lib/use-spotlight'

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
  return (
    <Suspense fallback={null}>
      <IngestView />
    </Suspense>
  )
}

function IngestView() {
  const searchParams = useSearchParams()
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
  const spotlight = useSpotlight<HTMLDivElement>()

  // Preselect the tab from the dashboard "Add" menu (?type=note|file|url|transcript).
  useEffect(() => {
    const t = searchParams.get('type')
    if (t === 'file') setTab('file')
    else if (t === 'url') setTab('url')
    else if (t === 'note' || t === 'text' || t === 'transcript') setTab('text')
  }, [searchParams])

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
    // Guard (Req 5.9, 10.7): never act while not submittable or already loading,
    // for pointer OR keyboard (Enter/Space) activation. Native `disabled` already
    // blocks activation; this makes the contract robust regardless of caller.
    if (!canSubmit || status === 'loading') return
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

  // Glass-system input styling, synced with the dashboard's frosted controls.
  // Dark inset wells (--dash-card-solid) read like the dashboard's deep panels,
  // not light grey overlays.
  const fieldClass =
    'w-full rounded-xl px-4 py-3 text-sm bg-[var(--dash-card-solid)] border border-[var(--dash-border)] ' +
    'text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-subtle)] ' +
    'focus:border-[var(--dash-border-glow)] focus:shadow-[0_0_0_3px_var(--dash-accent-soft)]'

  const submitReady = canSubmit && status !== 'loading'
  const submitGlow = submitReady || status === 'loading'

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <div className="space-y-6">
          {/* Header */}
          <header className="dash-rise" style={{ animationDelay: '0s' }}>
            <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
              Ingest engine · Ready
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="dash-metallic-text">Add to Knowledge Base</span>
            </h1>
            <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
              Paste a URL or text — Claude reads, structures, and cross-links it automatically.
            </p>
          </header>

          {/* Tabs — glass segmented control */}
          <div
            className="dash-rise grid grid-cols-1 gap-1 rounded-2xl p-1.5 sm:grid-cols-3"
            style={{ animationDelay: '0.06s', background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
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
                  className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-all duration-200"
                  style={
                    on
                      ? {
                          background: 'var(--dash-accent-soft)',
                          color: 'var(--dash-accent)',
                          border: '1px solid var(--dash-border-glow)',
                        }
                      : { color: 'var(--dash-muted)', border: '1px solid transparent' }
                  }
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="mono tracking-wider">{label}</span>
                </button>
              )
            })}
          </div>

          {/* Inputs — frosted glass panel with the dashboard's signature FX:
              grain texture + cursor spotlight + drifting warm aura */}
          <div
            ref={spotlight.ref}
            onMouseMove={spotlight.onMouseMove}
            className="dash-panel dash-grain dash-spotlight dash-rise relative overflow-hidden rounded-2xl p-6 space-y-4"
            style={{ animationDelay: '0.12s' }}
          >
            <span className="dash-spotlight-glow" aria-hidden />
            {/* warm aura glow — gentle drift, mirrors the dashboard hero */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full blur-2xl"
              style={{ background: 'radial-gradient(circle, var(--dash-accent-soft), transparent 70%)' }}
            />
            <div className="relative space-y-4">
            {tab === 'file' ? (
              <Field label="UPLOAD FILE">
                <label
                  className={cn(
                    'block rounded-xl border-2 border-dashed px-5 py-7 text-center cursor-pointer transition-colors',
                    parsing && 'opacity-60 cursor-wait',
                  )}
                  style={{
                    background: 'var(--dash-card-solid)',
                    borderColor: parseError ? 'var(--dash-border-glow)' : 'var(--dash-border)',
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
                            style={{ background: 'var(--dash-card-strong)', border: '1px solid var(--dash-border)' }}
                          >
                            <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--dash-accent)' }} />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-[var(--dash-text)] font-medium truncate">{m.name}</p>
                              <p className="mono text-[10px] text-[var(--dash-subtle)] tracking-widest">
                                {(m.size / 1024).toFixed(1)} KB · {words} WORDS
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={e => { e.preventDefault(); e.stopPropagation(); removeFile(m.name, m.size) }}
                              className="w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--dash-soft)]"
                              style={{ color: 'var(--dash-subtle)' }}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      })}
                      <div className="flex items-center justify-between mt-1 mono text-[10px] tracking-widest">
                        <span style={{ color: 'var(--dash-accent)' }}>
                          + ADD MORE FILES
                        </span>
                        <button
                          type="button"
                          onClick={e => { e.preventDefault(); e.stopPropagation(); clearAllFiles() }}
                          className="text-[var(--dash-subtle)] hover:text-[var(--dash-text)] transition-colors"
                        >
                          CLEAR ALL
                        </button>
                      </div>
                    </div>
                  ) : parsing ? (
                    <div className="flex items-center justify-center gap-2 text-[var(--dash-muted)]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="mono text-[10px] tracking-widest">PARSING…</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[var(--dash-muted)]">
                      <Upload className="w-5 h-5" style={{ color: 'var(--dash-subtle)' }} />
                      <p className="text-sm">
                        Click to choose files
                      </p>
                      <p className="mono text-[10px] text-[var(--dash-subtle)] tracking-widest">
                        PDF · DOCX · MD · TXT · MULTI-SELECT · UP TO 50 MB EACH
                      </p>
                    </div>
                  )}
                </label>
                {parseError && (
                  <p className="mono text-[10px] mt-2 tracking-wider" style={{ color: 'var(--dash-accent)' }}>
                    {parseError}
                  </p>
                )}
              </Field>
            ) : tab === 'url' ? (
              <Field label="SOURCE URL">
                <div className="relative">
                  <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--dash-subtle)]" />
                  <input
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://example.com/article"
                    className={cn(fieldClass, 'pl-10')}
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
                  className={cn(fieldClass, 'resize-none leading-relaxed')}
                />
                <p className="mono text-[10px] text-[var(--dash-subtle)] mt-1.5">
                  {text.trim().split(/\s+/).filter(Boolean).length} WORDS
                </p>
              </Field>
            )}

            <Field label={<>TITLE <span className="text-[var(--dash-subtle)]">· OPTIONAL</span></>}>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={tab === 'url' ? 'Auto-detected from page' : 'Give this a title'}
                className={fieldClass}
              />
            </Field>

            <button
              onClick={handleIngest}
              disabled={!canSubmit || status === 'loading'}
              aria-busy={status === 'loading'}
              className={cn(
                'relative inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl text-sm font-semibold transition',
                submitGlow
                  ? 'dash-accent-grad text-white shadow-[0_16px_36px_-10px_rgba(255,102,0,0.6)]'
                  : 'cursor-not-allowed',
                submitReady && 'hover:-translate-y-0.5',
              )}
              style={submitGlow ? undefined : { background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-subtle)' }}
            >
              {submitGlow && (
                <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.35),transparent_45%)]" />
              )}
              {status === 'loading' ? (
                <>
                  <Loader2 className="relative w-4 h-4 animate-spin" />
                  <span className="relative mono tracking-wider">{STEPS[currentStep]?.code}…</span>
                </>
              ) : (
                <>
                  <Zap className="relative w-4 h-4" />
                  <span className="relative">Initialize Ingest</span>
                </>
              )}
            </button>
            </div>
          </div>

          {/* Progress Steps */}
          {status === 'loading' && (
            <div className="dash-panel dash-rise relative rounded-2xl p-5">
              <p className="mono text-[10px] tracking-widest mb-4" style={{ color: 'var(--dash-accent)' }}>
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
                                background: 'var(--dash-accent-soft)',
                                border: '1px solid var(--dash-border-glow)',
                              }
                            : active
                              ? {
                                  background: 'var(--dash-accent-soft)',
                                  border: '1px solid var(--dash-border-glow)',
                                }
                              : {
                                  background: 'var(--dash-card-solid)',
                                  border: '1px solid var(--dash-border)',
                                }
                        }
                      >
                        {done ? (
                          <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--dash-accent)' }} />
                        ) : active ? (
                          <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--dash-accent)' }} />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--dash-subtle)' }} />
                        )}
                      </div>
                      <span
                        className="mono text-[10px] tracking-wider flex-1"
                        style={{
                          color: done
                            ? 'var(--dash-accent)'
                            : active
                              ? 'var(--dash-text)'
                              : 'var(--dash-subtle)',
                        }}
                      >
                        {step.label.toUpperCase()}
                      </span>
                      {done && (
                        <span
                          className="mono text-[9px]"
                          style={{ color: 'var(--dash-accent)' }}
                        >
                          DONE
                        </span>
                      )}
                      {active && (
                        <span
                          className="w-1.5 h-1.5 rounded-full pulse-dot"
                          style={{ background: 'var(--dash-accent)' }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Progress bar */}
              <div className="mt-5 h-px rounded-full overflow-hidden" style={{ background: 'var(--dash-border)' }}>
                <div
                  className="h-full transition-all duration-700"
                  style={{
                    width: `${((currentStep + 1) / STEPS.length) * 100}%`,
                    background: 'linear-gradient(90deg, var(--dash-accent-2), var(--dash-accent))',
                  }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div className="dash-panel dash-rise rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--dash-accent)' }} />
                <div>
                  <p className="mono text-[10px] tracking-widest mb-1" style={{ color: 'var(--dash-accent)' }}>
                    ERROR · INGEST FAILED
                  </p>
                  <p className="text-sm text-[var(--dash-text)]">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Success */}
          {status === 'success' && result && (
            <div className="dash-panel dash-panel-strong dash-rise relative rounded-2xl p-5">
              <div className="relative">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{
                      background: 'var(--dash-accent-soft)',
                      border: '1px solid var(--dash-border-glow)',
                    }}
                  >
                    <Brain className="w-4 h-4" style={{ color: 'var(--dash-accent)' }} />
                  </div>
                  <div>
                    <p className="mono text-[10px] tracking-widest" style={{ color: 'var(--dash-accent)' }}>
                      INGEST COMPLETE
                    </p>
                    <p className="text-xs text-[var(--dash-muted)]">
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
                            color: 'var(--dash-accent)',
                            background: 'var(--dash-accent-soft)',
                            borderColor: 'var(--dash-border-glow)',
                          }
                        : {
                            color: SILVER,
                            background: 'color-mix(in srgb, #ffffff 4%, transparent)',
                            borderColor: 'var(--dash-border)',
                          }
                    return (
                      <button
                        key={p.slug}
                        onClick={() => router.push(`/app/wiki/${p.slug}`)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg transition-all group text-left"
                        style={{
                          background: 'var(--dash-card-solid)',
                          border: '1px solid var(--dash-border)',
                        }}
                      >
                        <span
                          className="mono text-[9px] px-2 py-0.5 rounded border font-medium shrink-0 tracking-wider"
                          style={chipStyle}
                        >
                          {p.type?.toUpperCase().slice(0, 8)}
                        </span>
                        <span className="text-xs text-[var(--dash-text)] flex-1 truncate">{p.title}</span>
                        <ArrowRight className="w-3 h-3 shrink-0" style={{ color: 'var(--dash-subtle)' }} />
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => { setStatus('idle'); setResult(null) }}
                  className="w-full mono text-[10px] text-[var(--dash-subtle)] hover:text-[var(--dash-text)] tracking-widest transition-colors py-2"
                >
                  INGEST ANOTHER SOURCE
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

/* ═══════════════════════════════════════════════════════ */
function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="mono text-[10px] text-[var(--dash-subtle)] tracking-widest block mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}
