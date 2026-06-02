// ── Trust scope resolution + scoped brain-token mint ──────────────────────────
// Two least-privilege primitives that together back Property 8 ("Sub-agent and
// token scope never exceed the parent/agent scope"):
//
//   1. `resolveSubScope(parent, requested)` — PURE / TOTAL / DETERMINISTIC. Given a
//      parent Agent's Trust_Scope and a requested Sub_Agent scope, it returns a
//      scope that is a SUBSET of the parent: readable sources/collections ⊆
//      parent's, `webAccess ⇒ parent.webAccess`, `perRunTokenBudget ≤ parent's`.
//      It NEVER widens — a `requested` scope that asks for MORE than the parent is
//      clamped back down to a subset (Req 8.10).
//
//   2. `mintScopedAgentToken(...)` — derives `AgentToken.scopes` from the Agent's
//      Trust_Scope (NEVER broader) and mints a brain token by REUSING the existing
//      `generateToken()` (agent-auth) + the existing `AgentToken` model. No parallel
//      token system; the plaintext token value is returned once and NEVER logged
//      (Req 11.6, AGENTS.md security rules).
//
// See design.md → "Components and Interfaces" / Data Models (`AgentToken` reuse) and
// Requirements 8.10, 11.6.

import { connectDB } from '@/lib/mongodb'
import { AgentToken } from '@/lib/models'
import { generateToken, type AgentScope } from '@/lib/agent-auth'

// ── Structural Trust_Scope types ──────────────────────────────────────────────
// We type ONLY the shape this module reads (the four Trust_Scope fields) rather
// than importing the Mongoose `Agent` model, keeping `resolveSubScope` pure and
// DB-import-free. The source-id element type is generic so callers can pass
// `mongoose.Types.ObjectId[]` (as the `Agent` model stores) or `string[]`; ids are
// compared by their string form, so both interoperate.

/** A readable-source id as stored on `Agent.trustScope` — an ObjectId or a string. */
export type SourceIdLike = string | { toString(): string }

/** The least-privilege scope an Agent (or Sub_Agent) operates within. */
export interface TrustScope<TSourceId = SourceIdLike> {
  /** Specific readable Source ids. EMPTY = the whole vault (per design policy). */
  readableSourceIds: readonly TSourceId[]
  /** Specific readable collections. EMPTY = not collection-restricted (all). */
  readableCollections: readonly string[]
  /** May the Agent reach the network. */
  webAccess: boolean
  /** Per-run token ceiling. */
  perRunTokenBudget: number
}

/** The resolved Sub_Agent scope (mutable arrays, ready to persist). */
export interface ResolvedScope<TSourceId = SourceIdLike> {
  readableSourceIds: TSourceId[]
  readableCollections: string[]
  webAccess: boolean
  perRunTokenBudget: number
}

// ── Internal helpers (total by construction) ──────────────────────────────────

/** Coerce anything into an array so the resolver never throws on a bad shape. */
function asArray<T>(value: readonly T[] | undefined | null): readonly T[] {
  return Array.isArray(value) ? value : []
}

/** Stable string key for an id (string stays as-is; ObjectId → its hex string). */
function idKey(id: SourceIdLike): string {
  return typeof id === 'string' ? id : String(id)
}

/** Normalize a number to a finite value (non-finite / NaN → 0) so `min` is total. */
function finiteOrZero(n: number): number {
  return Number.isFinite(n) ? n : 0
}

