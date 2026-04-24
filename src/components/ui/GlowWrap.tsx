'use client'

/**
 * Aceternity-inspired animated conic border.
 * The keyframes + mask live in globals.css (.glow-wrap).
 * - `always` → keep the glow visible (don't wait for hover)
 * - `radius` → matches parent's rounded class; set the same on the child
 * - `speed`  → override --orbit-speed in seconds (default 22s)
 */
import { cn } from '@/lib/utils'

export function GlowWrap({
  children,
  className,
  always = false,
  radius = 'var(--radius-lg)',
  speed,
}: {
  children: React.ReactNode
  className?: string
  always?: boolean
  radius?: string
  speed?: number
}) {
  return (
    <div
      className={cn('glow-wrap', className)}
      data-always={always ? 'true' : undefined}
      style={{
        borderRadius: radius,
        ...(speed ? { ['--orbit-speed' as string]: `${speed}s` } : {}),
      }}
    >
      {children}
    </div>
  )
}
