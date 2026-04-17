'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { Zap, Check } from 'lucide-react'

export default function SettingsPage() {
  const { user } = useUser()
  const [plan, setPlan] = useState<any>(null)
  const [vault, setVault] = useState<any>(null)

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(d => {
      setPlan(d.plan)
      setVault(d.vault)
    })
  }, [])

  async function handleUpgrade() {
    const res = await fetch('/api/stripe/checkout', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.location.href = data.url
  }

  const isPro = plan?.plan === 'pro'

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">Manage your account and subscription</p>
      </div>

      {/* Account */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
        <h2 className="text-sm font-semibold text-zinc-200 mb-4">Account</h2>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white font-semibold text-sm">
            {user?.firstName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-200">{user?.fullName || 'User'}</p>
            <p className="text-xs text-zinc-500">{user?.emailAddresses?.[0]?.emailAddress}</p>
          </div>
        </div>
      </section>

      {/* Vault Stats */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-4">
        <h2 className="text-sm font-semibold text-zinc-200 mb-4">Your Vault</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold text-zinc-100">{vault?.pageCount ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Wiki pages</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-100">{vault?.sourceCount ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Sources ingested</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-zinc-100">{plan?.ingestsThisMonth ?? 0}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Ingests this month</p>
          </div>
        </div>
      </section>

      {/* Plan */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-200 mb-4">Plan</h2>
        {isPro ? (
          <div className="flex items-center gap-3 p-4 bg-violet-600/10 border border-violet-500/20 rounded-xl">
            <Zap className="w-5 h-5 text-violet-400" />
            <div>
              <p className="text-sm font-semibold text-violet-300">Pro Plan</p>
              <p className="text-xs text-zinc-500">Unlimited ingests, all models, full access</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Free */}
              <div className="border border-zinc-700 rounded-xl p-4">
                <p className="text-sm font-semibold text-zinc-300 mb-1">Free</p>
                <p className="text-2xl font-bold text-zinc-100 mb-3">$0</p>
                <ul className="space-y-1.5 mb-4">
                  {['25 ingests/month', '50 queries/month', '1 vault', 'Claude Haiku'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-zinc-500">
                      <Check className="w-3 h-3 text-zinc-600" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="w-full text-center text-xs text-zinc-600 py-2 border border-zinc-800 rounded-lg">Current plan</div>
              </div>
              {/* Pro */}
              <div className="border border-violet-500/40 rounded-xl p-4 bg-violet-600/5">
                <p className="text-sm font-semibold text-violet-300 mb-1">Pro</p>
                <p className="text-2xl font-bold text-zinc-100 mb-3">$18<span className="text-sm font-normal text-zinc-500">/mo</span></p>
                <ul className="space-y-1.5 mb-4">
                  {['Unlimited ingests', 'Unlimited queries', '3 vaults', 'Claude Sonnet 4.6', 'Priority support'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-zinc-300">
                      <Check className="w-3 h-3 text-violet-400" /> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleUpgrade}
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium py-2 rounded-lg transition-colors"
                >
                  Upgrade to Pro
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
