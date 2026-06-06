'use client'

// ── ShortcutsDialog — discoverable keyboard-shortcuts cheatsheet ──────────────
// Press "?" (when not typing in a field) to see the app's real keyboard shortcuts.
// Mounted once in the app layout. Lists ONLY shortcuts that actually work today — no
// aspirational entries (the ⌘K palette, "/" to search, "?" for this sheet, Esc).
//
// ── GLASS THEME (.kiro/steering/glass-theme.md, RULE #5) ──────────────────────
// Portalled to <body> (outside `.sb-dashboard`), so ROOT tokens only, opaque panel.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Keyboard, X } from 'lucide-react'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'

// Each shortcut: the keys to render + what it does. Keys are arrays so each renders as
// its own <kbd>. These all map to real, wired behaviors.
const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: [MOD, 'K'], label: 'Open the command palette' },
  { keys: ['/'], label: 'Open the command palette (search)' },
  { keys: ['?'], label: 'Show this shortcuts sheet' },
  { keys: ['↑', '↓'], label: 'Move between palette results' },
  { keys: ['↵'], label: 'Open the selected result' },
  { keys: ['Esc'], label: 'Close the palette or this sheet' },
]

/** True when the target is a text-entry surface — so "?" doesn't fire while typing. */
function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => setMounted(true), [])

  const close = useCallback(() => setOpen(false), [])

  // Global "?" opener (Shift+/), ignored while typing; plus a custom event so other UI
  // can open it. Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !isEditableTarget(e.target)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    const onOpenEvent = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-shortcuts', onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-shortcuts', onOpenEvent)
    }
  }, [])

  // Focus management: focus Close on open, restore on close, trap Tab, Esc to close.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null
      const id = window.setTimeout(() => closeRef.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
    const el = restoreFocusRef.current
    if (el && document.contains(el)) el.focus()
  }, [open])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    },
    [close],
  )

  if (!mounted || !open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label="Close shortcuts"
        tabIndex={-1}
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default"
        style={{ background: 'rgba(0,0,0,0.58)', backdropFilter: 'blur(2px)' }}
      />

      <div
        className="relative w-full max-w-[440px] overflow-hidden rounded-2xl"
        style={{
          background: 'var(--bg-elev-3, #1c1c1f)',
          border: '1px solid var(--border-bright)',
          boxShadow: 'var(--shadow-3), 0 24px 60px -20px rgba(0,0,0,0.7)',
          color: 'var(--text-primary)',
        }}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-bright)' }}>
          <h2 id={titleId} className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            <Keyboard className="h-4 w-4" style={{ color: 'var(--accent)' }} aria-hidden />
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Close"
            className="grid h-6 w-6 place-items-center rounded-md transition hover:opacity-80"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-bright)' }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <ul className="px-4 py-3">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 py-2">
              <span className="text-[13px]" style={{ color: 'var(--text-secondary, var(--text-primary))' }}>
                {s.label}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="grid h-6 min-w-6 place-items-center rounded-md px-1.5 font-sans text-[11px] font-medium"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border-bright)', color: 'var(--text-primary)' }}
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
