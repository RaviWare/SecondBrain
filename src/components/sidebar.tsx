'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { LayoutDashboard, Plus, BookOpen, MessageSquare, ScrollText, Settings } from 'lucide-react'
import { BrainMark } from '@/components/ui/BrainMark'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const nav = [
  { href: '/app/dashboard', label: 'Dashboard',   icon: LayoutDashboard, tag: 'CTRL+1' },
  { href: '/app/ingest',    label: 'Ingest',       icon: Plus,            tag: 'CTRL+I' },
  { href: '/app/wiki',      label: 'Wiki',          icon: BookOpen,        tag: 'CTRL+W' },
  { href: '/app/query',     label: 'Query',         icon: MessageSquare,   tag: 'CTRL+Q' },
  { href: '/app/log',       label: 'Activity Log',  icon: ScrollText,      tag: null },
  { href: '/app/settings',  label: 'Settings',      icon: Settings,        tag: null },
]

export function Sidebar() {
  const path = usePathname()

  return (
    <aside
      className="w-56 shrink-0 h-screen sticky top-0 flex flex-col border-r border-[var(--border)]"
      style={{ background: 'var(--surface)' }}
    >
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[var(--border)]">
        <Link href="/app/dashboard" className="flex items-center gap-2.5 group">
          <span
            className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-lg border border-[var(--border-bright)] transition-colors group-hover:border-[var(--border-glow)]"
            style={{ background: 'var(--metallic)' }}
          >
            <span
              aria-hidden
              className="absolute inset-0 pointer-events-none rounded-lg"
              style={{ background: 'var(--metallic-hi)' }}
            />
            <BrainMark size={20} className="relative z-[1] text-[#e5e5ea]" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--text-primary)] tracking-tight leading-none">
              SecondBrain
            </p>
            <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest mt-1">CLOUD · v1.0</p>
          </div>
        </Link>
      </div>

      {/* Status bar */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full pulse-dot shrink-0"
            style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }}
          />
          <span className="mono text-[9px] text-[var(--text-muted)] tracking-widest">CLAUDE HAIKU · ONLINE</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        <p className="mono text-[9px] text-[var(--text-muted)] tracking-widest px-3 mb-3">NAVIGATION</p>
        {nav.map(({ href, label, icon: Icon, tag }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all duration-200 group relative overflow-hidden"
              style={
                active
                  ? {
                      background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                      color: 'var(--accent-bright)',
                      border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
                    }
                  : {
                      color: 'var(--text-secondary)',
                      border: '1px solid transparent',
                    }
              }
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r"
                  style={{ background: 'var(--accent)' }}
                />
              )}
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 font-medium">{label}</span>
              {tag && (
                <span className="mono text-[9px] text-[var(--text-muted)] hidden group-hover:block">{tag}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-[var(--border)]">
        <div className="flex items-center gap-3">
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
                  // Hide Clerk branding inside the popover
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
            <p className="text-xs text-[var(--text-primary)] font-medium leading-none">Account</p>
            <p className="mono text-[9px] text-[var(--text-muted)] mt-1">FREE PLAN</p>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  )
}
