// ── Agent token management (Clerk-authed) ─────────────────────────────────────
// GET    → list the user's tokens (metadata only, never the secret)
// POST   → create a token; returns the plaintext ONCE
// DELETE → revoke a token by id
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { AgentToken } from '@/lib/models'
import { generateToken, type AgentScope } from '@/lib/agent-auth'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const tokens = await AgentToken.find({ userId, revoked: false })
    .sort({ createdAt: -1 })
    .select('name prefix scopes lastUsedAt createdAt')
    .lean()

  return NextResponse.json({
    tokens: tokens.map(t => ({
      id: String(t._id),
      name: t.name,
      prefix: t.prefix,
      scopes: t.scopes,
      lastUsedAt: t.lastUsedAt,
      createdAt: t.createdAt,
    })),
  })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()

  const body = await req.json().catch(() => ({}))
  const name = (typeof body.name === 'string' && body.name.trim()) || 'Hermes agent'
  const requested: AgentScope[] = Array.isArray(body.scopes) ? body.scopes : ['read']
  const scopes = requested.filter((s): s is AgentScope => s === 'read' || s === 'write')
  if (scopes.length === 0) scopes.push('read')

  // cap tokens per user to keep the surface small
  const count = await AgentToken.countDocuments({ userId, revoked: false })
  if (count >= 10) {
    return NextResponse.json({ error: 'Token limit reached (10). Revoke one first.' }, { status: 400 })
  }

  const { token, tokenHash, prefix } = generateToken()
  const doc = await AgentToken.create({ userId, name, tokenHash, prefix, scopes })

  // Plaintext returned exactly once — never stored, never retrievable again.
  return NextResponse.json({
    token,
    id: String(doc._id),
    name: doc.name,
    prefix: doc.prefix,
    scopes: doc.scopes,
  })
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Token id required' }, { status: 400 })

  const res = await AgentToken.updateOne({ _id: id, userId }, { revoked: true })
  if (res.matchedCount === 0) return NextResponse.json({ error: 'Token not found' }, { status: 404 })

  return NextResponse.json({ success: true })
}
