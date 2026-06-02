// ── Skill Security_Scan ───────────────────────────────────────────────────────
// `scanSkill` is the blocking Security_Scan that gates Skill installation and runs
// on every periodic re-scan (Req 9.3, 9.9; design.md → "Components and Interfaces
// · 6. Skills"). It inspects a Skill DEFINITION — its `promptTemplate` plus its
// declared capability surface (`touches` / `tools` / `writesToVault`) — and decides
// whether the Skill is safe to add to a user's runtime.
//
// This is DISTINCT FROM the Content_Scanner (`src/lib/agents/scanner.ts`): the
// Content_Scanner screens vault CONTENT an Agent reads at run time; `scanSkill`
// screens the Skill ARTIFACT itself before it is ever installed. They share the
// same injection/credential pattern library, so this module REUSES `scanContent`
// to detect injection and credential leakage inside the `promptTemplate` rather
// than reinventing those detectors.
//
// PURE · TOTAL · DETERMINISTIC — no I/O, no clock, no randomness. Same input ⇒ same
// output, always. This is what lets `scanSkill` be the direct property-test target
// for Property 12 (task 6.10: "Security scan gates installation and grants no
// authority") and be reused verbatim by the periodic re-scan (Property 13).
//
// Decision rule (Property 12 / Req 9.3, 9.9): the scan FAILS if and only if ANY of
//   1. injection patterns appear in the promptTemplate,
//   2. credential access is present (credential patterns in the template, or the
//      declared `touches`/`tools` indicate credential access),
//   3. exfiltration is present (sending data out / external-network indicators), OR
//   4. the declared `touches` blast radius does not cover the observed behavior
//      (under-declaration) — e.g. `touches: 'nothing'` paired with vault, network,
//      or credential access; `touches: 'vault-read'` while the Skill ingests
//      (vault-write is a strictly broader blast radius than declared).
// The governing principle: the declared blast radius must be ≥ the observed
// behavior and may never be under-declared. Otherwise the scan PASSES.

import { scanContent } from '../agents/scanner'
import type { SkillTouches } from './catalog'

// ── Declared blast-radius union ──────────────────────────────────────────────
// Single source of truth: task 6.1 shipped `SkillTouches`
// (`vault-read | vault-write | network | credentials | nothing`) on the catalog's
// `SkillDef`, so we re-export it here under this module's existing public name
// rather than keeping a divergent local copy. The alias keeps `scanSkill`'s
// behavior and this module's exported type name identical to before.
export type SkillTouch = SkillTouches

// ── Structural input ─────────────────────────────────────────────────────────
// We type the input STRUCTURALLY rather than against the concrete `SkillDef` so
// this scanner compiles regardless of exactly how task 6.1's additive fields land,
// and so the Property 12 test (6.10) can hand it arbitrary skill-like objects. A
// real `SkillDef` (with or without 6.1's `touches`) is assignable to this shape.
export interface ScannableSkill {
  /** system prompt the runner uses; scanned for injection/credential/exfil text */
  promptTemplate?: string
  /** vault tools the Skill may call (e.g. 'search' | 'query' | 'ingest') */
  tools?: readonly string[]
  /** whether the Skill writes back into the vault — implies a vault-write radius */
  writesToVault?: boolean
  /** declared blast radius; a single value or an array (6.1 lands it as an array) */
  touches?: readonly SkillTouch[] | SkillTouch
}

/** The four failure reasons a Security_Scan can report (design.md · 6. Skills). */
export type SkillScanReason =
  | 'injection'
  | 'credential-access'
  | 'exfiltration'
  | 'capability-mismatch'

/**
 * Result of a Security_Scan. `reasons` is always present (empty on `passed`) so
 * downstream consumers — `InstalledSkill.scanReasons` (6.2) and the install gate
 * (6.4) — can read it uniformly. This is a superset of the design's
 * `{ status: 'passed' }` shape: a passed scan simply carries an empty reason list.
 */
export type SkillScanResult =
  | { status: 'passed'; reasons: [] }
  | { status: 'failed'; reasons: SkillScanReason[] }

// ── Capability detectors over the promptTemplate ──────────────────────────────
// Exfiltration = instructions to send/export data OUT to an external destination.
// Network = any external-network reach (inbound or outbound). These are written
// with bounded quantifiers (no nested unbounded repetition) to stay linear on
// adversarial input, matching the Content_Scanner's discipline.

const EXFIL_PATTERNS: RegExp[] = [
  /\bexfiltrat/i,
  /\bwebhook\b/i,
  /\b(?:curl|wget)\b/i,
  // a send/export verb aimed at an external destination
  /\b(?:send|email|post|upload|transmit|forward|leak|ship|deliver|publish|push|export|relay|beacon)\b[^.\n]{0,60}?(?:\bexternal\b|\boutside\b|\bthird[- ]?party\b|\bremote\b|\bendpoint\b|\bserver\b|\bdomain\b|\brecipient\b|\binbox\b|https?:\/\/)/i,
  // "... to https://evil.example/collect"
  /\bto\s+https?:\/\//i,
]

