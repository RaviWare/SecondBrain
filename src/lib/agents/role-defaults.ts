// ── Agent_Role defaults + Trust_Scope_Statement generator ─────────────────────
// Pure, total, deterministic config helpers for the Conversational Builder
// (Phase 4). Two responsibilities, both backing Property 21 ("Role defaults are
// conservative and scope statements deny by name", design.md → Requirements
// 1.2, 1.3, 1.8):
//
//   1. `roleDefaults(role)` — maps every Agent_Role to a WELL-FORMED default
//      skill set (each id resolves in the curated `catalog.ts`) plus a
//      CONSERVATIVE default `signOffPolicy`: every knowledge-write action
//      (ingestSource / createSynthesis / createConnection) defaults to `'ask'`
//      (ask-first for writes to knowledge structure — Req 1.3, glossary
//      Sign_Off_Policy). `custom` gets a safe minimal default (no skills granted
//      until the user picks).
//
//   2. `trustScopeStatement(scope)` — generates the plain-language permission
//      statement: a list of GRANTED capabilities derived from the actual
//      Trust_Scope, plus a NON-EMPTY explicit "cannot" list (Req 1.8). The
//      "cannot" list ALWAYS carries the core denials (propose-never-write, no
//      delete, no self-escalation, no third-party sharing) regardless of scope,
//      so it is never empty, and appends scope-derived denials (no web when
//      `webAccess` is false, no out-of-scope reads when restricted).
//
// No I/O, never throws — an unknown role or a malformed scope returns the safe
// (most conservative) default. Matches the existing `accent.ts` / `scope.ts`
// style: structural input types, no Mongoose import.

import { getSkill } from '@/lib/skills/catalog'
import type { TrustScope } from '@/lib/agents/scope'

// ── Canonical Agent_Role + Sign_Off_Policy types (verbatim from the model) ────
// Mirror the exact unions/field names on `IAgent` in `src/lib/models.ts` without
// importing the Mongoose model (keeps this module pure / DB-free), mirroring how
// `aegis/classify.ts` types `signOffPolicy` structurally.

/** Agent archetype — verbatim from `IAgent.role` (Req 1.2). */
export type AgentRole =
  | 'scout'
  | 'synthesist'
  | 'connector'
  | 'critic'
  | 'librarian'
  | 'researcher'
  | 'custom'

/** Every Agent_Role, for exhaustive iteration (e.g. the property test, builder UI). */
export const AGENT_ROLES: readonly AgentRole[] = [
  'scout',
  'synthesist',
  'connector',
  'critic',
  'librarian',
  'researcher',
  'custom',
] as const

/** Per-action sign-off setting — verbatim from `IAgent.signOffPolicy`. */
export interface SignOffPolicy {
  ingestSource: 'auto' | 'ask'
  createSynthesis: 'auto' | 'ask'
  createConnection: 'auto' | 'ask'
  flagContradiction: 'auto' | 'ask' | 'notify'
}

/** The knowledge-write actions a Sign_Off_Policy governs (Property 21 subject). */
export const KNOWLEDGE_WRITE_ACTIONS = [
  'ingestSource',
  'createSynthesis',
  'createConnection',
] as const satisfies readonly (keyof SignOffPolicy)[]

/** What `roleDefaults` returns: a well-formed skill set + a conservative policy. */
export interface RoleDefaults {
  /** Default assigned Skill ids — every id resolves via `getSkill` (well-formed). */
  skillIds: string[]
  /** Conservative default: every knowledge-write action = `'ask'`. */
  signOffPolicy: SignOffPolicy
}

// ── Conservative Sign_Off_Policy (Req 1.3) ────────────────────────────────────
// Every knowledge-STRUCTURE write asks first. `flagContradiction` is NOT a
// knowledge-write (it surfaces a contradiction, it doesn't mutate the vault), so
// its conservative default is `'notify'` — alert the user without auto-acting,
// matching the model's schema default. A fresh copy is returned per call so a
// caller mutating the result never poisons the shared default.
function conservativeSignOffPolicy(): SignOffPolicy {
  return {
    ingestSource: 'ask',
    createSynthesis: 'ask',
    createConnection: 'ask',
    flagContradiction: 'notify',
  }
}

// ── Role → suggested skill preset (real catalog ids only) ─────────────────────
// Each id below is a REAL skill in `src/lib/skills/catalog.ts`. `roleDefaults`
// additionally filters through `getSkill`, so even if the catalog changes the
// returned set stays well-formed (it can shrink, never reference a missing id).
//
//   scout       → gathers fresh material across the vault AND the web → Research Analyst
//   synthesist  → produces cited syntheses + grounded drafts          → Research Analyst, Content Engine
//   connector   → finds relationships across the vault                → Research Analyst
//   critic      → flags risks, contradictions, stale claims           → Ops Monitor
//   librarian   → organizes / triages, files what can be filed        → Inbox Triage
//   researcher  → deep research with gap analysis                     → Research Analyst
//   custom      → safe minimal default (no skills until the user picks) → []
const ROLE_SKILL_PRESET: Record<AgentRole, readonly string[]> = {
  scout: ['research-analyst'],
  synthesist: ['research-analyst', 'content-engine'],
  connector: ['research-analyst'],
  critic: ['ops-monitor'],
  librarian: ['inbox-triage'],
  researcher: ['research-analyst'],
  custom: [],
}

/**
 * Defaults for a freshly-assigned Agent_Role (Req 1.2, 1.3).
 *
 * Returns a WELL-FORMED default skill set (every id resolves via `getSkill`) and
 * a CONSERVATIVE `signOffPolicy` where every knowledge-write action is `'ask'`.
 * TOTAL: an unknown/garbage role falls back to the `custom` (empty) preset and
 * the same conservative policy. PURE / DETERMINISTIC — never throws, no I/O.
 */
