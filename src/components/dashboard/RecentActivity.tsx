'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { useDashboardData, useRecentActivity } from '@/components/dashboard/DashboardData'

const dotClass = {
  green: 'bg-emerald-400',
  blue: 'bg-sky-400',
  amber: 'bg-amber-400',
  orange: 'bg-orange-400',
  red: 'bg-rose-500',
}

const iconClass = {
  green: 'text-emerald-500 dark:text-emerald-400',
  blue: 'text-sky-500 dark:text-sky-400',
  amber: 'text-amber-500 dark:text-amber-400',
  orange: 'text-orange-500 dark:text-orange-400',
  red: 'text-rose-500 dark:text-rose-400',
}

export function RecentActivity() {
  const { loading } = useDashboardData()
  const activity = useRecentActivity()

  return (
    <section className="dash-panel dash-grain p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--dash-text-strong)] 2xl:text-[15px]">Recent activity</h2>
        <Link href="/app/log" className="group inline-flex items-center gap-0.5 text-[13px] font-medium text-[var(--dash-accent)] transition hover:opacity-80">
          View all
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-[var(--dash-soft)]" />
              <div className="flex-1 space-y-2 pt-0.5">
                <span className="block h-3 w-3/4 animate-pulse rounded bg-[var(--dash-soft)]" />
                <span className="block h-2.5 w-1/3 animate-pulse rounded bg-[var(--dash-soft)]" />
              </div>
            </div>
          ))}
        </div>
      ) : activity.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-[var(--dash-subtle)]">
          Activity will appear here as you ingest and query.
        </p>
      ) : (
        <div className="relative space-y-0.5">
          {/* timeline rail */}
          <span className="pointer-events-none absolute bottom-4 left-[19px] top-4 w-px bg-[var(--dash-border)]" aria-hidden />

          {activity.map(({ title, meta, icon: Icon, tone, href }, i) => (
            <Link
              key={`${href}-${i}`}
              href={href}
              className="group relative -mx-1.5 flex items-start gap-2.5 rounded-xl p-1.5 transition hover:bg-[var(--dash-soft)]"
            >
              <span className={`relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-card-strong)] backdrop-blur ${iconClass[tone]}`}>
                <Icon className="h-[15px] w-[15px]" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="truncate text-[13px] font-medium text-[var(--dash-text)] transition-colors group-hover:text-[var(--dash-text-strong)]">{title}</p>
                <p className="mt-0.5 text-[11px] text-[var(--dash-muted)]">{meta}</p>
              </div>
              <span className={`mt-2.5 h-2 w-2 shrink-0 rounded-full ${dotClass[tone]} ${i === 0 ? 'dash-live-dot' : ''}`} />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
