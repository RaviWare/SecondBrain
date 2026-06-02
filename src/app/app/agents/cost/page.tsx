'use client'

// ── Cost & Budget — token economics for the squad (Req 10.1, 10.2, 10.3, 10.9, 10.10, 11.7) ──
// A READ-ONLY surface. Four sections, top to bottom:
//   1. Plan allowance vs consumed (Req 10.3) — the period budget summary + bar.
//   2. Usage by Agent  (Req 10.2) — real attribution from Run_Traces, desc.
//   3. Usage by Skill  (Req 10.2) — same, by Skill; the unattributed bucket labelled.
//   4. Live Run_Trace  (Req 10.1, 10.9, 10.10, 10.11) — recent runs: skills invoked,
//      tokens consumed, and a per-Run Budget bar coloured ok / amber / over.
//
// All data is REAL, fetched from `/api/agents/cost` on mount (mirrors the Squad
// page's fetch / loading / error / empty handling). Honest zeros and empty states
// — never fabricated numbers (Property 18). When there is nothing at all (total 0
// and no runs) the whole surface is a warm empty state.
//
// Budget-bar colour is bound to the pure `budgetBarState(used, cap)` from
// `@/lib/agents/budget` (NOT reimplemented): ok < 80%, amber [80%,100%), over ≥ cap.
// A cap of 0 means NO cap configured = unlimited — we never render a fake cap.
//
// Glass recipe is mandatory (Req 11.7, glass-theme.md):
//   • shell  = `sb-dashboard` (paints the aurora + grid backdrop)
//   • panels = `dash-panel dash-grain dash-interactive` (the summary hero adds
//              `dash-spotlight` + a `dash-spotlight-glow` child + useSpotlight)
//   • inset wells (rows/tiles) = `--dash-card-solid` bg + `--dash-border`
//   • tokens = `--dash-*` only; heading uses `.dash-metallic-text`

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Boxes,
  Coins,
  Gauge,
  Loader2,
  Package,
  RotateCcw,
  Users,
  Wallet,
} from 'lucide-react'
import { budgetBarState, type BudgetBarState } from '@/lib/agents/budget'
import { useSpotlight } from '@/lib/use-spotlight'

// Bucket-key constants mirrored from `@/lib/agents/token-attribution` (which can't
// be imported into this `'use client'` module — it pulls in the Mongoose models via
// `connectDB`). The API route imports the real constants from the lib; these literals
// MUST stay in lock-step with `UNATTRIBUTED_SKILL` / `UNKNOWN_AGENT` there.
const UNATTRIBUTED_SKILL = '__unattributed__'
const UNKNOWN_AGENT = '__unknown_agent__'

// ── Payload types (mirror `/api/agents/cost` GET) ─────────────────────────────

interface AgentUsageRow {
  agentId: string
  name: string
  role: string
  tokens: number
}

interface SkillUsageRow {
  skillId: string
  tokens: number
}

interface TraceStepView {
  skillId: string | null
  step: string
  tokens: number
}

interface RunView {
  runId: string
  agentId: string
  agentName: string
  status: string
  startedAt: string | null
  finishedAt: string | null
  tokensUsed: number
  perRunBudget: number
  trace: TraceStepView[]
}

interface CostPayload {
  total: number
  allowance: { allowance: number; consumed: number; remaining: number }
  byAgent: AgentUsageRow[]
  bySkill: SkillUsageRow[]
  runs: RunView[]
}

type LoadState = 'loading' | 'error' | 'ready'

// ── Budget-bar colour language (ok / amber / over) ────────────────────────────
// Visually distinct treatments per `budgetBarState`. ok leans on the warm accent,
// amber is a gold warning tone, over is a red danger tone. All three are rendered
// with explicit colours so they never collapse into one another.
const BAR_FILL: Record<BudgetBarState, string> = {
  ok: 'linear-gradient(90deg, var(--dash-accent), var(--dash-accent-2))',
  amber: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
  over: 'linear-gradient(90deg, #e11d48, #f43f5e)',
}

