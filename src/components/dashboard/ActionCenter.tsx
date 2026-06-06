'use client'

// ── ActionCenter — the unified "needs me" card ────────────────────────────────
// One calm place that answers "what needs my decision right now?", unifying signals
// that were otherwise scattered across the Squad panel and the Missions list:
//   • proposals awaiting your sign-off (the Aegis queue)
//   • missions awaiting plan approval
//
// Prioritization is the PURE, unit-tested `buildActionItems` (@/lib/action-center);
// this file only renders. Both signals come from the existing `useSquadSnapshot`
// (composes /api/agents/dashboard + /api/missions) — no new backend.
//
// NO DUMMY DATA: the card renders NOTHING when nothing is pending (honest calm — it
// never invents an "all caught up" tile that counts work that doesn't exist). Every
// row links to where the user actually resolves it.
//
// Glass recipe (.kiro/steering/glass-theme.md): a feature card with the full texture
// stack `dash-panel dash-grain dash-spotlight dash-interactive` + a `.dash-spotlight-glow`
// child + `useSpotlight()`. The warm `--dash-accent` is reserved for exactly this
// moment — a real decision is waiting. Inset rows use `--dash-card-solid` + `--dash-border`.

import Link from 'next/link'
import { ChevronRight, ClipboardCheck, Inbox, Target } from 'lucide-react'
import { useSpotlight } from '@/lib/use-spotlight'
import { useSquadSnapshot } from '@/lib/use-squad-snapshot'
import { buildActionItems, type ActionItem } from '@/lib/action-center'

const WELL = { background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }

export function ActionCenter() {
  const spotlight = useSpotlight<HTMLElement>()
  const snap = useSquadSnapshot()

  // Honest calm: while loading, or when nothing needs the user, render nothing. The
  // card only appears when there is a real decision waiting.
  if (snap.loading) return null
  const { items, total } = buildActionItems({
    pendingSignOff: snap.pendingSignOff,
    queue: snap.queue,
    missions: snap.missions,
  })
  if (total === 0 || items.length === 0) return null

  return (
    <section
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      className="dash-panel dash-grain dash-spotlight dash-interactive dash-rise group p-4 2xl:p-5"
      aria-label="Action center — items that need you"
      style={{ borderColor: 'var(--dash-border-glow)' }}
    >
      <span className="dash-spotlight-glow" aria-hidden />

      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded-lg"
            style={{ background: 'var(--dash-accent-soft)', color: 'var(--dash-accent)', border: '1px solid var(--dash-border-glow)' }}
          >
            <Inbox className="h-3.5 w-3.5" />
          </span>
          <h2 className="dash-metallic-text text-sm font-semibold tracking-tight 2xl:text-[15px]">
            Needs you
          </h2>
          <span
            className="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold [font-variant-numeric:tabular-nums]"
            style={{ background: 'var(--dash-accent)', color: '#fff' }}
            aria-label={`${total} ${total === 1 ? 'item needs' : 'items need'} your attention`}
          >
            {total}
          </span>
        </div>
      </div>

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id}>
            <ActionRow item={item} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function ActionRow({ item }: { item: ActionItem }) {
  const Icon = item.kind === 'mission-approval' ? Target : ClipboardCheck
  const kindLabel = item.kind === 'mission-approval' ? 'Mission · plan approval' : 'Squad · sign-off'
  return (
    <Link
      href={item.href}
      className="group/row flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 transition hover:border-[var(--dash-border-glow)]"
      style={WELL}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
          style={{ background: 'var(--dash-soft)', color: 'var(--dash-accent)' }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-[var(--dash-text)] group-hover/row:text-[var(--dash-text-strong)]">
            {item.title}
          </span>
          <span className="block text-[10px] font-medium uppercase tracking-wider text-[var(--dash-subtle)]">
            {kindLabel}
          </span>
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--dash-accent)]" />
    </Link>
  )
}
