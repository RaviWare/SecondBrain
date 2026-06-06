// ── Command palette model + matcher (PURE, total, deterministic) ──────────────
// The data + ranking behind the ⌘K command palette. Kept DB-free and UI-free so the
// matcher is unit-testable with plain strings — the component (CommandPalette.tsx)
// only renders what `filterCommands` returns and routes to the chosen command's href.
//
// NO DUMMY DATA: every command points at a REAL in-app route that already exists
// (mirrors the sidebar nav + the dashboard's primary actions). An empty query returns
// the full list in declared order; a query with no match returns an honest empty array
// (the component shows a "no matches" state, never a fabricated result).

/** One navigable command. `href` is a real in-app route; `keywords` widen matching. */
export interface PaletteCommand {
  id: string
  label: string
  href: string
  group: 'Navigate' | 'Create' | 'Squad'
  /** Extra search terms (synonyms / aliases) beyond the label. */
  keywords?: string[]
}

/**
 * The canonical command set. Routes mirror the sidebar nav and the dashboard's primary
 * actions — all already exist in the app. Order here is the default (empty-query) order.
 */
export const COMMANDS: ReadonlyArray<PaletteCommand> = [
  // Create / primary actions first — what people reach for most.
  { id: 'new-source', label: 'Add a source', href: '/app/ingest', group: 'Create', keywords: ['ingest', 'upload', 'import', 'inbox', 'new'] },
  { id: 'ask', label: 'Ask your memory', href: '/app/query', group: 'Create', keywords: ['search', 'query', 'ask', 'ai', 'assistant', 'answer'] },
  { id: 'new-mission', label: 'Start a mission', href: '/app/missions', group: 'Create', keywords: ['mission', 'objective', 'squad', 'orchestrate', 'new'] },

  // Navigate — the in-app destinations (sidebar parity).
  { id: 'nav-dashboard', label: 'Dashboard', href: '/app/dashboard', group: 'Navigate', keywords: ['home', 'overview'] },
  { id: 'nav-search', label: 'Search', href: '/app/query', group: 'Navigate', keywords: ['query', 'find', 'ask'] },
  { id: 'nav-inbox', label: 'Inbox', href: '/app/ingest', group: 'Navigate', keywords: ['ingest', 'add', 'upload', 'sources'] },
  { id: 'nav-sources', label: 'Sources', href: '/app/wiki?view=sources', group: 'Navigate', keywords: ['documents', 'files', 'references'] },
  { id: 'nav-memory', label: 'Memory', href: '/app/wiki', group: 'Navigate', keywords: ['wiki', 'notes', 'vault', 'pages'] },
  { id: 'nav-graph', label: 'Knowledge graph', href: '/app/dashboard#knowledge-graph', group: 'Navigate', keywords: ['graph', 'network', 'connections'] },
  { id: 'nav-topics', label: 'Topics', href: '/app/wiki?type=concept', group: 'Navigate', keywords: ['concepts', 'tags', 'themes'] },
  { id: 'nav-people', label: 'People', href: '/app/wiki?type=entity', group: 'Navigate', keywords: ['entities', 'contacts', 'persons'] },
  { id: 'nav-decisions', label: 'Decisions', href: '/app/wiki?type=synthesis', group: 'Navigate', keywords: ['synthesis', 'conclusions'] },
  { id: 'nav-collections', label: 'Collections', href: '/app/wiki?view=collections', group: 'Navigate', keywords: ['folders', 'groups'] },
  { id: 'nav-integrations', label: 'Integrations', href: '/app/integrations', group: 'Navigate', keywords: ['connect', 'plugins', 'apps'] },
  { id: 'nav-settings', label: 'Settings', href: '/app/settings', group: 'Navigate', keywords: ['preferences', 'account', 'config', 'agent access', 'tokens'] },
  { id: 'nav-docs', label: 'Docs', href: '/app/docs', group: 'Navigate', keywords: ['documentation', 'guide', 'help'] },
  { id: 'nav-help', label: 'Help', href: '/app/help', group: 'Navigate', keywords: ['support', 'faq'] },

  // Squad / missions surfaces.
  { id: 'nav-squad', label: 'Squad', href: '/app/agents', group: 'Squad', keywords: ['agents', 'team', 'roster', 'sign-off', 'aegis'] },
  { id: 'nav-board', label: 'Board', href: '/app/agents/board', group: 'Squad', keywords: ['kanban', 'tasks'] },
  { id: 'nav-skills', label: 'Skills', href: '/app/agents/skills', group: 'Squad', keywords: ['abilities', 'tools', 'grants'] },
  { id: 'nav-cost', label: 'Cost', href: '/app/agents/cost', group: 'Squad', keywords: ['budget', 'spend', 'usage', 'tokens'] },
  { id: 'nav-missions', label: 'Missions', href: '/app/missions', group: 'Squad', keywords: ['objectives', 'orchestrator'] },
]

/** Normalize a string for matching: lowercased, trimmed, whitespace collapsed. */
function norm(s: string): string {
  return (typeof s === 'string' ? s : '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Score a single command against a normalized, non-empty query. Higher is better;
 * 0 means "no match" (the command is dropped). PURE.
 *
 * Ranking (most to least specific):
 *   100  label equals the query exactly
 *    80  label starts with the query
 *    60  a label word starts with the query
 *    40  label contains the query
 *    25  a keyword starts with the query
 *    15  a keyword contains the query
 */
function scoreCommand(cmd: PaletteCommand, q: string): number {
  const label = norm(cmd.label)
  if (label === q) return 100
  if (label.startsWith(q)) return 80
  if (label.split(' ').some((w) => w.startsWith(q))) return 60
  if (label.includes(q)) return 40
  const keywords = Array.isArray(cmd.keywords) ? cmd.keywords.map(norm) : []
  if (keywords.some((k) => k.startsWith(q))) return 25
  if (keywords.some((k) => k.includes(q))) return 15
  return 0
}

/**
 * Filter + rank the command set for a query. PURE / TOTAL.
 *
 * - An empty/whitespace query returns ALL commands in their declared order (a stable
 *   browse list), never reordered.
 * - A non-empty query returns only commands that match (score > 0), ranked by score
 *   descending; ties keep declared order (stable) so results never jitter between
 *   keystrokes for equally-scored items.
 * - `commands` defaults to {@link COMMANDS}; pass a list for testing.
 */
export function filterCommands(
  query: string,
  commands: ReadonlyArray<PaletteCommand> = COMMANDS,
): PaletteCommand[] {
  const list = Array.isArray(commands) ? commands : []
  const q = norm(query)
  if (q.length === 0) return list.slice()

  return list
    .map((cmd, index) => ({ cmd, index, score: scoreCommand(cmd, q) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((e) => e.cmd)
}

/**
 * Group an ordered command list by `group`, preserving each group's first-seen order
 * and each command's order within it. Used by the palette to render section headers.
 * PURE.
 */
export function groupCommands(commands: ReadonlyArray<PaletteCommand>): Array<{ group: PaletteCommand['group']; commands: PaletteCommand[] }> {
  const order: PaletteCommand['group'][] = []
  const byGroup = new Map<PaletteCommand['group'], PaletteCommand[]>()
  for (const cmd of Array.isArray(commands) ? commands : []) {
    if (!byGroup.has(cmd.group)) {
      byGroup.set(cmd.group, [])
      order.push(cmd.group)
    }
    byGroup.get(cmd.group)!.push(cmd)
  }
  return order.map((group) => ({ group, commands: byGroup.get(group)! }))
}
