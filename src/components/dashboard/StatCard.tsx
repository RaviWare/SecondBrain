import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const toneClass = {
  violet: 'bg-orange-100 text-orange-700 dark:bg-orange-500/14 dark:text-orange-200',
  purple: 'bg-violet-100 text-violet-700 dark:bg-violet-500/14 dark:text-violet-200',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/14 dark:text-blue-200',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/14 dark:text-emerald-200',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-500/14 dark:text-orange-200',
}

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  delta: string
  icon: LucideIcon
  tone: keyof typeof toneClass
}) {
  return (
    <article className="rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-card)] p-2.5 shadow-[var(--dash-shadow-sm)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--dash-shadow-md)] 2xl:p-4">
      <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-center 2xl:gap-4">
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full 2xl:h-12 2xl:w-12', toneClass[tone])}>
          <Icon className="h-4 w-4 2xl:h-5 2xl:w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xl font-semibold leading-none tracking-tight text-[var(--dash-text)] 2xl:text-2xl">{value}</p>
          <p className="mt-1 whitespace-nowrap text-xs text-[var(--dash-muted)] 2xl:text-sm">{label}</p>
          <p className="mt-1 hidden truncate text-[10px] text-[var(--dash-subtle)] min-[1500px]:block 2xl:text-xs">{delta}</p>
        </div>
      </div>
    </article>
  )
}
