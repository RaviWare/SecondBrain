// ── Skills Authority_Grant API ────────────────────────────────────────────────
// POST /api/skills/grant — assign (or revoke) an installed+enabled Skill to/from
// an Agent (task 6.8 · Req 9.7). This is the route surface for the second half of
// the two-step grant model; the grant LOGIC already lives in
// `@/lib/skills/grant` (`grantSkillToAgent` / `revokeSkillFromAgent`). This
// handler only does Clerk auth → `connectDB()` → delegate, reusing the existing
// lib (no parallel registry — Req 11.1) and never logging tokens/secrets.
//
// CAPABILITY vs AUTHORITY: installing a Skill (POST /api/skills) is a
// Capability_Grant — the Skill exists but no Agent may invoke it. THIS route is
// the Authority_Grant: it is the only API surface that writes a Skill id to an
// Agent's `assignedSkillIds`. A disabled / not-installed Skill is never grantable
// (Req 9.8), enforced inside `grantSkillToAgent`.
//
// Clerk-authed like the rest of the in-app `/api/*` routes (`auth()` → 401 →
// `connectDB()`).
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { grantSkillToAgent, revokeSkillFromAgent } from '@/lib/skills/grant'
import { agentLog } from '@/lib/agents/redact'

const ACTIONS = ['grant', 'revoke'] as const
type Action = (typeof ACTIONS)[number]

/**
 * POST /api/skills/grant — grant or revoke a Skill on an Agent.
 * Body: { agentId: string, skillId: string, action?: 'grant' | 'revoke' }.
 *       `action` defaults to 'grant'.
 *
 * HTTP status reflects the lib outcome:
 *   • 200 — granted / revoked (carries `added`/`removed` for idempotency).
 *   • 409 — grant BLOCKED because the Skill is disabled or not installed; the
 *           response carries the `reason` (`not-installed` | `disabled` |
 *           `auto-disabled-by-scan`) so the UI can explain the block.
 *   • 404 — no Agent with that id for this user.
 *   • 400 — malformed body / missing agentId or skillId / unknown action.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : ''
  const skillId = typeof body.skillId === 'string' ? body.skillId.trim() : ''
  if (!agentId) return NextResponse.json({ error: 'agentId is required' }, { status: 400 })
  if (!skillId) return NextResponse.json({ error: 'skillId is required' }, { status: 400 })

  // `action` is optional and defaults to 'grant'. Anything else is a bad request.
  const action = body.action === undefined ? 'grant' : body.action
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: `Unknown action "${String(action)}"` }, { status: 400 })
  }

  try {
    await connectDB()

    if ((action as Action) === 'revoke') {
      const result = await revokeSkillFromAgent(userId, agentId, skillId)
      if (result.status === 'agent-not-found') {
        return NextResponse.json(result, { status: 404 })
      }
      return NextResponse.json(result, { status: 200 })
    }

    // Default: Authority_Grant.
    const result = await grantSkillToAgent(userId, agentId, skillId)
    if (result.status === 'agent-not-found') {
      return NextResponse.json(result, { status: 404 })
    }
    if (result.status === 'blocked') {
      // Skill disabled / not installed → the grant is not permitted. 409 Conflict
      // carries the `reason` so the caller can surface why (Req 9.8).
      return NextResponse.json(result, { status: 409 })
    }
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    agentLog.error('[skills/grant] grant/revoke failed', err)
    return NextResponse.json({ error: 'Skill grant failed' }, { status: 500 })
  }
}
