import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault } from '@/lib/models'

/** Update the user's vault name / description. */
export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const body = await req.json().catch(() => ({}))

  const update: Record<string, unknown> = {}
  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'Vault name cannot be empty' }, { status: 400 })
    update.name = name.slice(0, 80)
  }
  if (typeof body.description === 'string') {
    update.description = body.description.slice(0, 280)
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const vault = await Vault.findOneAndUpdate({ userId }, update, { new: true })
  if (!vault) return NextResponse.json({ error: 'Vault not found' }, { status: 404 })
  return NextResponse.json({ vault })
}
