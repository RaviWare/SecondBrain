'use client'

// ── ToastViewport — the single global toast renderer ──────────────────────────
// Subscribes to the framework-free `toastStore` (@/lib/toast-store) and renders its
// toasts via Radix Toast primitives. Mounted ONCE in the app layout, so any code can
// call `toast(...)` / `toast.success(...)` from anywhere and get a visible, accessible
// confirmation — replacing the silent state changes scattered across the app.
//
// ── GLASS THEME (.kiro/steering/glass-theme.md, RULE #5) ──────────────────────
// Radix Toast portals to <body>, OUTSIDE `.sb-dashboard`, so `--dash-*` tokens don't
// resolve here. This uses ROOT tokens ONLY — solid `--bg-elev-3` panel, `--surface-2`,
// `--border-bright`, `--text-primary`, `--accent`, `--shadow-3` — with an always-opaque
// background. The success tone borrows the warm `--accent` (a real, completed action is
// exactly the moment warmth is earned); errors use a red edge.

import { useSyncExternalStore } from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { Check, Info, TriangleAlert, X } from 'lucide-react'
import { toastStore, type Toast, type ToastTone } from '@/lib/toast-store'

const EMPTY: Toast[] = []

function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => toastStore.subscribe(cb),
    () => toastStore.getToasts(),
    () => EMPTY,
  )
}

const TONE_META: Record<ToastTone, { icon: typeof Check; color: string; edge: string }> = {
  success: { icon: Check, color: 'var(--accent)', edge: 'var(--accent)' },
  error: { icon: TriangleAlert, color: '#f87171', edge: '#ef4444' },
  info: { icon: Info, color: 'var(--text-secondary, var(--text-primary))', edge: 'var(--border-bright)' },
}

export function ToastViewport() {
  const toasts = useToasts()

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} />
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[200] m-0 flex w-[380px] max-w-[calc(100vw-2rem)] list-none flex-col gap-2 p-0 outline-none" />
    </ToastPrimitive.Provider>
  )
}

function ToastRow({ toast: t }: { toast: Toast }) {
  const meta = TONE_META[t.tone] ?? TONE_META.info
  const Icon = meta.icon

  return (
    <ToastPrimitive.Root
      // durationMs 0/negative = sticky → pass Infinity so Radix never auto-closes.
      duration={t.durationMs > 0 ? t.durationMs : Infinity}
      onOpenChange={(open) => {
        if (!open) toastStore.dismiss(t.id)
      }}
      className="sb-toast-root overflow-hidden rounded-xl p-3.5"
      style={{
        background: 'var(--bg-elev-3, #1c1c1f)',
        border: '1px solid var(--border-bright)',
        borderLeft: `3px solid ${meta.edge}`,
        boxShadow: 'var(--shadow-3), 0 18px 44px -16px rgba(0,0,0,0.6)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full"
          style={{ background: 'var(--surface-2)', color: meta.color }}
          aria-hidden
        >
          <Icon className="h-3.5 w-3.5" />
        </span>

        <div className="min-w-0 flex-1">
          <ToastPrimitive.Title className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
            {t.title}
          </ToastPrimitive.Title>
          {t.description && (
            <ToastPrimitive.Description
              className="mt-0.5 text-[12px] leading-snug"
              style={{ color: 'var(--text-secondary, var(--text-primary))' }}
            >
              {t.description}
            </ToastPrimitive.Description>
          )}
        </div>

        {t.action && (
          <ToastPrimitive.Action
            altText={t.action.label}
            onClick={(e) => {
              e.preventDefault()
              t.action?.onAction()
              toastStore.dismiss(t.id)
            }}
            className="shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition hover:opacity-90"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-bright)', color: 'var(--accent)' }}
          >
            {t.action.label}
          </ToastPrimitive.Action>
        )}

        <ToastPrimitive.Close
          aria-label="Dismiss"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md transition hover:opacity-80"
          style={{ color: 'var(--text-secondary, var(--text-primary))' }}
        >
          <X className="h-3.5 w-3.5" />
        </ToastPrimitive.Close>
      </div>
    </ToastPrimitive.Root>
  )
}
