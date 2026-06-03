'use client'

import { useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import {
  Zap, Check, BookOpen, Database, Activity, Shield, CreditCard,
  Bot, Plus, Copy, Trash2, KeyRound, Palette, Moon, Sun, Download,
  Brain, AlertTriangle, Save, Loader2, type LucideIcon,
} from 'lucide-react'
import { useTheme } from '@/components/theme/ThemeProvider'

const SILVER = '#c8c8cf'
const SURFACE_SOLID = 'var(--bg-elev-3, #1c1c1f)'

const NAV_SECTIONS: [string, string, LucideIcon][] = [
  ['account', 'Account', Shield],
  ['vault', 'Vault', Brain],
  ['usage', 'Usage', Activity],
  ['plan', 'Plan', CreditCard],
  ['appearance', 'Appearance', Palette],
  ['agents', 'Agent access', Bot],
  ['data', 'Data & privacy', Database],
  ['danger', 'Danger zone', AlertTriangle],
]

type PlanData = { plan?: string; tier?: string; ingestsThisMonth?: number; queriesThisMonth?: number }
type VaultData = { name?: string; description?: string; pageCount?: number; sourceCount?: number }
type AgentTokenMeta = {
  id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; createdAt: string
}

export default function SettingsPage() {
  const { user } = useUser()
  const [plan, setPlan] = useState<PlanData | null>(null)
  const [vault, setVault] = useState<VaultData | null>(null)
  const [active, setActive] = useState('account')

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => { setPlan(d.plan); setVault(d.vault) })
      .catch(() => { /* keep zeros */ })
  }, [])

  // Scroll-spy: highlight the nav item for the section currently in view.
  // A lock prevents the observer from flickering the highlight through every
  // section while a click-initiated smooth scroll is animating.
  const scrollLock = useRef(false)
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const ids = NAV_SECTIONS.map(([id]) => id)
    const els = ids.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    if (els.length === 0) return
    const observer = new IntersectionObserver(
      entries => {
        if (scrollLock.current) return // ignore during programmatic scroll
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  function scrollTo(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    setActive(id)                 // set target immediately — no flicker
    scrollLock.current = true     // hold it through the smooth scroll
    if (lockTimer.current) clearTimeout(lockTimer.current)
    lockTimer.current = setTimeout(() => { scrollLock.current = false }, 800)
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-5xl p-4 sm:p-6 md:p-8">
        {/* Heading */}
        <header className="dash-rise mb-8">
          <p className="mono text-[10px] uppercase text-[var(--dash-subtle)] tracking-widest mb-2">
            Account · Settings
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="dash-metallic-text">Settings</span>
          </h1>
          <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
            Manage your account, vault, appearance, data, and agent access.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
          {/* In-page nav */}
          <nav className="dash-rise hidden lg:block">
            <div className="sticky top-6 space-y-1">
              {NAV_SECTIONS.map(([id, label, Icon]) => {
                const on = active === id
                return (
                  <button
                    key={id}
                    onClick={() => scrollTo(id)}
                    aria-current={on ? 'true' : undefined}
                    className="relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-all duration-200"
                    style={on
                      ? { background: 'var(--dash-accent-soft)', color: 'var(--dash-accent)', border: '1px solid var(--dash-border-glow)' }
                      : { color: 'var(--dash-muted)', border: '1px solid transparent' }}
                  >
                    {on && <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r" style={{ background: 'var(--dash-accent)' }} />}
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                  </button>
                )
              })}
            </div>
          </nav>

          <div className="space-y-5">
            {/* Account */}
            <Section id="account" icon={<Shield className="w-3.5 h-3.5" />} label="ACCOUNT">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="dash-accent-grad w-11 h-11 rounded-xl grid place-items-center font-semibold text-sm text-white" style={{ boxShadow: '0 8px 20px -8px rgba(255,102,0,0.45)' }}>
                  {(user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? '?').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--dash-text)] truncate">{user?.fullName ?? 'User'}</p>
                  <p className="mono text-[10px] text-[var(--dash-subtle)] tracking-wider truncate">{user?.emailAddresses?.[0]?.emailAddress}</p>
                </div>
                <div className="sm:ml-auto"><Pill tone={isPro ? 'accent' : 'silver'}>{isPro ? 'PRO' : 'FREE'}</Pill></div>
              </div>
              <p className="mt-4 text-[11px] text-[var(--dash-subtle)]">
                Profile, email, and password are managed via your secure account menu (top-left avatar).
              </p>
            </Section>

            {/* Vault */}
            <VaultSection vault={vault} onSaved={v => setVault(prev => ({ ...prev, ...v }))} />

            {/* Usage */}
            <Section id="usage" icon={<Activity className="w-3.5 h-3.5" />} label="VAULT STATISTICS & USAGE">
              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat icon={<BookOpen className="w-4 h-4" style={{ color: 'var(--dash-accent)' }} />} value={vault?.pageCount ?? 0} label="WIKI PAGES" />
                <Stat icon={<Database className="w-4 h-4" style={{ color: SILVER }} />} value={vault?.sourceCount ?? 0} label="SOURCES" />
                <Stat icon={<Activity className="w-4 h-4" style={{ color: 'var(--dash-accent)' }} />} value={ingests} label="INGESTS" />
              </div>
              {!isPro && (
                <div className="space-y-3">
                  <Meter label="INGESTS THIS MONTH" current={ingests} total={25} left={ingestsLeft} pct={ingestPct} warnAt={20} />
                  <Meter label="QUERIES THIS MONTH" current={queries} total={50} left={queriesLeft} pct={queryPct} warnAt={40} />
                </div>
              )}
            </Section>

            {/* Plan */}
            <Section id="plan" icon={<CreditCard className="w-3.5 h-3.5" />} label="SUBSCRIPTION PLAN">
              {isPro ? (
                <div className="rounded-xl p-5 relative overflow-hidden" style={{ border: '1px solid var(--dash-border-glow)', background: 'var(--dash-accent-soft)' }}>
                  <div className="relative flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: 'var(--dash-accent-soft)', border: '1px solid var(--dash-border-glow)' }}>
                      <Zap className="w-5 h-5" style={{ color: 'var(--dash-accent)' }} />
                    </div>
                    <div>
                      <p className="font-semibold" style={{ color: 'var(--dash-accent)' }}>Pro Plan · Active</p>
                      <p className="mono text-[10px] text-[var(--dash-subtle)] tracking-wider mt-0.5">UNLIMITED INGESTS · UNLIMITED QUERIES · AI AGENTS</p>
                    </div>
                    <button className="ml-auto mono text-[9px] tracking-widest px-3 py-2 rounded-lg" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-muted)' }}>
                      MANAGE BILLING
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl p-5" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-[var(--dash-text)]">Free</p>
                      <Pill tone="silver">CURRENT</Pill>
                    </div>
                    <p className="text-3xl font-bold text-[var(--dash-text)] mb-4">$0</p>
                    <ul className="space-y-2 mb-5">
                      {['25 ingests/month', '50 queries/month', '1 vault', 'AI memory + citations'].map(f => (
                        <li key={f} className="flex items-center gap-2 text-xs text-[var(--dash-muted)]"><Check className="w-3 h-3 shrink-0" style={{ color: SILVER }} /> {f}</li>
                      ))}
                    </ul>
                    <div className="w-full text-center mono text-[9px] tracking-widest py-2 rounded-lg" style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)', color: 'var(--dash-subtle)' }}>ACTIVE PLAN</div>
                  </div>
                  <div className="rounded-xl p-5 relative overflow-hidden" style={{ border: '1px solid var(--dash-border-glow)', background: 'linear-gradient(180deg, var(--dash-accent-soft), var(--dash-card-solid))' }}>
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold" style={{ color: 'var(--dash-accent)' }}>Pro</p>
                        <Zap className="w-3.5 h-3.5" style={{ color: 'var(--dash-accent)' }} />
                      </div>
                      <p className="text-3xl font-bold text-[var(--dash-text)] mb-4">$18<span className="text-sm font-normal text-[var(--dash-subtle)]">/mo</span></p>
                      <ul className="space-y-2 mb-5">
                        {['Unlimited ingests', 'Unlimited queries', '3 vaults', 'AI agents', 'Priority support'].map(f => (
                          <li key={f} className="flex items-center gap-2 text-xs text-[var(--dash-text)]"><Check className="w-3 h-3 shrink-0" style={{ color: 'var(--dash-accent)' }} /> {f}</li>
                        ))}
                      </ul>
                      <button onClick={handleUpgrade} className="dash-accent-grad w-full mono text-[10px] font-semibold py-2.5 rounded-lg tracking-widest text-white transition hover:-translate-y-0.5">UPGRADE TO PRO</button>
                    </div>
                  </div>
                </div>
              )}
            </Section>

            {/* Appearance */}
            <AppearanceSection />

            {/* Agent access */}
            <AgentAccessSection />

            {/* Data & privacy */}
            <DataPrivacySection />

            {/* Danger zone */}
            <DangerZoneSection />
          </div>
        </div>
      </div>
    </main>
  )
}

