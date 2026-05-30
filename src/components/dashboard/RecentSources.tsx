'use client'

import Link from 'next/link'
import { ArrowUpRight, Plus } from 'lucide-react'
import { useDashboardData, useRecentSources } from '@/components/dashboard/DashboardData'

const toneClass = {
  red: 'text-rose-500 dark:text-rose-400',
  green: 'text-emerald-500 dark:text-emerald-400',
  amber: 'text-amber-500 dark:text-amber-400',
  blue: 'text-sky-500 dark:text-sky-400',
  sky: 'text-sky-500 dark:text-sky-400',
}

export function RecentSources() {
  const { loading } = useDashboardData()
  const sources = useRecentSources()

  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--dash-text-strong)] 2xl:text-[15px]">Recent sources</h2>
        <Link href="/app/wiki?view=sources" className="group inline-flex items-center gap-0.5 text-[13px] font-medium text-[var(--dash-accent)] transition hover:opacity-80">
          View all
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 2xl:gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="dash-panel p-3.5">
              <div className="flex items-start gap-2.5">
                <span className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-[var(--dash-soft)]" />
                <div className="min-w-0 flex-1 space-y-2">
                  <span className="block h-3 w-full animate-pulse rounded bg-[var(--dash-soft)]" />
                  <span className="block h-2.5 w-1/2 animate-pulse rounded bg-[var(--dash-soft)]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : sources.length === 0 ? (
        <Link
          href="/app/ingest"
          className="dash-panel dash-interactive flex items-center justify-center gap-2 p-6 text-[13px] font-medium text-[var(--dash-muted)] hover:text-[var(--dash-accent)]"
        >
          <Plus className="h-4 w-4" />
          Ingest your first source to populate this
        </Link>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 2xl:gap-3">
          {sources.map(({ title, meta, time, icon: Icon, tone, href }) => (
            <Link key={href} href={href} className="dash-panel dash-grain dash-interactive group relative p-3.5 text-left">
              {/* hover sheen sweep */}
              <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                <span className="absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.18),transparent)] [animation:dash-sweep_1.1s_ease]" />
              </span>

              <div className="relative flex items-start gap-2.5">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-soft)] backdrop-blur ${toneClass[tone]}`}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <h3 className="line-clamp-2 text-[13px] font-semibold leading-[1.3] text-[var(--dash-text-strong)]">{title}</h3>
                  <p className="mt-1.5 text-[11px] text-[var(--dash-muted)]">{meta}</p>
                  <p className="mt-2 text-[11px] text-[var(--dash-subtle)]">{time}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
