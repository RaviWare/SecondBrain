// ── /api/admin/me — "is the signed-in user an admin?" ─────────────────────────
// Tiny Clerk-authed probe the sidebar uses to decide whether to show admin-only
// nav (the Updates page). Returns { isAdmin } — never the allow-list itself.
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const { userId } = await auth()
  return NextResponse.json({ isAdmin: isAdminUser(userId) })
}
