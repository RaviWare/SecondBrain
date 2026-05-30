import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { runIngest, VaultOpError, type IngestInput } from '@/lib/vault-ops'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await connectDB()

    const body = await req.json()
    const input = body as IngestInput
    const result = await runIngest(userId, input)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof VaultOpError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Ingest failed'
    console.error('[ingest] uncaught', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
