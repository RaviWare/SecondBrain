'use client'

// ── Work Board — the knowledge pipeline (Req 8.1, 8.2, 8.3, 11.7) ─────────────
// A read-only visualization of the squad's pipeline as five columns:
//   Queued → Reading → Connecting → Review → Woven in
// in canonical order. The Review column is the Aegis_Gate (Req 8.2): it holds
// every Work_Item awaiting sign-off and is the ONLY column rendered with the warm
// accent (Req 8.3). The accent decision is bound to `accent.ts` end-to-end
// (`groupWorkBoard` → `accentForColumn`), never hardcoded.
//
// Data is REAL (hard project rule — no fabricated cards): fetched from
// `/api/agents/board` on mount, which groups actual pending/applied `Proposal`
// rows + in-flight `AgentRun` rows by column. Empty columns render an honest
// "Nothing here yet" — never placeholder work.
//
// Glass recipe is mandatory (Req 11.7):
//   • shell    = `sb-dashboard` (paints the aurora + grid backdrop)
//   • columns + cards = `dash-panel dash-grain dash-spotlight dash-interactive`
//   • tokens   = `--dash-*` only; heading uses `.dash-metallic-text`
//
// SCOPE (tasks 5.1–5.4): the five-column board scaffold + glass + accent, Review-
// only approve/reject drag wired to the real proposals endpoint, the side sheet
// (5.3), and the discussion→refine wiring + nested Sub_Agent Work_Items (5.4).
// `groupWorkBoard` nests a Proposal carrying a `parentProposalId` under its
// parent's card; the side sheet's `onReply` posts a refine to the proposals
// endpoint.
//
// DRAG → PROPOSAL ACTION (task 5.2, Req 8.4/8.5): a Review Work_Item can be dragged
// onto an Approve or Reject drop zone (or resolved via its keyboard/click buttons).
// Both paths call `resolve(item, action)`, which POSTs to `/api/proposals/[id]`
// with `{ action }` — drag-to-approve → `{action:'approve'}`, drag-to-reject →
// `{action:'dismiss'}` — the SAME contract the dashboard's Aegis Queue uses. On
// success the board refetches so the resolved item leaves Review.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react'
import { WorkBoard } from '@/components/agents/WorkBoard'
import { WorkItemSheet } from '@/components/agents/WorkItemSheet'
import type { WorkItemDragAction } from '@/components/agents/WorkItemCard'
import type { BoardColumnView, WorkItemView } from '@/lib/agents/board-view'

interface BoardPayload {
  columns: BoardColumnView[]
}

type LoadState = 'loading' | 'error' | 'ready'

