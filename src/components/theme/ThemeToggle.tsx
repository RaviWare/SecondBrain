'use client'

import { Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useTheme } from './ThemeProvider'
import { cn } from '@/lib/utils'

const subscribeMounted = () => () => {}
const getMountedSnapshot = () => true
const getServerSnapshot = () => false

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getServerSnapshot
  )
  const displayTheme = mounted ? theme : 'dark'
  const isDark = displayTheme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      suppressHydrationWarning
      className={cn(
        'relative inline-flex h-8 w-[52px] sm:h-9 sm:w-[68px] items-center rounded-full border px-1',
        'transition-all duration-400 ease-out',
        'border-[var(--border-bright)] bg-[var(--surface-2)]',
        'hover:border-[var(--border-glow)]',
        className
      )}
      style={{ transitionTimingFunction: 'var(--ease-out-expo)' }}
    >
      <span
        className={cn(
          'absolute top-1 h-6 w-6 sm:h-7 sm:w-7 rounded-full shadow-[var(--shadow-1)]',
          'transition-transform duration-500',
          'flex items-center justify-center',
          isDark
            ? 'translate-x-0 bg-gradient-to-br from-[#2a2e3e] to-[#0d0f17]'
            : 'translate-x-[20px] sm:translate-x-[32px] bg-gradient-to-br from-white to-[#f0e9d7]'
        )}
        style={{ transitionTimingFunction: 'var(--ease-spring)' }}
      >
        {isDark ? (
          <Moon size={13} className="text-[var(--accent-bright)] sm:size-[14px]" />
        ) : (
          <Sun size={13} className="text-[var(--accent)] sm:size-[14px]" />
        )}
      </span>
      <span className="type-mono-xs ml-auto mr-2 hidden sm:inline text-[var(--text-muted)]">
        {isDark ? 'DRK' : 'LIT'}
      </span>
    </button>
  )
}
