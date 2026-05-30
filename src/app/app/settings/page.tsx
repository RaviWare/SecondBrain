'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import {
  Zap, Check, BookOpen, Database, Activity, Shield, CreditCard,
  Bot, Plus, Copy, Trash2, KeyRound,
} from 'lucide-react'

const SILVER = '#c8c8cf'

type PlanData = { plan?: string; tier?: string; ingestsThisMonth?: number; queriesThisMonth?: number }
type VaultData = { pageCount?: number; sourceCount?: number; nodeCount?: number; edgeCount?: number }
type AgentTokenMeta = {
  id: string
  name: string
  prefix: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
}

export default function SettingsPage() {
  const { user } = useUser()
  const [plan, setPlan] = useState<PlanData | null>(null)
  const [vault, setVault] = useState<VaultData | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        setPlan(d.plan)
        setVault(d.vault)
      })
      .catch(() => { /* keep zeros */ })
  }, [])

  async function handleUpgrade() {
    const res = await fetch('/api/stripe/checkout', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.location.href = data.url
  }

  const isPro       = plan?.plan === 'pro'
  const ingests     = plan?.ingestsThisMonth ?? 0
  const queries     = plan?.queriesThisMonth ?? 0
  const ingestsLeft = Math.max(0, 25 - ingests)
  const queriesLeft = Math.max(0, 50 - queries)
  const ingestPct   = Math.min((ingests / 25) * 100, 100)
  const queryPct    = Math.min((queries / 50) * 100, 100)

  return (
    <div className="mx-auto max-w-3xl p-4 text-[var(--text-primary)] sm:p-6 md:p-8">
      {/* ── Heading ─────────────────────────────────────────── */}
      <div className="mb-8">
        <p className="mono text-[10px] text-[var(--text-muted)] tracking-widest mb-2">
          ACCOUNT · SETTINGS
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-[var(--text-secondary)] text-sm mt-1">
          Manage your account and subscription.
        </p>
      </div>

      <div className="space-y-5">
        {/* ── Account card ───────────────────────────────── */}
        <Section icon={<Shield className="w-3.5 h-3.5" />} label="ACCOUNT">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div
              className="w-11 h-11 rounded-xl grid place-items-center font-semibold text-sm"
              style={{
                background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                color: '#0b0b0d',
                boxShadow: '0 8px 20px -8px color-mix(in srgb, var(--accent) 45%, transparent)',
              }}
            >
              {(user?.firstName?.[0] ??
                user?.emailAddresses?.[0]?.emailAddress?.[0] ??
                '?').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {user?.fullName ?? 'User'}
              </p>
              <p className="mono text-[10px] text-[var(--text-muted)] tracking-wider truncate">
                {user?.emailAddresses?.[0]?.emailAddress}
              </p>
            </div>
            <div className="sm:ml-auto">
              <Pill tone={isPro ? 'accent' : 'silver'}>{isPro ? 'PRO' : 'FREE'}</Pill>
            </div>
          </div>
        </Section>

        {/* ── Vault stats ────────────────────────────────── */}
        <Section icon={<Database className="w-3.5 h-3.5" />} label="VAULT STATISTICS">
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              icon={<BookOpen className="w-4 h-4" style={{ color: 'var(--accent-bright)' }} />}
              value={vault?.pageCount ?? 0}
              label="WIKI PAGES"
            />
            <Stat
              icon={<Database className="w-4 h-4" style={{ color: SILVER }} />}
              value={vault?.sourceCount ?? 0}
              label="SOURCES"
            />
            <Stat
              icon={<Activity className="w-4 h-4" style={{ color: 'var(--accent-bright)' }} />}
              value={ingests}
              label="INGESTS"
            />
          </div>

          {!isPro && (
            <div className="space-y-3">
              <Meter
                label="INGESTS THIS MONTH"
                current={ingests}
                total={25}
                left={ingestsLeft}
                pct={ingestPct}
                warnAt={20}
              />
              <Meter
                label="QUERIES THIS MONTH"
                current={queries}
                total={50}
                left={queriesLeft}
                pct={queryPct}
                warnAt={40}
              />
            </div>
          )}
        </Section>

        {/* ── Plan ───────────────────────────────────────── */}
        <Section icon={<CreditCard className="w-3.5 h-3.5" />} label="SUBSCRIPTION PLAN">
          {isPro ? (
            <div
              className="rounded-xl p-5 relative overflow-hidden"
              style={{
                border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
                background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
              }}
            >
              <div className="relative flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl grid place-items-center"
                  style={{
                    background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
                  }}
                >
                  <Zap className="w-5 h-5" style={{ color: 'var(--accent-bright)' }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--accent-bright)' }}>
                    Pro Plan · Active
                  </p>
                  <p className="mono text-[10px] text-[var(--text-muted)] tracking-wider mt-0.5">
                    UNLIMITED INGESTS · UNLIMITED QUERIES
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Free */}
              <div
                className="rounded-xl p-5"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Free</p>
                  <Pill tone="silver">CURRENT</Pill>
                </div>
                <p className="text-3xl font-bold text-[var(--text-primary)] mb-4">$0</p>
                <ul className="space-y-2 mb-5">
                  {['25 ingests/month', '50 queries/month', '1 vault', 'Claude Haiku'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <Check className="w-3 h-3 shrink-0" style={{ color: SILVER }} /> {f}
                    </li>
                  ))}
                </ul>
                <div
                  className="w-full text-center mono text-[9px] tracking-widest py-2 rounded-lg"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                  }}
                >
                  ACTIVE PLAN
                </div>
              </div>

              {/* Pro */}
              <div
                className="rounded-xl p-5 relative overflow-hidden"
                style={{
                  border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
                  background:
                    'linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, transparent), var(--surface-2))',
                }}
              >
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold" style={{ color: 'var(--accent-bright)' }}>
                      Pro
                    </p>
                    <Zap className="w-3.5 h-3.5" style={{ color: 'var(--accent-bright)' }} />
                  </div>
                  <p className="text-3xl font-bold text-[var(--text-primary)] mb-4">
                    $18<span className="text-sm font-normal text-[var(--text-muted)]">/mo</span>
                  </p>
                  <ul className="space-y-2 mb-5">
                    {[
                      'Unlimited ingests',
                      'Unlimited queries',
                      '3 vaults',
                      'Claude Sonnet 4.6',
                      'Priority support',
                    ].map(f => (
                      <li key={f} className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
                        <Check className="w-3 h-3 shrink-0" style={{ color: 'var(--accent-bright)' }} /> {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={handleUpgrade}
                    className="w-full mono text-[10px] font-semibold py-2.5 rounded-lg tracking-widest transition-opacity hover:opacity-95"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                      color: '#0b0b0d',
                    }}
                  >
                    UPGRADE TO PRO
                  </button>
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* ── Agent Access (Hermes / MCP) ────────────────── */}
        <AgentAccessSection />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════ */
function Section({
  icon,
  label,
  children,
}: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-2xl p-6 relative overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-bright)',
        boxShadow: 'var(--shadow-1)',
      }}
    >
      <span
        aria-hidden
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, color-mix(in srgb, #ffffff 8%, transparent), transparent)',
        }}
      />
      <div className="flex items-center gap-2 mb-5 text-[var(--text-muted)]">
        {icon}
        <p className="mono text-[10px] tracking-widest">{label}</p>
      </div>
      {children}
    </section>
  )
}

