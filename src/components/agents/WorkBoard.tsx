'use client'

import type { BoardColumnView, WorkItemView } from '@/lib/agents/board-view'
import { WorkColumn } from './WorkColumn'
import type { WorkItemDragAction } from './WorkItemCard'

/**
 * The Work_Board grid (Req 8.1): renders the five columns
 *   Queued → Reading → Connecting → Review → Woven in
 * in the canonical pipeline order supplied by `groupWorkBoard` (the order is fixed
 * by `WORK_BOARD_COLUMNS` in accent.ts — this component does not re-order). The
 * Review column is the Aegis_Gate and the only accented column; each `WorkColumn`
 * makes that decision via `accent.ts`.
 *
 * Layout: a five-track grid on wide screens that gracefully wraps to fewer tracks
 * on smaller widths so the board never overflows the glass shell.
 *
 * EXTENSION POINT: `onSelect` is forwarded to every column → card so the side
 * sheet (task 5.3) can open from a card click without touching this component.
 *
 * REVIEW-ONLY DRAG (task 5.2): `onResolve` is forwarded to every column, but a
 * column only wires it through to drop zones / card buttons when it is the Review
 * column (the gating lives in `WorkColumn` via `accent.ts`). `resolvingId` marks
 * the single Work_Item whose approve/dismiss is currently in flight.
 */
export interface WorkBoardProps {
  columns: BoardColumnView[]
  onSelect?: (item: WorkItemView) => void
  /** Resolve a Review Work_Item via approve/dismiss (proposals endpoint). */
  onResolve?: (item: WorkItemView, action: WorkItemDragAction) => void
  /** Id of the Work_Item whose decision is currently in flight. */
  resolvingId?: string | null
}

export function WorkBoard({ columns, onSelect, onResolve, resolvingId }: WorkBoardProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:gap-4">
      {columns.map((col) => (
        <WorkColumn
          key={col.column}
          column={col.column}
          items={col.items}
          onSelect={onSelect}
          onResolve={onResolve}
          resolvingId={resolvingId}
        />
      ))}
    </div>
  )
}
