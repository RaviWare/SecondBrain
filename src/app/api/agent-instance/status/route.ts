import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getAgent } from '@/lib/agent-service'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const view = await getAgent(userId)
    return NextResponse.json(view)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read agent status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
