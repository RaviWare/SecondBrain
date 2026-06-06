// ── Command palette recents (PURE list ops + thin localStorage adapter) ───────
// Tracks the command ids the user has recently run in the ⌘K palette so they can be
// surfaced at the top for faster repeat-jumps. The LIST logic is pure + unit-tested;
// the storage read/write is a tiny guarded adapter (no-ops when localStorage is absent,
// e.g. SSR or a privacy-locked browser).
//
// NO DUMMY DATA: recents are ONLY ids the user actually selected. An empty/corrupt
// store yields an empty list — never a seeded or fabricated "recent".

const STORAGE_KEY = 'sb:cmd:recents'
/** How many recent command ids to retain (MRU, most-recent-first). */
export const MAX_RECENTS = 5

/**
 * Push `id` to the front of the recents list (most-recent-first), de-duplicating so a
 * repeated command moves up rather than appearing twice, and capping at `max`. PURE.
 */
export function pushRecent(list: ReadonlyArray<string>, id: string, max = MAX_RECENTS): string[] {
  const clean = typeof id === 'string' ? id.trim() : ''
  const base = Array.isArray(list) ? list.filter((x) => typeof x === 'string' && x.length > 0) : []
  if (clean.length === 0) return base.slice(0, max)
  const deduped = [clean, ...base.filter((x) => x !== clean)]
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : deduped.length
  return deduped.slice(0, cap)
}

/**
 * Resolve a recents id list to actual items from a lookup, dropping any id that no
 * longer maps to a known item (e.g. a command that was removed). PURE / TOTAL — order
 * follows the recents list (most-recent-first).
 */
export function resolveRecents<T>(ids: ReadonlyArray<string>, byId: (id: string) => T | undefined): T[] {
  const out: T[] = []
  for (const id of Array.isArray(ids) ? ids : []) {
    const item = byId(id)
    if (item !== undefined) out.push(item)
  }
  return out
}

// ── localStorage adapter (guarded; safe on SSR / disabled storage) ──────────────

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

/** Read the persisted recents id list. Returns [] on absence/parse error (honest). */
export function loadRecents(): string[] {
  const store = safeStorage()
  if (!store) return []
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x) => typeof x === 'string' && x.length > 0).slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

/** Persist the recents id list (best-effort; silently no-ops if storage is unavailable). */
export function saveRecents(ids: ReadonlyArray<string>): void {
  const store = safeStorage()
  if (!store) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(ids) ? ids.slice(0, MAX_RECENTS) : []))
  } catch {
    /* quota / privacy mode — recents are a nicety, never critical */
  }
}