/** Drop duplicates while preserving first-seen order, keyed by `keyOf`. */
function dedupe<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const k = keyOf(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

/**
 * Resolve a list field (sources or collections) to a subset of the parent's,
 * honoring the design's "EMPTY = the whole vault / unrestricted" policy so the
 * result can NEVER grant access the parent lacks:
 *
 *   - parent unrestricted (empty)  → the parent grants everything, so the child
 *     may narrow freely; return the requested list as-is (empty stays empty).
 *   - parent restricted, child asks for everything (empty) → the child cannot
 *     have the whole vault when the parent is limited; CLAMP to the parent's set.
 *   - both restricted, overlapping → intersection: keep only requested items the
 *     parent allows (drop anything the parent doesn't grant).
 *   - both restricted, DISJOINT → the intersection is empty. Returning that empty
 *     list would read downstream as "the whole vault" (empty = universe), handing
 *     the child BROADER access than its restricted parent — a privilege
 *     escalation. So we CLAMP to the parent's set instead (never empty).
 *
 * The "empty = universe" convention is overloaded: an empty list can mean either
 * "unrestricted / whole vault" OR "deny everything". A naive literal intersection
 * collapses a DISJOINT restricted request to `[]`, which is then interpreted as
 * the whole vault — broader than the parent. This function closes that hole by
 * guaranteeing a key invariant:
 *
 *   the resolved list is EMPTY ⇒ the PARENT list was empty (unrestricted).
 *
 * i.e. a restricted parent NEVER yields an empty (→ universe) resolved list, so
 * the downstream "empty = whole vault" read is only ever reached when the parent
 * genuinely WAS the whole vault. The resolved accessible set is therefore always a
 * subset of the parent's accessible set (Req 8.10, Property 8).
 */
function resolveListSubset<T>(
  parentList: readonly T[] | undefined | null,
  requestedList: readonly T[] | undefined | null,
  keyOf: (item: T) => string,
): T[] {
  const parent = asArray(parentList)
  const requested = asArray(requestedList)

  const parentRestricted = parent.length > 0
  const requestedRestricted = requested.length > 0

  let chosen: readonly T[]
  if (!parentRestricted) {
    // Parent = universe; the child may request any narrowing (or the universe).
    chosen = requested
  } else if (!requestedRestricted) {
    // Child asked for the universe but the parent is restricted → clamp to parent.
    chosen = parent
  } else {
    // Both restricted → keep only the requested items the parent actually grants.
    const parentKeys = new Set(parent.map(keyOf))
    const intersection = requested.filter((item) => parentKeys.has(keyOf(item)))
    // If the request is DISJOINT from a restricted parent the intersection is
    // empty. An empty list would be read as "whole vault" (empty = universe) and
    // escalate the child ABOVE its restricted parent, so clamp to the parent's
    // bound — the child can never exceed it, and the list is never spuriously
    // empty for a restricted parent (Req 8.10).
    chosen = intersection.length > 0 ? intersection : parent
  }

  return dedupe(chosen, keyOf)
}

// ── resolveSubScope ─────────────────────────────────────────────────────────────

/**
 * Resolve a Sub_Agent's effective scope as a SUBSET of its parent Agent's
 * Trust_Scope (Req 8.10, Property 8).
 *
 * PURE, TOTAL, DETERMINISTIC — no I/O, never throws, same inputs → same output.
 * The result satisfies, for ALL inputs (including a `requested` scope asking for
 * MORE than the parent):
 *   - `readableSourceIds`   accessible set ⊆ parent's (empty = whole vault),
 *   - `readableCollections` accessible set ⊆ parent's (empty = all collections),
 *   - `webAccess`           ⇒ parent had `webAccess` (logical AND),
 *   - `perRunTokenBudget`   ≤ parent's (min of the two, non-finite → 0).
 *
 * It NEVER widens: anything the `requested` scope asks for beyond the parent is
 * dropped or clamped down.
 */
export function resolveSubScope<T = SourceIdLike>(
  parent: TrustScope<T>,
  requested: TrustScope<T>,
): ResolvedScope<T> {
  const keyOf = (id: T): string => idKey(id as unknown as SourceIdLike)

  return {
    readableSourceIds: resolveListSubset(parent?.readableSourceIds, requested?.readableSourceIds, keyOf),
    readableCollections: resolveListSubset(
      parent?.readableCollections,
      requested?.readableCollections,
      (c) => c,
    ),
    // A child may have web access ONLY IF the parent does (webAccess ⇒ parent.webAccess).
    webAccess: Boolean(parent?.webAccess) && Boolean(requested?.webAccess),
    // Budget can only shrink: min(parent, requested), with non-finite treated as 0.
    perRunTokenBudget: Math.min(
      finiteOrZero(parent?.perRunTokenBudget),
      finiteOrZero(requested?.perRunTokenBudget),
    ),
  }
}

// ── Scoped brain-token mint ──────────────────────────────────────────────────────

/**
 * Derive the `AgentToken.scopes` ceiling from an Agent's Trust_Scope — NEVER
 * broader than the Trust_Scope (Req 11.6, Property 8 token half).
 *
 * Hermes Agents OS runs on the propose-never-write spine: an Agent's runner uses
 * only the read-only `VaultTools` (search / query / planIngest / fetchSource /
 * scan) and can never perform a write — every vault mutation flows through the
 * Aegis `applyProposal` choke point under the user's own (Clerk) auth, NOT the
 * Agent's brain token. The Trust_Scope itself carries no write capability; its
 * `readableSourceIds` / `readableCollections` bound what may be READ (enforced at
 * request time by the scoped token + the in-process scope check). Therefore the
 * derived scope ceiling for an Agent's brain token is read-only: `['read']`.
 *
 * PURE / TOTAL / DETERMINISTIC.
 */
export function deriveTokenScopes(_trustScope: TrustScope): AgentScope[] {
  // Read-only by construction — the strongest "never broader than Trust_Scope"
  // guarantee, since the Agent proposes and never writes via its brain token.
  return ['read']
}

/** Parameters for minting an Agent-scoped brain token. */
export interface MintScopedAgentTokenParams {
  /** Owning user (Clerk id). */
  userId: string
  /** The Agent whose Trust_Scope bounds the token. */
  agentId: string
  /** The Agent's Trust_Scope — the token's scopes are derived from this. */
  trustScope: TrustScope
  /** Optional display name (non-secret). */
  name?: string
}

/** Result of a scoped mint. The plaintext `token` is returned ONCE and never stored. */
export interface MintScopedAgentTokenResult {
  /** Plaintext `sb_...` token — surfaced exactly once, NEVER logged or persisted. */
  token: string
  /** The new `AgentToken._id` (safe to persist on `Agent.tokenId`). */
  tokenId: string
  /** Non-secret display prefix (`sb_` + first 8 chars). */
  prefix: string
  /** The scopes granted — derived from the Trust_Scope, never broader. */
  scopes: AgentScope[]
}

/**
 * Mint a brain token scoped to an Agent's Trust_Scope (Req 11.6).
 *
 * REUSES the existing token infrastructure end to end — `generateToken()` from
 * `agent-auth.ts` (same `sb_<43-char>` format, same SHA-256-hash-at-rest model)
 * and the existing `AgentToken` model (its `scopes` array is reused unchanged).
 * This is NOT a parallel token system: a token minted here authenticates through
 * the same `authenticateAgent()` path as every other brain token.
 *
 * The token's `scopes` come from `deriveTokenScopes(trustScope)`, so they can
 * never be broader than the Trust_Scope. Only the SHA-256 hash is persisted; the
 * plaintext is returned once to the caller and is NEVER written to a log.
 */
export async function mintScopedAgentToken(
  params: MintScopedAgentTokenParams,
): Promise<MintScopedAgentTokenResult> {
  const { userId, agentId, trustScope, name } = params

  // Derive the scope ceiling from the Trust_Scope (never broader).
  const scopes = deriveTokenScopes(trustScope)

  // Reuse the existing minting primitive — identical format + hash-at-rest model.
  const { token, tokenHash, prefix } = generateToken()

  await connectDB()
  const doc = await AgentToken.create({
    userId,
    name: (typeof name === 'string' && name.trim()) || `Agent ${agentId}`,
    tokenHash, // only the hash is stored; the plaintext is never persisted
    prefix, // non-secret display prefix
    scopes, // derived from trustScope — never broader (Req 11.6)
  })

  // Return the plaintext exactly once. Callers MUST NOT log `token`.
  return {
    token,
    tokenId: String(doc._id),
    prefix,
    scopes,
  }
}
