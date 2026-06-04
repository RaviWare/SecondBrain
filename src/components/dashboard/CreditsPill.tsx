'use client'

// ── Credits pill ──────────────────────────────────────────────────────────────
// Top-bar token indicator (the Mission Control "Credits" counter), from REAL
// data: GET /api/agents/cost → allowance { consumed, remaining, allowance }.
// Shows remaining tokens when the squad has a cap, else total consumed (uncapped).
// Links to the Cost page. Renders nothing until data loads (no fabricated number).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Coins } from 'lucide-react'

type Allowance = { allowance: number; consumed: number; remaining: number }

function compact(n: number): string {
  if (!Number.isFinite(n)) return '∞'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

export function CreditsPill() {
  const [data, setData] = useState<Allowance | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/agents/cost', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.allowance) return
        setData(d.allowance as Allowance)
      })
      .catch(() => { /* silent — pill simply doesn't render */ })
    return () => { cancelled = true }
  }, [])

  if (!data) return null

  // Capped plan → show remaining headroom; uncapped → show consumed this period.
  const capped = Number.isFinite(data.allowance) && data.allowance > 0
  const value = capped ? data.remaining : data.consumed
  const label = capped ? 'left' : 'used'
  const low = capped && data.allowance > 0 && data.remaining / data.allowance <= 0.15

  return (
    <Link
      href="/app/agents/cost"
      aria-label="Token credits — view cost & budget"
      title={
        capped
          ? `${compact(data.consumed)} of ${compact(data.allowance)} tokens used this period`
          : `${compact(data.consumed)} tokens used this period (no cap set)`
      }
      className="dash-menu dash-interactive group hidden h-11 shrink-0 items-center gap-2 rounded-2xl px-3.5 sm:flex"
      style={low ? { borderColor: 'var(--dash-border-glow)' } : undefined}
    >
      <Coins
        className="h-[17px] w-[17px] transition-transform duration-300 group-hover:scale-110"
        style={{ color: low ? 'var(--dash-accent)' : 'var(--dash-muted)' }}
      />
      <span className="flex items-baseline gap-1 [font-variant-numeric:tabular-nums]">
        <span className="text-sm font-semibold" style={{ color: low ? 'var(--dash-accent)' : 'var(--dash-text)' }}>
          {compact(value)}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--dash-subtle)]">{label}</span>
      </span>
    </Link>
  )
}
