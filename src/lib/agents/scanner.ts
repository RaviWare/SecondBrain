// ── Content Scanner ───────────────────────────────────────────────────────────
// Screens every source an Agent reads BEFORE it can become a vault node or feed a
// Proposal (Req 5.1, 5.9). It is the brain's immune system against poisoned web
// content: prompt-injection, leaked credentials/secrets, PII, and text written to
// manipulate "the AI" reading it.
//
// `scanContent` is PURE, SYNCHRONOUS, and DETERMINISTIC — no I/O, no clock, no
// randomness. Same input ⇒ same output, always. This is what lets it be the
// property-test target for Property 5 (task 2.10: "flags any detectable pattern
// and never drops content").
//
// NON-DESTRUCTIVE BY CONSTRUCTION (Property 5): the scanner never mutates, edits,
// truncates, or discards the input. It only REPORTS — every finding's `passage`
// is a verbatim substring of the input (`match[0]`), tagged with its category and
// the `offset` at which it occurs. Holding-for-review vs dropping is the caller's
// job (the runner turns a `flagged` result into a held Proposal, task 2.4); the
// scanner itself returns the text's verdict and leaves the text untouched.
//
// Type reuse: the result shape is the SAME `ScanResult` the Phase-1 runner already
// consumes via its `VaultTools.scan` hook — imported and re-exported here rather
// than duplicated, so the scanner drops straight into the existing runner contract
// when it is wired in (task 2.4). `ScanCategory` is the typed set of detector
// categories (every emitted `category` is one of these; it is a `string` subtype,
// so it stays assignable to the runner's lightweight finding shape).
// See design.md → "Components and Interfaces · 3. Content Scanner" and Requirement 5.

import type { ScanResult } from './runner/types'

export type { ScanResult }

/** The four detector categories the Content_Scanner recognizes (Req 5.2, 5.3). */
export type ScanCategory = 'injection' | 'credential' | 'pii' | 'addressed-to-ai'

/**
 * A single suspicious hit. `passage` is always a verbatim substring of the input
 * at `offset` (so the review surface can highlight the exact text — Req 5.5).
 */
export type ScanFinding = { category: ScanCategory; passage: string; offset: number }

// ── Detector table ────────────────────────────────────────────────────────────
// Each detector is a category + a global, case-insensitive regex. Patterns are
// written to avoid catastrophic backtracking (no nested unbounded quantifiers over
// overlapping classes) so the scan stays linear on adversarial input. Every regex
// carries the `g` flag because we iterate matches with `String.prototype.matchAll`.
type Detector = { category: ScanCategory; pattern: RegExp }

