'use client'

// ── Admin → Messaging setup ───────────────────────────────────────────────────
// One-click Telegram webhook registration + a readiness checklist, so an admin
// never needs curl. Clerk + admin-allow-list gated (the API enforces it too).
// Glass recipe throughout.

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2, RefreshCw, Send, ShieldAlert, X } from 'lucide-react'

type Status = {
  checklist: { hasToken: boolean; hasUsername: boolean; hasSecret: boolean }
  botUsername: string | null
  expectedUrl: string
  webhook: { registered: boolean; url: string; pending: number; matches: boolean } | null
  ready: boolean
}

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden'

export default function AdminMessagingPage() {
  const [state, setState] = useState<LoadState>('loading')
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/messaging/setup', { cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { setState('forbidden'); return }
      if (!r.ok) { setState('error'); return }
      setStatus(await r.json())
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

  async function register() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/messaging/setup', { method: 'POST' })
      const d = await r.json()
      setMsg(r.ok ? `Webhook registered at ${d.webhookUrl}` : d.error || 'Setup failed')
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6 lg:p-7">
        <header className="dash-rise">
          <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
            Admin · Messaging setup
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Send className="h-6 w-6 text-[var(--dash-accent)]" />
            <span className="dash-metallic-text">Telegram</span>
          </h1>
          <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
            Connect the platform bot so every user can link their Telegram and get squad alerts. One-time setup.
          </p>
        </header>

        {state === 'loading' && <Card><p className="text-[13px] text-[var(--dash-muted)]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Checking configuration…</p></Card>}
        {state === 'error' && <Notice icon={ShieldAlert} title="Could not load setup" body="Try again shortly." />}
        {state === 'forbidden' && <Notice icon={ShieldAlert} title="Admin access required" body="Add your account to ADMIN_USER_IDS to manage messaging setup." />}

        {state === 'ready' && status && (
          <>
            {/* Checklist */}
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-[var(--dash-text-strong)]">Configuration</h2>
              <ul className="space-y-2">
                <CheckRow ok={status.checklist.hasToken} label="TELEGRAM_BOT_TOKEN set" hint="From @BotFather → /newbot" />
                <CheckRow ok={status.checklist.hasUsername} label="TELEGRAM_BOT_USERNAME set" hint={status.botUsername ? `@${status.botUsername}` : 'The bot @username (no @)'} />
                <CheckRow ok={status.checklist.hasSecret} label="TELEGRAM_WEBHOOK_SECRET set" hint="Random string, 8+ chars" />
              </ul>
              {!status.ready && (
                <p className="mt-3 flex items-start gap-1.5 rounded-lg p-2.5 text-[11px]" style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.30)', color: '#fbbf24' }}>
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Set the missing environment variables in Coolify and redeploy, then refresh this page.
                </p>
              )}
            </Card>

            {/* Webhook status + action */}
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--dash-text-strong)]">Webhook</h2>
                <button onClick={load} className="inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] text-[var(--dash-muted)]" style={{ borderColor: 'var(--dash-border)' }}>
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              </div>

              {status.webhook?.registered ? (
                <div className="rounded-lg p-3" style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}>
                  <p className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: status.webhook.matches ? '#34d399' : '#fbbf24' }}>
                    {status.webhook.matches ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {status.webhook.matches ? 'Registered & pointing here' : 'Registered, but to a different URL'}
                  </p>
                  <code className="mono mt-1 block break-all text-[10px] text-[var(--dash-subtle)]">{status.webhook.url}</code>
                  {status.webhook.pending > 0 && (
                    <p className="mt-1 text-[10px] text-[var(--dash-subtle)]">{status.webhook.pending} pending update(s)</p>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-[var(--dash-muted)]">No webhook registered yet. Click below to connect Telegram to this deployment.</p>
              )}

              <button
                onClick={register}
                disabled={busy || !status.ready}
                className="dash-accent-grad mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {status.webhook?.registered ? 'Re-register webhook' : 'Register webhook'}
              </button>
              <p className="mt-2 text-[10px] text-[var(--dash-subtle)]">Target: {status.expectedUrl}</p>

              {msg && <p className="mt-2 text-[11px] text-[var(--dash-text)]">{msg}</p>}
            </Card>

            <Card>
              <h2 className="mb-2 text-sm font-semibold text-[var(--dash-text-strong)]">How users connect</h2>
              <ol className="space-y-1.5 text-[12px] text-[var(--dash-muted)]">
                <li>1. Once the webhook is registered, users open <strong>Integrations → Telegram → Connect</strong>.</li>
                <li>2. They tap the deep link (or send the code) to the bot.</li>
                <li>3. Their chat is linked; the squad DMs them when something needs a decision.</li>
              </ol>
            </Card>
          </>
        )}
      </div>
    </main>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="dash-panel dash-grain dash-interactive dash-rise p-5">{children}</section>
}

function CheckRow({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full" style={{ background: ok ? 'rgba(52,211,153,0.15)' : 'rgba(240,116,107,0.12)' }}>
        {ok ? <Check className="h-3 w-3" style={{ color: '#34d399' }} /> : <X className="h-3 w-3" style={{ color: '#f0746b' }} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-medium text-[var(--dash-text)]">{label}</span>
        <span className="block text-[10px] text-[var(--dash-subtle)]">{hint}</span>
      </span>
    </li>
  )
}

function Notice({ icon: Icon, title, body }: { icon: typeof ShieldAlert; title: string; body: string }) {
  return (
    <section className="dash-panel dash-grain dash-interactive dash-rise p-8 text-center">
      <span className="mx-auto inline-grid h-12 w-12 place-items-center rounded-2xl border bg-[var(--dash-soft)]" style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}>
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight"><span className="dash-metallic-text">{title}</span></h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--dash-muted)]">{body}</p>
    </section>
  )
}
