import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault, Page, Log, UserPlan } from '@/lib/models'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()

  const [vault, plan, recentLogs, recentPages] = await Promise.all([
    Vault.findOne({ userId }),
    UserPlan.findOne({ userId }),
    Log.find({ userId }).sort({ createdAt: -1 }).limit(8).lean(),
    Page.find({ userId }, 'slug title type summary createdAt updatedAt').sort({ updatedAt: -1 }).limit(6).lean(),
  ])

  return NextResponse.json({ vault, plan, recentLogs, recentPages })
}
