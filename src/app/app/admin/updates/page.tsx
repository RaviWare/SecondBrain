'use client'

// ── Admin → Updates ───────────────────────────────────────────────────────────
// Admin-only feed of system alerts (currently upstream-update notifications from
// the scheduled monitor). Reads GET /api/admin/notifications and lets the admin
// acknowledge items. A non-admin sees a clear "not authorized" state (the API
// returns 403; the UI never fabricates data).
//
// Glass recipe is MANDATORY (.kiro/steering/glass-theme.md): `sb-dashboard`
// shell + `dash-panel dash-grain dash-interactive` cards, `--dash-*` tokens only,
// `.dash-metallic-text` heading, `.dash-accent-grad` primary button.

import { useCallback, useEffect, useState } from 'react'
import {
  BellRing,
  Check,
  CheckCheck,
  ExternalLink,
  GitCommitHorizontal,
  Loader2,
  ShieldAlert,
  Tag,
} from 'lucide-react'

type Notification = {
  id: string
  kind: string
  source: string
  title: string
  body: string
  url: string | null
  severity: 'info' | 'warning'
  acknowledged: boolean
  acknowledgedAt: string | null
  createdAt: string | null
}

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden'

export default function AdminUpdatesPage() {
  const [state, setState] = useState<LoadState>('loading')
  const [items, setItems] = useState<Notification[]>([])
  const [unack, setUnack] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notifications', { cache: 'no-store' })
      if (res.status === 403 || res.status === 401) {
        setState('forbidden')
        return
      }
      if (!res.ok) {
        setState('error')
        return
      }
      const body = await res.json()
      setItems(Array.isArray(body.notifications) ? body.notifications : [])
      setUnack(typeof body.unacknowledged === 'number' ? body.unacknowledged : 0)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) load() })
    return () => { cancelled = true }
  }, [load])

  async function acknowledge(id: string) {
    setBusy(id)
    try {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function acknowledgeAll() {
    setBusy('all')
    try {
      await fetch('/api/admin/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 lg:p-7">
        <header className="dash-rise flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
              Admin · System updates
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="dash-metallic-text">Updates</span>
            </h1>
            <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
              Alerts when the upstream agent project ships a new release or commit. Notifications only —
              no upstream code is pulled or applied automatically.
            </p>
          </div>
          {state === 'ready' && items.some((n) => !n.acknowledged) && (
            <button
              onClick={acknowledgeAll}
              disabled={busy === 'all'}
              className="dash-accent-grad inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              Mark all read
            </button>
          )}
        </header>

        {state === 'ready' && (
          <p className="dash-inset inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--dash-accent)]">
            <BellRing className="h-3 w-3" /> {unack} unread
          </p>
        )}

        {state === 'loading' && <SkeletonCard />}
        {state === 'error' && <NoticeCard icon={ShieldAlert} title="Could not load updates" body="Something went wrong fetching the admin feed. Try again shortly." />}
        {state === 'forbidden' && (
          <NoticeCard
            icon={ShieldAlert}
            title="Admin access required"
            body="This page is limited to administrators. Ask an admin to add your account to ADMIN_USER_IDS."
          />
        )}

        {state === 'ready' &&
          (items.length === 0 ? (
            <NoticeCard icon={BellRing} title="No updates yet" body="When the upstream agent project ships a new release or commit, it will appear here." />
          ) : (
            <div className="space-y-3">
              {items.map((n, i) => (
                <NotificationCard
                  key={n.id}
                  n={n}
                  delay={`${0.05 * (i + 1)}s`}
                  busy={busy === n.id}
                  onAck={() => acknowledge(n.id)}
                />
              ))}
            </div>
          ))}
      </div>
    </main>
  )
}

function NotificationCard({ n, delay, busy, onAck }: { n: Notification; delay: string; busy: boolean; onAck: () => void }) {
  const isRelease = n.title.toLowerCase().includes('release')
  const Icon = isRelease ? Tag : GitCommitHorizontal
  return (
    <article
      className="dash-panel dash-grain dash-interactive dash-rise flex flex-col gap-2.5 p-4"
      style={{ animationDelay: delay, opacity: n.acknowledged ? 0.6 : 1 }}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border"
          style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)', background: 'var(--dash-accent-soft)' }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--dash-text-strong)]">{n.title}</p>
          <p className="mono mt-0.5 text-[10px] uppercase tracking-wide text-[var(--dash-subtle)]">
            {n.source}{n.createdAt ? ` · ${new Date(n.createdAt).toLocaleString()}` : ''}
          </p>
        </div>
        {n.acknowledged ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ color: '#34d399', borderColor: 'rgba(52,211,153,0.32)', background: 'rgba(52,211,153,0.10)' }}>
            <Check className="h-3 w-3" /> Read
          </span>
        ) : (
          <button
            onClick={onAck}
            disabled={busy}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--dash-border)] px-2.5 text-[11px] font-medium text-[var(--dash-text)] transition hover:border-[var(--dash-border-glow)] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Mark read
          </button>
        )}
      </div>

      <p className="whitespace-pre-line rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--dash-muted)]" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
        {n.body}
      </p>

      {n.url && (
        <a
          href={n.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium"
          style={{ color: 'var(--dash-accent)' }}
        >
          <ExternalLink className="h-3.5 w-3.5" /> View on GitHub
        </a>
      )}
    </article>
  )
}

function NoticeCard({ icon: Icon, title, body }: { icon: typeof BellRing; title: string; body: string }) {
  return (
    <section className="dash-panel dash-grain dash-interactive dash-rise p-8 text-center">
      <span className="mx-auto inline-grid h-12 w-12 place-items-center rounded-2xl border bg-[var(--dash-soft)]" style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}>
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">
        <span className="dash-metallic-text">{title}</span>
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--dash-muted)]">{body}</p>
    </section>
  )
}

function SkeletonCard() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="dash-panel dash-grain h-[120px] animate-pulse rounded-2xl p-4" style={{ animationDelay: `${i * 0.05}s` }}>
          <div className="h-9 w-9 rounded-xl" style={{ background: 'var(--dash-soft)' }} />
          <div className="mt-3 h-3 w-2/3 rounded" style={{ background: 'var(--dash-soft)' }} />
          <div className="mt-2 h-3 w-full rounded" style={{ background: 'var(--dash-soft)' }} />
        </div>
      ))}
    </div>
  )
}