/* ═══════════════════════════════════════════════════════ */
function Section({ id, icon, label, children, danger }: { id?: string; icon: React.ReactNode; label: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section
      id={id}
      className="dash-panel dash-grain dash-rise rounded-2xl p-6 relative overflow-hidden scroll-mt-8"
      style={danger ? { borderColor: 'color-mix(in srgb, #f0524b 30%, var(--dash-border))' } : undefined}
    >
      <div className="flex items-center gap-2 mb-5" style={{ color: danger ? '#f0746b' : 'var(--dash-subtle)' }}>
        {icon}
        <p className="mono text-[10px] tracking-widest">{label}</p>
      </div>
      {children}
    </section>
  )
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="rounded-lg p-4 text-center" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
      <div className="flex justify-center mb-2">{icon}</div>
      <p className="text-2xl font-bold text-[var(--dash-text)]">{value}</p>
      <p className="mono text-[9px] text-[var(--dash-subtle)] tracking-wider mt-1">{label}</p>
    </div>
  )
}

function Meter({ label, current, total, left, pct, warnAt }: { label: string; current: number; total: number; left: number; pct: number; warnAt: number }) {
  const warn = current >= warnAt
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="mono text-[9px] text-[var(--dash-subtle)] tracking-widest">{label}</p>
        <p className="mono text-[9px] text-[var(--dash-muted)]">{current} / {total}<span className="ml-2" style={{ color: warn ? 'var(--dash-accent)' : 'var(--dash-subtle)' }}>({left} LEFT)</span></p>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--dash-card-solid)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: warn ? 'var(--dash-accent)' : 'linear-gradient(90deg, var(--dash-accent-2), var(--dash-accent))' }} />
      </div>
    </div>
  )
}

