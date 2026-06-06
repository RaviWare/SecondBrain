// ── Action Center deriver (PURE, total, deterministic) ────────────────────────
// Unifies the dashboard's scattered "needs me" signals into ONE prioritized list:
//   • proposals awaiting your sign-off  (the Aegis queue depth + a few item labels)
//   • missions awaiting plan approval   (lifecycle === 'awaiting-plan-approval')
//
// The Action Center component renders only what this returns; this module is DB-free
// and UI-free so the prioritization is unit-testable with plain objects.
//
// NO DUMMY DATA: every item is derived from a REAL pending signal. When nothing is
// pending the result is an EMPTY array and the component renders nothing (the dashboard
// stays calm — no fabricated "all caught up!" badge counting work that doesn't exist).

import type { MissionLite, QueueItemLite } from '@/lib/use-squad-snapshot'

/** A single actionable item the user can resolve, in priority order. */
export interface ActionItem {
  id: string
  /** What kind of decision this is — drives the icon/label in the UI. */
  kind: 'sign-off' | 'mission-approval'
  /** Short human title (already free of internal codenames). */
  title: string
  /** Where resolving it lives. */
  href: string
  /** Lower = more urgent (sorted ascending; stable within a tier). */
  priority: number
}

/** Inputs the deriver reads — a subset of the squad snapshot. */
export interface ActionCenterInput {
  /** How many proposals await sign-off (authoritative count; may exceed `queue`). */
  pendingSignOff: number
  /** A few pending queue items for labels/links (bounded preview from the snapshot). */
  queue: ReadonlyArray<QueueItemLite>
  /** The user's missions; those awaiting plan approval become action items. */
  missions: ReadonlyArray<MissionLite>
}

/** Result: the prioritized items plus the honest total count of things needing the user. */
export interface ActionCenterResult {
  items: ActionItem[]
  /** Total count across all sources (sign-offs + mission approvals). Honest, never faked. */
  total: number
}

// Priority tiers (lower = surfaced first). Mission plan approvals gate a whole squad's
// work, so they edge out individual sign-offs; both are well above anything else.
const PRIORITY_MISSION_APPROVAL = 0
const PRIORITY_SIGN_OFF = 10

/** Coerce to a finite, non-negative integer count; anything invalid → 0 (honest). */
function safeCount(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * Build the prioritized Action Center list from the snapshot signals. PURE / TOTAL.
 *
 * - Missions with `lifecycle === 'awaiting-plan-approval'` each become a top-tier
 *   `mission-approval` item linking to that mission's plan page.
 * - Pending sign-offs become `sign-off` items: one per known queue item (with its
 *   label), and if the authoritative `pendingSignOff` count exceeds the previewed
 *   queue, ONE summary item stands in for the remainder (so the list never claims more
 *   detail than it has, but the total stays honest).
 * - `total` is the real sum (mission approvals + pendingSignOff), independent of how
 *   many preview items exist.
 * - `maxItems` bounds the rendered list (default 5); `total` is unaffected by the cap.
 *
 * Tolerant of malformed input (missing arrays, bad counts) — never throws.
 */
export function buildActionItems(input: ActionCenterInput, maxItems = 5): ActionCenterResult {
  const missions = Array.isArray(input?.missions) ? input.missions : []
  const queue = Array.isArray(input?.queue) ? input.queue : []
  const pendingSignOff = safeCount(input?.pendingSignOff)

  const items: ActionItem[] = []

  // ── Mission plan approvals (top tier) ──
  const awaiting = missions.filter((m) => m && m.lifecycle === 'awaiting-plan-approval')
  for (const m of awaiting) {
    items.push({
      id: `mission-approval:${m._id}`,
      kind: 'mission-approval',
      title: m.objective?.trim() ? m.objective : 'A mission is ready for your review',
      href: `/app/missions/${m._id}/plan`,
      priority: PRIORITY_MISSION_APPROVAL,
    })
  }

  // ── Sign-offs ── one item per known queue entry, then a summary for any overflow.
  const previewable = Math.min(queue.length, pendingSignOff)
  for (let i = 0; i < previewable; i += 1) {
    const q = queue[i]
    const title = q?.title?.trim()
      ? q.title
      : q?.agentName?.trim()
        ? `${q.agentName} needs your sign-off`
        : 'A proposal needs your sign-off'
    items.push({
      id: `sign-off:${q?.id ?? i}`,
      kind: 'sign-off',
      title,
      href: '/app/agents',
      priority: PRIORITY_SIGN_OFF + i,
    })
  }
  const remainder = pendingSignOff - previewable
  if (remainder > 0) {
    items.push({
      id: 'sign-off:more',
      kind: 'sign-off',
      title: `${remainder} more ${remainder === 1 ? 'proposal needs' : 'proposals need'} your sign-off`,
      href: '/app/agents',
      priority: PRIORITY_SIGN_OFF + previewable,
    })
  }

  // Stable sort by priority (ascending). Ties keep insertion order.
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.priority - b.item.priority || a.index - b.index)
    .map((e) => e.item)

  const cap = Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : ordered.length
  const total = awaiting.length + pendingSignOff

  return { items: ordered.slice(0, cap), total }
}