function Stat({
  icon,
  value,
  label,
}: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div
      className="rounded-lg p-4 text-center"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <div className="flex justify-center mb-2">{icon}</div>
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
      <p className="mono text-[9px] text-[var(--text-muted)] tracking-wider mt-1">{label}</p>
    </div>
  )
}

function Meter({
  label, current, total, left, pct, warnAt,
}: {
  label: string; current: number; total: number; left: number; pct: number; warnAt: number
}) {
  const warn = current >= warnAt
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest">{label}</p>
        <p className="mono text-[9px] text-[var(--text-secondary)]">
          {current} / {total}
          <span
            className="ml-2"
            style={{ color: warn ? 'var(--accent-bright)' : 'var(--text-muted)' }}
          >
            ({left} LEFT)
          </span>
        </p>
      </div>
      <div
        className="h-1 rounded-full overflow-hidden"
        style={{ background: 'var(--surface-2)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: warn
              ? 'var(--accent-bright)'
              : 'linear-gradient(90deg, var(--accent-bright), var(--accent))',
          }}
        />
      </div>
    </div>
  )
}

function Pill({ tone, children }: { tone: 'accent' | 'silver'; children: React.ReactNode }) {
  const style =
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
    <span
      className="mono text-[9px] px-2 py-1 rounded border tracking-widest font-medium"
      style={style}
    >
      {children}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════ */
/* Agent Access — Hermes / OpenClaw / MCP bearer tokens     */
function AgentAccessSection() {
  const [tokens, setTokens] = useState<AgentTokenMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('Hermes agent')
  const [writeScope, setWriteScope] = useState(false)
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const base = typeof window !== 'undefined' ? window.location.origin : ''

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/agent/tokens')
      const d = await r.json()
      setTokens(d.tokens || [])
    } catch {
      setTokens([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function createToken() {
    setCreating(true)
    setError('')
    setFreshToken(null)
    try {
      const r = await fetch('/api/agent/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'Hermes agent', scopes: writeScope ? ['read', 'write'] : ['read'] }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Failed to create token'); return }
      setFreshToken(d.token)
      await load()
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

  function copy(text: string) {
    navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Section icon={<Bot className="w-3.5 h-3.5" />} label="AGENT ACCESS · HERMES / MCP">
      <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
        Connect an autonomous agent (Hermes, OpenClaw, or any MCP client) to this vault.
        It can query with synthesis + gap analysis, search, and optionally ingest. Tokens are
        shown once — store them securely.
      </p>

      {/* Connection details */}
      <div
        className="rounded-lg p-3 mb-4 space-y-1.5"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <ConnRow label="MANIFEST" value={`${base}/api/agent/manifest`} onCopy={copy} />
        <ConnRow label="QUERY" value={`${base}/api/agent/query`} onCopy={copy} />
        <ConnRow label="SEARCH" value={`${base}/api/agent/search`} onCopy={copy} />
        <ConnRow label="INGEST" value={`${base}/api/agent/ingest`} onCopy={copy} />
      </div>

      {/* Create */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end mb-4">
        <div className="flex-1">
          <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest mb-1.5">TOKEN NAME</p>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Hermes agent"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <button
          onClick={() => setWriteScope(v => !v)}
          className="mono text-[9px] tracking-widest px-3 py-2.5 rounded-lg transition-colors"
          style={{
            background: writeScope ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--surface-2)',
            border: `1px solid ${writeScope ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'var(--border)'}`,
            color: writeScope ? 'var(--accent-bright)' : 'var(--text-muted)',
          }}
        >
          {writeScope ? 'READ + WRITE' : 'READ ONLY'}
        </button>
        <button
          onClick={createToken}
          disabled={creating}
          className="mono text-[10px] font-semibold py-2.5 px-4 rounded-lg tracking-widest flex items-center justify-center gap-1.5 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))', color: '#0b0b0d' }}
        >
          <Plus className="w-3 h-3" /> CREATE
        </button>
      </div>

      {error && <p className="text-xs mb-3" style={{ color: '#e0633c' }}>{error}</p>}

      {/* Fresh token (shown once) */}
      {freshToken && (
        <div
          className="rounded-lg p-3 mb-4"
          style={{ background: 'color-mix(in srgb, var(--accent) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)' }}
        >
          <p className="mono text-[9px] tracking-widest mb-2" style={{ color: 'var(--accent-bright)' }}>
            COPY NOW — SHOWN ONLY ONCE
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] break-all" style={{ color: 'var(--text-primary)' }}>{freshToken}</code>
            <button
              onClick={() => copy(freshToken)}
              className="shrink-0 grid place-items-center w-8 h-8 rounded-lg"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              {copied ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--accent-bright)' }} /> : <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
            </button>
          </div>
        </div>
      )}

      {/* Existing tokens */}
      {loading ? (
        <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest">LOADING…</p>
      ) : tokens.length === 0 ? (
        <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest">NO TOKENS YET</p>
      ) : (
        <div className="space-y-2">
          {tokens.map(t => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-lg p-3"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <span className="grid place-items-center w-8 h-8 rounded-lg shrink-0" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <KeyRound className="w-3.5 h-3.5" style={{ color: SILVER }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{t.name}</p>
                <p className="mono text-[9px] text-[var(--text-muted)] tracking-wider truncate">
                  {t.prefix}••• · {t.scopes.join(' + ').toUpperCase()} · {t.lastUsedAt ? `used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'never used'}
                </p>
              </div>
              <button
                onClick={() => revoke(t.id)}
                aria-label="Revoke token"
                className="shrink-0 grid place-items-center w-8 h-8 rounded-lg transition-colors hover:bg-[var(--surface)]"
                style={{ border: '1px solid var(--border)' }}
              >
                <Trash2 className="w-3.5 h-3.5" style={{ color: '#e0633c' }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function ConnRow({ label, value, onCopy }: { label: string; value: string; onCopy: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="mono text-[9px] text-[var(--text-muted)] tracking-widest w-16 shrink-0">{label}</span>
      <code className="flex-1 text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>{value}</code>
      <button onClick={() => onCopy(value)} aria-label={`Copy ${label} URL`} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <Copy className="w-3 h-3" />
      </button>
    </div>
  )
}
