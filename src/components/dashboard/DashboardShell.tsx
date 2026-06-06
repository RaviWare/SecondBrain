'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Command, Search } from 'lucide-react'
import { AskKnowledgeCard, TopActions } from '@/components/dashboard/AskKnowledgeCard'
import { CreditsPill } from '@/components/dashboard/CreditsPill'
import { KnowledgeGraph } from '@/components/dashboard/KnowledgeGraph'
import { MemoryOverview } from '@/components/dashboard/MemoryOverview'
import { RecentActivity } from '@/components/dashboard/RecentActivity'
import { RecentSources } from '@/components/dashboard/RecentSources'
import { SquadMissionsPanel } from '@/components/dashboard/SquadMissionsPanel'
import { StatCard, StatCardSkeleton } from '@/components/dashboard/StatCard'
import { DashboardDataProvider, useDashboardData, useStatCards } from '@/components/dashboard/DashboardData'
import { CommandPalette } from '@/components/dashboard/CommandPalette'
import { useSquadSnapshot } from '@/lib/use-squad-snapshot'

/** Open the global ⌘K command palette (handled by <CommandPalette/>'s window listener). */
function openCommandPalette() {
  window.dispatchEvent(new Event('open-command-palette'))
}

export function DashboardShell() {
  return (
    <DashboardDataProvider>
      <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
        <CommandPalette />
        <div className="mx-auto grid max-w-[1640px] gap-4 p-4 sm:p-5 lg:p-6 min-[1180px]:grid-cols-[minmax(0,1fr)_300px] min-[1440px]:grid-cols-[minmax(0,1fr)_336px] 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:gap-5 2xl:p-7">
          <section className="min-w-0 space-y-4 2xl:space-y-5">
            <DashboardHeader />
            <StatRow />

            <div className="dash-rise" style={{ animationDelay: '0.4s' }}>
              <AskKnowledgeCard />
            </div>

            <div className="dash-rise" style={{ animationDelay: '0.48s' }}>
              <MemoryOverview />
            </div>

            <div className="dash-rise" style={{ animationDelay: '0.56s' }}>
              <RecentSources />
            </div>
          </section>

          <aside className="grid gap-4 lg:grid-cols-2 min-[1180px]:block min-[1180px]:space-y-4 min-[1180px]:pt-[78px] 2xl:gap-5 2xl:min-[1180px]:space-y-5">
            <div className="dash-rise" style={{ animationDelay: '0.26s' }}>
              <SquadMissionsPanel />
            </div>
            <div className="dash-rise" style={{ animationDelay: '0.3s' }}>
              <RecentActivity />
            </div>
            <div className="dash-rise" style={{ animationDelay: '0.44s' }}>
              <KnowledgeGraph />
            </div>
          </aside>
        </div>
      </main>
    </DashboardDataProvider>
  )
}

function StatRow() {
  const { loading } = useDashboardData()
  const stats = useStatCards()

  return (
    <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 2xl:gap-3">
      {loading
        ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="dash-rise" style={{ animationDelay: `${0.05 + i * 0.06}s` }}>
              <StatCardSkeleton />
            </div>
          ))
        : stats.map((stat, i) => (
            <div key={stat.label} className="dash-rise" style={{ animationDelay: `${0.05 + i * 0.06}s` }}>
              <StatCard {...stat} />
            </div>
          ))}
    </section>
  )
}

function DashboardHeader() {
  const [query, setQuery] = useState('')
  const router = useRouter()
  const { data } = useDashboardData()
  const vaultName = data?.vault?.name

  const submitSearch = () => {
    const q = query.trim()
    router.push(q ? `/app/query?q=${encodeURIComponent(q)}` : '/app/query')
  }

  return (
    <header className="dash-rise relative z-30 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between" style={{ animationDelay: '0s' }}>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight 2xl:text-2xl">
          <span className="dash-metallic-text">{greeting()}</span>
          <span className="text-xl 2xl:text-2xl">👋</span>
        </h1>
        <p className="mt-0.5 text-[13px] text-[var(--dash-muted)]">
          {vaultName ? `${vaultName} is up to date.` : 'Your memory vault is up to date.'}
        </p>
      </div>

      <div className="flex items-center gap-2 xl:min-w-[540px] 2xl:min-w-[600px]">
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
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[var(--dash-muted)]" />
          <input
            id="dashboard-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search your memory..."
            className="dash-panel h-11 w-full !rounded-2xl pl-11 pr-16 text-sm text-[var(--dash-text)] outline-none transition focus:border-[var(--dash-border-glow)] focus:shadow-[var(--dash-shadow-md),0_0_0_3px_var(--dash-accent-soft)]"
          />
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Open command palette"
            title="Command palette"
            className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-[var(--dash-border-bright)] bg-[var(--dash-soft)] px-1.5 py-0.5 font-sans text-[11px] font-medium text-[var(--dash-muted)] transition hover:border-[var(--dash-border-glow)] hover:text-[var(--dash-text)] sm:flex"
          >
            <Command className="h-3 w-3" />K
          </button>
        </form>

        <CreditsPill />

        <NotificationBell />

        <TopActions />
      </div>
    </header>
  )
}

// Notification bell — the dot is bound to REAL pending sign-off state (the Aegis
// queue depth from useSquadSnapshot). NO DUMMY DATA: no pending → no dot, and the
// link routes to where the user can act (agents queue when something's waiting,
// the activity log otherwise).
function NotificationBell() {
  const { pendingSignOff, loading } = useSquadSnapshot()
  const hasPending = !loading && pendingSignOff > 0
  const href = hasPending ? '/app/agents' : '/app/log'
  const label = hasPending
    ? `${pendingSignOff} item${pendingSignOff === 1 ? '' : 's'} need your sign-off`
    : 'Notifications'

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="dash-panel dash-interactive relative grid h-11 w-11 shrink-0 place-items-center !rounded-2xl text-[var(--dash-muted)] transition hover:text-[var(--dash-text)]"
    >
      <Bell className="h-[18px] w-[18px]" />
      {hasPending && (
        <>
          <span
            aria-hidden
            className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[var(--dash-accent)] shadow-[0_0_0_2px_var(--dash-card-solid)]"
          />
          <span
            aria-hidden
            className="absolute right-2.5 top-2.5 h-2 w-2 animate-ping rounded-full bg-[var(--dash-accent)]"
          />
        </>
      )}
    </Link>
  )
}

function greeting() {
  const h = new Date().getHours()
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
  return `Good ${part}`
}
