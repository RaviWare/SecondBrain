// ── Skills catalog API ────────────────────────────────────────────────────────
// GET  /api/skills  — returns the public skill catalog (no prompt templates).
// POST /api/skills  — installs a Skill into the signed-in user's runtime, gated by
//                     the blocking Security_Scan (the scan-gated Capability_Grant).
//
// Both are Clerk-authed so only signed-in users reach them, mirroring the auth
// convention of the other in-app `/api/*` routes (`auth()` → 401 → `connectDB()`).
//
// NOTE (task 6.8): the rest of the Skills control plane lives in sibling routes
// that reuse the same lib (no parallel registry — Req 11.1):
//   • POST /api/skills/rescan — periodic Security_Scan re-scan + auto-disable
//                               (`@/lib/skills/rescan` `rescanUserSkills`).
//   • POST /api/skills/grant  — Authority_Grant assign/revoke a Skill to an Agent
//                               (`@/lib/skills/grant` `grantSkillToAgent` /
//                               `revokeSkillFromAgent`).
// The install POST below stays the scan gate; its logic lives in
// `@/lib/skills/install` (`installSkill`). The UI (task 6.7) calls POST
// `/api/skills` with `{ skillId }`, so this path is preserved unchanged.
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { SKILLS, SKILL_CATEGORIES, toPublicSkill } from '@/lib/skills/catalog'
import { installSkill } from '@/lib/skills/install'
import { agentLog } from '@/lib/agents/redact'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    categories: SKILL_CATEGORIES,
    skills: SKILLS.map(toPublicSkill),
  })
}

/**
 * POST /api/skills — install a catalog Skill for the signed-in user.
 * Body: { skillId: string }.
 *
 * Delegates the whole install decision to `installSkill` (the scan gate). The
 * HTTP status reflects the install outcome:
 *   • 200 — scan passed; the InstalledSkill Capability_Grant exists (NO Agent
 *           authority granted as a side effect — that is task 6.5).
 *   • 422 — scan failed; installation blocked, nothing added to the runtime. The
 *           response carries the scan `reasons` for display.
 *   • 404 — unknown skillId.
 *   • 400 — malformed body / missing skillId.
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

  const skillId = typeof body.skillId === 'string' ? body.skillId.trim() : ''
  if (!skillId) return NextResponse.json({ error: 'skillId is required' }, { status: 400 })

  // `installSkill` resolves the catalog def, runs the blocking scan, and (on pass)
  // upserts the per-user InstalledSkill. `connectDB()` is also called inside it
  // before any write; we call it here too so an unknown-skill / blocked result is
  // handled uniformly. Never log token/secret values from this path.
  try {
    await connectDB()
    const result = await installSkill(userId, skillId)

    if (result.status === 'unknown-skill') {
      return NextResponse.json({ error: 'Unknown skill', skillId }, { status: 404 })
    }
    if (result.status === 'blocked') {
      // Scan failed → blocked. Surface the reasons so the UI can explain the block.
      return NextResponse.json(result, { status: 422 })
    }
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    agentLog.error('[skills] install failed', err)
    return NextResponse.json({ error: 'Skill install failed' }, { status: 500 })
  }
}
