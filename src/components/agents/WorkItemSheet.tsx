'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Check,
  Loader2,
  MessageSquare,
  Quote,
  RotateCcw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react'
import { accentForColumn } from '@/lib/agents/accent'
import {
  COLUMN_HINT,
  COLUMN_LABEL,
  type WorkItemView,
} from '@/lib/agents/board-view'
import { cn } from '@/lib/utils'
import type { WorkItemDragAction } from './WorkItemCard'

// ── Work_Item side sheet (Req 8.6, 8.7, 8.8) ──────────────────────────────────
// The detail surface that opens when a Work_Item card is selected on the board.
//
// "KEEPS THE BOARD IN CONTEXT" (Req 8.6): this is rendered INLINE — it is a DOM
// descendant of the page's `<main className="sb-dashboard">`, NOT portalled to
// `<body>`. Two consequences, both intentional:
//   1. The board never unmounts. The sheet is a sibling overlay drawn over a
//      semi-transparent scrim, so the pipeline stays visible behind it.
//   2. Because CSS custom properties cascade by DOM ANCESTRY (not visual
//      position — `position: fixed` does not change the cascade), the `--dash-*`
//      tokens resolve here exactly as they do on the board. So this surface uses
//      the SAME `--dash-*` glass recipe as the rest of the in-app pages, per
//      `glass-theme.md`. (Only a portalled overlay rendered at `<body>` would
//      fall outside `.sb-dashboard` and need the ROOT token set instead — we are
//      deliberately NOT doing that, mirroring the dashboard refine/undo overlays.)
//
// MANDATORY "WHY" EVIDENCE BLOCK (Req 8.7): the sheet always renders the "why"
// section — the proposal's rationale plus EVERY citation (quote + a source link:
// a wiki slug → `/app/wiki/[slug]`, or an external url). This reuses the exact
// `WorkItemView` data the board already carries from `toQueueItem` (what · why ·
// citations · isFactual · the three actions), so the gate anatomy matches the
// dashboard rail and Inbox (design.md → Property 16). The block is not hideable.
//
// DISCUSSION THREAD (Req 8.8): the sheet renders the thread shell — an existing
// messages list plus a reply composer. The `Proposal` model carries no thread/
// messages field yet, so the list shows an HONEST empty state ("No discussion
// yet") — never fabricated messages. The reply→`refineProposal` wiring is task
// 5.4; this task leaves a clean `onReply(text)` extension point. When `onReply`
// is not yet wired, the composer renders in a disabled preview state that is
// honest about what posting will do once 5.4 lands.
//
// DECISIONS (Req reuse 3.3 / 8.7): for a Review (Aegis_Gate) Work_Item the sheet
// surfaces the three decisions. Approve / Dismiss reuse the page's `onResolve`
// (the `/api/proposals/[id]` contract shared with the board drag + dashboard
// queue); the page closes the sheet after a resolve. Refine opens the reply
// composer (full refine wiring is 5.4).

export interface WorkItemSheetProps {
  /** The selected Work_Item, or null when the sheet is closed. */
  item: WorkItemView | null
  /** Dismiss the sheet (X / Esc / scrim click). */
  onClose: () => void
  /**
   * Resolve a Review Work_Item via approve/dismiss — reuses the page's
   * `handleResolve` (`/api/proposals/[id]`). Only offered for Review items.
   */
  onResolve?: (item: WorkItemView, action: WorkItemDragAction) => void
  /** True while THIS item's approve/dismiss is in flight (spinner + disabled). */
  resolving?: boolean
  /**
   * EXTENSION POINT for task 5.4 (discussion → refine). Called with the reply
   * text when the user posts in the thread. When omitted, the composer renders
   * in a disabled preview state (this task builds the UI shell only).
   */
  onReply?: (item: WorkItemView, text: string) => void
}

