'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import {
  BookOpen,
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
  { href: '/app/query', label: 'AI Assistant', icon: Sparkles },
]

const mobileNav = nav.filter(item => ['Dashboard', 'Search', 'Inbox', 'Memory', 'AI Assistant'].includes(item.label))

export function Sidebar() {
  const path = usePathname()

  return (
    <>
      <div
        className="fixed inset-x-0 top-0 z-50 border-b px-4 py-3 backdrop-blur-xl md:hidden"
        style={{ background: 'rgba(5, 10, 18, 0.92)', borderColor: 'rgba(255,255,255,0.10)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserButton
              appearance={{
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
              }}
            />
          </div>
        </div>
      </div>

      <aside
        className="hidden h-dvh w-60 shrink-0 sticky top-0 flex-col border-r md:flex"
        style={{
          background: 'linear-gradient(180deg, #07111f 0%, #020617 48%, #000814 100%)',
          borderColor: 'rgba(255,255,255,0.08)',
          color: '#ffffff',
        }}
      >
        {/* Logo */}
        <div className="px-4 py-5">
          <BrandMark />
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-hidden px-3 pb-3">
          {nav.map(({ href, label, icon: Icon, badge }) => {
            const active = isActiveNav(label, path)
            return (
              <Link
                key={`${href}-${label}`}
                href={href}
                className="relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm transition-all duration-200"
                style={
                  active
                    ? {
                        background: 'linear-gradient(135deg, #ff7a1f, #ff6600)',
                        color: '#ffffff',
                        boxShadow: '0 16px 32px rgba(255, 102, 0, 0.26)',
                      }
                    : {
                        color: 'rgba(255,255,255,0.82)',
                      }
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1 font-medium">{label}</span>
                {badge && (
                  <span className="grid h-6 min-w-6 place-items-center rounded-full bg-orange-500 px-2 text-xs font-semibold text-white">
                    {badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="mx-3 mb-3 rounded-2xl border p-3" style={{ background: 'rgba(255,255,255,0.035)', borderColor: 'rgba(255,255,255,0.11)' }}>
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-orange-500/15 text-orange-200">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold text-white">Private and secure</p>
          </div>
          <p className="text-xs leading-5 text-white/60">Your data is encrypted and never used to train AI.</p>
        </div>

        {/* User */}
        <div className="p-3">
          <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3">
            <div className="shrink-0 grid place-items-center h-8 w-8 rounded-full overflow-hidden">
              <UserButton
                appearance={{
                  elements: {
                    rootBox: 'h-8 w-8',
                    userButtonTrigger:
                      'h-8 w-8 p-0 rounded-full focus:shadow-none focus:ring-0',
                    userButtonBox: 'h-8 w-8',
                    avatarBox: 'h-8 w-8 rounded-full',
                    userButtonOuterIdentifier: 'hidden',
                    userButtonPopoverFooter: 'hidden',
                    footer: 'hidden',
                    footerAction: 'hidden',
                    logoBox: 'hidden',
                    poweredByClerk: 'hidden',
                  },
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-none text-white">Alex Thompson</p>
              <p className="mt-1 text-xs text-white/55">Pro Plan</p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <nav
        className="fixed inset-x-3 bottom-3 z-50 rounded-3xl border p-1.5 shadow-[0_16px_50px_rgba(0,0,0,0.24)] backdrop-blur-xl md:hidden"
        style={{
          background: 'rgba(5, 10, 18, 0.92)',
          borderColor: 'rgba(255,255,255,0.12)',
        }}
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
                        background: 'rgba(255, 102, 0, 0.24)',
                        border: '1px solid rgba(255, 122, 31, 0.38)',
                      }
                    : {
                        color: 'rgba(255,255,255,0.52)',
                        border: '1px solid transparent',
                      }
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
        style={{ background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.16)' }}
      >
        <BrainMark size={22} className="relative z-[1] text-white" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold tracking-tight leading-none text-white">
          SecondBrain
        </p>
        <p className="mt-1 truncate text-sm text-white/55">Cloud</p>
      </div>
    </Link>
  )
}
