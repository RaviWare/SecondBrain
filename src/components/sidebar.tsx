'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { Brain, LayoutDashboard, Plus, BookOpen, MessageSquare, ScrollText, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/app/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/app/ingest',    label: 'Ingest',      icon: Plus },
  { href: '/app/wiki',      label: 'Wiki',         icon: BookOpen },
  { href: '/app/query',     label: 'Query',        icon: MessageSquare },
  { href: '/app/log',       label: 'Activity Log', icon: ScrollText },
  { href: '/app/settings',  label: 'Settings',     icon: Settings },
]

export function Sidebar() {
  const path = usePathname()

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 flex flex-col bg-zinc-900 border-r border-zinc-800">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-zinc-800">
        <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
          <Brain className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-zinc-100 text-sm tracking-tight">Second Brain</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              path.startsWith(href)
                ? 'bg-violet-600/20 text-violet-300 font-medium'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-zinc-800 flex items-center gap-3">
        <UserButton appearance={{ elements: { avatarBox: 'w-8 h-8' } }} />
        <span className="text-xs text-zinc-500 truncate">Account</span>
      </div>
    </aside>
  )
}
