'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { LayoutDashboard, Plus, BookOpen, MessageSquare, ScrollText, Settings } from 'lucide-react'

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
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col border-r border-white/5 bg-[#06060f]">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-xs font-black shadow-lg shadow-violet-500/20">
            S
          </div>
          <div>
            <p className="text-xs font-semibold text-white/90 tracking-tight">
              Second<span className="text-violet-400">Brain</span>
            </p>
            <p className="mono text-[9px] text-white/20 tracking-widest">CLOUD · v1.0</p>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot shrink-0" />
          <span className="mono text-[9px] text-white/25 tracking-widest">CLAUDE HAIKU · ONLINE</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        <p className="mono text-[9px] text-white/20 tracking-widest px-3 mb-3">NAVIGATION</p>
        {nav.map(({ href, label, icon: Icon, tag }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all duration-200 group relative overflow-hidden ${
                active
                  ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20'
                  : 'text-white/35 hover:text-white/70 hover:bg-white/4'
              }`}
            >
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-violet-400 rounded-r" />
              )}
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 font-medium">{label}</span>
              {tag && (
                <span className="mono text-[9px] text-white/15 hidden group-hover:block">{tag}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-1">
          <UserButton appearance={{ elements: { avatarBox: 'w-7 h-7' } }} />
          <div className="min-w-0">
            <p className="text-xs text-white/50 font-medium">Account</p>
            <p className="mono text-[9px] text-white/20">FREE PLAN</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
