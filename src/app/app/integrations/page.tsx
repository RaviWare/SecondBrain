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
  Plug,
  Plus,
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
