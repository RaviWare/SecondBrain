'use client'

import { useState, type DragEvent } from 'react'
import { Check, X } from 'lucide-react'
import {
  accentForColumn,
  type WorkBoardColumn,
} from '@/lib/agents/accent'
import {
  COLUMN_HINT,
  COLUMN_LABEL,
  type WorkItemView,
} from '@/lib/agents/board-view'
import { useSpotlight } from '@/lib/use-spotlight'
import { cn } from '@/lib/utils'
import {
  WorkItemCard,
  WORK_ITEM_DND_MIME,
  type WorkItemDragAction,
} from './WorkItemCard'

/**
 * One Work_Board column (Req 8.1). A glass panel carrying the mandatory texture
 * stack `dash-panel dash-grain dash-interactive` (+ `dash-spotlight` so the column
 * frame feels alive, matching the dashboard energy). It hosts its Work_Items as
 * feature cards.
 *
 * The Review column is the Aegis_Gate (Req 8.2): it is the only column that gets
 * the warm accent — its header marker and frame ring bind the accent token, and
 * its cards receive the accent via `WorkItemCard`. That decision comes from
 * `accentForColumn` (accent.ts), never hardcoded here (design.md → Property 17).
 *
 * REVIEW-ONLY DRAG (task 5.2, Req 8.4/8.5): the Review column — and ONLY the
 * Review column — renders two decision DROP ZONES (Approve / Dismiss) and is the
 * only column wired with `onDragOver` / `onDrop` handlers. Drag-to-approve resolves
 * the dropped Work_Item via `{action:'approve'}`; drag-to-dismiss (reject) via
 * `{action:'dismiss'}` — the same proposals-endpoint contract the dashboard's Aegis
 * Queue uses. The other four columns are NOT drop targets and their cards are not
 * draggable (the gating flows from `accentForColumn`, so "drag restricted to
 * Review" is asserted in exactly one place). The drop zones are an ADDITION: each
 * Review card also exposes click / keyboard Approve & Dismiss buttons.
 *
 * EXTENSION POINTS (left for later Phase-5 tasks, NOT built here):
 *   • `onSelect` is forwarded to each card so task 5.3 can open the side sheet.
 *   • The column body is a plain vertical stack that can host nested items (5.4).
 */
export interface WorkColumnProps {
  column: WorkBoardColumn
  items: WorkItemView[]
  /** Selection handler forwarded to cards for the side sheet (task 5.3). */
  onSelect?: (item: WorkItemView) => void
  /**
   * Resolve a Review Work_Item (approve/dismiss) — wired to the proposals endpoint
   * by the page. Drives BOTH the drop zones and each Review card's action buttons.
   * Only ever invoked for the Review column.
   */
  onResolve?: (item: WorkItemView, action: WorkItemDragAction) => void
  /** Id of the Work_Item whose decision is currently in flight (disables its UI). */
  resolvingId?: string | null
}

