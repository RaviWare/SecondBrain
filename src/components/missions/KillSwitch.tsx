'use client'

// ── Kill_Switch — pause · resume · abort a Mission (Req 5.10, 5.11, 5.12) ─────
// The user-facing control that pauses or aborts a running Mission across all its
// Agents. It is a thin client over the EXISTING route `/api/missions/[id]/control`
// (`src/app/api/missions/[id]/control/route.ts`), which drives the pure Mission
// lifecycle FSM and nothing else:
//
//   POST { action: 'pause'  }  running        → paused   (Req 5.11, 9.5)
//   POST { action: 'resume' }  paused         → running  (Req 9.6)
//   POST { action: 'abort'  }  running|paused → aborted  (Req 5.12, 9.9)
//
// The route NO-OPS an invalid move (the FSM returns the state unchanged) and reports
// it as a 409 Conflict — this component surfaces that gracefully as an inline message
// rather than a silent failure, and never re-fires a control the FSM could not apply.
//
// WHICH CONTROLS RENDER (Req 5.10): the buttons shown depend entirely on the current
// lifecycle. Pause is offered only while `running`; Resume only while `paused`; Abort
// while `running` or `paused`. Terminal/pre-execution states (`planning`,
// `awaiting-plan-approval`, `completed`, `failed`, `aborted`) expose NOTHING
// actionable — there is no Run to stop, so the control renders an honest disabled note.
//
// ── GLASS THEME (.kiro/steering/glass-theme.md) ───────────────────────────────
// This control lives INSIDE the dashboard shell, so its in-scope buttons use the
// `--dash-*` glass tokens (Resume — the affirmative "go" action — uses the warm
// `.dash-accent-grad`; Pause/Abort use `--dash-card-solid` wells with `--dash-border`).
//
// The ABORT CONFIRMATION is a PORTALLED OVERLAY: `createPortal` mounts it at
// `document.body`, OUTSIDE `.sb-dashboard`. Per glass-theme RULE #5, `--dash-*` custom
// properties DON'T resolve outside the dashboard shell (they cascade by DOM ancestry),
// so a portalled overlay that used them would render transparent — menu/text bleed
// through. The dialog therefore uses ROOT tokens only — solid `--bg-elev-3` panel,
// `--surface-2` wells, `--border-bright` borders, `--text-primary` text, `--accent`,
// `--shadow-3` — and its panel background is ALWAYS OPAQUE.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ban, Loader2, Pause, Play, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast-store'
import type { MissionState } from '@/lib/agents/mission/lifecycle'

// The Kill_Switch actions a user may POST — each maps 1:1 onto a lifecycle FSM event
// of the same name (the route's `CONTROL_ACTIONS`).
type ControlAction = 'pause' | 'resume' | 'abort'

export interface KillSwitchProps {
  /** The Mission whose Run lifecycle this control drives. */
  missionId: string
  /** The Mission's CURRENT lifecycle state — decides which controls are actionable. */
  lifecycle: MissionState
  /**
   * Called after a control action succeeds, so the parent can refresh. Receives the
   * updated Mission document returned by the route. Alias `onChange` is also accepted
   * for callers that only need a "something changed, re-fetch" signal.
   */
  onUpdated?: (mission: Record<string, unknown>) => void
  /** Lightweight alias for {@link onUpdated} — invoked (with no args) on success. */
  onChange?: () => void
  /** Optional extra classes for the control's wrapper. */
  className?: string
}

/** The route's success payload: `{ mission: <the saved doc> }`. */
interface ControlSuccess {
  mission: Record<string, unknown>
}
/** The route's error payload: `{ error, lifecycle? }` (409 carries the live state). */
interface ControlError {
  error: string
  lifecycle?: MissionState
}

/**
 * Kill_Switch control for a single Mission. Renders the pause/resume/abort buttons
 * appropriate to `lifecycle`, POSTs the matching action to the existing control route,
 * and surfaces 409/error responses inline. Abort is guarded by a portalled, accessible
 * confirmation dialog.
 */
