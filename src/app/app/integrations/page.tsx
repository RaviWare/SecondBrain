'use client'

// ── Integrations / Connect ────────────────────────────────────────────────────
// One place to connect external tools to your vault. The WORKING surfaces are
// real and live: MCP / Agent-API bearer tokens (mint / copy / revoke), the four
// agent endpoints, and a full data export. Provider connectors (Gmail, Slack,
// etc.) are shown HONESTLY as a roadmap — no fake "Connect" buttons that do
// nothing (NO DUMMY DATA rule). Glass recipe throughout.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  Copy,
  Database,
  Download,
  KeyRound,
  Loader2,
  MessageCircle,
  Plug,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

type TokenMeta = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
}

// Provider connectors on the roadmap. `status: 'planned'` renders a clear
// "Coming soon" affordance — never a dead button pretending to work.
const PROVIDERS: Array<{ name: string; blurb: string; status: 'planned' }> = [
  { name: 'Gmail', blurb: 'Let an agent read (read-only) and triage your inbox.', status: 'planned' },
  { name: 'Slack', blurb: 'Post briefs and alerts to a channel.', status: 'planned' },
  { name: 'Google Drive', blurb: 'Ingest docs and sheets into your vault.', status: 'planned' },
  { name: 'Notion', blurb: 'Two-way sync with your Notion workspace.', status: 'planned' },
  { name: 'GitHub', blurb: 'Watch repos and summarize activity.', status: 'planned' },
  { name: 'Telegram', blurb: 'Talk to your squad lead from anywhere.', status: 'planned' },
]

