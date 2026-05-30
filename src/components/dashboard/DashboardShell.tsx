'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Search } from 'lucide-react'
import { AskKnowledgeCard, TopActions } from '@/components/dashboard/AskKnowledgeCard'
import { KnowledgeGraph } from '@/components/dashboard/KnowledgeGraph'
import { MemoryOverview } from '@/components/dashboard/MemoryOverview'
import { RecentActivity } from '@/components/dashboard/RecentActivity'
import { RecentSources } from '@/components/dashboard/RecentSources'
import { StatCard } from '@/components/dashboard/StatCard'
import { dashboardStats } from '@/lib/dashboard-data'

export function DashboardShell() {
  return (
    <main className="sb-dashboard min-h-full bg-[var(--dash-bg)] text-[var(--dash-text)]">
      <div className="mx-auto grid max-w-[1640px] gap-5 p-4 sm:p-6 lg:p-7 min-[1180px]:grid-cols-[minmax(0,1fr)_300px] min-[1440px]:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:p-8">
        <section className="min-w-0 space-y-6">
          <DashboardHeader />

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {dashboardStats.map(stat => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </section>

          <AskKnowledgeCard />

          <MemoryOverview />

          <RecentSources />
        </section>

        <aside className="grid gap-5 lg:grid-cols-2 min-[1180px]:block min-[1180px]:space-y-5 min-[1180px]:pt-[86px]">
          <RecentActivity />
          <KnowledgeGraph />
        </aside>
      </div>
    </main>
  )
}

function DashboardHeader() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  const submitSearch = () => {
    const q = query.trim()
    router.push(q ? `/app/query?q=${encodeURIComponent(q)}` : '/app/query')
  }

  return (
    <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--dash-text)]">
          Good morning, Alex 👋
        </h1>
        <p className="mt-1 text-sm text-[var(--dash-muted)]">Your memory vault is up to date.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:min-w-[560px] 2xl:min-w-[620px]">
        <form
          className="relative flex-1"
          onSubmit={event => {
            event.preventDefault()
            submitSearch()
          }}
        >
          <label className="sr-only" htmlFor="dashboard-search">
            Search your memory
          </label>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--dash-muted)]" />
          <input
            id="dashboard-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search your memory..."
            className="h-12 w-full rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-card)] pl-11 pr-14 text-sm text-[var(--dash-text)] shadow-[var(--dash-shadow-sm)] outline-none transition focus:border-[var(--dash-accent)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--dash-accent)_18%,transparent)]"
          />
          <span className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-lg border border-[var(--dash-border)] px-2 py-1 text-xs text-[var(--dash-muted)] sm:block">
            ⌘ K
          </span>
        </form>

        <button
          type="button"
          onClick={() => router.push('/app/log')}
          aria-label="Notifications"
          className="relative grid h-12 w-12 place-items-center rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-card)] text-[var(--dash-text)] shadow-[var(--dash-shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--dash-shadow-md)]"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[var(--dash-accent-2)]" />
        </button>

        <TopActions />
      </div>
    </header>
  )
}
