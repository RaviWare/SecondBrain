import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { runQuery, VaultOpError } from '@/lib/vault-ops'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()

  const { question } = await req.json()

  try {
    const result = await runQuery(userId, question)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof VaultOpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Query failed'
    console.error('[query] uncaught', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