export function WorkColumn({ column, items, onSelect, onResolve, resolvingId }: WorkColumnProps) {
  const spotlight = useSpotlight<HTMLElement>()

  // Review-only accent + drop-target decision from accent.ts (single source).
  const isReview = accentForColumn(column)
  const canResolve = isReview && typeof onResolve === 'function'

  return (
    <section
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      className={cn(
        'dash-panel dash-grain dash-spotlight dash-interactive flex min-h-[16rem] flex-col gap-3 p-3.5',
        isReview && 'ring-1 ring-[var(--dash-accent)]/30',
      )}
      data-column={column}
      data-accent={isReview ? 'review' : undefined}
      style={
        isReview ? { borderColor: 'var(--dash-border-glow)' } : undefined
      }
      aria-label={`${COLUMN_LABEL[column]} column`}
    >
      <span className="dash-spotlight-glow" aria-hidden />

      {/* Column header — label + count + (Review) the gate marker. */}
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isReview && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: 'var(--dash-accent)' }}
                aria-hidden
              />
            )}
            <h2
              className={cn(
                'text-[13px] font-semibold tracking-tight',
                isReview ? 'text-[var(--dash-accent)]' : 'dash-metallic-text',
              )}
            >
              {COLUMN_LABEL[column]}
            </h2>
          </div>
          <p className="mt-0.5 text-[10px] font-medium text-[var(--dash-subtle)]">
            {isReview ? 'Aegis gate · awaiting your sign-off' : COLUMN_HINT[column]}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold [font-variant-numeric:tabular-nums]"
          style={
            isReview && items.length > 0
              ? {
                  color: 'var(--dash-accent)',
                  borderColor: 'var(--dash-border-glow)',
                  background: 'var(--dash-accent-soft)',
                }
              : { color: 'var(--dash-subtle)', borderColor: 'var(--dash-border)' }
          }
        >
          {items.length}
        </span>
      </header>

      {/* Drag-to-decide zones — Review column ONLY, and only when there is at least
          one item to act on. Drag a card here to approve/dismiss it; keyboard/click
          users use the buttons on each card instead. */}
      {canResolve && items.length > 0 && (
        <DecisionDropZones items={items} onResolve={onResolve!} />
      )}

      {/* Items — honest empty state when the column has no real backing rows. */}
      {items.length === 0 ? (
        <div
          className="mt-1 flex flex-1 items-center justify-center rounded-xl border border-dashed px-3 py-8 text-center"
          style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }}
        >
          <p className="text-[11px] text-[var(--dash-subtle)]">Nothing here yet</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2.5">
          {items.map((item) => (
            <WorkItemCard
              key={item.id}
              item={item}
              column={column}
              onSelect={onSelect}
              // Forward the resolver unconditionally: each card (and each nested
              // Sub_Agent sub-card) gates its OWN approve/dismiss buttons by its
              // own column via `accentForColumn`, so a non-Review parent shows no
              // buttons while a nested Review child can still resolve (Req 8.9).
              onResolve={onResolve}
              resolving={resolvingId === item.id}
              resolvingId={resolvingId}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * The two drag-decision drop zones for the Review (Aegis_Gate) column. Drop a
 * dragged Work_Item on "Approve" → `{action:'approve'}`; on "Reject / Dismiss" →
 * `{action:'dismiss'}`. Uses the native HTML5 DnD API only. The active target lifts
 * with `--dash-accent` / `--dash-accent-soft`; the resting state uses neutral
 * `--dash-*` tokens so the glass texture is never regressed.
 */
function DecisionDropZones({
  items,
  onResolve,
}: {
  items: WorkItemView[]
  onResolve: (item: WorkItemView, action: WorkItemDragAction) => void
}) {
  const resolveDropped = (e: DragEvent<HTMLDivElement>, action: WorkItemDragAction) => {
    e.preventDefault()
    const id = e.dataTransfer?.getData(WORK_ITEM_DND_MIME) || e.dataTransfer?.getData('text/plain')
    if (!id) return
    const item = items.find((it) => it.id === id)
    if (item) onResolve(item, action)
  }

  return (
    <div className="grid grid-cols-2 gap-2" aria-hidden data-review-dropzones="true">
      <DropZone label="Approve" tone="approve" Icon={Check} onDropItem={(e) => resolveDropped(e, 'approve')} />
      <DropZone label="Reject" tone="dismiss" Icon={X} onDropItem={(e) => resolveDropped(e, 'dismiss')} />
    </div>
  )
}

function DropZone({
  label,
  tone,
  Icon,
  onDropItem,
}: {
  label: string
  tone: WorkItemDragAction
  Icon: typeof Check
  onDropItem: (e: DragEvent<HTMLDivElement>) => void
}) {
  const [over, setOver] = useState(false)
  const approve = tone === 'approve'

  return (
    <div
      data-dropzone={tone}
      onDragOver={(e) => {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        if (!over) setOver(true)
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        onDropItem(e)
      }}
      className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed px-2.5 py-2.5 text-[11px] font-semibold transition"
      style={
        over
          ? {
              borderColor: 'var(--dash-accent)',
              background: 'var(--dash-accent-soft)',
              color: 'var(--dash-accent)',
            }
          : {
              borderColor: approve ? 'var(--dash-border-glow)' : 'var(--dash-border)',
              background: 'var(--dash-card-solid)',
              color: 'var(--dash-muted)',
            }
      }
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </div>
  )
}