export function WorkItemSheet({ item, onClose, onResolve, resolving = false, onReply }: WorkItemSheetProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  // The reply composer is opened either by the "Refine" decision or the thread's
  // own reply affordance. Kept local so it resets when the sheet item changes.
  const [composerOpen, setComposerOpen] = useState(false)
  const [reply, setReply] = useState('')

  const open = item !== null

  // Esc closes the sheet (Req 8.6 close affordance).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reset the composer whenever a different Work_Item is opened.
  useEffect(() => {
    setComposerOpen(false)
    setReply('')
  }, [item?.id])

  // Move focus into the sheet on open so keyboard users land inside the dialog.
  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  const handlePostReply = useCallback(() => {
    const text = reply.trim()
    if (!text || !item || !onReply) return
    onReply(item, text)
    setReply('')
  }, [reply, item, onReply])

  if (!item) return null

  const isReview = accentForColumn(item.column)
  const canResolve = isReview && item.actions.length > 0 && typeof onResolve === 'function'
  const canReply = typeof onReply === 'function'

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Work item — ${item.what}`}>
      {/* Scrim — click outside to dismiss; semi-transparent so the board stays
          visible behind it (keeps the board in context, Req 8.6). */}
      <button
        type="button"
        aria-label="Close detail"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
        style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(2px)' }}
      />

      {/* Slide-in panel, anchored to the right. Inline (not portalled), so the
          `--dash-*` glass tokens resolve and the glass recipe matches the board. */}
      <aside
        className="dash-panel dash-grain absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col overflow-hidden border-l text-[var(--dash-text)] shadow-[0_0_80px_-12px_rgba(0,0,0,0.7)]"
        style={{
          borderColor: isReview ? 'var(--dash-accent)' : 'var(--dash-border-glow)',
          ...(isReview
            ? { boxShadow: '0 0 0 1px var(--dash-accent) inset, 0 0 90px -20px var(--dash-accent-soft)' }
            : {}),
        }}
      >
        {/* Header — column context + kind + the close affordance. */}
        <header
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--dash-border)' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isReview && (
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--dash-accent)' }} aria-hidden />
              )}
              <p
                className={cn(
                  'mono text-[10px] font-medium uppercase tracking-widest',
                  isReview ? 'text-[var(--dash-accent)]' : 'text-[var(--dash-subtle)]',
                )}
              >
                {COLUMN_LABEL[item.column]}
                {isReview ? ' · Aegis gate' : ` · ${COLUMN_HINT[item.column]}`}
              </p>
            </div>
            <h2 className="mt-1.5 text-[15px] font-semibold leading-snug text-[var(--dash-text-strong)]">
              {item.what}
            </h2>
            <span className="mt-2 inline-block rounded-md border border-[var(--dash-border)] bg-[var(--dash-soft)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--dash-subtle)]">
              {item.kind}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border p-1.5 text-[var(--dash-muted)] transition hover:border-[var(--dash-border-glow)] hover:text-[var(--dash-text)]"
            style={{ background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Scrollable body. */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* ── Mandatory "why" evidence block (Req 8.7) — never hidden ─────── */}
          <section aria-label="Why — evidence">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'var(--dash-accent)' }} />
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--dash-text-strong)]">
                Why
              </h3>
              {item.isFactual && (
                <span className="rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
                  style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)', background: 'var(--dash-accent-soft)' }}>
                  Cited
                </span>
              )}
            </div>

            {/* rationale */}
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--dash-muted)]">
              {item.why.trim()
                ? item.why
                : 'This agent is still working — no rationale recorded yet.'}
            </p>

            {/* citations — the full evidence (ALL, not just the card's first hint) */}
            {item.citations.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {item.citations.map((c, i) => (
                  <li
                    key={`${item.id}-cite-${i}`}
                    className="flex items-start gap-2 rounded-lg px-3 py-2"
                    style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
                  >
                    <Quote className="mt-0.5 h-3 w-3 shrink-0" style={{ color: 'var(--dash-accent)' }} />
                    <div className="min-w-0">
                      <p className="text-[12px] leading-snug text-[var(--dash-muted)]">{c.quote}</p>
                      {(c.slug || c.url) && <CitationLink slug={c.slug} url={c.url} />}
                    </div>
                  </li>
                ))}
              </ul>
            ) : item.isFactual ? (
              <p className="mt-3 text-[11px] text-[var(--dash-subtle)]">
                No citations attached to this item.
              </p>
            ) : null}
          </section>

          {/* ── Decisions (Review / Aegis_Gate items only) ─────────────────── */}
          {canResolve && (
            <section className="mt-6" aria-label="Decision">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--dash-text-strong)]">
                Your decision
              </h3>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {item.actions.includes('approve') && (
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => onResolve!(item, 'approve')}
                    className={cn(
                      'dash-accent-grad inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition',
                      resolving ? 'opacity-60' : 'hover:-translate-y-0.5',
                    )}
                  >
                    {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve
                  </button>
                )}
                {item.actions.includes('refine') && (
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => setComposerOpen((v) => !v)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition',
                      resolving ? 'opacity-60' : 'hover:border-[var(--dash-border-glow)]',
                    )}
                    style={{
                      background: 'var(--dash-card-solid)',
                      borderColor: composerOpen ? 'var(--dash-border-glow)' : 'var(--dash-border)',
                      color: 'var(--dash-muted)',
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Refine
                  </button>
                )}
                {item.actions.includes('dismiss') && (
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => onResolve!(item, 'dismiss')}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition',
                      resolving ? 'opacity-60' : 'hover:border-[var(--dash-border-glow)]',
                    )}
                    style={{
                      background: 'var(--dash-card-solid)',
                      borderColor: 'var(--dash-border)',
                      color: 'var(--dash-muted)',
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Dismiss
                  </button>
                )}
              </div>
            </section>
          )}

          {/* ── Discussion thread (Req 8.8) — UI shell; reply→refine is task 5.4 ─ */}
          <section className="mt-6" aria-label="Discussion">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5" style={{ color: 'var(--dash-muted)' }} />
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--dash-text-strong)]">
                Discussion
              </h3>
            </div>

            {/* Messages list — the Proposal model has no thread field yet, so this
                is honestly empty (no fabricated messages). Task 5.4 wires posting. */}
            <div
              className="mt-2.5 rounded-xl border border-dashed px-3 py-6 text-center"
              style={{ borderColor: 'var(--dash-border)', background: 'var(--dash-card-solid)' }}
            >
              <p className="text-[11px] text-[var(--dash-subtle)]">No discussion yet</p>
              <p className="mt-1 text-[10px] text-[var(--dash-subtle)]">
                Reply to ask {item.kind === 'run' ? 'this agent' : 'the agent'} to refine its proposal.
              </p>
            </div>

            {/* Reply composer — the `onReply` extension point for task 5.4. When
                a handler is wired the composer posts; until then it is an honest,
                disabled preview (this task builds the shell only). */}
            {composerOpen || canReply ? (
              <div className="mt-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  autoFocus={composerOpen}
                  disabled={!canReply}
                  placeholder={canReply ? 'Tell the agent what to change…' : 'Replies refine the proposal (coming soon)'}
                  className="w-full resize-none rounded-lg px-3 py-2 text-[12px] leading-relaxed text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-subtle)] focus:border-[var(--dash-border-glow)] focus:shadow-[0_0_0_3px_var(--dash-accent-soft)] disabled:opacity-60"
                  style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-[var(--dash-subtle)]">
                    {canReply
                      ? 'Your reply asks the agent to refine its proposal.'
                      : 'Posting will ask the agent to refine its proposal.'}
                  </p>
                  <button
                    type="button"
                    disabled={!canReply || reply.trim().length === 0}
                    onClick={handlePostReply}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition',
                      !canReply || reply.trim().length === 0
                        ? 'cursor-not-allowed opacity-50'
                        : 'dash-accent-grad hover:-translate-y-0.5',
                    )}
                    style={
                      !canReply || reply.trim().length === 0
                        ? { background: 'var(--dash-card-solid)', color: 'var(--dash-subtle)', border: '1px solid var(--dash-border)' }
                        : undefined
                    }
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send reply
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition hover:border-[var(--dash-border-glow)]"
                style={{ background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border)', color: 'var(--dash-muted)' }}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Reply
              </button>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}

/**
 * A single citation's source link. A wiki slug links to the page
 * (`/app/wiki/[slug]`); an external url opens in a new tab. Mirrors the dashboard
 * Aegis Queue's `CitationLink` so evidence links read identically everywhere.
 */
function CitationLink({ slug, url }: { slug?: string; url?: string }) {
  if (slug) {
    return (
      <Link
        href={`/app/wiki/${slug}`}
        className="mt-1 inline-block text-[10px] font-medium underline-offset-2 hover:underline"
        style={{ color: 'var(--dash-accent)' }}
      >
        {slug}
      </Link>
    )
  }
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block max-w-full truncate text-[10px] font-medium underline-offset-2 hover:underline"
        style={{ color: 'var(--dash-accent)' }}
      >
        {url}
      </a>
    )
  }
  return null
}
