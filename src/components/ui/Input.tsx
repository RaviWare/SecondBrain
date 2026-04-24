'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const base = [
  'w-full rounded-[var(--radius-md)] border bg-[var(--surface-2)]',
  'border-[var(--border-bright)] text-[var(--text-primary)]',
  'placeholder:text-[var(--text-muted)]',
  'px-3 py-2 text-sm leading-5',
  'transition-all duration-200 outline-none',
  'focus:border-[var(--border-glow)] focus:bg-[var(--surface)]',
  'focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]',
  'disabled:opacity-50 disabled:pointer-events-none',
].join(' ')

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
  suffix?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, icon, suffix, ...props }, ref) => {
  if (!icon && !suffix) return <input ref={ref} className={cn(base, className)} {...props} />
  return (
    <div className="relative w-full">
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        className={cn(base, icon && 'pl-9', suffix && 'pr-10', className)}
        {...props}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">{suffix}</span>
      )}
    </div>
  )
})
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(base, 'min-h-[96px] resize-y py-2.5', className)} {...props} />
  )
)
Textarea.displayName = 'Textarea'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('type-mono-xs mb-1.5 block text-[var(--text-muted)]', className)} {...props} />
}
