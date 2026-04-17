'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Send, Brain, Loader2, ExternalLink } from 'lucide-react'

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

export default function QueryPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const suggestions = [
    'What are the main themes across all my sources?',
    'Who are the key people I\'ve read about?',
    'Summarize the most important concepts in my wiki.',
    'What patterns appear across multiple sources?',
  ]

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
      <div className="px-8 py-5 border-b border-zinc-800 shrink-0">
        <h1 className="text-lg font-bold text-zinc-100">Query Your Wiki</h1>
        <p className="text-zinc-500 text-xs mt-0.5">Ask anything — Claude searches your wiki and cites its sources.</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto mt-8">
            <div className="flex items-center justify-center mb-8">
              <div className="w-12 h-12 rounded-2xl bg-violet-600/20 flex items-center justify-center">
                <Brain className="w-6 h-6 text-violet-400" />
              </div>
            </div>
            <p className="text-center text-zinc-500 text-sm mb-8">Ask a question about your knowledge base</p>
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => handleQuery(s)}
                  className="text-left p-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 transition-all"
                >
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
                  <div className="bg-violet-600 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm max-w-[80%]">
                    {msg.content}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm p-4">
                      <div
                        className="wiki-content text-sm"
                        dangerouslySetInnerHTML={{ __html: `<p>${renderAnswer(msg.content, msg.citedPages)}</p>` }}
                      />
                    </div>
                    {msg.citedPages && msg.citedPages.length > 0 && (
                      <div>
                        <p className="text-xs text-zinc-600 mb-1.5">Sources from your wiki:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citedPages.map(p => (
                            <Link
                              key={p.slug}
                              href={`/app/wiki/${p.slug}`}
                              className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 bg-violet-500/10 px-2 py-0.5 rounded transition-colors"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              {p.title}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.tokensUsed && (
                      <p className="text-xs text-zinc-700">{msg.tokensUsed.toLocaleString()} tokens</p>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm p-4">
                <div className="flex items-center gap-2 text-zinc-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="text-xs">Searching your wiki...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-8 py-5 border-t border-zinc-800 shrink-0">
        <div className="max-w-2xl mx-auto flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleQuery(input)}
            placeholder="Ask your wiki anything..."
            disabled={loading}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors disabled:opacity-50"
          />
          <button
            onClick={() => handleQuery(input)}
            disabled={!input.trim() || loading}
            className="bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white p-3 rounded-xl transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
