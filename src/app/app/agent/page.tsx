'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Play, Square, Sparkles, KeyRound, Send, ShieldCheck } from 'lucide-react'

type AgentView = {
  status: 'none' | 'provisioning' | 'running' | 'stopped' | 'error'
  running: boolean
  llmProvider: string | null
  llmModel: string | null
  lastActiveAt: string | null
  lastError: string | null
}

type ChatMsg = { role: 'user' | 'agent' | 'system'; content: string }

const PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'openai/gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'claude-haiku-4-5' },
  { id: 'openai', label: 'OpenAI', placeholder: 'gpt-4o-mini' },
]

export default function AgentPage() {
  const [view, setView] = useState<AgentView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // provisioning form
  const [provider, setProvider] = useState('openrouter')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')

  // chat
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  async function refresh() {
    try {
      const r = await fetch('/api/agent-instance/status')
      const d = await r.json()
      if (r.ok) setView(d)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function provision() {
    setError('')
    if (!apiKey.trim()) { setError('Enter your model API key.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/agent-instance/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llmProvider: provider, llmModel: model.trim() || providerPlaceholder(provider), llmApiKey: apiKey }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Failed to start agent'); return }
      setApiKey('')
      setView(d)
      setMessages([{ role: 'system', content: 'Your agent is live. It can read, search, and add to your knowledge vault.' }])
    } catch {
      setError('Network error starting agent')
    } finally {
      setBusy(false)
    }
  }

  async function toggleRun(action: 'start' | 'stop') {
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/agent-instance/${action}`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) { setError(d.error || `Failed to ${action} agent`); return }
      setView(d)
    } catch {
      setError(`Network error on ${action}`)
    } finally {
      setBusy(false)
    }
  }

  function send() {
    const q = input.trim()
    if (!q) return
    setInput('')
    setMessages(prev => [
      ...prev,
      { role: 'user', content: q },
      { role: 'system', content: 'Live agent chat streaming connects in Phase 4 integration on the server. Your message is recorded; the agent loop is provisioned and wired to your vault.' },
    ])
  }

  const provisioned = view && view.status !== 'none'

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 lg:p-7">
        {/* Header */}
        <header className="dash-rise">
          <span className="dash-inset inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--dash-accent)]">
            <Sparkles className="h-3 w-3" /> Hermes · your agent
          </span>
          <h1 className="mt-2.5 flex items-center gap-2 text-xl font-semibold tracking-tight text-[var(--dash-text-strong)] 2xl:text-2xl">
            <Bot className="h-6 w-6 text-[var(--dash-accent)]" />
            Your AI agent
          </h1>
          <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
            A personal autonomous agent that uses your knowledge vault as its memory. Bring your own model key — it runs free on our servers.
          </p>
        </header>

        {loading ? (
          <div className="dash-panel dash-grain p-6">
            <div className="h-4 w-40 animate-pulse rounded bg-[var(--dash-soft)]" />
          </div>
        ) : !provisioned ? (
          <SetupCard
            provider={provider} setProvider={setProvider}
            model={model} setModel={setModel}
            apiKey={apiKey} setApiKey={setApiKey}
            onProvision={provision} busy={busy} error={error}
          />
        ) : (
          <>
            <StatusCard view={view!} busy={busy} onStart={() => toggleRun('start')} onStop={() => toggleRun('stop')} error={error} />
            <ChatCard messages={messages} input={input} setInput={setInput} onSend={send} running={view!.running} bottomRef={bottomRef} />
          </>
        )}
      </div>
    </main>
  )
}

function providerPlaceholder(id: string) {
  return PROVIDERS.find(p => p.id === id)?.placeholder ?? ''
}

function SetupCard(props: {
  provider: string; setProvider: (v: string) => void
  model: string; setModel: (v: string) => void
  apiKey: string; setApiKey: (v: string) => void
  onProvision: () => void; busy: boolean; error: string
}) {
  const ph = providerPlaceholder(props.provider)
  return (
    <section className="dash-panel dash-panel-strong dash-grain dash-rise p-5 lg:p-6" style={{ animationDelay: '0.05s' }}>
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-[var(--dash-accent)]" />
        <h2 className="text-sm font-semibold text-[var(--dash-text-strong)]">Bring your own model key</h2>
      </div>
      <p className="mb-4 text-[13px] text-[var(--dash-muted)]">
        Your key is passed straight to your private agent container and never stored on our servers. You pay your provider directly for tokens.
      </p>

      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--dash-muted)]">Provider</label>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => props.setProvider(p.id)}
            className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
              props.provider === p.id
                ? 'border-[var(--dash-border-glow)] bg-[var(--dash-soft)] text-[var(--dash-accent)]'
                : 'border-[var(--dash-border)] text-[var(--dash-text)] hover:border-[var(--dash-border-glow)]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--dash-muted)]">Model</label>
      <input
        value={props.model}
        onChange={e => props.setModel(e.target.value)}
        placeholder={ph}
        className="mb-4 w-full rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-strong)] px-3 py-2.5 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-border-glow)]"
      />

      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--dash-muted)]">API key</label>
      <input
        type="password"
        value={props.apiKey}
        onChange={e => props.setApiKey(e.target.value)}
        placeholder="sk-..."
        className="mb-4 w-full rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-strong)] px-3 py-2.5 text-sm text-[var(--dash-text)] outline-none focus:border-[var(--dash-border-glow)]"
      />

      {props.error && <p className="mb-3 text-xs" style={{ color: '#e0633c' }}>{props.error}</p>}

      <button
        onClick={props.onProvision}
        disabled={props.busy}
        className="dash-accent-grad inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white shadow-[0_16px_36px_-10px_rgba(255,102,0,0.6)] disabled:opacity-50"
      >
        {props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {props.busy ? 'Starting your agent…' : 'Launch my agent'}
      </button>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--dash-subtle)]">
        <ShieldCheck className="h-3 w-3" /> Sandboxed container · key never stored · stops when idle
      </p>
    </section>
  )
}

function StatusCard({ view, busy, onStart, onStop, error }: {
  view: AgentView; busy: boolean; onStart: () => void; onStop: () => void; error: string
}) {
  const dot = view.running ? 'bg-emerald-400' : view.status === 'error' ? 'bg-rose-500' : 'bg-[var(--dash-subtle)]'
  return (
    <section className="dash-panel dash-grain dash-rise flex flex-wrap items-center gap-4 p-4" style={{ animationDelay: '0.05s' }}>
      <span className={`grid h-10 w-10 place-items-center rounded-xl border border-[var(--dash-border)] bg-[var(--dash-soft)] text-[var(--dash-accent)]`}>
        <Bot className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--dash-text-strong)]">
          <span className={`h-2 w-2 rounded-full ${dot} ${view.running ? 'dash-live-dot' : ''}`} />
          {view.running ? 'Agent running' : view.status === 'error' ? 'Agent error' : 'Agent stopped'}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--dash-muted)]">
          {view.llmProvider} · {view.llmModel}
          {view.lastActiveAt ? ` · last active ${new Date(view.lastActiveAt).toLocaleString()}` : ''}
        </p>
        {error && <p className="mt-1 text-[11px]" style={{ color: '#e0633c' }}>{error}</p>}
        {view.lastError && !error && <p className="mt-1 text-[11px]" style={{ color: '#e0633c' }}>{view.lastError}</p>}
      </div>
      {view.running ? (
        <button onClick={onStop} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--dash-border)] px-3 text-xs font-medium text-[var(--dash-text)] transition hover:border-[var(--dash-border-glow)] disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} Stop
        </button>
      ) : (
        <button onClick={onStart} disabled={busy} className="dash-accent-grad inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Start
        </button>
      )}
    </section>
  )
}

function ChatCard({ messages, input, setInput, onSend, running, bottomRef }: {
  messages: ChatMsg[]; input: string; setInput: (v: string) => void; onSend: () => void
  running: boolean; bottomRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <section className="dash-panel dash-grain dash-rise flex h-[460px] flex-col p-4" style={{ animationDelay: '0.1s' }}>
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="grid h-full place-items-center text-center text-[13px] text-[var(--dash-subtle)]">
            Ask your agent to research, summarize, or capture into your vault.
          </p>
        ) : messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === 'user'
                  ? 'dash-accent-grad rounded-tr-sm text-white'
                  : m.role === 'system'
                    ? 'dash-inset rounded-tl-sm text-[var(--dash-muted)]'
                    : 'rounded-tl-sm border border-[var(--dash-border)] bg-[var(--dash-card-strong)] text-[var(--dash-text)]'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={e => { e.preventDefault(); onSend() }}
        className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-card-strong)] p-1.5"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={running ? 'Message your agent…' : 'Start your agent to chat'}
          disabled={!running}
          className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-subtle)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!running || !input.trim()}
          className="dash-accent-grad grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  )
}