function Pill({ tone, children }: { tone: 'accent' | 'silver'; children: React.ReactNode }) {
  const style = tone === 'accent'
    ? { color: 'var(--dash-accent)', background: 'var(--dash-accent-soft)', borderColor: 'var(--dash-border-glow)' }
    : { color: SILVER, background: 'color-mix(in srgb, #ffffff 4%, transparent)', borderColor: 'var(--dash-border)' }
  return <span className="mono text-[9px] px-2 py-1 rounded border tracking-widest font-medium" style={style}>{children}</span>
}

/* ── Vault rename/description ──────────────────────────────── */
function VaultSection({ vault, onSaved }: { vault: VaultData | null; onSaved: (v: VaultData) => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    queueMicrotask(() => {
      setName(vault?.name ?? '')
      setDesc(vault?.description ?? '')
    })
  }, [vault?.name, vault?.description])

  const dirty = name.trim() !== (vault?.name ?? '') || desc !== (vault?.description ?? '')

  async function save() {
    setSaving(true); setSaved(false)
    try {
      const r = await fetch('/api/vault', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc }),
      })
      if (r.ok) { onSaved({ name: name.trim(), description: desc }); setSaved(true); setTimeout(() => setSaved(false), 1800) }
    } finally { setSaving(false) }
  }

  return (
    <Section id="vault" icon={<Brain className="w-3.5 h-3.5" />} label="VAULT">
      <label className="mono text-[9px] text-[var(--dash-subtle)] tracking-widest mb-1.5 block">VAULT NAME</label>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        maxLength={80}
        placeholder="My Second Brain"
        className="w-full rounded-lg px-3 py-2.5 text-sm mb-4 focus:outline-none"
        style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-text)' }}
      />
      <label className="mono text-[9px] text-[var(--dash-subtle)] tracking-widest mb-1.5 block">DESCRIPTION · OPTIONAL</label>
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        maxLength={280}
        rows={2}
        placeholder="What is this brain for?"
        className="w-full rounded-lg px-3 py-2.5 text-sm mb-4 resize-none focus:outline-none"
        style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-text)' }}
      />
      <button
        onClick={save}
        disabled={!dirty || saving}
        className="dash-accent-grad inline-flex items-center gap-2 rounded-lg px-4 py-2.5 mono text-[10px] font-semibold tracking-widest text-white disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        {saved ? 'SAVED' : 'SAVE CHANGES'}
      </button>
    </Section>
  )
}

