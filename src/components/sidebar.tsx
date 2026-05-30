'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import {
  BookOpen,
  Bot,
  ClipboardCheck,
  FileText,
  Folder,
  Inbox,
  LayoutDashboard,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  Tags,
  Users,
} from 'lucide-react'
import { BrainMark } from '@/components/ui/BrainMark'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const nav = [
  { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/query', label: 'Search', icon: Search },
  { href: '/app/ingest', label: 'Inbox', icon: Inbox, badge: '12' },
  { href: '/app/wiki?view=sources', label: 'Sources', icon: FileText },
  { href: '/app/wiki', label: 'Memory', icon: BookOpen },
  { href: '/app/dashboard#knowledge-graph', label: 'Graph', icon: Network },
  { href: '/app/wiki?type=concept', label: 'Topics', icon: Tags },
  { href: '/app/wiki?type=entity', label: 'People', icon: Users },
  { href: '/app/wiki?type=synthesis', label: 'Decisions', icon: ClipboardCheck },
  { href: '/app/wiki?view=collections', label: 'Collections', icon: Folder },
  { href: '/app/agent', label: 'AI Agent', icon: Bot },
  { href: '/app/query', label: 'AI Assistant', icon: Sparkles },
]

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
  const path = usePathname()

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
          {nav.map(({ href, label, icon: Icon, badge }) => {
            const active = isActiveNav(label, path)
            return (
              <Link
                key={`${href}-${label}`}
                href={href}
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
          {mobileNav.map(({ href, label, icon: Icon }) => {
            const active = isActiveNav(label, path)
            return (
              <Link
                key={`${href}-${label}-mobile`}
                href={href}
                aria-label={label}
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

function isActiveNav(label: string, path: string) {
  if (label === 'Dashboard') return path === '/app/dashboard'
  if (label === 'Search' || label === 'AI Assistant') return path === '/app/query'
  if (label === 'AI Agent') return path === '/app/agent'
  if (label === 'Inbox') return path === '/app/ingest'
  if (['Sources', 'Memory', 'Topics', 'People', 'Decisions', 'Collections'].includes(label)) {
    return path === '/app/wiki'
  }

  return false
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
