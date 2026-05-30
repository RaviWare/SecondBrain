// ── Hermes agent integration ──────────────────────────────────────────────────
// Verifies the bearer-token auth path and that an authenticated agent can run
// the same query logic the UI uses, against real MongoDB (+ Claude if keyed).
import './load-env'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'

const HAS_DB = !!process.env.MONGODB_URI
const HAS_AI = !!process.env.ANTHROPIC_API_KEY
const TEST_USER = 'test-user__hermes-agent'

describe.skipIf(!HAS_DB)('Hermes agent (live integration)', () => {
  let connectDB: typeof import('@/lib/mongodb').connectDB
  let models: typeof import('@/lib/models')
  let agentAuth: typeof import('@/lib/agent-auth')
  let vaultOps: typeof import('@/lib/vault-ops')
  let vaultId: mongoose.Types.ObjectId
  let plaintextToken: string

  beforeAll(async () => {
    connectDB = (await import('@/lib/mongodb')).connectDB
    models = await import('@/lib/models')
    agentAuth = await import('@/lib/agent-auth')
    vaultOps = await import('@/lib/vault-ops')

    await connectDB()
    await models.AgentToken.deleteMany({ userId: TEST_USER })
    await models.Page.deleteMany({ userId: TEST_USER })
    await models.Vault.deleteMany({ userId: TEST_USER })

    const vault = await models.Vault.create({ userId: TEST_USER, name: 'Agent Brain' })
    vaultId = vault._id as mongoose.Types.ObjectId

    await models.Page.create({
      userId: TEST_USER, vaultId, slug: 'roadmap', title: 'Roadmap', type: 'concept',
      content: '---\ntitle: Roadmap\n---\n\n## Current Understanding\nQ2 roadmap prioritizes onboarding and pricing experiments.',
      summary: 'Q2 roadmap', relatedSlugs: [], tags: [], confidence: 'high', timelineEntries: 1,
    })

    // Mint a token the way the API does, persisting only the hash.
    const { token, tokenHash, prefix } = agentAuth.generateToken()
    plaintextToken = token
    await models.AgentToken.create({ userId: TEST_USER, name: 'test', tokenHash, prefix, scopes: ['read'] })
  }, 30_000)

  afterAll(async () => {
    if (!connectDB) return
    await models.AgentToken.deleteMany({ userId: TEST_USER })
    await models.Page.deleteMany({ userId: TEST_USER })
    await models.Vault.deleteMany({ userId: TEST_USER })
    await mongoose.connection.close()
  })

  it('generateToken produces sb_ prefixed token and a matching hash', () => {
    expect(plaintextToken.startsWith('sb_')).toBe(true)
    expect(agentAuth.hashToken(plaintextToken)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('authenticates a valid bearer token to the right user + scope', async () => {
    const req = new Request('https://x/api/agent/query', {
      headers: { authorization: `Bearer ${plaintextToken}` },
    }) as unknown as import('next/server').NextRequest

    const ctx = await agentAuth.authenticateAgent(req)
    expect(ctx).not.toBeNull()
    expect(ctx!.userId).toBe(TEST_USER)
    expect(agentAuth.hasScope(ctx!, 'read')).toBe(true)
    expect(agentAuth.hasScope(ctx!, 'write')).toBe(false)
  }, 15_000)

  it('rejects a bogus / revoked token', async () => {
    const bad = new Request('https://x', { headers: { authorization: 'Bearer sb_not-a-real-token' } }) as unknown as import('next/server').NextRequest
    expect(await agentAuth.authenticateAgent(bad)).toBeNull()

    const none = new Request('https://x') as unknown as import('next/server').NextRequest
    expect(await agentAuth.authenticateAgent(none)).toBeNull()
  }, 15_000)

  it.skipIf(!HAS_AI)('authenticated agent can run a synthesis query', async () => {
    const req = new Request('https://x', { headers: { authorization: `Bearer ${plaintextToken}` } }) as unknown as import('next/server').NextRequest
    const ctx = await agentAuth.authenticateAgent(req)
    expect(ctx).not.toBeNull()

    const result = await vaultOps.runQuery(ctx!.userId, 'What does the Q2 roadmap prioritize?')
    expect(typeof result.answer).toBe('string')
    expect(result.answer.length).toBeGreaterThan(10)
    expect(result.gap).toBeDefined()
    expect(typeof result.gap.confidence).toBe('number')
    console.log('[agent query answer]:', result.answer.slice(0, 160))
  }, 45_000)
})
