// ── Agent control-plane integration ───────────────────────────────────────────
// Verifies the per-user Hermes lifecycle logic (provision → status → stop) and
// scoped-token minting against real MongoDB, using the Null provisioner driver
// (no Docker needed). Forces AGENT_DRIVER=null before importing the service.
import './load-env'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'

process.env.AGENT_DRIVER = 'null'

const HAS_DB = !!process.env.MONGODB_URI
const TEST_USER = 'test-user__agent-service'

describe.skipIf(!HAS_DB)('Agent control plane (live MongoDB, null driver)', () => {
  let connectDB: typeof import('@/lib/mongodb').connectDB
  let models: typeof import('@/lib/models')
  let svc: typeof import('@/lib/agent-service')

  beforeAll(async () => {
    connectDB = (await import('@/lib/mongodb')).connectDB
    models = await import('@/lib/models')
    svc = await import('@/lib/agent-service')
    await connectDB()
    await models.UserAgent.deleteMany({ userId: TEST_USER })
    await models.AgentToken.deleteMany({ userId: TEST_USER })
  }, 30_000)

  afterAll(async () => {
    if (!connectDB) return
    await models.UserAgent.deleteMany({ userId: TEST_USER })
    await models.AgentToken.deleteMany({ userId: TEST_USER })
    await mongoose.connection.close()
  })

  it('starts as status=none', async () => {
    const v = await svc.getAgent(TEST_USER)
    expect(v.status).toBe('none')
    expect(v.running).toBe(false)
  })

  it('rejects provision without an API key', async () => {
    await expect(
      svc.provisionAgent(TEST_USER, { llmProvider: 'openrouter', llmModel: 'x', llmApiKey: '' })
    ).rejects.toThrow(/API key/i)
  })

  it('provisions an agent and mints a scoped read+write token', async () => {
    const v = await svc.provisionAgent(TEST_USER, {
      llmProvider: 'openrouter', llmModel: 'openai/gpt-4o-mini', llmApiKey: 'sk-test-123',
    })
    expect(v.status).toBe('running')
    expect(v.llmProvider).toBe('openrouter')

    const agent = await models.UserAgent.findOne({ userId: TEST_USER })
    expect(agent?.containerName).toMatch(/^hermes-/)
    expect(agent?.tokenId).toBeTruthy()

    const token = await models.AgentToken.findById(agent!.tokenId)
    expect(token?.scopes).toEqual(expect.arrayContaining(['read', 'write']))
    expect(token?.revoked).toBe(false)
    // BYO key must never be persisted on the agent record.
    expect(JSON.stringify(agent)).not.toContain('sk-test-123')
  }, 20_000)

  it('re-provision revokes the prior token and mints a fresh one', async () => {
    const before = await models.UserAgent.findOne({ userId: TEST_USER })
    const oldTokenId = before!.tokenId

    await svc.provisionAgent(TEST_USER, {
      llmProvider: 'anthropic', llmModel: 'claude-haiku-4-5', llmApiKey: 'sk-test-456',
    })

    const oldToken = await models.AgentToken.findById(oldTokenId)
    expect(oldToken?.revoked).toBe(true)

    const after = await models.UserAgent.findOne({ userId: TEST_USER })
    expect(after!.tokenId).not.toBe(oldTokenId)
    expect(after!.llmProvider).toBe('anthropic')
  }, 20_000)

  it('stops the agent → status=stopped', async () => {
    const v = await svc.stopAgent(TEST_USER)
    expect(v.status).toBe('stopped')
    expect(v.running).toBe(false)
  }, 15_000)
})
