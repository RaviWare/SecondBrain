'use client'

import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Node-type colour map mirrors KnowledgeGraph.tsx so badges stay in sync
 * with the graph visualization.
 */
export const NODE_TYPES = [
  'concept', 'person', 'organization', 'entity',
  'tool', 'synthesis', 'pattern', 'event',
] as const
export type NodeType = typeof NODE_TYPES[number]

const badge = cva(
  [
    'inline-flex items-center gap-1.5 rounded-full',
    'type-mono-xs font-medium tracking-[0.08em]',
    'border transition-colors',
  ].join(' '),
  {
    variants: {
      tone: {
        neutral: 'bg-[var(--surface-2)] border-[var(--border-bright)] text-[var(--text-secondary)]',
        accent:  'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent-bright)]',
        silver:  'bg-[var(--surface-2)] border-[var(--border-bright)] text-[var(--text-primary)]',
        success: 'bg-[var(--surface-2)] border-[var(--border-bright)] text-[var(--text-primary)]',
        warning: 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent-bright)]',
        danger:  'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent-bright)]',
        info:    'bg-[var(--surface-2)] border-[var(--border-bright)] text-[var(--text-secondary)]',
        violet:  'bg-[var(--surface-2)] border-[var(--border-bright)] text-[var(--text-secondary)]',
      },
      size: {
        sm: 'h-5 px-2 text-[10px]',
        md: 'h-6 px-2.5 text-[11px]',
        lg: 'h-7 px-3 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {
  dot?: boolean
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, size, dot, children, ...props }, ref) => (
    <span ref={ref} className={cn(badge({ tone, size }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current pulse-dot" />}
      {children}
    </span>
  )
)
Badge.displayName = 'Badge'

/** Type-coded badge (uses inline CSS var so light/dark stay accurate). */
export function NodeTypeBadge({ type, className, size = 'md' }: { type: NodeType; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const colorVar = TYPE_VAR[type]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border type-mono-xs font-medium tracking-[0.08em]',
        size === 'sm' && 'h-5 px-2 text-[10px]',
        size === 'md' && 'h-6 px-2.5 text-[11px]',
        size === 'lg' && 'h-7 px-3 text-xs',
        className
      )}
      style={{
        background: `color-mix(in srgb, ${colorVar} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${colorVar} 32%, transparent)`,
        color: colorVar,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorVar }} />
      {type}
    </span>
  )
}

/**
 * Two-tone palette (orange accent + brushed silver) alternating across
 * the 8 node types — keeps the graph visually readable while adhering
 * to the site-wide 3-colour system (grey/silver/orange).
 */
const SILVER = '#c8c8cf'
const TYPE_VAR: Record<NodeType, string> = {
  concept:      'var(--accent)',
  person:       SILVER,
  organization: 'var(--accent)',
  entity:       SILVER,
  tool:         'var(--accent)',
  synthesis:    SILVER,
  pattern:      'var(--accent)',
  event:        SILVER,
}
