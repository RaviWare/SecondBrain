/**
 * Pure navigation helpers for the sidebar — extracted so the single-active-item
 * law is unit/property testable independent of React.
 *
 * The old `isActiveNav` bucketed items by pathname alone, so the six items that
 * all point at `/app/wiki` (Sources, Memory, Topics, People, Decisions,
 * Collections) and the two that point at `/app/query` (Search, AI Assistant)
 * ALL lit up at once — the "multiple orange pills" bug. `resolveActiveIndex`
 * fixes that by choosing EXACTLY ONE winner.
 */

export interface NavMatch {
  href: string
  label: string
}

/**
 * Returns the index of the single best-matching nav item for the current
 * location, or `null` if none matches. Exactly-one-winner by construction:
 *
 *  - the item's href pathname must equal the current pathname;
 *  - every query param the item declares must equal the current URL's value
 *    for that param (an item that requires `type=concept` only matches when the
 *    URL actually carries `type=concept`);
 *  - among eligible items the MOST SPECIFIC one wins (the one matching the most
 *    query params), so `/app/wiki?type=concept` selects Topics over the bare
 *    Memory item;
 *  - ties (equal specificity — e.g. two items sharing an identical href) resolve
 *    to the FIRST in list order, never both.
 *
 * Any `#hash` on the href is ignored (pathname/query only).
 */
export function resolveActiveIndex(
  pathname: string,
  search: string | URLSearchParams,
  items: ReadonlyArray<NavMatch>,
): number | null {
  const current = typeof search === 'string' ? new URLSearchParams(search) : search
  let bestIdx: number | null = null
  let bestScore = -1

  items.forEach((item, idx) => {
    const hrefNoHash = item.href.split('#')[0]
    const [itemPath, itemQuery = ''] = hrefNoHash.split('?')
    if (itemPath !== pathname) return

    const itemParams = new URLSearchParams(itemQuery)
    let specificity = 0
    for (const [key, value] of itemParams) {
      if (current.get(key) !== value) return // item requires a param the URL lacks
      specificity++
    }

    // Strictly greater → first item at the top specificity wins (no ties).
    if (specificity > bestScore) {
      bestScore = specificity
      bestIdx = idx
    }
  })

  return bestIdx
}

/**
 * Inbox unread badge text. Honest by construction:
 *  - 0 / negative / non-finite → `null` (render no badge);
 *  - greater than 99 → `"99+"`;
 *  - otherwise the decimal count.
 */
export function formatBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null
  if (count > 99) return '99+'
  return String(count)
}
