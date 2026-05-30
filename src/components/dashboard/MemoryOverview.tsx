import Link from 'next/link'
import { CheckCircle2, FileText, Sparkles } from 'lucide-react'
import { aiAnswers, mostUsedSources, recentDecisions, topTopics } from '@/lib/dashboard-data'

export function MemoryOverview() {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--dash-text)]">Your memory at a glance</h2>
        <Link href="/app/log" className="text-sm text-[var(--dash-accent-2)] transition hover:opacity-80">
          This week
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard title="Most used sources" action="View all sources" href="/app/wiki?view=sources">
          {mostUsedSources.map(([label, value]) => (
            <ListRow key={label} icon={FileText} label={label} value={value} tone="blue" />
          ))}
        </OverviewCard>

        <OverviewCard title="Top topics" action="View all topics" href="/app/wiki?type=concept">
          {topTopics.map(([label, value]) => (
            <TopicRow key={label} label={label} value={value} />
          ))}
        </OverviewCard>

        <OverviewCard title="Recent decisions" action="View decisions" href="/app/wiki?type=synthesis">
          {recentDecisions.map(([label, value]) => (
            <ListRow key={label} icon={CheckCircle2} label={label} value={value} tone="green" />
          ))}
        </OverviewCard>

        <OverviewCard title="AI answers" action="View answers" href="/app/query?view=answers">
          {aiAnswers.map(([label, value]) => (
            <ListRow key={label} icon={Sparkles} label={label} value={value} tone="orange" />
          ))}
        </OverviewCard>
      </div>
    </section>
  )
}

function OverviewCard({ title, action, href, children }: { title: string; action: string; href: string; children: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-4 shadow-[var(--dash-shadow-sm)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
        <Link href={href} className="text-xs font-medium text-[var(--dash-accent-2)] transition hover:opacity-80">
          {action}
        </Link>
      </div>
      <div className="space-y-3">{children}</div>
    </article>
  )
}

function ListRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof FileText
  label: string
  value: string
  tone: 'blue' | 'green' | 'orange'
}) {
  const color = tone === 'green' ? 'text-emerald-500' : tone === 'blue' ? 'text-blue-500' : 'text-orange-500'

  return (
    <div className="flex items-center gap-2.5">
      <Icon className={`h-4 w-4 shrink-0 ${color}`} />
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--dash-text)]">{label}</span>
      <span className="shrink-0 text-xs text-[var(--dash-muted)]">{value}</span>
    </div>
  )
}

function TopicRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="truncate text-xs text-[var(--dash-text)]">{label}</span>
        <span className="text-xs text-[var(--dash-muted)]">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--dash-accent-2)_12%,transparent)]">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--dash-accent-2),var(--dash-accent))]" style={{ width: `${Math.min(100, (value / 30) * 100)}%` }} />
      </div>
    </div>
  )
}
