import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { provisionAgent, AgentServiceError } from '@/lib/agent-service'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { llmProvider?: string; llmModel?: string; llmApiKey?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const view = await provisionAgent(userId, {
      llmProvider: body.llmProvider ?? '',
      llmModel: body.llmModel ?? '',
      llmApiKey: body.llmApiKey ?? '',
    })
    return NextResponse.json(view)
  } catch (err) {
    if (err instanceof AgentServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Provision failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