const BAR_TEXT: Record<BudgetBarState, string> = {
  ok: 'var(--dash-accent)',
  amber: '#f59e0b',
  over: '#f43f5e',
}

const BAR_LABEL: Record<BudgetBarState, string> = {
  ok: 'On budget',
  amber: 'Approaching cap',
  over: 'Over budget',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CostBudgetPage() {
  const [state, setState] = useState<LoadState>('loading')
  const [data, setData] = useState<CostPayload | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setState('loading')
    try {
      const res = await fetch('/api/agents/cost', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error || 'Could not load your cost data.')
        setState('error')
        return
      }
      setData(body as CostPayload)
      setState('ready')
    } catch {
      setError('Network error. Please try again.')
      setState('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const isEmpty = data && data.total === 0 && data.runs.length === 0

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-[1640px] p-4 sm:p-5 lg:p-6 2xl:p-7">
        <Header />
        {state === 'loading' && <LoadingView />}
        {state === 'error' && <ErrorView message={error} onRetry={load} />}
        {state === 'ready' && data && (isEmpty ? <EmptyState /> : <CostView data={data} />)}
      </div>
    </main>
  )
}

function Header() {
  return (
    <header className="dash-rise mb-4 2xl:mb-5" style={{ animationDelay: '0s' }}>
      <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
        Cost &amp; Budget · Token economics
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        <span className="dash-metallic-text">Cost &amp; Budget</span>
      </h1>
      <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
        Where your tokens go — live Run traces, usage by agent and skill, and your plan
        allowance for this period. Every number is real attribution from your squad&apos;s runs.
      </p>
    </header>
  )
}

// ── Ready view ────────────────────────────────────────────────────────────────

function CostView({ data }: { data: CostPayload }) {
  return (
    <div className="space-y-4 2xl:space-y-5">
      <AllowancePanel allowance={data.allowance} total={data.total} />
      <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-2 2xl:gap-5">
        <AgentUsagePanel rows={data.byAgent} total={data.total} />
        <SkillUsagePanel rows={data.bySkill} total={data.total} />
      </div>
      <RunTracePanel runs={data.runs} />
    </div>
  )
}

// ── 1. Plan allowance vs consumed (Req 10.3) ──────────────────────────────────

function AllowancePanel({
  allowance,
  total,
}: {
  allowance: { allowance: number; consumed: number; remaining: number }
  total: number
}) {
  const spotlight = useSpotlight<HTMLElement>()
  const hasCap = allowance.allowance > 0 && Number.isFinite(allowance.allowance)
  // Colour the bar via the shared pure helper. With no cap configured the helper
  // returns 'ok' (an unlimited allowance is never over) — we still show it calmly.
  const barState = budgetBarState(allowance.consumed, hasCap ? allowance.allowance : 0)
  const pct = hasCap ? Math.min(100, (allowance.consumed / allowance.allowance) * 100) : 0
  const remainingFinite = Number.isFinite(allowance.remaining)

  return (
    <section
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      className="dash-panel dash-grain dash-spotlight dash-interactive dash-rise p-5 sm:p-6"
      style={{ animationDelay: '0.05s' }}
    >
      <span className="dash-spotlight-glow" aria-hidden />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl border bg-[var(--dash-soft)]"
            style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}
          >
            <Wallet className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-[var(--dash-text-strong)]">
              Plan allowance
            </h2>
            <p className="text-[11px] text-[var(--dash-subtle)]">Consumed this period</p>
          </div>
        </div>
        {hasCap && (
          <span
            className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
            style={{ color: BAR_TEXT[barState], borderColor: 'var(--dash-border-glow)', background: 'var(--dash-accent-soft)' }}
          >
            {BAR_LABEL[barState]}
          </span>
        )}
      </div>

      {/* The big number: consumed of allowance (or unlimited). */}
      <div className="mt-5 flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className="text-3xl font-semibold leading-none tracking-tight text-[var(--dash-text-strong)] [font-variant-numeric:tabular-nums]">
          {allowance.consumed.toLocaleString()}
        </span>
        <span className="pb-0.5 text-[13px] text-[var(--dash-muted)]">
          {hasCap ? (
            <>of {allowance.allowance.toLocaleString()} tokens</>
          ) : (
            <>tokens · No cap set · Unlimited</>
          )}
        </span>
      </div>

      {/* Progress bar — only meaningful with a finite cap. */}
      {hasCap ? (
        <div className="mt-4">
          <div
            className="h-2.5 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${pct}%`, background: BAR_FILL[barState] }}
            />
          </div>
          <p className="mt-2 text-[11px] text-[var(--dash-subtle)]">
            {pct.toFixed(pct < 10 ? 1 : 0)}% used
          </p>
        </div>
      ) : (
        <div
          className="mt-4 rounded-xl px-4 py-3 text-[12px] text-[var(--dash-muted)]"
          style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
        >
          No monthly cap is configured, so runs are unconstrained at the plan level. Per-run and
          per-agent budgets still apply.
        </div>
      )}

      {/* Supporting tiles: total consumed + remaining headroom (when finite). */}
      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <MiniTile
          icon={Coins}
          label="Total consumed"
          value={`${total.toLocaleString()} tokens`}
          hint="Across every run this period"
        />
        <MiniTile
          icon={Gauge}
          label="Remaining"
          value={remainingFinite ? `${allowance.remaining.toLocaleString()} tokens` : 'Unlimited'}
          hint={remainingFinite ? 'Headroom left this period' : 'No cap configured'}
        />
      </div>
    </section>
  )
}

function MiniTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Coins
  label: string
  value: string
  hint: string
}) {
  return (
    <div
      className="rounded-xl p-3.5"
      style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-[var(--dash-subtle)]" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--dash-subtle)]">
          {label}
        </span>
      </div>
      <p className="mt-1.5 text-lg font-semibold leading-none tracking-tight text-[var(--dash-text-strong)] [font-variant-numeric:tabular-nums]">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-[var(--dash-subtle)]">{hint}</p>
    </div>
  )
}

// ── 2. Usage by Agent (Req 10.2) ──────────────────────────────────────────────

function AgentUsagePanel({ rows, total }: { rows: AgentUsageRow[]; total: number }) {
  return (
    <section className="dash-panel dash-grain dash-interactive dash-rise p-5" style={{ animationDelay: '0.12s' }}>
      <PanelHeader icon={Users} title="Usage by agent" subtitle="Real attribution from run traces" />
      {rows.length === 0 ? (
        <EmptyRow message="No agent usage yet." />
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <UsageRow
              key={row.agentId}
              title={row.name}
              meta={formatRole(row.role)}
              tokens={row.tokens}
              total={total}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

// ── 3. Usage by Skill (Req 10.2) ──────────────────────────────────────────────

function SkillUsagePanel({ rows, total }: { rows: SkillUsageRow[]; total: number }) {
  return (
    <section className="dash-panel dash-grain dash-interactive dash-rise p-5" style={{ animationDelay: '0.18s' }}>
      <PanelHeader icon={Boxes} title="Usage by skill" subtitle="Tokens attributed per skill" />
      {rows.length === 0 ? (
        <EmptyRow message="No skill usage yet." />
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <UsageRow
              key={row.skillId}
              title={skillLabel(row.skillId)}
              meta={row.skillId === UNATTRIBUTED_SKILL ? 'Framework overhead' : 'Skill'}
              tokens={row.tokens}
              total={total}
              muted={row.skillId === UNATTRIBUTED_SKILL}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

// A usage row: an inset well with a title, meta line, token count + share bar.
function UsageRow({
  title,
  meta,
  tokens,
  total,
  muted = false,
}: {
  title: string
  meta: string
  tokens: number
  total: number
  muted?: boolean
}) {
  const share = total > 0 ? Math.min(100, (tokens / total) * 100) : 0
  return (
    <li
      className="rounded-xl px-3.5 py-3"
      style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--dash-text-strong)]">{title}</p>
          <p className="mt-0.5 text-[11px] text-[var(--dash-subtle)]">{meta}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-semibold tabular-nums text-[var(--dash-text)] [font-variant-numeric:tabular-nums]">
            {tokens.toLocaleString()}
          </p>
          <p className="text-[10px] text-[var(--dash-subtle)]">{share.toFixed(share < 10 ? 1 : 0)}%</p>
        </div>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--dash-soft)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${share}%`,
            background: muted
              ? 'var(--dash-border-bright)'
              : 'linear-gradient(90deg, var(--dash-accent), var(--dash-accent-2))',
          }}
        />
      </div>
    </li>
  )
}

// ── 4. Live Run_Trace (Req 10.1, 10.9, 10.10, 10.11) ──────────────────────────

function RunTracePanel({ runs }: { runs: RunView[] }) {
  return (
    <section className="dash-panel dash-grain dash-interactive dash-rise p-5" style={{ animationDelay: '0.24s' }}>
      <PanelHeader icon={Package} title="Run traces" subtitle="Recent runs · skills invoked, tokens, and per-run budget" />
      {runs.length === 0 ? (
        <EmptyRow message="No runs recorded yet." />
      ) : (
        <ul className="mt-4 space-y-3">
          {runs.map((run) => (
            <RunTraceCard key={run.runId} run={run} />
          ))}
        </ul>
      )}
    </section>
  )
}

function RunTraceCard({ run }: { run: RunView }) {
  const hasBudget = run.perRunBudget > 0 && Number.isFinite(run.perRunBudget)
  // Per-Run Budget bar colour via the shared pure helper (Req 10.9 / 10.10).
  const barState = budgetBarState(run.tokensUsed, hasBudget ? run.perRunBudget : 0)
  const pct = hasBudget ? Math.min(100, (run.tokensUsed / run.perRunBudget) * 100) : 0

  return (
    <li
      className="rounded-xl p-3.5"
      style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
    >
      {/* Run header — agent, status, started time, tokens. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--dash-text-strong)]">
            {run.agentName}
          </p>
          <StatusChip status={run.status} />
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--dash-subtle)]">
          {run.startedAt && <time dateTime={run.startedAt}>{timeAgo(run.startedAt)}</time>}
          <span className="font-semibold text-[var(--dash-text)] [font-variant-numeric:tabular-nums]">
            {run.tokensUsed.toLocaleString()} tok
          </span>
        </div>
      </div>

      {/* Per-Run Budget bar (ok / amber / over). */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-medium uppercase tracking-wider" style={{ color: BAR_TEXT[barState] }}>
            {BAR_LABEL[barState]}
          </span>
          <span className="text-[var(--dash-subtle)] [font-variant-numeric:tabular-nums]">
            {hasBudget
              ? `${run.tokensUsed.toLocaleString()} / ${run.perRunBudget.toLocaleString()}`
              : `${run.tokensUsed.toLocaleString()} · no per-run cap`}
          </span>
        </div>
        <div
          className="mt-1.5 h-2 w-full overflow-hidden rounded-full"
          style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${hasBudget ? pct : Math.min(100, run.tokensUsed > 0 ? 100 : 0)}%`, background: BAR_FILL[barState] }}
          />
        </div>
      </div>

      {/* Trace steps — skills invoked + tokens consumed (Req 10.1). */}
      {run.trace.length > 0 && (
        <ul className="mt-3 space-y-1">
          {run.trace.map((step, i) => (
            <li
              key={`${run.runId}-step-${i}`}
              className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5"
              style={{ background: 'var(--dash-soft)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-medium text-[var(--dash-text)] truncate">{step.step}</span>
                <span className="shrink-0 rounded-md border border-[var(--dash-border)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--dash-subtle)]">
                  {step.skillId ?? 'framework'}
                </span>
              </div>
              <span className="shrink-0 text-[11px] text-[var(--dash-subtle)] [font-variant-numeric:tabular-nums]">
                {step.tokens.toLocaleString()} tok
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function PanelHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Users
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-soft)] text-[var(--dash-muted)]">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-[var(--dash-text-strong)]">{title}</h2>
        <p className="text-[11px] text-[var(--dash-subtle)]">{subtitle}</p>
      </div>
    </div>
  )
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div
      className="mt-4 rounded-xl border border-dashed px-4 py-8 text-center"
      style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }}
    >
      <p className="text-[12px] text-[var(--dash-subtle)]">{message}</p>
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const color = statusColor(status)
  return (
    <span
      className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
      style={{ color, background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
    >
      {status}
    </span>
  )
}

function statusColor(status: string): string {
  if (status === 'completed') return '#34d399' // emerald
  if (status === 'running') return 'var(--dash-accent)'
  if (status === 'failed' || status === 'timeout') return '#f43f5e' // rose
  if (status === 'budget-stopped') return '#f59e0b' // amber
  return 'var(--dash-subtle)'
}

function formatRole(role: string): string {
  if (!role || role === 'unknown') return 'Unknown role'
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function skillLabel(skillId: string): string {
  if (skillId === UNATTRIBUTED_SKILL) return 'Framework / unattributed'
  if (skillId === UNKNOWN_AGENT) return 'Unknown agent'
  return skillId
}

// ── First-run / empty state ───────────────────────────────────────────────────

function EmptyState() {
  const spotlight = useSpotlight<HTMLElement>()
  return (
    <div className="mx-auto max-w-2xl py-8 sm:py-12">
      <section
        ref={spotlight.ref}
        onMouseMove={spotlight.onMouseMove}
        className="dash-panel dash-grain dash-spotlight dash-interactive dash-rise relative overflow-hidden p-6 text-center sm:p-8"
      >
        <span className="dash-spotlight-glow" aria-hidden />
        <span
          className="inline-grid h-12 w-12 place-items-center rounded-2xl border bg-[var(--dash-soft)]"
          style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}
        >
          <Wallet className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">
          <span className="dash-metallic-text">No agent runs yet</span>
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--dash-muted)]">
          Cost data appears once your squad starts working. You&apos;ll see live run traces, token
          usage by agent and skill, and your plan allowance for the period right here.
        </p>
        <Link
          href="/app/agents"
          className="dash-accent-grad mt-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5"
        >
          <Users className="h-4 w-4" />
          Go to your squad
        </Link>
      </section>
    </div>
  )
}

// ── Loading / error views (mirror the Squad page) ─────────────────────────────

function LoadingView() {
  return (
    <div className="space-y-4">
      <div className="dash-panel h-48 animate-pulse" />
      <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-2">
        <div className="dash-panel h-64 animate-pulse" />
        <div className="dash-panel h-64 animate-pulse" />
      </div>
      <div className="dash-panel h-72 animate-pulse" />
    </div>
  )
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16">
      <section className="dash-panel dash-grain dash-interactive p-6 text-center">
        <AlertCircle className="mx-auto h-6 w-6" style={{ color: 'var(--dash-accent)' }} />
        <p className="mono mt-3 text-[10px] uppercase tracking-widest" style={{ color: 'var(--dash-accent)' }}>
          Could not load cost data
        </p>
        <p className="mt-2 text-[13px] text-[var(--dash-muted)]">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="dash-accent-grad mt-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5"
        >
          <RotateCcw className="h-4 w-4" />
          Try again
        </button>
      </section>
    </div>
  )
}

// ── Relative time (same as the Squad page) ────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const s = Math.round(ms / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.round(d / 7)
  return `${w}w ago`
}
