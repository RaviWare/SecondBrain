// ── /api/me — tiny Clerk-authed "who am I + what plan" probe ───────────────────
// The sidebar (rendered on every /app/* page) needs the signed-in user's plan tier
// to label their account honestly. This is a deliberately CHEAP endpoint — a single
// indexed `UserPlan.findOne` by userId — so it can run on every page without the cost
// of the full `/api/dashboard` aggregate (which loads the whole page set).
//
// The user's NAME/avatar come from Clerk on the client (`useUser`), so this route only
// returns the plan. NO DUMMY DATA: a user with no UserPlan row yet is honestly `free`
// (the same default the schema + vault/ensure use), never a fabricated tier.
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { UserPlan } from '@/lib/models'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const plan = await UserPlan.findOne({ userId }, 'plan').lean<{ plan?: 'free' | 'pro' }>()

  return NextResponse.json(
    { plan: plan?.plan ?? 'free' },
    { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' } },
  )
}