/* ── Appearance (wired to real ThemeProvider) ─────────────── */
function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  return (
    <Section id="appearance" icon={<Palette className="w-3.5 h-3.5" />} label="APPEARANCE">
      <p className="mono text-[9px] text-[var(--dash-subtle)] tracking-widest mb-3">THEME</p>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        {([['dark', 'Dark', Moon], ['light', 'Light', Sun]] as const).map(([val, label, Icon]) => {
          const on = theme === val
          return (
            <button
              key={val}
              onClick={() => setTheme(val)}
              className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium transition"
              style={on
                ? { background: 'var(--dash-accent-soft)', border: '1px solid var(--dash-border-glow)', color: 'var(--dash-accent)' }
                : { background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-muted)' }}
            >
              <Icon className="h-4 w-4" /> {label}
              {on && <Check className="h-3.5 w-3.5 ml-auto" />}
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-[var(--dash-subtle)]">Your theme preference is saved on this device.</p>
    </Section>
  )
}

/* ── Data & privacy ───────────────────────────────────────── */
function DataPrivacySection() {
  return (
    <Section id="data" icon={<Database className="w-3.5 h-3.5" />} label="DATA & PRIVACY">
      <div className="space-y-2.5 mb-5">
        <PrivacyRow text="Encrypted in transit (TLS) and at rest (AES-256)." />
        <PrivacyRow text="Your content is processed only to power your brain's features — never sold, never used to train AI models." />
        <PrivacyRow text="You own your data and can export everything at any time." />
      </div>
      <a
        href="/api/vault/export"
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition hover:border-[var(--dash-border-glow)]"
        style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-text)' }}
      >
        <Download className="h-3.5 w-3.5" /> Export all data (JSON)
      </a>
      <p className="mt-2 text-[11px] text-[var(--dash-subtle)]">
        Includes every wiki page, source, and log entry in a single portable file.
      </p>
    </Section>
  )
}

function PrivacyRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg p-3" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
      <Shield className="h-4 w-4 shrink-0 mt-0.5" style={{ color: SILVER }} />
      <p className="text-[12px] text-[var(--dash-muted)] leading-relaxed">{text}</p>
    </div>
  )
}

/* ── Danger zone (typed-confirmation wipe) ────────────────── */
function DangerZoneSection() {
  const [confirming, setConfirming] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  async function wipe() {
    if (phrase !== 'DELETE') return
    setBusy(true); setDone('')
    try {
      const r = await fetch('/api/vault/wipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      })
      const d = await r.json()
      if (r.ok) {
        setDone(`Erased ${d.deleted.pages} pages, ${d.deleted.sources} sources, ${d.deleted.logs} logs.`)
        setConfirming(false); setPhrase('')
      }
    } finally { setBusy(false) }
  }

  return (
    <Section id="danger" icon={<AlertTriangle className="w-3.5 h-3.5" />} label="DANGER ZONE" danger>
      <p className="text-[12px] text-[var(--dash-muted)] leading-relaxed mb-4">
        Permanently erase all knowledge in your vault — every wiki page, source, and log. Your account
        stays active but starts empty. This cannot be undone. Export your data first.
      </p>
      {done ? (
        <p className="text-xs" style={{ color: 'var(--dash-accent)' }}>{done}</p>
      ) : !confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition"
          style={{ background: 'color-mix(in srgb, #f0524b 10%, transparent)', border: '1px solid color-mix(in srgb, #f0524b 30%, transparent)', color: '#f0746b' }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Erase all knowledge…
        </button>
      ) : (
        <div className="rounded-lg p-4" style={{ background: 'color-mix(in srgb, #f0524b 7%, transparent)', border: '1px solid color-mix(in srgb, #f0524b 28%, transparent)' }}>
          <p className="text-[12px] mb-3" style={{ color: '#f0746b' }}>
            Type <strong>DELETE</strong> to confirm. This erases everything in your vault.
          </p>
          <input
            value={phrase}
            onChange={e => setPhrase(e.target.value)}
            placeholder="DELETE"
            className="w-full rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none"
            style={{ background: SURFACE_SOLID, border: '1px solid color-mix(in srgb, #f0524b 28%, transparent)', color: 'var(--dash-text)' }}
          />
          <div className="flex gap-2">
            <button
              onClick={wipe}
              disabled={phrase !== 'DELETE' || busy}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
              style={{ background: '#c0392b', color: '#fff' }}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Permanently erase
            </button>
            <button
              onClick={() => { setConfirming(false); setPhrase('') }}
              className="rounded-lg px-4 py-2.5 text-sm font-medium"
              style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Section>
  )
}

/* ═══════════════════════════════════════════════════════ */
/* Agent Access — OpenClaw / MCP bearer tokens              */
function AgentAccessSection() {
  const [tokens, setTokens] = useState<AgentTokenMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('Agent token')
  const [writeScope, setWriteScope] = useState(false)
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const base = typeof window !== 'undefined' ? window.location.origin : ''

  async function load() {
    queueMicrotask(() => setLoading(true))
    try {
      const r = await fetch('/api/agent/tokens')
      const d = await r.json()
      setTokens(d.tokens || [])
    } catch { setTokens([]) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) load() })
    return () => { cancelled = true }
  }, [])

  async function createToken() {
    setCreating(true); setError(''); setFreshToken(null)
    try {
      const r = await fetch('/api/agent/tokens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'Agent token', scopes: writeScope ? ['read', 'write'] : ['read'] }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Failed to create token'); return }
      setFreshToken(d.token); await load()
    } catch { setError('Network error creating token') }
    finally { setCreating(false) }
  }

  async function revoke(id: string) {
    await fetch(`/api/agent/tokens?id=${id}`, { method: 'DELETE' }); await load()
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Section id="agents" icon={<Bot className="w-3.5 h-3.5" />} label="AGENT ACCESS · MCP">
      <p className="text-xs text-[var(--dash-muted)] mb-4 leading-relaxed">
        Connect an autonomous agent (OpenClaw or any MCP client) to this vault. It can query
        with synthesis + gap analysis, search, and optionally ingest. Tokens are shown once — store them securely.
      </p>

      <div className="rounded-lg p-3 mb-4 space-y-1.5" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
        <ConnRow label="MANIFEST" value={`${base}/api/agent/manifest`} onCopy={copy} />
        <ConnRow label="QUERY" value={`${base}/api/agent/query`} onCopy={copy} />
        <ConnRow label="SEARCH" value={`${base}/api/agent/search`} onCopy={copy} />
        <ConnRow label="INGEST" value={`${base}/api/agent/ingest`} onCopy={copy} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end mb-4">
        <div className="flex-1">
          <p className="mono text-[9px] text-[var(--dash-subtle)] tracking-widest mb-1.5">TOKEN NAME</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Agent token"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-text)' }} />
        </div>
        <button onClick={() => setWriteScope(v => !v)} className="mono text-[9px] tracking-widest px-3 py-2.5 rounded-lg transition-colors"
          style={{ background: writeScope ? 'var(--dash-accent-soft)' : 'var(--dash-card-solid)', border: `1px solid ${writeScope ? 'var(--dash-border-glow)' : 'var(--dash-border)'}`, color: writeScope ? 'var(--dash-accent)' : 'var(--dash-subtle)' }}>
          {writeScope ? 'READ + WRITE' : 'READ ONLY'}
        </button>
        <button onClick={createToken} disabled={creating} className="dash-accent-grad mono text-[10px] font-semibold py-2.5 px-4 rounded-lg tracking-widest flex items-center justify-center gap-1.5 text-white disabled:opacity-50">
          <Plus className="w-3 h-3" /> CREATE
        </button>
      </div>

      {error && <p className="text-xs mb-3" style={{ color: '#e0633c' }}>{error}</p>}

      {freshToken && (
        <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--dash-accent-soft)', border: '1px solid var(--dash-border-glow)' }}>
          <p className="mono text-[9px] tracking-widest mb-2" style={{ color: 'var(--dash-accent)' }}>COPY NOW — SHOWN ONLY ONCE</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] break-all" style={{ color: 'var(--dash-text)' }}>{freshToken}</code>
            <button onClick={() => copy(freshToken)} className="shrink-0 grid place-items-center w-8 h-8 rounded-lg" style={{ background: SURFACE_SOLID, border: '1px solid var(--dash-border)' }}>
              {copied ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--dash-accent)' }} /> : <Copy className="w-3.5 h-3.5 text-[var(--dash-subtle)]" />}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="mono text-[9px] text-[var(--dash-subtle)] tracking-widest">LOADING…</p>
      ) : tokens.length === 0 ? (
        <p className="mono text-[9px] text-[var(--dash-subtle)] tracking-widest">NO TOKENS YET</p>
      ) : (
        <div className="space-y-2">
          {tokens.map(t => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg p-3" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
              <span className="grid place-items-center w-8 h-8 rounded-lg shrink-0" style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}>
                <KeyRound className="w-3.5 h-3.5" style={{ color: SILVER }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--dash-text)] truncate">{t.name}</p>
                <p className="mono text-[9px] text-[var(--dash-subtle)] tracking-wider truncate">
                  {t.prefix}••• · {t.scopes.join(' + ').toUpperCase()} · {t.lastUsedAt ? `used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'never used'}
                </p>
              </div>
              <button onClick={() => revoke(t.id)} aria-label="Revoke token" className="shrink-0 grid place-items-center w-8 h-8 rounded-lg transition-colors hover:bg-[var(--dash-soft)]" style={{ border: '1px solid var(--dash-border)' }}>
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
      <span className="mono text-[9px] text-[var(--dash-subtle)] tracking-widest w-16 shrink-0">{label}</span>
      <code className="flex-1 text-[10px] truncate" style={{ color: 'var(--dash-muted)' }}>{value}</code>
      <button onClick={() => onCopy(value)} aria-label={`Copy ${label} URL`} className="shrink-0 text-[var(--dash-subtle)] hover:text-[var(--dash-text)]">
        <Copy className="w-3 h-3" />
      </button>
    </div>
  )
}
