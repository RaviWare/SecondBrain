'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from './ThemeProvider'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      className={cn(
        'relative inline-flex h-9 w-[68px] items-center rounded-full border px-1',
        'transition-all duration-400 ease-out',
        'border-[var(--border-bright)] bg-[var(--surface-2)]',
        'hover:border-[var(--border-glow)]',
        className
      )}
      style={{ transitionTimingFunction: 'var(--ease-out-expo)' }}
    >
      <span
        className={cn(
          'absolute top-1 h-7 w-7 rounded-full shadow-[var(--shadow-1)]',
          'transition-transform duration-500',
          'flex items-center justify-center',
          isDark
            ? 'translate-x-0 bg-gradient-to-br from-[#2a2e3e] to-[#0d0f17]'
            : 'translate-x-[32px] bg-gradient-to-br from-white to-[#f0e9d7]'
        )}
        style={{ transitionTimingFunction: 'var(--ease-spring)' }}
      >
        {isDark ? (
          <Moon size={14} className="text-[var(--accent-bright)]" />
        ) : (
          <Sun size={14} className="text-[var(--accent)]" />
        )}
      </span>
      <span className="type-mono-xs ml-auto mr-2 text-[var(--text-muted)]">
        {isDark ? 'DRK' : 'LIT'}
      </span>
    </button>
  )
}
