'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import {
  Zap, Check, BookOpen, Database, Activity, Shield, CreditCard,
} from 'lucide-react'

const SILVER = '#c8c8cf'

type PlanData = { plan?: string; tier?: string; ingestsThisMonth?: number; queriesThisMonth?: number }
type VaultData = { pageCount?: number; sourceCount?: number; nodeCount?: number; edgeCount?: number }

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
    <div className="p-8 max-w-3xl mx-auto text-[var(--text-primary)]">
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
          <div className="flex items-center gap-4">
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
            <div className="ml-auto">
              <Pill tone={isPro ? 'accent' : 'silver'}>{isPro ? 'PRO' : 'FREE'}</Pill>
            </div>
          </div>
        </Section>

        {/* ── Vault stats ────────────────────────────────── */}
        <Section icon={<Database className="w-3.5 h-3.5" />} label="VAULT STATISTICS">
          <div className="grid grid-cols-3 gap-3 mb-5">
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
