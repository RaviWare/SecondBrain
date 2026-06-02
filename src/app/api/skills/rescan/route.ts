// ── Skills re-scan API ────────────────────────────────────────────────────────
// POST /api/skills/rescan — the PROTECTED periodic re-scan trigger surface
// (task 6.8 · Req 9.10). Re-runs the blocking Security_Scan on the signed-in
// user's INSTALLED Skills, auto-disabling any that now fail and surfacing a
// corresponding item to the Aegis_Queue.
//
// This is the route layer the `rescan.ts` WIRING NOTE points to: the re-scan
// LOGIC already lives in `@/lib/skills/rescan` (`rescanUserSkills`). This handler
// only does Clerk auth → `connectDB()` → delegate; it invents NO parallel
// registry and duplicates NO scan logic (Req 11.1). A scheduled tick can later
// hit this same endpoint; building that scheduler is out of scope here.
//
// Clerk-authed like the rest of the in-app `/api/*` routes (`auth()` → 401 →
// `connectDB()`). Never logs token/secret values.
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { rescanUserSkills } from '@/lib/skills/rescan'
import { agentLog } from '@/lib/agents/redact'

/**
 * POST /api/skills/rescan — re-scan the signed-in user's installed Skills.
 *
 * No body. Delegates entirely to `rescanUserSkills(userId)` and returns its
 * `RescanSummary`:
 *   { userId, scanned, autoDisabled, autoDisabledSkillIds, surfacedProposalIds }
 *
 * Always 200 on success — a re-scan that disables nothing is a valid outcome
 * (the summary's counts tell the caller what happened).
 */
export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await connectDB()
    const summary = await rescanUserSkills(userId)
    return NextResponse.json(summary, { status: 200 })
  } catch (err) {
    agentLog.error('[skills/rescan] re-scan failed', err)
    return NextResponse.json({ error: 'Skill re-scan failed' }, { status: 500 })
  }
}
