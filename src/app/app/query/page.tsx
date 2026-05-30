'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Send, Brain, Loader2, ExternalLink, Zap, MessageSquare, AlertTriangle, Lightbulb, Clock, GitCompareArrows } from 'lucide-react'

interface GapAnalysis {
  gaps: string[]
  staleSlugs: string[]
  contradictions: string[]
  confidence: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  citedPages?: Array<{ slug: string; title: string }>
  gap?: GapAnalysis
  tokensUsed?: number
}

function renderAnswer(text: string, pages: Array<{ slug: string; title: string }> = []) {
  const slugToTitle = Object.fromEntries(pages.map(p => [p.slug, p.title]))
  return text.replace(/\[\[([^\]]+)\]\]/g, (_, slug) => {
    const title = slugToTitle[slug] || slug
    return `<a href="/app/wiki/${slug}" class="wiki-link">${title}</a>`
  })
}

const SUGGESTIONS = [
  'What are the main themes across all my sources?',
  'Who are the key people I\'ve read about?',
  'Summarize the most important concepts in my wiki.',
  'What patterns appear across multiple sources?',
]

export default function QueryPage() {
  return (
    <Suspense fallback={null}>
      <QueryView />
    </Suspense>
  )
}

function QueryView() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get('q')
  const ranInitial = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Auto-run a query passed in via ?q= (from the dashboard Ask box / search).
  useEffect(() => {
    if (ranInitial.current) return
    const q = initialQuery?.trim()
    if (q) {
      ranInitial.current = true
      handleQuery(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery])

  async function handleQuery(question: string) {
    if (!question.trim() || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error || 'Something went wrong.' }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.answer,
          citedPages: data.pages,
          gap: data.gap,
          tokensUsed: data.tokensUsed,
        }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-[calc(100dvh-160px)] flex-col text-[var(--text-primary)] md:min-h-screen">
      {/* Header */}
      <div
        className="relative shrink-0 px-4 py-4 sm:px-6 md:px-8 md:py-5"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="mono text-[10px] text-[var(--text-muted)] tracking-widest mb-1">
              QUERY ENGINE · CLAUDE HAIKU
            </p>
            <h1 className="text-lg font-bold tracking-tight">Query Your Wiki</h1>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full pulse-dot"
              style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }}
            />
            <span
              className="mono text-[9px] tracking-widest"
              style={{ color: 'var(--accent-bright)' }}
            >
              ONLINE
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 md:px-8 md:py-6">
        {messages.length === 0 ? (
          <div className="mx-auto mt-6 max-w-2xl sm:mt-12">
            {/* Empty state */}
            <div className="flex flex-col items-center text-center mb-10">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 relative"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
                }}
              >
                <Brain className="w-7 h-7" style={{ color: 'var(--accent-bright)' }} />
              </div>
              <p className="mono text-[10px] text-[var(--text-muted)] tracking-widest mb-2">
                READY TO QUERY
              </p>
              <p className="text-[var(--text-secondary)] text-sm">
                Ask anything about your knowledge base
              </p>
            </div>

            {/* Suggestions */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => handleQuery(s)}
                  className="text-left p-4 rounded-xl text-xs transition-colors group"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border-bright)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <MessageSquare
                    className="w-3 h-3 mb-2"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-5 sm:space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={msg.role === 'user' ? 'flex justify-end' : ''}>
                {msg.role === 'user' ? (
                  <div
                    className="max-w-[88%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm sm:max-w-[80%]"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                      color: '#0b0b0d',
                      fontWeight: 500,
                    }}
                  >
                    {msg.content}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-5 h-5 rounded-lg flex items-center justify-center"
                        style={{
                          background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
                        }}
                      >
                        <Brain className="w-3 h-3" style={{ color: 'var(--accent-bright)' }} />
                      </div>
                      <span
                        className="mono text-[9px] tracking-widest"
                        style={{ color: 'var(--accent-bright)' }}
                      >
                        CLAUDE HAIKU · RESPONSE
                      </span>
                    </div>
                    <div
                      className="rounded-2xl rounded-tl-sm p-5 relative"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border-bright)',
                      }}
                    >
                      <div
                        className="wiki-content text-sm"
                        style={{ color: 'var(--text-primary)' }}
                        dangerouslySetInnerHTML={{
                          __html: `<p>${renderAnswer(msg.content, msg.citedPages)}</p>`,
                        }}
                      />
                    </div>

                    {msg.citedPages && msg.citedPages.length > 0 && (
                      <div>
                        <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest mb-2">
                          CITED FROM WIKI
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citedPages.map(p => (
                            <Link
                              key={p.slug}
                              href={`/app/wiki/${p.slug}`}
                              className="flex items-center gap-1 mono text-[9px] px-2 py-1 rounded tracking-wider transition-colors"
                              style={{
                                color: 'var(--accent-bright)',
                                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--accent) 24%, transparent)',
                              }}
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              {p.title.slice(0, 25)}{p.title.length > 25 ? '...' : ''}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {msg.gap && <GapPanel gap={msg.gap} citedPages={msg.citedPages} />}

                    {msg.tokensUsed && (
                      <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest">
                        {msg.tokensUsed.toLocaleString()} TOKENS USED
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div
                className="rounded-2xl rounded-tl-sm p-5"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-bright)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{
                          background: 'var(--accent-bright)',
                          animationDelay: `${i * 150}ms`,
                        }}
                      />
                    ))}
                  </div>
                  <span
                    className="mono text-[10px] tracking-widest"
                    style={{ color: 'var(--accent-bright)' }}
                  >
                    SEARCHING KNOWLEDGE BASE...
                  </span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="px-8 py-5 shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        <div className="max-w-2xl mx-auto">
          <div
            className="rounded-xl flex items-center gap-3 px-4 py-3 transition-colors"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-bright)',
            }}
          >
            <Zap className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleQuery(input)}
              placeholder="Ask your wiki anything..."
              disabled={loading}
              className="flex-1 bg-transparent text-sm focus:outline-none disabled:opacity-50"
              style={{ color: 'var(--text-primary)' }}
            />
            <button
              onClick={() => handleQuery(input)}
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0 disabled:opacity-40"
              style={{
                background: !input.trim() || loading
                  ? 'var(--surface)'
                  : 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                color: !input.trim() || loading ? 'var(--text-muted)' : '#0b0b0d',
                border: '1px solid var(--border)',
              }}
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />
              }
            </button>
          </div>
          <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest text-center mt-2">
            PRESS ENTER TO SEND · CLAUDE HAIKU · CITED RESPONSES
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Gap Analysis panel (GBrain "think" differentiator) ─────────────────────────
// Surfaces what the brain does NOT know yet: open gaps, stale pages, and
// contradictions — plus an answer-confidence meter. This is the part that turns
// a cited answer into a brain-style briefing.
function GapPanel({
  gap,
  citedPages,
}: {
  gap: GapAnalysis
  citedPages?: Array<{ slug: string; title: string }>
}) {
  const hasContent =
    gap.gaps.length > 0 || gap.contradictions.length > 0 || gap.staleSlugs.length > 0
  if (!hasContent && gap.confidence >= 0.85) return null

  const slugTitle = Object.fromEntries((citedPages ?? []).map(p => [p.slug, p.title]))
  const pct = Math.round((gap.confidence ?? 0) * 100)
  const confTone =
    pct >= 75 ? 'var(--accent-bright)' : pct >= 45 ? '#e0a106' : '#e0633c'

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{
        background: 'color-mix(in srgb, var(--accent) 5%, var(--surface))',
        border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="mono text-[9px] tracking-widest flex items-center gap-1.5"
          style={{ color: 'var(--accent-bright)' }}
        >
          <Brain className="w-3 h-3" />
          WHAT THE BRAIN KNOWS — AND DOESN&apos;T
        </span>
        <span className="flex items-center gap-1.5">
          <span className="mono text-[9px] tracking-widest" style={{ color: 'var(--text-muted)' }}>
            CONFIDENCE
          </span>
          <span className="mono text-[10px] font-bold" style={{ color: confTone }}>
            {pct}%
          </span>
        </span>
      </div>

      {/* confidence bar */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'color-mix(in srgb, var(--text-muted) 24%, transparent)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: confTone }}
        />
      </div>

      {gap.gaps.length > 0 && (
        <GapSection icon={<Lightbulb className="w-3 h-3" />} label="GAPS TO FILL" items={gap.gaps} />
      )}
      {gap.contradictions.length > 0 && (
        <GapSection
          icon={<GitCompareArrows className="w-3 h-3" />}
          label="CONTRADICTIONS"
          items={gap.contradictions}
          tone="#e0633c"
        />
      )}
      {gap.staleSlugs.length > 0 && (
        <div className="space-y-1.5">
          <p className="mono text-[9px] tracking-widest flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <Clock className="w-3 h-3" />
            POSSIBLY STALE
          </p>
          <div className="flex flex-wrap gap-1.5">
            {gap.staleSlugs.map(slug => (
              <Link
                key={slug}
                href={`/app/wiki/${slug}`}
                className="mono text-[9px] px-2 py-1 rounded tracking-wider transition-colors"
                style={{
                  color: 'var(--text-secondary)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                }}
              >
                {(slugTitle[slug] ?? slug).slice(0, 28)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GapSection({
  icon,
  label,
  items,
  tone,
}: {
  icon: React.ReactNode
  label: string
  items: string[]
  tone?: string
}) {
  return (
    <div className="space-y-1.5">
      <p
        className="mono text-[9px] tracking-widest flex items-center gap-1.5"
        style={{ color: tone ?? 'var(--text-muted)' }}
      >
        {tone ? <AlertTriangle className="w-3 h-3" /> : icon}
        {label}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-[12px] leading-relaxed flex gap-2" style={{ color: 'var(--text-secondary)' }}>
            <span style={{ color: tone ?? 'var(--accent-bright)' }}>·</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
