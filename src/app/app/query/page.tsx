'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Send, Brain, Loader2, ExternalLink, Zap, MessageSquare } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  citedPages?: Array<{ slug: string; title: string }>
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
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

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
    <div className="flex flex-col h-screen text-[var(--text-primary)]">
      {/* Header */}
      <div
        className="px-8 py-5 shrink-0 relative"
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
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto mt-12">
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
            <div className="grid grid-cols-2 gap-2">
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
          <div className="max-w-2xl mx-auto space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={msg.role === 'user' ? 'flex justify-end' : ''}>
                {msg.role === 'user' ? (
                  <div
                    className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm max-w-[80%]"
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