const NETWORK_PATTERNS: RegExp[] = [
  /https?:\/\//i,
  /\bwww\.[a-z0-9-]+\.[a-z]{2,}/i,
  /\b(?:fetch|http\s+request|api\s+(?:call|request)|web\s*(?:page|site|hook)|website|internet|online|browse\s+the\s+web|download\s+from|external\s+(?:url|site|api|service|endpoint)|webhook|curl|wget)\b/i,
]

// tool/keyword hints that a Skill reaches for credentials or the network directly
const CREDENTIAL_TOOL = /credential|secret|passwd|password|api[_-]?key|access[_-]?token/i
const NETWORK_TOOL = /\b(?:fetch|http|web|browse|crawl|scrape|network|url|webhook)\b/i

function anyMatch(patterns: RegExp[], text: string): boolean {
  return patterns.some(p => p.test(text))
}

/** Normalize the declared `touches` into a set, dropping the no-op `nothing`. */
function declaredRadius(touches: ScannableSkill['touches']): Set<SkillTouch> {
  const list: SkillTouch[] = Array.isArray(touches)
    ? [...touches]
    : touches
      ? [touches]
      : []
  return new Set(list.filter(t => t !== 'nothing'))
}

/**
 * Does the declared radius cover an observed capability? `vault-write` is a
 * strictly broader blast radius than `vault-read`, so declaring write also covers
 * read; every other axis must be declared explicitly.
 */
function covers(declared: Set<SkillTouch>, observed: SkillTouch): boolean {
  switch (observed) {
    case 'vault-read':
      return declared.has('vault-read') || declared.has('vault-write')
    case 'vault-write':
      return declared.has('vault-write')
    case 'network':
      return declared.has('network')
    case 'credentials':
      return declared.has('credentials')
    case 'nothing':
      return true
  }
}

/**
 * Run the blocking Security_Scan on a Skill definition.
 *
 * @returns `{ status: 'passed', reasons: [] }` when the Skill exhibits no
 *          injection / credential access / exfiltration AND its declared `touches`
 *          covers everything it observably does; otherwise
 *          `{ status: 'failed', reasons }` listing each triggered reason in a
 *          stable canonical order.
 */
export function scanSkill(def: ScannableSkill): SkillScanResult {
  // Defensive coercion keeps the scan total even for malformed/hostile defs.
  const template = typeof def?.promptTemplate === 'string' ? def.promptTemplate : ''
  const tools: readonly string[] = Array.isArray(def?.tools) ? def!.tools! : []
  const writesToVault = def?.writesToVault === true
  const declared = declaredRadius(def?.touches)

  // Run the shared Content_Scanner over the template once and bucket by category.
  const contentCats = new Set(scanContent(template).findings.map(f => f.category))

  const reasons = new Set<SkillScanReason>()

  // 1. Injection — embedded instructions trying to override the runner's task.
  if (contentCats.has('injection')) reasons.add('injection')

  // 2. Credential access — secrets in the template, a declared credential radius,
  //    or a tool that reaches for credentials. Any credential access fails (9.3).
  const credentialAccess =
    contentCats.has('credential') ||
    declared.has('credentials') ||
    tools.some(t => CREDENTIAL_TOOL.test(t))
  if (credentialAccess) reasons.add('credential-access')

  // 3. Exfiltration — instructions to send data out to an external destination.
  if (anyMatch(EXFIL_PATTERNS, template)) reasons.add('exfiltration')

  // ── Observed blast radius (what the Skill actually does) ────────────────────
  const observed = new Set<SkillTouch>()
  if (tools.includes('search') || tools.includes('query')) observed.add('vault-read')
  if (writesToVault || tools.includes('ingest')) observed.add('vault-write')
  // Network reach: template indicators, an exfil indicator (sending out is network),
  // or a network-ish tool name.
  if (
    anyMatch(NETWORK_PATTERNS, template) ||
    anyMatch(EXFIL_PATTERNS, template) ||
    tools.some(t => NETWORK_TOOL.test(t))
  ) {
    observed.add('network')
  }
  if (credentialAccess) observed.add('credentials')

  // 4. Capability mismatch — the declared radius must cover everything observed.
  //    Under-declaration (including `touches: 'nothing'` while touching anything)
  //    fails the scan (Req 9.9).
  for (const cap of observed) {
    if (!covers(declared, cap)) {
      reasons.add('capability-mismatch')
      break
    }
  }

  if (reasons.size === 0) return { status: 'passed', reasons: [] }

  // Stable canonical ordering so the output is deterministic.
  const ORDER: SkillScanReason[] = [
    'injection',
    'credential-access',
    'exfiltration',
    'capability-mismatch',
  ]
  return { status: 'failed', reasons: ORDER.filter(r => reasons.has(r)) }
}
