'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import {
  BellRing,
  BookOpen,
  Bot,
  Blocks,
  ClipboardCheck,
  FileText,
  Folder,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Network,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  Tags,
  Users,
  Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { BrainMark } from '@/components/ui/BrainMark'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { resolveActiveIndex, formatBadge } from '@/components/sidebar-nav'

const nav = [
  { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/query', label: 'Search', icon: Search },
  { href: '/app/ingest', label: 'Inbox', icon: Inbox },
  { href: '/app/wiki?view=sources', label: 'Sources', icon: FileText },
  { href: '/app/wiki', label: 'Memory', icon: BookOpen },
  { href: '/app/dashboard#knowledge-graph', label: 'Graph', icon: Network },
  { href: '/app/wiki?type=concept', label: 'Topics', icon: Tags },
  { href: '/app/wiki?type=entity', label: 'People', icon: Users },
  { href: '/app/wiki?type=synthesis', label: 'Decisions', icon: ClipboardCheck },
  { href: '/app/wiki?view=collections', label: 'Collections', icon: Folder },
  { href: '/app/agents', label: 'Squad', icon: Radar },
  { href: '/app/agents/board', label: 'Board', icon: KanbanSquare },
  { href: '/app/agents/skills', label: 'Skills', icon: Blocks },
  { href: '/app/agents/cost', label: 'Cost', icon: Wallet },
  { href: '/app/agent', label: 'AI Agent', icon: Bot },
  { href: '/app/query', label: 'AI Assistant', icon: Sparkles },
]

// Real unread count drives the Inbox badge. No data source is wired yet, so it
// is 0 → no badge renders (honest-by-construction; never a fake "12"). Wire this
// to the real inbox/ingest-queue count when that endpoint exists.
const inboxUnread = 0

const mobileNav = nav.filter(item => ['Dashboard', 'Search', 'Inbox', 'AI Agent', 'AI Assistant'].includes(item.label))

const userButtonAppearance = {
  elements: {
    rootBox: 'h-8 w-8',
    userButtonTrigger: 'h-8 w-8 p-0 rounded-full focus:shadow-none focus:ring-0',
    userButtonBox: 'h-8 w-8',
    avatarBox: 'h-8 w-8 rounded-full',
    userButtonOuterIdentifier: 'hidden',
    userButtonPopoverFooter: 'hidden',
    footer: 'hidden',
    footerAction: 'hidden',
    logoBox: 'hidden',
    poweredByClerk: 'hidden',
  },
}

export function Sidebar() {
  return (
    <Suspense fallback={<SidebarView activeIndex={null} mobileActiveIndex={null} isAdmin={false} adminActive={false} />}>
      <SidebarWithActive />
    </Suspense>
  )
}

function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/me')
      .then(r => (r.ok ? r.json() : { isAdmin: false }))
      .then(d => { if (!cancelled) setIsAdmin(Boolean(d?.isAdmin)) })
      .catch(() => { /* non-admin / not signed in */ })
    return () => { cancelled = true }
  }, [])
  return isAdmin
}

function SidebarWithActive() {
  const path = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const activeIndex = resolveActiveIndex(path, search, nav)
  const mobileActiveIndex = resolveActiveIndex(path, search, mobileNav)
  const isAdmin = useIsAdmin()
  const adminActive = path === '/app/admin/updates'
  return (
    <SidebarView
      activeIndex={activeIndex}
      mobileActiveIndex={mobileActiveIndex}
      isAdmin={isAdmin}
      adminActive={adminActive}
    />
  )
}

