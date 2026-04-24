'use client'

import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const card = cva(
  'relative rounded-[var(--radius-lg)] transition-all duration-300',
  {
    variants: {
      variant: {
        glass: 'glass',
        glassBright: 'glass-bright',
        metallic: 'metallic',
        flat: 'bg-[var(--surface)] border border-[var(--border)]',
        outline: 'bg-transparent border border-[var(--border-bright)]',
      },
      interactive: {
        true: 'card-hover cursor-pointer',
        false: '',
      },
      padding: {
        none: 'p-0',
        sm: 'p-3',
        md: 'p-5',
        lg: 'p-7',
      },
    },
    defaultVariants: { variant: 'glass', interactive: false, padding: 'md' },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof card> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, interactive, padding, children, ...props }, ref) => (
    <div ref={ref} className={cn(card({ variant, interactive, padding }), className)} {...props}>
      <div className="relative z-[1]">{children}</div>
    </div>
  )
)
Card.displayName = 'Card'

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 flex items-start justify-between gap-3', className)} {...props} />
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('type-h5 text-[var(--text-primary)]', className)} {...props} />
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('type-body-sm', className)} {...props} />
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4 flex items-center justify-between gap-3', className)} {...props} />
}