export default function IntegrationsPage() {
  const [tokens, setTokens] = useState<TokenMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('My integration')
  const [writeScope, setWriteScope] = useState(false)
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState('')

  const base = typeof window !== 'undefined' ? window.location.origin : ''

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/agent/tokens', { cache: 'no-store' })
      const d = await r.json()
      setTokens(d.tokens || [])
    } catch {
      setTokens([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) load() })
    return () => { cancelled = true }
  }, [load])

  async function createToken() {
    setCreating(true); setError(''); setFreshToken(null)
    try {
      const r = await fetch('/api/agent/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'My integration', scopes: writeScope ? ['read', 'write'] : ['read'] }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Failed to create token'); return }
      setFreshToken(d.token); await load()
    } catch {
      setError('Network error creating token')
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/agent/tokens?id=${id}`, { method: 'DELETE' })
    await load()
  }

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500)
  }

  const endpoints = useMemo(
    () => [
      { label: 'MANIFEST', url: `${base}/api/agent/manifest` },
      { label: 'QUERY', url: `${base}/api/agent/query` },
      { label: 'SEARCH', url: `${base}/api/agent/search` },
      { label: 'INGEST', url: `${base}/api/agent/ingest` },
    ],
    [base],
  )

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-7">
        <header className="dash-rise">
          <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
            Connect · Integrations
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Plug className="h-6 w-6 text-[var(--dash-accent)]" />
            <span className="dash-metallic-text">Integrations</span>
          </h1>
          <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
            Connect external tools and agents to your vault. Mint a secure token, point any MCP client at the
            endpoints below, and export your data any time.
          </p>
        </header>

        {/* ── Chat channels (Telegram live, WhatsApp roadmap) ── */}
        <MessagingSection />

        {/* ── Working: MCP / Agent API access ── */}
        <section className="dash-panel dash-grain dash-interactive dash-rise p-5" style={{ animationDelay: '0.05s' }}>
          <div className="mb-3 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[var(--dash-accent)]" />
            <h2 className="text-sm font-semibold text-[var(--dash-text-strong)]">Agent &amp; MCP access</h2>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ color: '#34d399', borderColor: 'rgba(52,211,153,0.30)', background: 'rgba(52,211,153,0.10)' }}>
              <Check className="h-3 w-3" /> Live
            </span>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-[var(--dash-muted)]">
            Connect an autonomous agent (OpenClaw or any MCP client) to this vault. It can query with synthesis + gap
            analysis, search, and optionally ingest. Tokens are shown once — store them securely.
          </p>

          {/* Endpoints */}
          <div className="mb-4 space-y-1.5 rounded-lg p-3" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
            {endpoints.map((e) => (
              <div key={e.label} className="flex items-center gap-2">
                <span className="mono w-20 shrink-0 text-[9px] tracking-widest text-[var(--dash-subtle)]">{e.label}</span>
                <code className="mono min-w-0 flex-1 truncate text-[11px] text-[var(--dash-text)]">{e.url}</code>
                <button onClick={() => copy(e.url, e.label)} className="shrink-0 grid h-7 w-7 place-items-center rounded-lg" style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}>
                  {copied === e.label ? <Check className="h-3.5 w-3.5" style={{ color: 'var(--dash-accent)' }} /> : <Copy className="h-3.5 w-3.5 text-[var(--dash-subtle)]" />}
                </button>
              </div>
            ))}
          </div>

          {/* Create token */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <p className="mono mb-1.5 text-[9px] tracking-widest text-[var(--dash-subtle)]">TOKEN NAME</p>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My integration"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--dash-border-glow)]"
                style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-text)' }} />
            </div>
            <button onClick={() => setWriteScope((v) => !v)} className="mono rounded-lg px-3 py-2.5 text-[9px] tracking-widest transition"
              style={{ background: writeScope ? 'var(--dash-accent-soft)' : 'var(--dash-card-solid)', border: `1px solid ${writeScope ? 'var(--dash-border-glow)' : 'var(--dash-border)'}`, color: writeScope ? 'var(--dash-accent)' : 'var(--dash-subtle)' }}>
              {writeScope ? 'READ + WRITE' : 'READ ONLY'}
            </button>
            <button onClick={createToken} disabled={creating} className="dash-accent-grad mono inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[10px] font-semibold tracking-widest text-white disabled:opacity-50">
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} CREATE
            </button>
          </div>

          {error && <p className="mb-3 text-xs" style={{ color: '#e0633c' }}>{error}</p>}

          {freshToken && (
            <div className="mb-4 rounded-lg p-3" style={{ background: 'var(--dash-accent-soft)', border: '1px solid var(--dash-border-glow)' }}>
              <p className="mono mb-2 text-[9px] tracking-widest" style={{ color: 'var(--dash-accent)' }}>COPY NOW — SHOWN ONLY ONCE</p>
              <div className="flex items-center gap-2">
                <code className="mono min-w-0 flex-1 break-all text-[11px] text-[var(--dash-text)]">{freshToken}</code>
                <button onClick={() => copy(freshToken, 'fresh')} className="shrink-0 grid h-8 w-8 place-items-center rounded-lg" style={{ background: 'var(--bg-elev-3, #1c1c1f)', border: '1px solid var(--dash-border)' }}>
                  {copied === 'fresh' ? <Check className="h-3.5 w-3.5" style={{ color: 'var(--dash-accent)' }} /> : <Copy className="h-3.5 w-3.5 text-[var(--dash-subtle)]" />}
                </button>
              </div>
            </div>
          )}

          {/* Token list */}
          {loading ? (
            <p className="mono text-[9px] tracking-widest text-[var(--dash-subtle)]">LOADING…</p>
          ) : tokens.length === 0 ? (
            <p className="mono text-[9px] tracking-widest text-[var(--dash-subtle)]">NO TOKENS YET</p>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-lg p-3" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}>
                    <KeyRound className="h-3.5 w-3.5 text-[var(--dash-subtle)]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--dash-text)]">{t.name}</p>
                    <p className="mono text-[9px] tracking-wider text-[var(--dash-subtle)]">
                      {t.prefix}… · {t.scopes.join(' + ')}{t.lastUsedAt ? ` · used ${new Date(t.lastUsedAt).toLocaleDateString()}` : ' · never used'}
                    </p>
                  </div>
                  <button onClick={() => revoke(t.id)} className="shrink-0 grid h-8 w-8 place-items-center rounded-lg transition hover:border-[var(--dash-border-glow)]" style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }} title="Revoke">
                    <Trash2 className="h-3.5 w-3.5" style={{ color: '#f0746b' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Working: Data export ── */}
        <section className="dash-panel dash-grain dash-interactive dash-rise p-5" style={{ animationDelay: '0.1s' }}>
          <div className="mb-2 flex items-center gap-2">
            <Database className="h-4 w-4 text-[var(--dash-accent)]" />
            <h2 className="text-sm font-semibold text-[var(--dash-text-strong)]">Data portability</h2>
            <span className="ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ color: '#34d399', borderColor: 'rgba(52,211,153,0.30)', background: 'rgba(52,211,153,0.10)' }}>
              <Check className="h-3 w-3" /> Live
            </span>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-[var(--dash-muted)]">
            Export everything — every wiki page, source, and log — in one portable JSON file. Your data is yours.
          </p>
          <a href="/api/vault/export" className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-4 text-xs font-medium text-[var(--dash-text)] transition hover:border-[var(--dash-border-glow)]" style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }}>
            <Download className="h-3.5 w-3.5" /> Export all data (JSON)
          </a>
        </section>

        {/* ── Roadmap: provider connectors (honest, not fake) ── */}
        <section className="dash-rise" style={{ animationDelay: '0.15s' }}>
          <div className="mb-2.5 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--dash-text-strong)]">App connectors</h2>
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold text-[var(--dash-subtle)]" style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-soft)' }}>
              Rolling out
            </span>
          </div>
          <p className="mb-3 text-[12px] text-[var(--dash-muted)]">
            One-click connectors for popular tools are on the way. Today, any of these can already be wired up through
            the Agent API + a token above. We&apos;ll add native OAuth connectors here as each lands.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PROVIDERS.map((p) => (
              <div key={p.name} className="dash-panel dash-grain flex items-start gap-3 p-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border" style={{ color: 'var(--dash-muted)', borderColor: 'var(--dash-border)', background: 'var(--dash-soft)' }}>
                  <Plug className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-[var(--dash-text-strong)]">{p.name}</p>
                    <span className="mono shrink-0 rounded-full px-2 py-0.5 text-[9px] tracking-widest text-[var(--dash-subtle)]" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
                      COMING SOON
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--dash-muted)]">{p.blurb}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="dash-rise flex items-center justify-center gap-1.5 text-[11px] text-[var(--dash-subtle)]" style={{ animationDelay: '0.2s' }}>
          <ShieldCheck className="h-3 w-3" /> Tokens are stored only as hashes · revoke any time · your data is never sold.
        </p>
      </div>
    </main>
  )
}

// ── Chat channels: Telegram (live when configured) + WhatsApp (roadmap) ────────

type ChannelStatus = {
  configured: boolean
  status: 'unconfigured' | 'none' | 'pending' | 'linked'
  handle?: string | null
  code?: string | null
  deepLink?: string | null
  notify?: { proposals: boolean; runs: boolean; support: boolean }
}

type ChannelKey = 'telegram' | 'whatsapp' | 'discord' | 'email'

const CHANNELS: Array<{
  key: ChannelKey
  name: string
  blurb: string
  /** how the user proves ownership */
  mode: 'deeplink' | 'code-to-number' | 'slash-command' | 'email-code'
}> = [
  { key: 'telegram', name: 'Telegram', blurb: 'Tap to open the bot, press Start — done.', mode: 'deeplink' },
  { key: 'whatsapp', name: 'WhatsApp', blurb: 'Message our number with your code to link.', mode: 'code-to-number' },
  { key: 'discord', name: 'Discord', blurb: 'Run /link with your code in a DM to the bot.', mode: 'slash-command' },
  { key: 'email', name: 'Email', blurb: 'Get a code by email, paste it back to confirm.', mode: 'email-code' },
]

function MessagingSection() {
  return (
    <section className="dash-panel dash-grain dash-interactive dash-rise p-5" style={{ animationDelay: '0.02s' }}>
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-[var(--dash-accent)]" />
        <h2 className="text-sm font-semibold text-[var(--dash-text-strong)]">Chat with your squad</h2>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-[var(--dash-muted)]">
        Get pinged the moment your squad needs a decision — on whichever channel you live in. Connect one or several.
      </p>
      <div className="space-y-3">
        {CHANNELS.map((c) => (
          <ChannelCard key={c.key} channel={c} />
        ))}
      </div>
    </section>
  )
}

function ChannelCard({ channel }: { channel: (typeof CHANNELS)[number] }) {
  const api = `/api/messaging/${channel.key}`
  const [st, setSt] = useState<ChannelStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [email, setEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch(api, { cache: 'no-store' })
      setSt(await r.json())
    } catch {
      setSt({ configured: false, status: 'unconfigured' })
    }
  }, [api])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) load() })
    return () => { cancelled = true }
  }, [load])

  // Poll while pending for webhook-based channels (not email — it's code-confirm).
  useEffect(() => {
    if (st?.status !== 'pending' || channel.mode === 'email-code') return
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [st?.status, channel.mode, load])

  async function connect() {
    setBusy(true)
    try {
      const body = channel.mode === 'email-code' ? JSON.stringify({ address: email.trim() }) : undefined
      const r = await fetch(api, { method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body })
      const d = await r.json()
      if (r.ok) setSt((prev) => ({ ...(prev ?? { configured: true }), ...d }))
    } finally {
      setBusy(false)
    }
  }

  async function confirmEmail() {
    setBusy(true)
    try {
      const r = await fetch(api, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: emailCode.trim() }) })
      if (r.ok) { setEmailCode(''); await load() }
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try { await fetch(api, { method: 'DELETE' }); await load() } finally { setBusy(false) }
  }

  async function setNotify(next: { proposals: boolean; runs: boolean; support: boolean }) {
    setSt((prev) => (prev ? { ...prev, notify: next } : prev))
    await fetch(api, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notify: next }) })
  }

  const notify = st?.notify ?? { proposals: true, runs: false, support: true }
  const unconfigured = st?.configured === false

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
      <div className="flex items-center gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border"
          style={st?.status === 'linked'
            ? { color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)', background: 'var(--dash-accent-soft)' }
            : { color: 'var(--dash-muted)', borderColor: 'var(--dash-border)', background: 'var(--dash-soft)' }}
        >
          {channel.key === 'email' ? <MessageCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--dash-text-strong)]">{channel.name}</p>
          <p className="text-[11px] text-[var(--dash-subtle)]">
            {st?.status === 'linked'
              ? `Connected${st.handle ? ` · ${st.handle}` : ''}`
              : unconfigured
                ? 'Coming soon on this server'
                : channel.blurb}
          </p>
        </div>
        {st?.status === 'linked' ? (
          <button onClick={disconnect} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-[var(--dash-text)] transition hover:border-[var(--dash-border-glow)] disabled:opacity-50" style={{ borderColor: 'var(--dash-border)' }}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Disconnect
          </button>
        ) : unconfigured ? (
          <span className="mono rounded-full px-2 py-0.5 text-[9px] tracking-widest text-[var(--dash-subtle)]" style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}>
            COMING SOON
          </span>
        ) : channel.mode === 'email-code' && st?.status !== 'pending' ? null : (
          <button onClick={connect} disabled={busy} className="dash-accent-grad inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {st?.status === 'pending' ? 'Restart' : 'Connect'}
          </button>
        )}
      </div>

      {/* Email connect: address input (only when not yet pending/linked) */}
      {!unconfigured && channel.mode === 'email-code' && st?.status !== 'linked' && st?.status !== 'pending' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--dash-border)' }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--dash-border-glow)]"
            style={{ background: 'var(--bg-elev-3, #1c1c1f)', border: '1px solid var(--dash-border)', color: 'var(--dash-text)' }}
          />
          <button onClick={connect} disabled={busy || !email.trim()} className="dash-accent-grad inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send code
          </button>
        </div>
      )}

      {/* Pending state per mode */}
      {st?.status === 'pending' && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--dash-border)' }}>
          {channel.mode === 'deeplink' && (
            <div className="flex flex-wrap items-center gap-2">
              {st.deepLink && (
                <a href={st.deepLink} target="_blank" rel="noopener noreferrer" className="dash-accent-grad inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white">
                  <Send className="h-3.5 w-3.5" /> Open {channel.name}
                </a>
              )}
              {st.code && <CodeChip code={st.code} copied={copied} onCopy={() => { navigator.clipboard?.writeText(st.code!); setCopied(true); setTimeout(() => setCopied(false), 1500) }} />}
              <Waiting />
            </div>
          )}
          {(channel.mode === 'code-to-number' || channel.mode === 'slash-command') && (
            <div className="space-y-2">
              <p className="text-[11px] text-[var(--dash-muted)]">
                {channel.mode === 'code-to-number'
                  ? 'Send this code to our WhatsApp number to link:'
                  : 'In a DM with the bot, run '}
                {channel.mode === 'slash-command' && <code className="mono">/link {st.code}</code>}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {st.code && <CodeChip code={st.code} copied={copied} onCopy={() => { navigator.clipboard?.writeText(st.code!); setCopied(true); setTimeout(() => setCopied(false), 1500) }} />}
                <Waiting />
              </div>
            </div>
          )}
          {channel.mode === 'email-code' && (
            <div className="space-y-2">
              <p className="text-[11px] text-[var(--dash-muted)]">We emailed a code{st.handle ? ` to ${st.handle}` : ''}. Paste it here to confirm:</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value)}
                  placeholder="sb-xxxxxx"
                  className="rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--dash-border-glow)]"
                  style={{ background: 'var(--bg-elev-3, #1c1c1f)', border: '1px solid var(--dash-border)', color: 'var(--dash-text)' }}
                />
                <button onClick={confirmEmail} disabled={busy || !emailCode.trim()} className="dash-accent-grad inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white disabled:opacity-50">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Confirm
                </button>
                <button onClick={disconnect} className="text-[11px] text-[var(--dash-subtle)] underline-offset-2 hover:underline">cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Linked: notification preferences */}
      {st?.status === 'linked' && (
        <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: 'var(--dash-border)' }}>
          <p className="mono mb-1 text-[9px] tracking-widest text-[var(--dash-subtle)]">NOTIFY ME ABOUT</p>
          {([
            ['proposals', 'Proposals awaiting my sign-off'],
            ['support', 'Support tickets & escalations'],
            ['runs', 'Run completions & failures'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setNotify({ ...notify, [key]: !notify[key] })}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition"
              style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
            >
              <span className="text-[12px] text-[var(--dash-text)]">{label}</span>
              <span className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition" style={{ background: notify[key] ? 'var(--dash-accent)' : 'var(--dash-border)' }}>
                <span className="inline-block h-3 w-3 rounded-full bg-white transition" style={{ transform: notify[key] ? 'translateX(calc(100% + 2px))' : 'translateX(2px)' }} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CodeChip({ code, copied, onCopy }: { code: string; copied: boolean; onCopy: () => void }) {
  return (
    <button onClick={onCopy} className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium text-[var(--dash-text)]" style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }}>
      {copied ? <Check className="h-3.5 w-3.5" style={{ color: 'var(--dash-accent)' }} /> : <Copy className="h-3.5 w-3.5" />}
      <code className="mono">{code}</code>
    </button>
  )
}

function Waiting() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--dash-subtle)]">
      <RefreshCw className="h-3 w-3 animate-spin" /> waiting…
    </span>
  )
}