const DETECTORS: Detector[] = [
  // ── injection — embedded instructions trying to override the Agent's task (Req 5.2)
  {
    category: 'injection',
    pattern:
      /\b(?:ignore|disregard|forget)\b[^.\n]{0,40}?\b(?:all|any|the|your|previous|prior|above|earlier|preceding)\b[^.\n]{0,40}?\b(?:instruction|instructions|prompt|prompts|task|tasks|context|directive|directives|rules?)\b/gi,
  },
  { category: 'injection', pattern: /\byou\s+are\s+now\b/gi },
  { category: 'injection', pattern: /\b(?:new|updated|revised)\s+(?:instruction|instructions|task|directive|directives|system\s+prompt)\b/gi },
  { category: 'injection', pattern: /\b(?:system\s*prompt|system\s*message)\b/gi },
  { category: 'injection', pattern: /\b(?:override|bypass|ignore)\s+(?:your|the|all|any)\s+(?:instruction|instructions|task|rules?|guardrails?|restrictions?|safety)\b/gi },
  { category: 'injection', pattern: /\bdo\s+not\s+(?:follow|obey|listen\s+to)\b[^.\n]{0,40}?\b(?:instruction|instructions|task|prompt|user)\b/gi },
  { category: 'injection', pattern: /\b(?:act|behave|respond|pretend)\s+as\s+(?:if\s+)?(?:you\s+(?:are|were)\s+)?(?:a|an|the)\b[^.\n]{0,40}?\b(?:assistant|ai|model|agent|jailbreak|developer\s+mode)\b/gi },

  // ── addressed-to-ai — content that speaks directly to the model reading it (Req 5.2)
  { category: 'addressed-to-ai', pattern: /\b(?:hey|hi|hello|dear|attention|note\s+to|message\s+to)\b[\s,]{0,4}\b(?:ai|a\.i\.|assistant|agent|chatbot|bot|llm|language\s+model|model|gpt|claude)\b/gi },
  { category: 'addressed-to-ai', pattern: /\bto\s+the\s+(?:ai|assistant|agent|language\s+model|llm|model|bot|chatbot)\b[^.\n]{0,40}?\b(?:reading|seeing|processing|scanning|parsing|ingesting)\b/gi },
  { category: 'addressed-to-ai', pattern: /\b(?:if|when|since)\s+you(?:'re|\s+are)\s+(?:an?\s+)?(?:ai|assistant|agent|language\s+model|llm|model|bot|chatbot)\b/gi },
  { category: 'addressed-to-ai', pattern: /\bas\s+an?\s+(?:ai|assistant|agent|language\s+model|llm)\b/gi },

  // ── credential — API keys, tokens, secrets (Req 5.3). Match only the minimal
  //    secret-bearing passage; never widen beyond it (AGENTS.md: never log secrets).
  { category: 'credential', pattern: /\bsk-[A-Za-z0-9_-]{16,}/g }, // OpenAI / Anthropic-style keys
  { category: 'credential', pattern: /\bsb_[A-Za-z0-9_-]{8,}/g }, // SecondBrain brain tokens
  { category: 'credential', pattern: /\bAKIA[0-9A-Z]{16}\b/g }, // AWS access key id
  { category: 'credential', pattern: /\bghp_[A-Za-z0-9]{20,}/g }, // GitHub personal access token
  { category: 'credential', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g }, // Slack token
  { category: 'credential', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi }, // bearer token
  { category: 'credential', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g }, // JWT
  { category: 'credential', pattern: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*\S{4,}/gi },

  // ── pii — emails, phones, SSN, credit-card-like sequences (Req 5.3)
  { category: 'pii', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g }, // email
  { category: 'pii', pattern: /\b\d{3}-\d{2}-\d{4}\b/g }, // US SSN
  { category: 'pii', pattern: /\b(?:\d[ -]*?){4}\d{4}[ -]?\d{4}[ -]?\d{4}\b/g }, // 16-digit grouped card
  { category: 'pii', pattern: /\b\d{13,16}\b/g }, // contiguous card-like sequence
  { category: 'pii', pattern: /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g }, // NA phone
  { category: 'pii', pattern: /\+\d{6,15}\b/g }, // international phone (contiguous)
]

/**
 * Scan `text` for suspicious patterns across all four categories.
 *
 * @returns `{ status: 'clean', findings: [] }` when nothing matches (Req 5.8);
 *          otherwise `{ status: 'flagged', findings }` with a non-empty, stably
 *          ordered list of findings whose `passage` values are verbatim
 *          substrings of `text`. The input is never altered or dropped.
 */
export function scanContent(text: string): ScanResult {
  // Defensive coercion keeps the function total/deterministic even if a caller
  // hands a non-string (the public contract is `string`, but a hostile/odd source
  // shouldn't throw inside the safety screen).
  const input = typeof text === 'string' ? text : String(text ?? '')

  if (input.length === 0) return { status: 'clean', findings: [] }

  const seen = new Set<string>()
  const findings: ScanFinding[] = []

  for (const { category, pattern } of DETECTORS) {
    for (const match of input.matchAll(pattern)) {
      const passage = match[0]
      if (!passage) continue
      const offset = match.index ?? 0
      const key = `${category}\u0000${offset}\u0000${passage}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({ category, passage, offset })
    }
  }

  if (findings.length === 0) return { status: 'clean', findings: [] }

  // Stable, deterministic ordering: by position, then category, then passage.
  findings.sort(
    (a, b) =>
      a.offset - b.offset ||
      a.category.localeCompare(b.category) ||
      a.passage.localeCompare(b.passage),
  )

  return { status: 'flagged', findings }
}
