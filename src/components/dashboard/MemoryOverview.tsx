'use client'

import Link from 'next/link'
import { ArrowUpRight, CheckCircle2, FileText, type LucideIcon, MessageCircleQuestion, Network, Plus, Sparkles, Upload } from 'lucide-react'
import { useDashboardData, useMemoryOverview } from '@/components/dashboard/DashboardData'

export function MemoryOverview() {
  const { loading } = useDashboardData()
  const { mostUsedSources, topTopics, recentDecisions, aiAnswers } = useMemoryOverview()
  const maxTopic = Math.max(1, ...topTopics.map(t => t.value))

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--dash-text-strong)] 2xl:text-[15px]">Your memory at a glance</h2>
        <Link
          href="/app/log"
          className="dash-inset inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--dash-accent)] transition hover:-translate-y-0.5"
        >
          This week
        </Link>
      </div>

      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4 2xl:gap-3">
        <OverviewCard
          title="Most used sources"
          action="View all"
          href="/app/wiki?view=sources"
          loading={loading}
          empty={mostUsedSources.length === 0}
          emptyText="Add your first source to start building memory."
          emptyCta="Add a source"
          emptyHref="/app/ingest"
          emptyIcon={Upload}
        >
          {mostUsedSources.map(s => (
            <ListRow key={s.href} icon={FileText} label={s.label} value={s.value} tone="blue" href={s.href} />
          ))}
        </OverviewCard>

        <OverviewCard
          title="Top topics"
          action="View all"
          href="/app/wiki?type=concept"
          loading={loading}
          empty={topTopics.length === 0}
          emptyText="Topics emerge automatically as you add sources."
          emptyCta="Add a source"
          emptyHref="/app/ingest"
          emptyIcon={Network}
        >
          {topTopics.map(t => (
            <TopicRow key={t.href} label={t.label} value={t.value} max={maxTopic} href={t.href} />
          ))}
        </OverviewCard>

        <OverviewCard
          title="Recent decisions"
          action="View all"
          href="/app/wiki?type=synthesis"
          loading={loading}
          empty={recentDecisions.length === 0}
          emptyText="Decisions you capture and synthesize will appear here."
          emptyCta="Add a note"
          emptyHref="/app/ingest?type=note"
          emptyIcon={Plus}
        >
          {recentDecisions.map(d => (
            <ListRow key={d.href} icon={CheckCircle2} label={d.label} value={d.value} tone="green" href={d.href} />
          ))}
        </OverviewCard>

        <OverviewCard
          title="AI answers"
          action="View all"
          href="/app/query"
          loading={loading}
          empty={aiAnswers.length === 0}
          emptyText="Ask your memory a question to get a cited answer."
          emptyCta="Ask a question"
          emptyHref="/app/query"
          emptyIcon={MessageCircleQuestion}
        >
          {aiAnswers.map((a, i) => (
            <ListRow key={i} icon={Sparkles} label={a.label} value={a.value} tone="orange" href={a.href} />
          ))}
        </OverviewCard>
      </div>
    </section>
  )
}

function OverviewCard({
  title,
  action,
  href,
  loading,
  empty,
  emptyText,
  emptyCta,
  emptyHref,
  emptyIcon: EmptyIcon,
  children,
}: {
  title: string
  action: string
  href: string
  loading: boolean
  empty: boolean
  emptyText: string
  emptyCta?: string
  emptyHref?: string
  emptyIcon?: LucideIcon
  children: React.ReactNode
}) {
  return (
    <article className="dash-panel dash-grain dash-interactive p-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-[var(--dash-text-strong)]">{title}</h3>
        <Link href={href} className="group inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--dash-accent)] transition hover:opacity-80">
          {action}
          <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>
      <div className="space-y-2.5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-[var(--dash-soft)]" />
              <span className="h-3 flex-1 animate-pulse rounded bg-[var(--dash-soft)]" />
            </div>
          ))
        ) : empty ? (
          <div className="flex flex-col items-center gap-2.5 py-3 text-center">
            {EmptyIcon && (
              <span
                className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--dash-border)] bg-[var(--dash-soft)] text-[var(--dash-subtle)]"
                aria-hidden
              >
                <EmptyIcon className="h-4 w-4" />
              </span>
            )}
            <p className="text-[11px] leading-snug text-[var(--dash-subtle)]">{emptyText}</p>
            {emptyCta && emptyHref && (
              <Link
                href={emptyHref}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition hover:-translate-y-0.5"
                style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-accent)' }}
              >
                {emptyCta}
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        ) : (
          children
        )}
      </div>
    </article>
  )
}

function ListRow({
  icon: Icon,
  label,
  value,
  tone,
  href,
}: {
  icon: typeof FileText
  label: string
  value: string
  tone: 'blue' | 'green' | 'orange'
  href: string
}) {
  const color =
    tone === 'green'
      ? 'text-emerald-500 dark:text-emerald-400'
      : tone === 'blue'
        ? 'text-sky-500 dark:text-sky-400'
        : 'text-orange-500 dark:text-orange-400'

  return (
    <Link href={href} className="group flex items-center gap-2.5">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-soft)] ${color}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--dash-text)] transition-colors group-hover:text-[var(--dash-accent)]">{label}</span>
      <span className="shrink-0 text-xs font-medium text-[var(--dash-muted)]">{value}</span>
    </Link>
  )
}

function TopicRow({ label, value, max, href }: { label: string; value: number; max: number; href: string }) {
  return (
    <Link href={href} className="group block">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="truncate text-xs text-[var(--dash-text)] transition-colors group-hover:text-[var(--dash-accent)]">{label}</span>
        <span className="text-xs font-medium text-[var(--dash-muted)] [font-variant-numeric:tabular-nums]">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--dash-soft)]">
        <div
          className="dash-accent-grad h-full rounded-full shadow-[0_0_10px_-2px_var(--dash-accent)]"
          style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        />
      </div>
    </Link>
  )
}
