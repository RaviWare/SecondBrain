// ── Secret-redaction for agent-layer logging ──────────────────────────────────
// Security invariant (AGENTS.md · Req 11.4, 11.5 · design.md Property 20):
//   "Never log BYO API keys or brain tokens."
// EVERY agent-layer log emission goes through `redact()` (directly, or via the
// `agentLog` wrapper below) so that no scoped brain token (`sb_…`) or BYO LLM
// key value can ever appear — even as a SUBSTRING — of emitted output.
//
// `redact()` is pure, deterministic, and TOTAL: it accepts a string OR any value
// (objects/Errors are safely stringified) plus the set of secret values to scrub
// for the current run, and never throws on empty/odd input.
//
//   what gets scrubbed:
//     1. Every passed-in secret value (the scoped brain token + the run's BYO
//        key), replaced GLOBALLY everywhere it appears (incl. mid-string).
//     2. Defensive pattern scrub for known secret shapes (`sb_…` brain tokens and
//        common API-key prefixes like `sk-…`) so a leaked value is caught even
//        when the exact value was not handed in.
//
// See design.md → "Property 20: Secrets are never present in emitted log output".

/** The stable mask substituted for every redacted secret. */
const MASK = '[REDACTED]'

/**
 * Defensive secret-shape patterns. These catch a leaked secret even when its
 * exact value was not passed to `redact()` (e.g. an SDK error that embeds the
 * key). Each is global + case-sensitive and matches a realistic minimum length
 * so ordinary text (`"sk-"`, `"sb_id"`) is not over-redacted.
 *
 *   • sb_…   — SecondBrain brain token: `sb_` + base64url (A–Z a–z 0–9 - _).
 *   • sk-…   — OpenAI / Anthropic / OpenRouter BYO LLM keys (sk-, sk-ant-, sk-or-).
 *   • sk_…   — alternate underscore-prefixed key style.
 *   • AIza…  — Google / Gemini API keys.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /sb_[A-Za-z0-9_-]{8,}/g,
  /sk-[A-Za-z0-9_-]{8,}/g,
  /sk_[A-Za-z0-9]{8,}/g,
  /AIza[A-Za-z0-9_-]{20,}/g,
]

/** Iterable of secret values to scrub; nullish/blank entries are ignored. */
export type Secrets = Iterable<string | null | undefined>

/**
 * Safely turn an arbitrary log argument into a string for scrubbing.
 * - strings pass through unchanged
 * - null / undefined → '' (nothing to log)
 * - Error → name + message + stack (where secrets most often hide)
 * - objects → JSON with circular/Error/bigint-safe replacer; falls back to
 *   String(value) if serialization fails
 * - other primitives → String(value)
 * Never throws.
 */
function stringify(input: unknown): string {
  if (typeof input === 'string') return input
  if (input == null) return ''
  if (input instanceof Error) {
    return input.stack ? `${input.name}: ${input.message}\n${input.stack}` : `${input.name}: ${input.message}`
  }
  if (typeof input === 'object') {
    try {
      const seen = new WeakSet<object>()
      return JSON.stringify(input, (_key, value) => {
        if (value instanceof Error) {
          return { name: value.name, message: value.message, stack: value.stack }
        }
        if (typeof value === 'bigint') return value.toString()
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]'
          seen.add(value)
        }
        return value
      })
    } catch {
      return String(input)
    }
  }
  // number | boolean | bigint | symbol | function
  return String(input)
}

/**
 * Pick a mask guaranteed not to contain `secret` as a substring, so replacing
 * the secret can never reintroduce it via the mask itself. Almost always the
 * default `[REDACTED]`; only degenerate "secrets" that are substrings of the
 * mask (e.g. `"ED"`, `"RED"`) trigger the fallback — never a real token/key.
 */
function maskFor(secret: string): string {
  if (!MASK.includes(secret)) return MASK
  // Fallback: a run of a single character that does not occur in the secret, so
  // it cannot possibly contain the secret as a substring. A char absent from any
  // finite string always exists in this small candidate set.
  for (const ch of ['*', '#', 'X', '•', '\u2588']) {
    if (!secret.includes(ch)) return ch.repeat(8)
  }
  return '\u2588'.repeat(8)
}

/**
 * Redact every occurrence of each secret value from `input`, then defensively
 * scrub known secret shapes. Returns a string safe to log.
 *
 * @param input    string or any value (objects/Errors are safely stringified)
 * @param secrets  exact secret values to scrub (e.g. the run's scoped brain
 *                 token + BYO LLM key). Nullish/blank entries are ignored.
 *
 * GUARANTEE (Property 20): for any non-blank value in `secrets`, the returned
 * string does not contain that value as a substring.
 */
export function redact(input: unknown, secrets?: Secrets): string {
  let text = stringify(input)

  // 1. Exact-value scrub. Longest-first so a secret that contains another secret
  //    is masked before its shorter substring, avoiding a partial leftover.
  const values = secrets
    ? [...secrets].filter((s): s is string => typeof s === 'string' && s.trim().length > 0).sort((a, b) => b.length - a.length)
    : []
  for (const secret of values) {
    // split/join replaces ALL occurrences and treats the secret literally (no
    // regex metacharacter pitfalls), so mid-string and repeated hits are covered.
    text = text.split(secret).join(maskFor(secret))
  }

  // 2. Defensive shape scrub — catches leaked tokens/keys not passed in (1).
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, MASK)
  }

  return text
}

type LogLevel = 'log' | 'info' | 'warn' | 'error'

function write(level: LogLevel, message: string, detail: unknown, secrets?: Secrets): void {
  const parts = detail === undefined ? [message] : [message, detail]
  // NOTE: the single, redaction-guarded console sink for the entire agent layer —
  // every argument is passed through redact() first. All agent-stack logging MUST
  // funnel through agentLog (below), never call console.* directly.
  console[level](parts.map((p) => redact(p, secrets)).join(' '))
}

/**
 * The agent layer's logger. A thin wrapper over `console` that funnels EVERY
 * argument through `redact()` first, so agent-layer code can log freely without
 * risking a brain-token / BYO-key leak. Use this instead of `console.*` anywhere
 * in the agent stack.
 *
 *   agentLog.error('[agents/run] run failed', err, [ctx.scopedToken, byoKey])
 *
 * `detail` is optional; `secrets` is the run's known secret values (the scoped
 * token + BYO key) and is optional because the defensive shape scrub still
 * protects output when the exact values are not on hand.
 */
export const agentLog = {
  log: (message: string, detail?: unknown, secrets?: Secrets) => write('log', message, detail, secrets),
  info: (message: string, detail?: unknown, secrets?: Secrets) => write('info', message, detail, secrets),
  warn: (message: string, detail?: unknown, secrets?: Secrets) => write('warn', message, detail, secrets),
  error: (message: string, detail?: unknown, secrets?: Secrets) => write('error', message, detail, secrets),
}