export function KillSwitch({ missionId, lifecycle, onUpdated, onChange, className }: KillSwitchProps) {
  // The action currently in flight (disables the row + shows a spinner), or null.
  const [pending, setPending] = useState<ControlAction | null>(null)
  // The last error to surface inline (e.g. a 409 invalid-move, or a network failure).
  const [error, setError] = useState<string | null>(null)
  // Whether the abort confirmation overlay is open.
  const [confirmingAbort, setConfirmingAbort] = useState(false)

  // Which controls are actionable for the current lifecycle (Req 5.10):
  //   running → Pause + Abort   ·   paused → Resume + Abort   ·   else → nothing.
  const canPause = lifecycle === 'running'
  const canResume = lifecycle === 'paused'
  const canAbort = lifecycle === 'running' || lifecycle === 'paused'
  const hasControls = canPause || canResume || canAbort

  // POST one control action and reconcile the result. Never throws — a failure is
  // captured as an inline message so the Kill_Switch always reports honestly.
  const runAction = useCallback(
    async (action: ControlAction) => {
      setPending(action)
      setError(null)
      try {
        const res = await fetch(`/api/missions/${missionId}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })

        if (res.ok) {
          const data = (await res.json()) as ControlSuccess
          // Visible confirmation of the control that just took effect (was silent).
          const verb = action === 'pause' ? 'paused' : action === 'resume' ? 'resumed' : 'aborted'
          toast.success(`Mission ${verb}`, {
            description:
              action === 'abort'
                ? 'No new agent runs will start.'
                : action === 'pause'
                  ? 'Agent runs are held until you resume.'
                  : 'Agent runs continue.',
          })
          onUpdated?.(data.mission)
          onChange?.()
          return
        }

        // Graceful failure handling — the route returns a JSON `{ error }` for 400 /
        // 404 / 500 and a `{ error, lifecycle }` 409 when the move is invalid from the
        // Mission's current state (e.g. pausing a non-running Mission). Surface the
        // server's message; fall back to a status-derived one if the body is unreadable.
        let message = `Could not ${action} the mission (HTTP ${res.status}).`
        try {
          const body = (await res.json()) as ControlError
          if (body?.error) message = body.error
        } catch {
          /* non-JSON body — keep the status-derived message */
        }
        setError(message)
      } catch {
        // Network / offline failure — never log secrets; show a calm, retryable note.
        setError(`Could not reach the server to ${action} the mission. Check your connection and try again.`)
      } finally {
        setPending(null)
      }
    },
    [missionId, onUpdated, onChange],
  )

  // Abort is the one destructive control — confirm before firing it.
  const handleConfirmAbort = useCallback(async () => {
    setConfirmingAbort(false)
    await runAction('abort')
  }, [runAction])

  if (!hasControls) {
    // Honest, non-actionable state for pre-execution + terminal lifecycles. No Run
    // exists to pause/resume/abort, so we show why rather than dead buttons.
    return (
      <div
        className={cn('flex items-center gap-2 text-[12px] text-[var(--dash-subtle)]', className)}
        role="status"
      >
        <span className="mono text-[10px] uppercase tracking-widest">Kill switch</span>
        <span aria-hidden>·</span>
        <span>No running mission to control.</span>
      </div>
    )
  }

  const busy = pending !== null

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {canPause && (
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction('pause')}
            aria-label="Pause mission"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition',
              busy ? 'opacity-60' : 'hover:-translate-y-0.5 hover:border-[var(--dash-border-glow)]',
            )}
            style={{ background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border)', color: 'var(--dash-text)' }}
          >
            {pending === 'pause' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
            Pause
          </button>
        )}

        {canResume && (
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction('resume')}
            aria-label="Resume mission"
            className={cn(
              'dash-accent-grad inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition',
              busy ? 'opacity-60' : 'hover:-translate-y-0.5',
            )}
          >
            {pending === 'resume' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Resume
          </button>
        )}

        {canAbort && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null)
              setConfirmingAbort(true)
            }}
            aria-label="Abort mission"
            aria-haspopup="dialog"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition',
              busy ? 'opacity-60' : 'hover:-translate-y-0.5',
            )}
            style={{
              background: 'var(--dash-card-solid)',
              borderColor: 'color-mix(in srgb, #ef4444 55%, var(--dash-border))',
              color: '#f87171',
            }}
          >
            {pending === 'abort' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            Abort
          </button>
        )}
      </div>

      {/* Inline result message — surfaces a 409 invalid-move or a network failure
          without a disruptive alert. `aria-live` announces it to assistive tech. */}
      {error && (
        <p className="text-[11px] leading-snug text-[#f87171]" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      {/* The destructive abort is gated behind a portalled confirmation overlay. */}
      <AbortConfirmDialog
        open={confirmingAbort}
        pending={pending === 'abort'}
        onCancel={() => setConfirmingAbort(false)}
        onConfirm={handleConfirmAbort}
      />
    </div>
  )
}

// ── Abort confirmation — a PORTALLED overlay (glass-theme RULE #5) ─────────────
// Rendered at `document.body` via `createPortal`, so it sits OUTSIDE `.sb-dashboard`.
// Because CSS custom properties cascade by DOM ancestry, `--dash-*` tokens do NOT
// resolve here — using them would render a transparent, bleed-through dialog. So this
// overlay uses ROOT tokens ONLY, and its panel background is ALWAYS OPAQUE.
interface AbortConfirmDialogProps {
  open: boolean
  /** True while the confirmed abort POST is in flight. */
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}

function AbortConfirmDialog({ open, pending, onCancel, onConfirm }: AbortConfirmDialogProps) {
  // `createPortal` needs `document`, which is absent during SSR. Gate on a mounted
  // flag so the portal is only created on the client.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const titleId = useId()
  const descId = useId()
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Move focus into the dialog on open (land on Cancel — the safe default for a
  // destructive action) and keep keyboard focus trapped between the two buttons.
  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!pending) onCancel()
        return
      }
      if (e.key === 'Tab') {
        // Two focusable controls — cycle between Cancel and Confirm so focus never
        // escapes the modal.
        const focusables = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[]
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, pending, onCancel])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      {/* Scrim — a dimmer behind the panel; clicking it cancels. The scrim may be
          translucent, but the PANEL below is opaque (glass-theme RULE #5). */}
      <button
        type="button"
        aria-label="Cancel abort"
        tabIndex={-1}
        onClick={() => !pending && onCancel()}
        className="absolute inset-0 h-full w-full cursor-default"
        style={{ background: 'rgba(0, 0, 0, 0.62)', backdropFilter: 'blur(2px)' }}
      />

      {/* The dialog panel — ROOT tokens only, ALWAYS-OPAQUE background. */}
      <div
        ref={panelRef}
        className="relative w-full max-w-[400px] overflow-hidden rounded-2xl p-5"
        style={{
          // Opaque solid background — no alpha, so nothing bleeds through.
          background: 'var(--bg-elev-3, #1c1c1f)',
          border: '1px solid var(--border-bright)',
          boxShadow: 'var(--shadow-3), 0 24px 60px -20px rgba(0, 0, 0, 0.7)',
          color: 'var(--text-primary)',
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-bright)' }}
            aria-hidden
          >
            <TriangleAlert className="h-4.5 w-4.5" style={{ color: '#f87171' }} />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
              Abort this mission?
            </h2>
            <p id={descId} className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-secondary, var(--text-primary))' }}>
              Aborting stops the mission from starting any new agent runs and moves it to a
              terminal state. Runs already in flight finish reporting and carry over — but the
              mission cannot be resumed. This cannot be undone.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={onCancel}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition',
              pending ? 'opacity-60' : 'hover:opacity-90',
            )}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-bright)',
              color: 'var(--text-primary)',
            }}
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition',
              pending ? 'opacity-70' : 'hover:opacity-95',
            )}
            style={{ background: '#dc2626', border: '1px solid #ef4444' }}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            Abort mission
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
