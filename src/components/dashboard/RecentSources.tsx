import Link from 'next/link'
import { recentSources } from '@/lib/dashboard-data'

const toneClass = {
  red: 'bg-rose-100 text-rose-600',
  green: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  blue: 'bg-blue-100 text-blue-600',
  sky: 'bg-sky-100 text-sky-600',
}

export function RecentSources() {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--dash-text)]">Recent sources</h2>
        <Link href="/app/wiki?view=sources" className="text-sm text-[var(--dash-accent-2)] transition hover:opacity-80">
          View all
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {recentSources.map(({ title, meta, time, icon: Icon, tone, href }) => (
          <Link
            key={title}
            href={href}
            className="group rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-4 text-left shadow-[var(--dash-shadow-sm)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--dash-shadow-md)]"
          >
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${toneClass[tone]}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--dash-text)]">{title}</h3>
                <p className="mt-2 text-xs text-[var(--dash-muted)]">{meta}</p>
                <p className="mt-3 text-xs text-[var(--dash-subtle)]">{time}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