export function roleDefaults(role: AgentRole): RoleDefaults {
  // Own-property guard: `ROLE_SKILL_PRESET` is a plain object, so indexing it with
  // a garbage role that collides with an Object.prototype member (e.g. 'valueOf',
  // 'toString', 'constructor') would return the INHERITED function rather than
  // undefined, and the `?? custom` fallback would never fire. Restricting the
  // lookup to OWN keys keeps the function TOTAL: any unknown/garbage role falls
  // back to the `custom` (empty) preset and never throws (Req 1.2 totality).
  const preset = Object.prototype.hasOwnProperty.call(ROLE_SKILL_PRESET, role)
    ? ROLE_SKILL_PRESET[role]
    : ROLE_SKILL_PRESET.custom
  // Well-formedness guard: keep only ids that actually exist in the catalog, so
  // the returned set can never reference a skill that does not resolve.
  const skillIds = preset.filter((id) => getSkill(id) !== undefined)
  return {
    skillIds,
    signOffPolicy: conservativeSignOffPolicy(),
  }
}

// ── Trust_Scope_Statement generator (Req 1.8) ─────────────────────────────────

/** The plain-language permission statement: granted capabilities + denials. */
export interface TrustScopeStatement {
  /** Granted capabilities, derived from the actual Trust_Scope (verb-first phrases). */
  canDo: string[]
  /** Explicit denials — ALWAYS non-empty (core denials + scope-derived denials). */
  cannotDo: string[]
}

/** Coerce a possibly-missing array field into a real array (totality helper). */
function asArray<T>(value: readonly T[] | undefined | null): readonly T[] {
  return Array.isArray(value) ? value : []
}

/** Plain-English count, e.g. `1 source` / `3 sources`. */
function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

// Core denials that hold for EVERY Agent regardless of Trust_Scope. Their
// presence guarantees `cannotDo` is never empty (Property 21). Listed as
// verb-first phrases so `renderTrustScopeStatement` can prefix "Cannot ".
const CORE_DENIALS: readonly string[] = [
  'write to your vault without your approval — every change is proposed for your sign-off first',
  'delete pages, sources, or connections',
  'widen its own trust scope or change its own permissions',
  'send your vault data to third parties',
]

/**
 * Generate the Trust_Scope_Statement for a Trust_Scope (Req 1.8, Property 21).
 *
 * `canDo` reflects the ACTUAL scope: what it may read (specific sources /
 * collections, or the whole vault when unrestricted — empty = whole vault per
 * design policy), whether it has web access, and its per-run token budget, plus
 * the always-true "propose for review" capability.
 *
 * `cannotDo` is ALWAYS non-empty: the four `CORE_DENIALS` are always present,
 * and scope-derived denials are appended (no web access when `webAccess` is
 * false; no out-of-scope reads when sources/collections are restricted) — so the
 * statement "denies by name".
 *
 * PURE / TOTAL / DETERMINISTIC — a malformed/partial scope degrades to the most
 * conservative reading (treated as no web access, whole-vault read) and never
 * throws.
 */
export function trustScopeStatement(scope: TrustScope): TrustScopeStatement {
  const sources = asArray(scope?.readableSourceIds)
  const collections = asArray(scope?.readableCollections)
  const webAccess = Boolean(scope?.webAccess)
  const budget = Number(scope?.perRunTokenBudget)
  const hasBudget = Number.isFinite(budget) && budget > 0

  const sourcesRestricted = sources.length > 0
  const collectionsRestricted = collections.length > 0

  // ── Granted capabilities (reflect the real scope) ──
  const canDo: string[] = []

  // Read scope. Empty sources AND empty collections = the whole vault (design policy).
  if (sourcesRestricted) {
    canDo.push(`read ${pluralize(sources.length, 'source')} you have granted`)
  }
  if (collectionsRestricted) {
    canDo.push(`read the collection(s): ${collections.join(', ')}`)
  }
  if (!sourcesRestricted && !collectionsRestricted) {
    canDo.push('read across your entire vault')
  }

  // The defining capability of every Agent: it proposes, it never writes.
  canDo.push('propose new pages, syntheses, and connections for your review')

  if (webAccess) {
    canDo.push('access the web to gather new sources')
  }
  if (hasBudget) {
    canDo.push(`spend up to ${budget.toLocaleString('en-US')} tokens per run`)
  }

  // ── Explicit "cannot" list (always non-empty) ──
  const cannotDo: string[] = [...CORE_DENIALS]

  if (!webAccess) {
    cannotDo.push('access the web or fetch external sources')
  }
  if (sourcesRestricted) {
    cannotDo.push('read sources you have not explicitly granted')
  }
  if (collectionsRestricted) {
    cannotDo.push(`read collections other than: ${collections.join(', ')}`)
  }

  return { canDo, cannotDo }
}

/** Uppercase the first letter of a phrase for bullet rendering. */
function capitalize(phrase: string): string {
  return phrase.length === 0 ? phrase : phrase[0].toUpperCase() + phrase.slice(1)
}

/**
 * Compose a Trust_Scope_Statement into the single plain-language string stored on
 * `Agent.trustScopeStatement` (a "can / cannot" bulleted statement). The output
 * always contains the literal "cannot" section since `cannotDo` is never empty
 * (Req 1.8). PURE / TOTAL.
 */
export function renderTrustScopeStatement(scope: TrustScope): string {
  const { canDo, cannotDo } = trustScopeStatement(scope)
  const can = canDo.map((c) => `• Can ${c}`).join('\n')
  const cannot = cannotDo.map((c) => `• Cannot ${c}`).join('\n')
  return `${capitalize('this agent can:')}\n${can}\n\n${capitalize('this agent cannot:')}\n${cannot}`
}
