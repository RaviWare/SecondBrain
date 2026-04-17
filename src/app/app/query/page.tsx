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
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/5 shrink-0 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-600/3 to-transparent" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="mono text-[10px] text-white/25 tracking-widest mb-1">QUERY ENGINE · CLAUDE HAIKU</p>
            <h1 className="text-lg font-black text-white/90">Query Your Wiki</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 pulse-dot" />
            <span className="mono text-[9px] text-violet-300/60 tracking-widest">ONLINE</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto mt-12">
            {/* Empty state */}
            <div className="flex flex-col items-center text-center mb-10">
              <div className="w-16 h-16 rounded-2xl glass border border-violet-500/20 flex items-center justify-center mb-5 relative">
                <div className="absolute inset-0 rounded-2xl bg-violet-600/10" />
                <Brain className="w-7 h-7 text-violet-400 relative" />
              </div>
              <p className="mono text-[10px] text-white/25 tracking-widest mb-2">READY TO QUERY</p>
              <p className="text-white/40 text-sm">Ask anything about your knowledge base</p>
            </div>

            {/* Suggestions */}
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => handleQuery(s)}
                  className="text-left p-4 glass border border-white/5 hover:border-violet-500/20 rounded-xl text-xs text-white/35 hover:text-white/70 transition-all group relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                  <MessageSquare className="w-3 h-3 text-white/15 group-hover:text-violet-400/60 mb-2 transition-colors" />
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
                  <div className="bg-violet-600/80 border border-violet-500/30 text-white/90 px-4 py-3 rounded-2xl rounded-tr-sm text-sm max-w-[80%] shadow-lg shadow-violet-500/10">
                    {msg.content}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-5 h-5 rounded-lg bg-violet-600/20 border border-violet-500/20 flex items-center justify-center">
                        <Brain className="w-3 h-3 text-violet-400" />
                      </div>
                      <span className="mono text-[9px] text-violet-300/50 tracking-widest">CLAUDE HAIKU · RESPONSE</span>
                    </div>
                    <div className="glass border border-white/5 rounded-2xl rounded-tl-sm p-5 relative overflow-hidden">
                      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-violet-500/20 via-transparent to-transparent" />
                      <div
                        className="wiki-content text-sm text-white/70"
                        dangerouslySetInnerHTML={{ __html: `<p>${renderAnswer(msg.content, msg.citedPages)}</p>` }}
                      />
                    </div>

                    {msg.citedPages && msg.citedPages.length > 0 && (
                      <div>
                        <p className="mono text-[9px] text-white/20 tracking-widest mb-2">CITED FROM WIKI</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citedPages.map(p => (
                            <Link
                              key={p.slug}
                              href={`/app/wiki/${p.slug}`}
                              className="flex items-center gap-1 mono text-[9px] text-violet-400 hover:text-violet-300 bg-violet-500/8 border border-violet-500/15 px-2 py-1 rounded tracking-wider transition-all hover:border-violet-500/30"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              {p.title.slice(0, 25)}{p.title.length > 25 ? '...' : ''}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {msg.tokensUsed && (
                      <p className="mono text-[9px] text-white/15 tracking-widest">
                        {msg.tokensUsed.toLocaleString()} TOKENS USED
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="glass border border-white/5 rounded-2xl rounded-tl-sm p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-violet-500/30 via-transparent to-transparent" />
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                  <span className="mono text-[10px] text-violet-300/50 tracking-widest">SEARCHING KNOWLEDGE BASE...</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-8 py-5 border-t border-white/5 shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="glass border border-white/8 rounded-xl flex items-center gap-3 px-4 py-3 focus-within:border-violet-500/40 transition-colors">
            <Zap className="w-3.5 h-3.5 text-white/15 shrink-0" />
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleQuery(input)}
              placeholder="Ask your wiki anything..."
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/15 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={() => handleQuery(input)}
              disabled={!input.trim() || loading}
              className="w-8 h-8 bg-violet-600/80 hover:bg-violet-500 disabled:bg-white/5 disabled:text-white/15 text-white rounded-lg flex items-center justify-center transition-all shrink-0"
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />
              }
            </button>
          </div>
          <p className="mono text-[9px] text-white/15 tracking-widest text-center mt-2">
            PRESS ENTER TO SEND · CLAUDE HAIKU · CITED RESPONSES
          </p>
        </div>
      </div>
    </div>
  )
}
