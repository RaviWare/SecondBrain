// ── Agent token auth (Hermes / MCP bearer access) ─────────────────────────────
// Tokens look like `sb_<43-char-base64url>`. We persist only a SHA-256 hash, so
// a DB leak never exposes a usable token. Verification hashes the presented
// bearer and looks it up. Plaintext is returned exactly once, at creation.
import { createHash, randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { AgentToken, Vault } from '@/lib/models'

export const TOKEN_PREFIX = 'sb_'

export function generateToken(): { token: string; tokenHash: string; prefix: string } {
  const secret = randomBytes(32).toString('base64url') // 43 chars, url-safe
  const token = `${TOKEN_PREFIX}${secret}`
  return {
    token,
    tokenHash: hashToken(token),
    prefix: token.slice(0, 11), // sb_ + first 8 chars — safe to display
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type AgentScope = 'read' | 'write'

export type AgentContext = {
  userId: string
  scopes: AgentScope[]
  tokenId: string
}

/**
 * Authenticate an incoming agent request by its `Authorization: Bearer sb_...`
 * header. Returns the resolved user context, or null if missing/invalid/revoked.
 * Touches lastUsedAt (fire-and-forget) so the UI can show "last active".
 */
export async function authenticateAgent(req: NextRequest): Promise<AgentContext | null> {
  const header = req.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const token = match[1].trim()
  if (!token.startsWith(TOKEN_PREFIX)) return null

  await connectDB()
  const tokenHash = hashToken(token)
  const record = await AgentToken.findOne({ tokenHash, revoked: false })
  if (!record) return null

  // Best-effort activity stamp; don't block the request on it.
  AgentToken.updateOne({ _id: record._id }, { lastUsedAt: new Date() }).catch(() => {})

  return {
    userId: record.userId,
    scopes: (record.scopes as AgentScope[]) ?? ['read'],
    tokenId: String(record._id),
  }
}

/** Resolve the user's vault for an authenticated agent context. */
export async function getAgentVault(ctx: AgentContext) {
  await connectDB()
  return Vault.findOne({ userId: ctx.userId })
}

export function hasScope(ctx: AgentContext, scope: AgentScope): boolean {
  return ctx.scopes.includes(scope)
}
