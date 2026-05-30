import Link from 'next/link'
import { recentActivity } from '@/lib/dashboard-data'

const dotClass = {
  green: 'bg-emerald-400',
  blue: 'bg-blue-400',
  amber: 'bg-amber-400',
  orange: 'bg-orange-400',
  red: 'bg-rose-500',
}

const iconClass = {
  green: 'bg-emerald-100 text-emerald-600',
  blue: 'bg-blue-100 text-blue-600',
  amber: 'bg-amber-100 text-amber-600',
  orange: 'bg-orange-100 text-orange-600',
  red: 'bg-rose-100 text-rose-600',
}

export function RecentActivity() {
  return (
    <section className="rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-5 shadow-[var(--dash-shadow-sm)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--dash-text)]">Recent activity</h2>
        <Link href="/app/log" className="text-sm text-[var(--dash-accent-2)] transition hover:opacity-80">
          View all
        </Link>
      </div>

      <div className="space-y-5">
        {recentActivity.map(({ title, meta, icon: Icon, tone, href }) => (
          <Link key={title} href={href} className="-mx-2 flex items-start gap-3 rounded-xl p-2 transition hover:bg-[var(--dash-soft)]">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${iconClass[tone]}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--dash-text)]">{title}</p>
              <p className="mt-0.5 text-xs text-[var(--dash-muted)]">{meta}</p>
            </div>
            <span className={`mt-3 h-2 w-2 shrink-0 rounded-full ${dotClass[tone]}`} />
          </Link>
        ))}
      </div>
    </section>
  )
}
