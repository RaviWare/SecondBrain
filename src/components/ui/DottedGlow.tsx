'use client'

import { cn } from '@/lib/utils'

/**
 * Aceternity-inspired dotted glow background.
 * Combines: radial plume from the top, dot grid masked to a soft ellipse,
 * and an optional animated scan line. Safe to use as a page or section wrapper.
 */
export function DottedGlow({
  children,
  className,
  scan = false,
}: {
  children?: React.ReactNode
  className?: string
  scan?: boolean
}) {
  return (
    <div className={cn('dotted-glow relative overflow-hidden', scan && 'scanline', className)}>
      {children}
    </div>
  )
}
