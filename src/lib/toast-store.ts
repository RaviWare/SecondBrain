// ── Toast store (framework-free, observable, deterministic) ───────────────────
// A tiny pub/sub store behind the global toast system. Kept UI-free and DOM-free so
// the queue logic (add, dedupe-by-id, dismiss, cap, auto-expire bookkeeping) is unit-
// testable with plain calls — the React layer (ToastViewport) just subscribes.
//
// Design: a module-level singleton emitter. Any component can `toast(...)` without
// prop-drilling or wrapping callers in context; the single <ToastViewport/> mounted in
// the app layout renders whatever the store holds. NO fabricated state — the store only
// ever holds toasts that were explicitly enqueued.

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastAction {
  /** Button label, e.g. "Undo". */
  label: string
  /** Invoked when the action button is pressed. The toast is dismissed afterward. */
  onAction: () => void
}

export interface ToastInput {
  /** Stable id; enqueuing the same id again REPLACES the existing toast (no dupes). */
  id?: string
  tone?: ToastTone
  title: string
  /** Optional secondary line. */
  description?: string
  /** Auto-dismiss after this many ms; 0/negative = sticky (no auto-dismiss). */
  durationMs?: number
  /** Optional single action (e.g. Undo). */
  action?: ToastAction
}

export interface Toast extends Required<Pick<ToastInput, 'title'>> {
  id: string
  tone: ToastTone
  title: string
  description?: string
  durationMs: number
  action?: ToastAction
  /** Epoch ms when enqueued (for ordering / debugging). */
  createdAt: number
}

type Listener = (toasts: Toast[]) => void

/** Max simultaneously-visible toasts; older ones are dropped (oldest-first). */
export const MAX_TOASTS = 4
const DEFAULT_DURATION_MS = 5000

let seq = 0
function nextId(): string {
  seq += 1
  return `t_${seq}_${Date.now().toString(36)}`
}

/**
 * The toast store. A single instance is exported as `toastStore`; the imperative
 * `toast()` helper below delegates to it. Exported as a class only so tests can spin up
 * an isolated instance without shared global state.
 */
export class ToastStore {
  private toasts: Toast[] = []
  private listeners = new Set<Listener>()
  private nowFn: () => number

  constructor(nowFn: () => number = () => Date.now()) {
    this.nowFn = nowFn
  }

  /** Current toasts, newest LAST (render order top→bottom is caller's choice). */
  getToasts(): Toast[] {
    return this.toasts.slice()
  }

  /** Subscribe to changes; returns an unsubscribe fn. Fires immediately is NOT done —
   *  the caller reads `getToasts()` for the initial value (React useSyncExternalStore). */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Enqueue (or replace, by id) a toast. Returns the resolved id. Enforces the
   * MAX_TOASTS cap by dropping the OLDEST toasts. PURE bookkeeping — auto-dismiss
   * timers live in the React layer (the store just records `durationMs`).
   */
  add(input: ToastInput): string {
    const id = input.id && input.id.length > 0 ? input.id : nextId()
    const toast: Toast = {
      id,
      tone: input.tone ?? 'info',
      title: input.title,
      description: input.description,
      durationMs:
        typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
          ? input.durationMs
          : DEFAULT_DURATION_MS,
      action: input.action,
      createdAt: this.nowFn(),
    }

    // Replace an existing toast with the same id (no duplicates), else append.
    const existing = this.toasts.findIndex((t) => t.id === id)
    if (existing >= 0) {
      this.toasts = this.toasts.map((t, i) => (i === existing ? toast : t))
    } else {
      this.toasts = [...this.toasts, toast]
    }

    // Cap: keep only the newest MAX_TOASTS (drop oldest first).
    if (this.toasts.length > MAX_TOASTS) {
      this.toasts = this.toasts.slice(this.toasts.length - MAX_TOASTS)
    }

    this.emit()
    return id
  }

  /** Remove a toast by id. No-op if it's already gone. */
  dismiss(id: string): void {
    const next = this.toasts.filter((t) => t.id !== id)
    if (next.length !== this.toasts.length) {
      this.toasts = next
      this.emit()
    }
  }

  /** Remove all toasts. */
  clear(): void {
    if (this.toasts.length > 0) {
      this.toasts = []
      this.emit()
    }
  }

  private emit(): void {
    const snapshot = this.getToasts()
    for (const l of this.listeners) l(snapshot)
  }
}

/** The app-wide singleton store. */
export const toastStore = new ToastStore()

// ── Imperative helpers — call from anywhere ────────────────────────────────────

/** Enqueue a toast; returns its id. */
export function toast(input: ToastInput): string {
  return toastStore.add(input)
}
toast.success = (title: string, opts?: Omit<ToastInput, 'title' | 'tone'>): string =>
  toastStore.add({ ...opts, title, tone: 'success' })
toast.error = (title: string, opts?: Omit<ToastInput, 'title' | 'tone'>): string =>
  toastStore.add({ ...opts, title, tone: 'error' })
toast.info = (title: string, opts?: Omit<ToastInput, 'title' | 'tone'>): string =>
  toastStore.add({ ...opts, title, tone: 'info' })
toast.dismiss = (id: string): void => toastStore.dismiss(id)
