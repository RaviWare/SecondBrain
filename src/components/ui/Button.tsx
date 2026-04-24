'use client'

import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const button = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap select-none',
    'font-medium tracking-[-0.01em] rounded-[var(--radius-md)]',
    'transition-all duration-300 outline-none',
    'focus-visible:ring-2 focus-visible:ring-[var(--border-glow)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
    'disabled:opacity-40 disabled:pointer-events-none',
    'overflow-hidden',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: [
          'text-[var(--text-inverse)]',
          'bg-[linear-gradient(135deg,var(--accent-bright),var(--accent))]',
          'shadow-[var(--shadow-2)]',
          'hover:shadow-[var(--glow-accent)] hover:-translate-y-[1px]',
          'active:translate-y-0',
        ].join(' '),
        metallic: [
          'text-[var(--text-primary)] border border-[var(--border-bright)]',
          'bg-[var(--metallic)] shadow-[var(--shadow-2)]',
          'hover:border-[var(--border-glow)] hover:-translate-y-[1px]',
          'before:absolute before:inset-0 before:bg-[var(--metallic-hi)] before:pointer-events-none',
        ].join(' '),
        ghost: [
          'text-[var(--text-secondary)] border border-[var(--border-bright)] bg-transparent',
          'hover:text-[var(--text-primary)] hover:border-[var(--border-glow)]',
          'hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]',
        ].join(' '),
        soft: [
          'text-[var(--accent-bright)] border border-transparent',
          'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]',
          'hover:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]',
        ].join(' '),
        icon: [
          'text-[var(--text-secondary)] border border-[var(--border)] bg-[var(--surface-2)]',
          'hover:text-[var(--text-primary)] hover:border-[var(--border-glow)]',
        ].join(' '),
        link: 'text-[var(--accent)] hover:text-[var(--accent-bright)] underline-offset-4 hover:underline px-0',
      },
      size: {
        xs: 'h-7 px-2.5 text-xs',
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        xl: 'h-14 px-8 text-base',
        iconSm: 'h-8 w-8 p-0',
        iconMd: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, children, ...props }, ref) => (
    <button ref={ref} className={cn(button({ variant, size }), className)} {...props}>
      <span className="relative z-[1] inline-flex items-center gap-2">{children}</span>
    </button>
  )
)
Button.displayName = 'Button'
