// ── Messaging link-code core (pure) ───────────────────────────────────────────
// Two-phase chat linking: the app mints a short-lived, unguessable code; the user
// sends it to the bot; the webhook validates it and binds the chat id. This module
// owns the PURE parts — code generation shape, expiry math, and validation — so
// they're unit-testable with no I/O. The async DB/bot work lives in the routes.

import { randomBytes } from 'crypto'

/** How long a link code is valid once minted. */
export const LINK_CODE_TTL_MS = 15 * 60 * 1000 // 15 minutes

/** Prefix so a code is recognizable when a user pastes it to the bot. */
const CODE_PREFIX = 'sb-'

/**
 * Mint a fresh link code: `sb-` + 8 url-safe chars. Unguessable (48 bits of
 * entropy) and short enough to type. Returns the code + its expiry instant.
 */
export function mintLinkCode(now: number = Date.now()): { code: string; expiresAt: number } {
  const raw = randomBytes(6).toString('base64url').slice(0, 8).toLowerCase()
  return { code: `${CODE_PREFIX}${raw}`, expiresAt: now + LINK_CODE_TTL_MS }
}

/**
 * Extract a link code from arbitrary inbound message text. Users may send the
 * code alone or inside `/start sb-xxxx` (Telegram deep-link convention). Returns
 * the normalized code, or null when none is present. PURE.
 */
export function extractLinkCode(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null
  // Match `sb-` followed by 6–12 url-safe chars, anywhere in the message.
  const m = /\bsb-[a-z0-9_-]{6,12}\b/i.exec(text.trim())
  return m ? m[0].toLowerCase() : null
}

/** Is a pending link code still valid (present, matches, not expired)? PURE. */
export function isCodeValid(
  presented: string | null | undefined,
  stored: string | null | undefined,
  expiresAt: number | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  const p = typeof presented === 'string' ? presented.trim().toLowerCase() : ''
  const s = typeof stored === 'string' ? stored.trim().toLowerCase() : ''
  if (!p || !s || p !== s) return false
  const exp = expiresAt instanceof Date ? expiresAt.getTime() : typeof expiresAt === 'number' ? expiresAt : 0
  return exp > now
}

/**
 * Build the Telegram deep link a user taps to start the bot with their code
 * pre-filled (`https://t.me/<bot>?start=<code>`). Returns null without a bot
 * username. PURE.
 */
export function telegramDeepLink(botUsername: string | null | undefined, code: string): string | null {
  const u = typeof botUsername === 'string' ? botUsername.trim().replace(/^@/, '') : ''
  if (!u || !code) return null
  return `https://t.me/${u}?start=${encodeURIComponent(code)}`
}
