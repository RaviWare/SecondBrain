import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { startAgent, AgentServiceError } from '@/lib/agent-service'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const view = await startAgent(userId)
    return NextResponse.json(view)
  } catch (err) {
    if (err instanceof AgentServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Start failed' }, { status: 500 })
  }
}