function SidebarView({
  activeIndex,
  mobileActiveIndex,
  isAdmin,
  adminActive,
}: {
  activeIndex: number | null
  mobileActiveIndex: number | null
  isAdmin: boolean
  adminActive: boolean
}) {
  const badgeText = formatBadge(inboxUnread)

  return (
    <>
      {/* Mobile top bar */}
      <div
        className="fixed inset-x-0 top-0 z-50 border-b px-4 py-3 backdrop-blur-xl md:hidden"
        style={{ background: 'var(--app-bar-bg)', borderColor: 'var(--app-sidebar-border)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserButton appearance={userButtonAppearance} />
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside
        className="relative hidden h-dvh w-[236px] shrink-0 sticky top-0 flex-col border-r md:flex"
        style={{
          background: 'var(--app-sidebar-bg)',
          borderColor: 'var(--app-sidebar-border)',
          color: 'var(--app-sidebar-text)',
        }}
      >
        {/* ambient glow at top */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          style={{ background: 'var(--app-sidebar-glow)' }}
        />

        {/* Logo */}
        <div className="relative px-4 py-5">
          <BrandMark />
        </div>

        {/* Nav */}
        <nav className="relative flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
          {nav.map(({ href, label, icon: Icon }, idx) => {
            const active = idx === activeIndex
            const badge = label === 'Inbox' ? badgeText : null
            return (
              <Link
                key={`${href}-${label}`}
                href={href}
                aria-current={active ? 'page' : undefined}
                className="group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-[13px] transition-all duration-200"
                style={
                  active
                    ? {
                        background: 'var(--app-sidebar-active)',
                        color: '#ffffff',
                        boxShadow: '0 12px 26px -10px rgba(255, 102, 0, 0.7)',
                      }
                    : { color: 'var(--app-sidebar-muted)' }
                }
              >
                {/* hover wash for inactive items */}
                {!active && (
                  <span
                    className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    style={{ background: 'var(--app-sidebar-hover)' }}
                  />
                )}
                {/* active left accent for light theme legibility */}
                {active && (
                  <span className="pointer-events-none absolute inset-0 rounded-xl bg-[linear-gradient(180deg,rgba(255,255,255,0.22),transparent_55%)]" />
                )}
                <Icon
                  className="relative h-[18px] w-[18px] shrink-0 transition-colors group-hover:text-[var(--app-sidebar-text)]"
                  style={active ? { color: '#ffffff' } : undefined}
                />
                <span
                  className="relative flex-1 font-medium transition-colors group-hover:text-[var(--app-sidebar-text)]"
                  style={active ? { color: '#ffffff' } : undefined}
                >
                  {label}
                </span>
                {badge && (
                  <span
                    className="relative grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold"
                    style={
                      active
                        ? { background: 'rgba(255,255,255,0.25)', color: '#ffffff' }
                        : { background: 'var(--accent)', color: '#ffffff' }
                    }
                  >
                    {badge}
                  </span>
                )}
              </Link>
            )
          })}

          {/* Admin-only: Updates feed (upstream monitor alerts). Hidden for
              non-admins (gated by /api/admin/me + the API's own allow-list). */}
          {isAdmin && (
            <Link
              href="/app/admin/updates"
              aria-current={adminActive ? 'page' : undefined}
              className="group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-[13px] transition-all duration-200"
              style={
                adminActive
                  ? {
                      background: 'var(--app-sidebar-active)',
                      color: '#ffffff',
                      boxShadow: '0 12px 26px -10px rgba(255, 102, 0, 0.7)',
                    }
                  : { color: 'var(--app-sidebar-muted)' }
              }
            >
              {!adminActive && (
                <span
                  className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  style={{ background: 'var(--app-sidebar-hover)' }}
                />
              )}
              <BellRing
                className="relative h-[18px] w-[18px] shrink-0 transition-colors group-hover:text-[var(--app-sidebar-text)]"
                style={adminActive ? { color: '#ffffff' } : undefined}
              />
              <span
                className="relative flex-1 font-medium transition-colors group-hover:text-[var(--app-sidebar-text)]"
                style={adminActive ? { color: '#ffffff' } : undefined}
              >
                Updates
              </span>
            </Link>
          )}
        </nav>

        {/* Privacy card */}
        <div
          className="relative mx-3 mb-3 rounded-2xl border p-3 backdrop-blur"
          style={{ background: 'var(--app-sidebar-card)', borderColor: 'var(--app-sidebar-card-border)' }}
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--app-sidebar-text)' }}>
              Private and secure
            </p>
          </div>
          <p className="text-[11px] leading-4" style={{ color: 'var(--app-sidebar-muted)' }}>
            Your data is encrypted and never used to train AI.
          </p>
        </div>

        {/* User */}
        <div className="relative p-3 pt-0">
          <div
            className="flex items-center gap-3 rounded-2xl border p-2.5 backdrop-blur"
            style={{ background: 'var(--app-sidebar-card)', borderColor: 'var(--app-sidebar-card-border)' }}
          >
            <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full">
              <UserButton appearance={userButtonAppearance} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-none" style={{ color: 'var(--app-sidebar-text)' }}>
                Alex Thompson
              </p>
              <p className="mt-1 truncate text-[11px]" style={{ color: 'var(--app-sidebar-muted)' }}>
                Pro Plan
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-3 bottom-3 z-50 rounded-3xl border p-1.5 shadow-[0_16px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl md:hidden"
        style={{ background: 'var(--app-bar-bg)', borderColor: 'var(--app-sidebar-border)' }}
      >
        <div className="grid grid-cols-5 gap-1">
          {mobileNav.map(({ href, label, icon: Icon }, idx) => {
            const active = idx === mobileActiveIndex
            return (
              <Link
                key={`${href}-${label}-mobile`}
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className="flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-medium transition-colors"
                style={
                  active
                    ? {
                        color: '#ffffff',
                        background: 'var(--app-sidebar-active)',
                        boxShadow: '0 10px 22px -10px rgba(255, 102, 0, 0.7)',
                      }
                    : { color: 'var(--app-sidebar-muted)' }
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="w-full truncate text-center leading-none">
                  {label === 'AI Assistant' ? 'AI' : label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}

function BrandMark() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5 group" aria-label="Go to SecondBrain home page">
      <span
        className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl border transition-colors"
        style={{ background: 'var(--app-sidebar-card)', borderColor: 'var(--app-sidebar-card-border)' }}
      >
        <BrainMark size={22} className="relative z-[1]" style={{ color: 'var(--accent)' }} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold tracking-tight leading-none" style={{ color: 'var(--app-sidebar-text)' }}>
          SecondBrain
        </p>
        <p className="mt-1 truncate text-[13px]" style={{ color: 'var(--app-sidebar-muted)' }}>
          Cloud
        </p>
      </div>
    </Link>
  )
}