export default function WorkBoardPage() {
  const [state, setState] = useState<LoadState>('loading')
  const [columns, setColumns] = useState<BoardColumnView[]>([])
  const [error, setError] = useState('')
  // The Work_Item whose approve/dismiss is currently in flight (disables its UI).
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  // The Work_Item whose side sheet is open (task 5.3). null = sheet closed.
  const [selected, setSelected] = useState<WorkItemView | null>(null)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const res = await fetch('/api/agents/board', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.error || 'Could not load your work board.')
        setState('error')
        return
      }
      setColumns((body as BoardPayload).columns ?? [])
      setState('ready')
    } catch {
      setError('Network error. Please try again.')
      setState('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Opening a Work_Item's side sheet (task 5.3). Tracks the selected item so the
  // inline <WorkItemSheet> overlays the board WITHOUT unmounting it (Req 8.6).
  const handleSelect = useCallback((item: WorkItemView) => {
    setSelected(item)
  }, [])

  // Close the side sheet (X / Esc / scrim click).
  const handleCloseSheet = useCallback(() => {
    setSelected(null)
  }, [])

  // Drag-to-approve / drag-to-reject resolution (task 5.2). Reuses the EXACT
  // proposals-action contract the dashboard's Aegis Queue uses: POST the decision
  // to `/api/proposals/[id]` with `{ action }`. drag-to-approve → 'approve';
  // drag-to-reject → 'dismiss'. On success, refetch so the item leaves Review.
  const handleResolve = useCallback(
    async (item: WorkItemView, action: WorkItemDragAction) => {
      setResolvingId(item.id)
      setActionError('')
      try {
        const res = await fetch(`/api/proposals/${item.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          setActionError(body?.error || 'That action could not be completed.')
          return
        }
        await load() // refetch the board so the resolved item leaves Review
        setSelected(null) // close the side sheet (if open) after a resolve (Req 8.6)
      } catch {
        setActionError('Network error. Please try again.')
      } finally {
        setResolvingId(null)
      }
    },
    [load],
  )

  // Discussion → refine (task 5.4, Req 8.8). When the user posts a reply in a
  // Work_Item's discussion thread, ask the originating Agent to refine its
  // Proposal: POST the SAME `/api/proposals/[id]` contract with
  // `{ action: 'refine', reply }` → `refineProposal` records the reply, marks the
  // ORIGINAL `refined` (so it leaves Review), and spawns a revised `pending` child
  // Proposal (`parentProposalId = original._id`). On success we refetch so the
  // board surfaces the revised child and drops the original from the gate. In-flight
  // + error states mirror `handleResolve` exactly (same spinner id + error banner).
  const handleReply = useCallback(
    async (item: WorkItemView, text: string) => {
      const reply = text.trim()
      if (!reply) return
      setResolvingId(item.id)
      setActionError('')
      try {
        const res = await fetch(`/api/proposals/${item.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'refine', reply }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          setActionError(body?.error || 'That reply could not be sent.')
          return
        }
        await load() // refetch: original leaves Review, the revised child appears
        setSelected(null) // close the sheet — the refined item is no longer pending
      } catch {
        setActionError('Network error. Please try again.')
      } finally {
        setResolvingId(null)
      }
    },
    [load],
  )

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-[1640px] p-4 sm:p-5 lg:p-6 2xl:p-7">
        <Header />
        {actionError && (
          <p
            className="mb-3 flex items-center gap-2 text-[12px]"
            style={{ color: 'var(--dash-accent)' }}
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {actionError}
          </p>
        )}
        {state === 'loading' && <LoadingView />}
        {state === 'error' && <ErrorView message={error} onRetry={load} />}
        {state === 'ready' && (
          <WorkBoard
            columns={columns}
            onSelect={handleSelect}
            onResolve={handleResolve}
            resolvingId={resolvingId}
          />
        )}
      </div>

      {/* Work_Item side sheet (task 5.3, Req 8.6/8.7/8.8). Rendered INLINE inside
          the `.sb-dashboard` shell so the `--dash-*` glass tokens resolve and the
          board stays mounted behind the scrim (keeps the board in context). The
          discussion reply→refine wiring (task 5.4) is `onReply`: posting a reply
          calls `refineProposal` via `/api/proposals/[id]` and refetches the board. */}
      <WorkItemSheet
        item={selected}
        onClose={handleCloseSheet}
        onResolve={handleResolve}
        onReply={handleReply}
        resolving={selected ? resolvingId === selected.id : false}
      />
    </main>
  )
}

function Header() {
  return (
    <header className="dash-rise mb-4 2xl:mb-5" style={{ animationDelay: '0s' }}>
      <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
        Work Board · Knowledge pipeline
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        <span className="dash-metallic-text">Work Board</span>
      </h1>
      <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
        Watch work move toward your brain. Everything pauses at{' '}
        <span className="font-medium text-[var(--dash-accent)]">Review</span> — the Aegis gate —
        until you sign off.
      </p>
    </header>
  )
}

function LoadingView() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-[var(--dash-muted)]">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading your work board…
    </div>
  )
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="dash-panel dash-grain dash-interactive mx-auto mt-8 max-w-md p-6 text-center">
      <AlertCircle className="mx-auto h-6 w-6" style={{ color: 'var(--dash-accent)' }} />
      <p className="mt-3 text-[14px] font-medium text-[var(--dash-text-strong)]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="dash-accent-grad mx-auto mt-4 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-semibold text-white transition hover:-translate-y-0.5"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Try again
      </button>
      <p className="mt-4 text-[11px] text-[var(--dash-subtle)]">
        <Link href="/app/agents" className="underline-offset-2 hover:underline">
          Back to the squad
        </Link>
      </p>
    </div>
  )
}
