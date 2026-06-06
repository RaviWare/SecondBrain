'use client'

// ── ⌘K Command Palette ────────────────────────────────────────────────────────
// Makes the dashboard header's previously-decorative "⌘K" badge REAL: a global
// keyboard shortcut (⌘K on macOS, Ctrl+K elsewhere, or "/") opens a searchable
// command launcher that routes to any in-app destination. The command set + ranking
// live in the pure, unit-tested `@/lib/command-palette`; this file is only the overlay
// + keyboard wiring.
//
// NO DUMMY DATA: every command is a real route that already exists. An empty query
// browses the full list; a non-matching query shows an honest "No matches" state.
//
// ── GLASS THEME (.kiro/steering/glass-theme.md, RULE #5) ──────────────────────
// This is a PORTALLED overlay mounted at `document.body`, OUTSIDE `.sb-dashboard`, so
// `--dash-*` tokens do NOT cascade here (they resolve by DOM ancestry). It therefore
// uses ROOT tokens ONLY — solid `--bg-elev-3` panel, `--surface-2` wells,
// `--border-bright` borders, `--text-primary`, `--accent`, `--shadow-3` — and the panel
// background is ALWAYS OPAQUE so nothing bleeds through.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { CornerDownLeft, Search, X } from 'lucide-react'
import { COMMANDS, filterCommands, groupCommands, type PaletteCommand } from '@/lib/command-palette'

/** True when the keydown is the palette-open chord (⌘K / Ctrl+K). */
function isOpenChord(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
}

/** True when the target is a text-entry surface — so "/" doesn't hijack typing. */
function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [mounted, setMounted] = useState(false)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()

  useEffect(() => setMounted(true), [])

  // The ordered, flat result list (what arrow keys traverse) + the grouped view (what
  // we render). Both derive from the same pure matcher, so they never disagree.
  const results = useMemo(() => filterCommands(query, COMMANDS), [query])
  const grouped = useMemo(() => groupCommands(results), [results])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }, [])

  const run = useCallback(
    (cmd: PaletteCommand | undefined) => {
      if (!cmd) return
      close()
      router.push(cmd.href)
    },
    [close, router],
  )

  // Global open chord (⌘K / Ctrl+K, or "/" when not typing in a field), plus a custom
  // `open-command-palette` event so the header's ⌘K badge can open it on click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isOpenChord(e)) {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }
      if (e.key === '/' && !open && !isEditableTarget(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    const onOpenEvent = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-command-palette', onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-command-palette', onOpenEvent)
    }
  }, [open])

  // On open: focus the input. Reset the active row whenever the result set changes.
  useEffect(() => {
    if (open) {
      // Defer so the input exists in the DOM before focusing.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Keep the active row scrolled into view as the user arrows through.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  // In-dialog keyboard handling: arrows move, Enter runs, Escape closes, focus trapped
  // on the single input.
  const onDialogKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (results.length === 0 ? 0 : (i - 1 + results.length) % results.length))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        run(results[activeIndex])
      }
    },
    [results, activeIndex, run, close],
  )

  if (!mounted || !open) return null

  // A flat index so grouped rendering can still map onto the linear arrow-key order.
  let flatIndex = -1

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onDialogKey}
    >
      {/* Scrim — translucent dimmer; click cancels. Panel below is opaque. */}
      <button
        type="button"
        aria-label="Close command palette"
        tabIndex={-1}
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default"
        style={{ background: 'rgba(0,0,0,0.58)', backdropFilter: 'blur(2px)' }}
      />

      <div
        className="relative w-full max-w-[560px] overflow-hidden rounded-2xl"
        style={{
          background: 'var(--bg-elev-3, #1c1c1f)',
          border: '1px solid var(--border-bright)',
          boxShadow: 'var(--shadow-3), 0 24px 60px -20px rgba(0,0,0,0.7)',
          color: 'var(--text-primary)',
        }}
      >
        <h2 id={titleId} className="sr-only">
          Command palette
        </h2>

        {/* Search row */}
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-bright)' }}
        >
          <Search className="h-[18px] w-[18px] shrink-0" style={{ color: 'var(--text-secondary, var(--text-primary))' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands and pages..."
            className="h-7 w-full bg-transparent text-[14px] outline-none placeholder:opacity-60"
            style={{ color: 'var(--text-primary)' }}
            aria-label="Search commands and pages"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md transition hover:opacity-80"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-bright)' }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--text-secondary, var(--text-primary))' }}>
              No matches for “{query.trim()}”.
            </p>
          ) : (
            grouped.map((section) => (
              <div key={section.group} className="px-2 pb-1.5">
                <p
                  className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--text-secondary, var(--text-primary))', opacity: 0.7 }}
                >
                  {section.group}
                </p>
                {section.commands.map((cmd) => {
                  flatIndex += 1
                  const index = flatIndex
                  const active = index === activeIndex
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      data-cmd-index={index}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => run(cmd)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] transition"
                      style={{
                        background: active ? 'var(--surface-2)' : 'transparent',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span className="truncate">{cmd.label}</span>
                      {active && (
                        <CornerDownLeft
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: 'var(--accent)' }}
                          aria-hidden
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div
          className="flex items-center gap-3 px-4 py-2 text-[11px]"
          style={{ borderTop: '1px solid var(--border-bright)', color: 'var(--text-secondary, var(--text-primary))' }}
        >
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            to navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd>
            to open
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>esc</Kbd>
            to close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="grid h-4 min-w-4 place-items-center rounded px-1 font-sans text-[10px] font-medium"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border-bright)', color: 'var(--text-primary)' }}
    >
      {children}
    </kbd>
  )
}
