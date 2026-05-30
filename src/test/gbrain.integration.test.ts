// ── GBrain features · live integration test ───────────────────────────────────
// Exercises the REAL code paths against REAL MongoDB + Claude using a synthetic
// test user (a dedicated userId seeded directly in the DB). Verifies:
//   #2 Self-wiring knowledge graph — wireGraphBatch creates bidirectional edges
//   #1 Synthesis + gap analysis    — queryWiki returns answer + gap object
//
// Run with:  npx vitest run src/test/gbrain.integration.test.ts --config vitest.config.ts
// Skips automatically if MONGODB_URI / ANTHROPIC_API_KEY are absent.
import './load-env'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import mongoose from 'mongoose'

const HAS_DB = !!process.env.MONGODB_URI
const HAS_AI = !!process.env.ANTHROPIC_API_KEY
const TEST_USER = 'test-user__gbrain-integration'

describe.skipIf(!HAS_DB)('GBrain features (live integration)', () => {
  let connectDB: typeof import('@/lib/mongodb').connectDB
  let models: typeof import('@/lib/models')
  let autoLink: typeof import('@/lib/auto-link')
  let claude: typeof import('@/lib/claude')
  let vaultId: mongoose.Types.ObjectId

  beforeAll(async () => {
    connectDB = (await import('@/lib/mongodb')).connectDB
    models = await import('@/lib/models')
    autoLink = await import('@/lib/auto-link')
    claude = await import('@/lib/claude')

    await connectDB()

    // Clean any prior run, then seed a fresh test vault + 3 linked pages.
    await models.Page.deleteMany({ userId: TEST_USER })
    await models.Vault.deleteMany({ userId: TEST_USER })

    const vault = await models.Vault.create({ userId: TEST_USER, name: 'Test Brain' })
    vaultId = vault._id as mongoose.Types.ObjectId

    const base = (slug: string, title: string, body: string) => ({
      userId: TEST_USER,
      vaultId,
      slug,
      title,
      type: 'concept' as const,
      content: `---\ntitle: ${title}\ntype: concept\n---\n\n## Current Understanding\n${body}`,
      summary: title,
      relatedSlugs: [],
      tags: [],
      confidence: 'high' as const,
      timelineEntries: 1,
    })

    await models.Page.create(base('pricing-strategy', 'Pricing Strategy',
      'The team decided to raise Pro plan pricing. This connects to the [[gtm-plan]] and reflects [[customer-insights]].'))
    await models.Page.create(base('gtm-plan', 'GTM Plan',
      'Go-to-market plan for Q2. Channels were locked. Relates to [[pricing-strategy]].'))
    await models.Page.create(base('customer-insights', 'Customer Insights',
      'Customers asked for better onboarding. No mention of pricing sensitivity yet.'))
  }, 30_000)

  afterAll(async () => {
    if (!connectDB) return
    await models.Page.deleteMany({ userId: TEST_USER })
    await models.Vault.deleteMany({ userId: TEST_USER })
    await mongoose.connection.close()
  })

  it('#2 self-wiring graph: creates bidirectional edges from [[wikilinks]]', async () => {
    const stats = await autoLink.wireGraphBatch(TEST_USER, vaultId, [
      'pricing-strategy',
      'gtm-plan',
      'customer-insights',
    ])

    // pricing-strategy links to gtm-plan + customer-insights; gtm-plan links back.
    expect(stats.resolved).toBeGreaterThan(0)

    const pricing = await models.Page.findOne({ userId: TEST_USER, vaultId, slug: 'pricing-strategy' }).lean()
    const gtm = await models.Page.findOne({ userId: TEST_USER, vaultId, slug: 'gtm-plan' }).lean()

    // forward edges from pricing-strategy
    expect(pricing?.relatedSlugs).toContain('gtm-plan')
    expect(pricing?.relatedSlugs).toContain('customer-insights')

    // BACKLINK: gtm-plan should now point back to pricing-strategy (bidirectional)
    expect(gtm?.relatedSlugs).toContain('pricing-strategy')
  }, 30_000)

  it.skipIf(!HAS_AI)('#1 synthesis + gap analysis: returns answer and gap object', async () => {
    const pages = await models.Page.find({ userId: TEST_USER, vaultId }).lean()
    const { answer, citedSlugs, gap } = await claude.queryWiki(
      'What is our pricing strategy and how price-sensitive are customers?',
      pages.map(p => ({ title: p.title, slug: p.slug, content: p.content, updatedAt: p.updatedAt }))
    )

    // synthesis answer present and non-trivial
    expect(typeof answer).toBe('string')
    expect(answer.length).toBeGreaterThan(20)
    expect(Array.isArray(citedSlugs)).toBe(true)

    // gap analysis structure is well-formed
    expect(gap).toBeDefined()
    expect(Array.isArray(gap.gaps)).toBe(true)
    expect(Array.isArray(gap.staleSlugs)).toBe(true)
    expect(Array.isArray(gap.contradictions)).toBe(true)
    expect(typeof gap.confidence).toBe('number')
    expect(gap.confidence).toBeGreaterThanOrEqual(0)
    expect(gap.confidence).toBeLessThanOrEqual(1)

    // The brain SHOULD flag a gap: customer pricing-sensitivity is explicitly absent.
    // (Soft assertion — log it so we can see the real model output.)
    console.log('[gap] confidence:', gap.confidence)
    console.log('[gap] gaps:', gap.gaps)
    console.log('[answer]:', answer.slice(0, 200))
  }, 45_000)
})
