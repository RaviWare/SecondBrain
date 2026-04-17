'use client'

import { useEffect, useState, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import { gsap } from 'gsap'
import { Zap, Check, BookOpen, Database, Activity, Shield, CreditCard } from 'lucide-react'

export default function SettingsPage() {
  const { user } = useUser()
  const [plan, setPlan] = useState<any>(null)
  const [vault, setVault] = useState<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(d => {
      setPlan(d.plan)
      setVault(d.vault)
    })
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    gsap.from(containerRef.current.children, {
      opacity: 0, y: 20, duration: 0.5, stagger: 0.08, ease: 'power2.out'
    })
  }, [])

  async function handleUpgrade() {
    const res = await fetch('/api/stripe/checkout', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.location.href = data.url
  }

  const isPro = plan?.plan === 'pro'
  const ingestsLeft = 25 - (plan?.ingestsThisMonth ?? 0)
  const queriesLeft = 50 - (plan?.queriesThisMonth ?? 0)
  const ingestPct = ((plan?.ingestsThisMonth ?? 0) / 25) * 100
  const queryPct = ((plan?.queriesThisMonth ?? 0) / 50) * 100

  const initial = user?.firstName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || '?'

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8 fade-up">
        <p className="mono text-[10px] text-white/25 tracking-widest mb-2">ACCOUNT · SETTINGS</p>
        <h1 className="text-2xl font-black text-white/90">Settings</h1>
        <p className="text-white/30 text-sm mt-1">Manage your account and subscription</p>
      </div>

      <div ref={containerRef} className="space-y-4">
        {/* Account */}
        <section className="glass border border-white/5 rounded-xl p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
          <div className="flex items-center gap-2 mb-5">
            <Shield className="w-3.5 h-3.5 text-white/20" />
            <p className="mono text-[10px] text-white/25 tracking-widest">ACCOUNT</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-violet-500/20">
              {initial}
            </div>
            <div>
              <p className="text-sm font-bold text-white/80">{user?.fullName || 'User'}</p>
              <p className="mono text-[10px] text-white/30 tracking-wider">{user?.emailAddresses?.[0]?.emailAddress}</p>
            </div>
            <div className="ml-auto">
              <span className={`mono text-[9px] px-2 py-1 rounded border tracking-widest font-medium ${
                isPro
                  ? 'text-violet-400 bg-violet-500/10 border-violet-500/20'
                  : 'text-white/30 bg-white/5 border-white/10'
              }`}>
                {isPro ? 'PRO' : 'FREE'}
              </span>
            </div>
          </div>
        </section>

        {/* Vault Stats */}
        <section className="glass border border-white/5 rounded-xl p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
          <div className="flex items-center gap-2 mb-5">
            <Database className="w-3.5 h-3.5 text-white/20" />
            <p className="mono text-[10px] text-white/25 tracking-widest">VAULT STATISTICS</p>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="glass border border-white/5 rounded-lg p-4 text-center">
              <BookOpen className="w-4 h-4 text-violet-400/60 mx-auto mb-2" />
              <p className="text-2xl font-black text-white/80">{vault?.pageCount ?? 0}</p>
              <p className="mono text-[9px] text-white/25 tracking-wider mt-1">WIKI PAGES</p>
            </div>
            <div className="glass border border-white/5 rounded-lg p-4 text-center">
              <Database className="w-4 h-4 text-blue-400/60 mx-auto mb-2" />
              <p className="text-2xl font-black text-white/80">{vault?.sourceCount ?? 0}</p>
              <p className="mono text-[9px] text-white/25 tracking-wider mt-1">SOURCES</p>
            </div>
            <div className="glass border border-white/5 rounded-lg p-4 text-center">
              <Activity className="w-4 h-4 text-cyan-400/60 mx-auto mb-2" />
              <p className="text-2xl font-black text-white/80">{plan?.ingestsThisMonth ?? 0}</p>
              <p className="mono text-[9px] text-white/25 tracking-wider mt-1">INGESTS</p>
            </div>
          </div>

          {!isPro && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="mono text-[9px] text-white/30 tracking-widest">INGESTS THIS MONTH</p>
                  <p className="mono text-[9px] text-white/30">
                    {plan?.ingestsThisMonth ?? 0} / 25
                    <span className={`ml-2 ${ingestsLeft <= 5 ? 'text-rose-400' : 'text-white/20'}`}>
                      ({ingestsLeft} LEFT)
                    </span>
                  </p>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${ingestPct > 80 ? 'bg-rose-500' : 'bg-violet-500'}`}
                    style={{ width: `${Math.min(ingestPct, 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="mono text-[9px] text-white/30 tracking-widest">QUERIES THIS MONTH</p>
                  <p className="mono text-[9px] text-white/30">
                    {plan?.queriesThisMonth ?? 0} / 50
                    <span className={`ml-2 ${queriesLeft <= 10 ? 'text-rose-400' : 'text-white/20'}`}>
                      ({queriesLeft} LEFT)
                    </span>
                  </p>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${queryPct > 80 ? 'bg-rose-500' : 'bg-cyan-500'}`}
                    style={{ width: `${Math.min(queryPct, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Plan */}
        <section className="glass border border-white/5 rounded-xl p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
          <div className="flex items-center gap-2 mb-5">
            <CreditCard className="w-3.5 h-3.5 text-white/20" />
            <p className="mono text-[10px] text-white/25 tracking-widest">SUBSCRIPTION PLAN</p>
          </div>

          {isPro ? (
            <div className="glass border border-violet-500/20 rounded-xl p-5 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600/8 to-transparent" />
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
              <div className="relative flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="font-bold text-violet-300">Pro Plan · Active</p>
                  <p className="mono text-[10px] text-white/30 tracking-wider mt-0.5">UNLIMITED INGESTS · UNLIMITED QUERIES</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {/* Free */}
              <div className="glass border border-white/8 rounded-xl p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-white/60">Free</p>
                  <span className="mono text-[9px] text-white/25 bg-white/5 border border-white/8 px-2 py-0.5 rounded tracking-widest">CURRENT</span>
                </div>
                <p className="text-3xl font-black text-white/80 mb-4">$0</p>
                <ul className="space-y-2 mb-5">
                  {['25 ingests/month', '50 queries/month', '1 vault', 'Claude Haiku'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-white/35">
                      <Check className="w-3 h-3 text-white/20 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="w-full text-center mono text-[9px] text-white/20 tracking-widest py-2 glass border border-white/5 rounded-lg">
                  ACTIVE PLAN
                </div>
              </div>

              {/* Pro */}
              <div className="glass border border-violet-500/25 rounded-xl p-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-600/8 to-transparent" />
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold text-violet-300">Pro</p>
                    <Zap className="w-3.5 h-3.5 text-violet-400" />
                  </div>
                  <p className="text-3xl font-black text-white/80 mb-4">
                    $18<span className="text-sm font-normal text-white/30">/mo</span>
                  </p>
                  <ul className="space-y-2 mb-5">
                    {['Unlimited ingests', 'Unlimited queries', '3 vaults', 'Claude Sonnet 4.6', 'Priority support'].map(f => (
                      <li key={f} className="flex items-center gap-2 text-xs text-white/60">
                        <Check className="w-3 h-3 text-violet-400 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={handleUpgrade}
                    className="w-full btn-primary mono text-[10px] font-semibold py-2.5 rounded-lg tracking-widest"
                  >
                    UPGRADE TO PRO
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
