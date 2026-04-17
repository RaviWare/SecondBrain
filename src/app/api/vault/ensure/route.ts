import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault, UserPlan } from '@/lib/models'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()

  let vault = await Vault.findOne({ userId })
  if (!vault) {
    vault = await Vault.create({ userId, name: 'My Second Brain' })
  }

  let plan = await UserPlan.findOne({ userId })
  if (!plan) {
    plan = await UserPlan.create({ userId })
  }

  return NextResponse.json({ vault, plan })
}
