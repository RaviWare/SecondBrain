'use client'

import { useState, type CSSProperties } from 'react'
import { Check, CornerDownRight, GripVertical, Loader2, Quote, X } from 'lucide-react'
import {
  accentForColumn,
  type WorkBoardColumn,
} from '@/lib/agents/accent'
import type { WorkItemView } from '@/lib/agents/board-view'
import { useSpotlight } from '@/lib/use-spotlight'
import { cn } from '@/lib/utils'

/**
 * The drag-and-drop payload MIME used to move a Review Work_Item onto a decision
 * drop zone. Native HTML5 DnD only (no dependency); the column's drop zones read
 * this key back off `dataTransfer`. Exported so `WorkColumn` reads the SAME key.
 */
export const WORK_ITEM_DND_MIME = 'application/x-hermes-work-item'

/**
 * The two drag-resolvable decisions on the Work_Board Review gate. Drag-to-approve
 * maps to the proposals endpoint `{action:'approve'}`; drag-to-dismiss (reject) maps
 * to `{action:'dismiss'}` — the SAME contract the dashboard's Aegis Queue uses.
 */
export type WorkItemDragAction = 'approve' | 'dismiss'

/**
 * One Work_Item card on the Work_Board (Req 8.x). A feature glass card matching
 * the StatCard / AgentCard energy: it carries the full texture stack
 * `dash-panel dash-grain dash-spotlight dash-interactive` plus a
 * `.dash-spotlight-glow` child and `useSpotlight` so the border + glow track the
 * cursor (glass-theme.md recipe).
 *
 * The Review column is the Aegis_Gate: a card in the Review column gets the warm
 * accent treatment; cards in every other column get NO accent. That decision is
 * bound to `accentForColumn` from `accent.ts` — the "accent IFF Review" invariant
 * lives in exactly one place (design.md → Property 17).
 *
 * REVIEW-ONLY DRAG (task 5.2, Req 8.4/8.5): cards are `draggable` IF AND ONLY IF
 * they sit in the Review column (`accentForColumn(column) === true`). Cards in
 * Queued/Reading/Connecting/Woven in render `draggable={false}` and attach NO drag
 * handlers — the gating is driven entirely by `accentForColumn`, so it is asserted
 * in exactly one place and is trivially checkable (the `draggable` attribute is
 * true only on Review cards). Dragging a Review card onto the column's Approve /
 * Dismiss drop zones resolves it; the same decisions are ALSO available as click /
 * keyboard buttons (drag is an addition, never the only path — accessibility).
 *
 * EXTENSION POINTS still open for later Phase-5 tasks (NOT built here):
 *   • `onSelect` — task 5.3 opens the side-sheet detail from this handler.
 *
 * NESTED SUB_AGENT WORK (task 5.4, Req 8.9): when `item.children` is non-empty —
 * i.e. one or more spawned Sub_Agent proposals nested under this Work_Item by
 * `groupWorkBoard` (via a genuine `parentProposalId` linkage) — the card renders
 * them as an indented "spawned sub-agent" sub-card list with a left accent rule.
 * Each nested sub-card is selectable (opens the same side sheet) and, when it sits
 * in Review with a resolver wired, exposes the same approve/dismiss decisions.
 */
export interface WorkItemCardProps {
  item: WorkItemView
  /** The column this card sits in — drives the Review-only accent + drag via accent.ts. */
  column: WorkBoardColumn
  /**
   * Selection handler stub for the side sheet (task 5.3). Optional so the
   * scaffold renders without it; when provided the card becomes clickable.
   */
  onSelect?: (item: WorkItemView) => void
  /**
   * Resolve a Review Work_Item via approve/dismiss (the proposals endpoint). When
   * provided AND the card is in the Review column, the card renders the keyboard /
   * click action buttons (the accessible equivalent of drag). Ignored off Review.
   * Also forwarded to nested Sub_Agent sub-cards so they resolve through the SAME
   * gate as their parent.
   */
  onResolve?: (item: WorkItemView, action: WorkItemDragAction) => void
  /** True while THIS card's decision is in flight — disables its controls + drag. */
  resolving?: boolean
  /**
   * Id of the Work_Item whose decision is currently in flight (board-wide). Used
   * to derive the in-flight state of NESTED Sub_Agent sub-cards (this card's own
   * in-flight state still comes from `resolving`). Optional.
   */
  resolvingId?: string | null
}

export function WorkItemCard({ item, column, onSelect, onResolve, resolving = false, resolvingId = null }: WorkItemCardProps) {
  const spotlight = useSpotlight<HTMLElement>()
  const [dragging, setDragging] = useState(false)

  // Accent + drag decision both come straight from accent.ts (Review column only).
  const isReview = accentForColumn(column)
  // Decisions are offered only at the gate, and only when a resolver is wired.
  const canResolve = isReview && typeof onResolve === 'function'
  // Drag is enabled IFF Review (Req 8.4/8.5); never while a decision is in flight.
  const draggable = isReview && !resolving

  // Warm accent border + glow, applied ONLY in the Review (Aegis_Gate) column.
  const accentStyle: CSSProperties = isReview
    ? {
        borderColor: 'var(--dash-accent)',
        boxShadow: '0 0 0 1px var(--dash-accent) inset, 0 0 34px -8px var(--dash-accent-soft)',
      }
    : {}

  const interactive = typeof onSelect === 'function'

  return (
    <article
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      onClick={interactive ? () => onSelect!(item) : undefined}
      draggable={isReview}
      onDragStart={
        isReview
          ? (e) => {
              // Carry the proposal id so the column drop zones can resolve it.
              e.dataTransfer?.setData(WORK_ITEM_DND_MIME, item.id)
              e.dataTransfer?.setData('text/plain', item.id)
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
              setDragging(true)
            }
          : undefined
      }
      onDragEnd={isReview ? () => setDragging(false) : undefined}
      style={{ ...accentStyle, ...(dragging ? { opacity: 0.55 } : {}) }}
      className={cn(
        'dash-panel dash-grain dash-spotlight dash-interactive group flex flex-col gap-2 p-3.5',
        isReview && 'ring-1 ring-[var(--dash-accent)]/30',
        draggable && 'cursor-grab active:cursor-grabbing',
        interactive && !draggable && 'cursor-pointer text-left',
      )}
      data-column={column}
      data-accent={isReview ? 'review' : undefined}
      data-draggable={isReview ? 'true' : undefined}
    >
      <span className="dash-spotlight-glow" aria-hidden />

      {/* Header: kind tag + (for Review) drag affordance + the sign-off marker. */}
      <div className="flex items-start justify-between gap-2">
        <span className="shrink-0 rounded-md border border-[var(--dash-border)] bg-[var(--dash-soft)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--dash-subtle)]">
          {item.kind}
        </span>
        {isReview && (
          <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-medium" style={{ color: 'var(--dash-accent)' }}>
            <GripVertical className="h-3 w-3 opacity-70" aria-hidden />
            Awaiting sign-off
          </span>
        )}
      </div>

      {/* what — title / current activity */}
      <p className="text-[13px] font-semibold leading-snug text-[var(--dash-text-strong)]">
        {item.what}
      </p>

      {/* why — rationale (when present) */}
      {item.why.trim() && (
        <p className="line-clamp-3 text-[12px] leading-relaxed text-[var(--dash-muted)]">
          {item.why}
        </p>
      )}

      {/* evidence — first citation shown inline as a hint (full block = side sheet) */}
      {item.citations.length > 0 && (
        <div
          className="flex items-start gap-2 rounded-lg px-2.5 py-1.5"
          style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
        >
          <Quote className="mt-0.5 h-3 w-3 shrink-0" style={{ color: 'var(--dash-accent)' }} />
          <p className="line-clamp-2 text-[11px] leading-snug text-[var(--dash-muted)]">
            {item.citations[0].quote}
          </p>
        </div>
      )}

      {/* Decision controls (Review only) — the ACCESSIBLE equivalent of the drag
          gesture: keyboard / click users approve or dismiss without dragging.
          Stops propagation so a click here never triggers the card's onSelect. */}
      {canResolve && (
        <div
          className="mt-0.5 flex flex-wrap items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {item.actions.includes('approve') && (
            <button
              type="button"
              disabled={resolving}
              onClick={() => onResolve!(item, 'approve')}
              className={cn(
                'dash-accent-grad inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white transition',
                resolving ? 'opacity-60' : 'hover:-translate-y-0.5',
              )}
            >
              {resolving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Approve
            </button>
          )}
          {item.actions.includes('dismiss') && (
            <button
              type="button"
              disabled={resolving}
              onClick={() => onResolve!(item, 'dismiss')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition',
                resolving ? 'opacity-60' : 'hover:border-[var(--dash-border-glow)]',
              )}
              style={{
                background: 'var(--dash-card-solid)',
                borderColor: 'var(--dash-border)',
                color: 'var(--dash-muted)',
              }}
            >
              <X className="h-3 w-3" />
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Nested Sub_Agent work (task 5.4, Req 8.9). Spawned Sub_Agent proposals
          carrying a `parentProposalId` matching this item are nested here by
          `groupWorkBoard`. Rendered as an indented sub-card list with a left
          accent rule so the parentage reads at a glance. Clicks here stop
          propagation so opening/resolving a child never triggers the parent. */}
      {item.children.length > 0 && (
        <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--dash-subtle)]">
            <CornerDownRight className="h-3 w-3 opacity-70" aria-hidden />
            {item.children.length === 1 ? 'Spawned sub-agent' : `Spawned sub-agents · ${item.children.length}`}
          </p>
          <div
            className="flex flex-col gap-2 pl-2.5"
            style={{ borderLeft: '2px solid var(--dash-border-glow)' }}
          >
            {item.children.map((child) => (
              <NestedSubAgentItem
                key={child.id}
                item={child}
                onSelect={onSelect}
                onResolve={onResolve}
                resolving={resolvingId === child.id}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

/**
 * A nested Sub_Agent Work_Item rendered under its parent card (Req 8.9). A compact
 * solid sub-card — `--dash-card-solid` well + `--dash-soft` hover wash, NOT the
 * full feature-card texture stack — so it reads as subordinate to the parent while
 * staying inside the glass recipe. When it sits in Review and a resolver is wired
 * it carries the warm-accent left rule + the same approve/dismiss decisions as the
 * parent gate; it is selectable so it opens the same side sheet.
 */
function NestedSubAgentItem({
  item,
  onSelect,
  onResolve,
  resolving = false,
}: {
  item: WorkItemView
  onSelect?: (item: WorkItemView) => void
  onResolve?: (item: WorkItemView, action: WorkItemDragAction) => void
  resolving?: boolean
}) {
  // A nested item's column is carried on the item itself (set by groupWorkBoard).
  const isReview = accentForColumn(item.column)
  const canResolve = isReview && typeof onResolve === 'function'
  const interactive = typeof onSelect === 'function'

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onSelect!(item) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect!(item)
              }
            }
          : undefined
      }
      className={cn(
        'flex flex-col gap-1.5 rounded-lg p-2.5 transition',
        interactive && 'cursor-pointer hover:bg-[var(--dash-soft)]',
      )}
      style={{
        background: 'var(--dash-card-solid)',
        border: '1px solid var(--dash-border)',
        ...(isReview ? { borderLeft: '2px solid var(--dash-accent)' } : {}),
      }}
      data-column={item.column}
      data-accent={isReview ? 'review' : undefined}
      data-nested="true"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 rounded-md border border-[var(--dash-border)] bg-[var(--dash-soft)] px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider text-[var(--dash-subtle)]">
          {item.kind}
        </span>
        {isReview && (
          <span className="text-[9px] font-medium" style={{ color: 'var(--dash-accent)' }}>
            Awaiting sign-off
          </span>
        )}
      </div>

      <p className="text-[12px] font-semibold leading-snug text-[var(--dash-text-strong)]">
        {item.what}
      </p>

      {item.why.trim() && (
        <p className="line-clamp-2 text-[11px] leading-snug text-[var(--dash-muted)]">
          {item.why}
        </p>
      )}

      {canResolve && (
        <div
          className="mt-0.5 flex flex-wrap items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {item.actions.includes('approve') && (
            <button
              type="button"
              disabled={resolving}
              onClick={() => onResolve!(item, 'approve')}
              className={cn(
                'dash-accent-grad inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-white transition',
                resolving ? 'opacity-60' : 'hover:-translate-y-0.5',
              )}
            >
              {resolving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" />}
              Approve
            </button>
          )}
          {item.actions.includes('dismiss') && (
            <button
              type="button"
              disabled={resolving}
              onClick={() => onResolve!(item, 'dismiss')}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition',
                resolving ? 'opacity-60' : 'hover:border-[var(--dash-border-glow)]',
              )}
              style={{
                background: 'var(--dash-card-solid)',
                borderColor: 'var(--dash-border)',
                color: 'var(--dash-muted)',
              }}
            >
              <X className="h-2.5 w-2.5" />
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  )
}
