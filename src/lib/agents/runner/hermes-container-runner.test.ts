// HermesContainerRunner driver-behavior + driver-parity tests (task 8.5).
//
// Validates: Requirements 2.11 (driver parity / identical Aegis path) and the
// propose-never-write invariant (Property 1, Req 2.2/2.10) for the container
// path, plus the totality of `run()` (every failure → a safe `RunOutput`).
//
//   Req 2.11: "THE System SHALL run the propose-never-write runner against the
//   same vault data and operations REGARDLESS of whether the Agent executes via
//   the Claude+vault runner or a Hermes container."
//
// `@/lib/agent-service` (getAgent/startAgent/AgentServiceError) is mocked so no
// DB or container is touched; we drive the mocked control-plane fns per test.
// The driver routes diagnostics through `agentLog` (redaction-guarded), so we
// also assert no scoped token / BYO secret can reach a console sink.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── agent-service mock (hoisted above the SUT import) ─────────────────────────
vi.mock('@/lib/agent-service', () => ({
  getAgent: vi.fn(),
  startAgent: vi.fn(),
  AgentServiceError: class AgentServiceError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'AgentServiceError'
      this.status = status
    }
  },
}))

import { getAgent, startAgent, AgentServiceError } from '@/lib/agent-service'
import { HermesContainerRunner, ClaudeVaultRunner, getRunner } from './index'
import type { AgentView } from '@/lib/agent-service'
import type { RunContext, RunOutput, VaultTools } from './types'

const mockGetAgent = vi.mocked(getAgent)
const mockStartAgent = vi.mocked(startAgent)

const SECRET_TOKEN = 'sb_secret_token_value_0123456789abcdef0123'

// ── Builders ──────────────────────────────────────────────────────────────────

/** A minimal, valid RunContext (positive budget, real userId, dryRun off). */
function makeCtx(overrides: Partial<RunContext> = {}): RunContext {
  return {
    agent: { userId: 'user_1' },
    trigger: { kind: 'manual' },
    runId: 'run_hermes_1',
    scopedToken: SECRET_TOKEN,
    budget: { perRunTokens: 50_000, agentRemaining: 50_000, squadRemaining: 50_000 },
    dryRun: false,
    ...overrides,
  }
}

/** A full AgentView the control plane would return. */
function agentView(over: Partial<AgentView> = {}): AgentView {
  return {
    status: 'running',
    running: true,
    llmProvider: 'anthropic',
    llmModel: 'claude-3-5-sonnet',
    lastActiveAt: null,
    lastError: null,
    ...over,
  }
}

/**
 * A stub of the read-only VaultTools. The container does its OWN retrieval via
 * the token-authed `/api/agent/*` endpoints, so this driver must NEVER call any
 * of these bindings. Every method is a spy so we can assert that.
 */
function makeTools(): VaultTools {
  return {
    search: vi.fn(async () => []),
    query: vi.fn(async () => ({})),
    planIngest: vi.fn(async () => ({})),
    fetchSource: vi.fn(async () => ({ type: 'text' as const, title: 't', url: null, rawContent: '' })),
    scan: vi.fn(() => ({ status: 'clean' as const, findings: [] })),
  }
}

function expectToolsUntouched(tools: VaultTools) {
  expect(tools.search).not.toHaveBeenCalled()
  expect(tools.query).not.toHaveBeenCalled()
  expect(tools.planIngest).not.toHaveBeenCalled()
  expect(tools.fetchSource).not.toHaveBeenCalled()
  expect(tools.scan).not.toHaveBeenCalled()
}

/** Assert the value is a well-formed RunOutput (the shared downstream contract). */
function expectRunOutputShape(out: RunOutput) {
  expect(Array.isArray(out.proposals)).toBe(true)
  expect(Array.isArray(out.scanResults)).toBe(true)
  expect(typeof out.tokensUsed).toBe('number')
  expect(Array.isArray(out.trace)).toBe(true)
  expect(['completed', 'failed', 'budget-stopped', 'timeout']).toContain(out.outcome)
}

// ── Env save/restore (we toggle AGENT_DRIVER / NODE_ENV / AGENT_RUNNER) ────────
const ENV_KEYS = ['AGENT_DRIVER', 'NODE_ENV', 'AGENT_RUNNER'] as const
let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  vi.clearAllMocks()
  savedEnv = {}
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  // Default test posture: dev/test env, container runtime not available.
  process.env.NODE_ENV = 'test'
  delete process.env.AGENT_DRIVER
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

// ── 1. Missing user context ────────────────────────────────────────────────────
describe('HermesContainerRunner.run — precondition failures (totality)', () => {
  it('fails safely with "missing user context" when the agent has no userId', async () => {
    const runner = new HermesContainerRunner()
    const tools = makeTools()
    const out = await runner.run(makeCtx({ agent: {} }), tools)

    expect(out.outcome).toBe('failed')
    expect(out.failureReason).toBe('missing user context')
    expect(out.proposals).toEqual([])
    expectRunOutputShape(out)
    // Never consulted the control plane or the vault tools.
    expect(mockGetAgent).not.toHaveBeenCalled()
    expect(mockStartAgent).not.toHaveBeenCalled()
    expectToolsUntouched(tools)
  })

  // ── 2. No container provisioned ──────────────────────────────────────────────
  it('fails with "No Hermes container provisioned" and never tries to start', async () => {
    mockGetAgent.mockResolvedValue(agentView({ status: 'none', running: false }))
    const runner = new HermesContainerRunner()
    const tools = makeTools()
    const out = await runner.run(makeCtx(), tools)

    expect(out.outcome).toBe('failed')
    expect(out.failureReason).toMatch(/No Hermes container provisioned/i)
    expect(mockStartAgent).not.toHaveBeenCalled()
    expectToolsUntouched(tools)
  })

  // ── 3. Provisioned but stopped, start fails ──────────────────────────────────
  it('fails safely (never throws) when starting a stopped container is rejected', async () => {
    mockGetAgent.mockResolvedValue(agentView({ status: 'stopped', running: false }))
    mockStartAgent.mockRejectedValue(new AgentServiceError('at capacity', 503))
    const runner = new HermesContainerRunner()
    const tools = makeTools()

    const out = await runner.run(makeCtx(), tools)

    expect(out.outcome).toBe('failed')
    expect(typeof out.failureReason).toBe('string')
    expect(out.failureReason).toBe('at capacity')
    expect(mockStartAgent).toHaveBeenCalledWith('user_1')
    expectToolsUntouched(tools)
  })

  // ── 4. Dev/test environment degradation (the realistic CI path) ──────────────
  it('degrades to "Hermes container unavailable in this environment" under the Null driver', async () => {
    mockGetAgent.mockResolvedValue(agentView({ status: 'running', running: true }))
    process.env.NODE_ENV = 'test'
    delete process.env.AGENT_DRIVER // → NullProvisioner selection
    const runner = new HermesContainerRunner()
    const tools = makeTools()

    const out = await runner.run(makeCtx(), tools)

    expect(out.outcome).toBe('failed')
    expect(out.failureReason).toBe('Hermes container unavailable in this environment')
    expect(mockStartAgent).not.toHaveBeenCalled()
    expectToolsUntouched(tools)
  })
})

// ── 5 + 6. Reachable runtime: budget guard + honest empty success ─────────────
describe('HermesContainerRunner.run — docker runtime reachable', () => {
  it('returns budget-stopped when perRunTokens is non-positive', async () => {
    mockGetAgent.mockResolvedValue(agentView({ status: 'running', running: true }))
    process.env.AGENT_DRIVER = 'docker'
    const runner = new HermesContainerRunner()
    const tools = makeTools()

    const out = await runner.run(
      makeCtx({ budget: { perRunTokens: 0, agentRemaining: 0, squadRemaining: 0 } }),
      tools,
    )

    expect(out.outcome).toBe('budget-stopped')
    expect(out.proposals).toEqual([])
    expect(out.tokensUsed).toBe(0)
    expect(out.trace.some((t) => t.step === 'hermes-container:budget-stopped')).toBe(true)
    expectToolsUntouched(tools)
  })

  it('returns an HONEST empty completed result (no fabricated proposals) on success', async () => {
    mockGetAgent.mockResolvedValue(agentView({ status: 'running', running: true }))
    process.env.AGENT_DRIVER = 'docker'
    const runner = new HermesContainerRunner()
    const tools = makeTools()

    const out = await runner.run(makeCtx(), tools)

    expect(out.outcome).toBe('completed')
    expect(out.proposals).toEqual([]) // nothing fabricated
    expect(out.scanResults).toEqual([])
    expect(out.tokensUsed).toBe(0)
    expect(out.trace.some((t) => t.step === 'hermes-container:delegated')).toBe(true)
    expect(out.failureReason).toBeUndefined()
    expectRunOutputShape(out)
    expectToolsUntouched(tools)
  })

  it('starts a provisioned-but-stopped container before delegating', async () => {
    mockGetAgent.mockResolvedValue(agentView({ status: 'stopped', running: false }))
    mockStartAgent.mockResolvedValue(agentView({ status: 'running', running: true }))
    process.env.AGENT_DRIVER = 'docker'
    const runner = new HermesContainerRunner()

    const out = await runner.run(makeCtx(), makeTools())

    expect(mockStartAgent).toHaveBeenCalledWith('user_1')
    expect(out.outcome).toBe('completed')
  })
})

// ── 7. Propose-never-write / no write path (Req 2.11 + Property 1 spirit) ─────
describe('HermesContainerRunner.run — propose-never-write (no write path)', () => {
  it('emits proposals-only: the output is exactly a RunOutput whose proposals are DraftProposal[] (emitted, not applied)', async () => {
    mockGetAgent.mockResolvedValue(agentView({ status: 'running', running: true }))
    process.env.AGENT_DRIVER = 'docker'
    const runner = new HermesContainerRunner()
    const tools = makeTools()

    const out = await runner.run(makeCtx(), tools)

    // There is no `applyIngestPlan`/`applyProposal` reachable from the driver —
    // it returns proposals only. Document that via the shape + tool assertions.
    expectRunOutputShape(out)
    expect(Array.isArray(out.proposals)).toBe(true)
    for (const p of out.proposals) {
      expect(['ingest', 'synthesis', 'connection', 'flagged-content']).toContain(p.kind)
    }
    // The driver never invokes any read/plan VaultTools binding (the container
    // does its own retrieval), and there is no write binding to call at all.
    expect('applyIngestPlan' in tools).toBe(false)
    expectToolsUntouched(tools)
  })
})

// ── 8. No secret logged ─────────────────────────────────────────────────────────
describe('HermesContainerRunner.run — never logs the scoped token (Req 11.4/11.5)', () => {
  it('keeps the scoped token out of console output on both the failure and success paths', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const runner = new HermesContainerRunner()

    // Failure path: startAgent throws an error whose message embeds the token.
    mockGetAgent.mockResolvedValue(agentView({ status: 'stopped', running: false }))
    mockStartAgent.mockRejectedValue(new Error(`boom while using ${SECRET_TOKEN}`))
    process.env.AGENT_DRIVER = 'docker'
    await runner.run(makeCtx(), makeTools())

    // Success path: the delegated-run info log routes through agentLog (redacts).
    mockGetAgent.mockResolvedValue(agentView({ status: 'running', running: true }))
    await runner.run(makeCtx(), makeTools())

    const allOutput = [errSpy, warnSpy, infoSpy, logSpy]
      .flatMap((s) => s.mock.calls)
      .flat()
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ')

    expect(allOutput).not.toContain(SECRET_TOKEN)

    errSpy.mockRestore()
    warnSpy.mockRestore()
    infoSpy.mockRestore()
    logSpy.mockRestore()
  })
})

// ── 9. Driver parity (Req 2.11) ──────────────────────────────────────────────
describe('Driver parity — both runners satisfy the identical AgentRunner contract (Req 2.11)', () => {
  it('getRunner() selects HermesContainerRunner when AGENT_RUNNER=hermes', () => {
    process.env.AGENT_RUNNER = 'hermes'
    expect(getRunner()).toBeInstanceOf(HermesContainerRunner)
  })

  it('getRunner() defaults to ClaudeVaultRunner when AGENT_RUNNER is unset', () => {
    delete process.env.AGENT_RUNNER
    expect(getRunner()).toBeInstanceOf(ClaudeVaultRunner)
  })

  it('both drivers expose a run() method (structural parity)', () => {
    expect(typeof new HermesContainerRunner().run).toBe('function')
    expect(typeof new ClaudeVaultRunner().run).toBe('function')
  })

  it('both drivers produce a RunOutput with identical keys, consumed identically downstream', async () => {
    // Hermes driver: success path produces an honest, well-formed RunOutput.
    mockGetAgent.mockResolvedValue(agentView({ status: 'running', running: true }))
    process.env.AGENT_DRIVER = 'docker'
    const hermesOut = await new HermesContainerRunner().run(makeCtx(), makeTools())

    // Claude driver: an empty-input agent yields a clean, well-formed RunOutput
    // with no proposals (no ingestInputs ⇒ nothing to plan) and no vault writes.
    const claudeOut = await new ClaudeVaultRunner().run(
      makeCtx({ agent: { role: 'researcher', ingestInputs: [] } }),
      makeTools(),
    )

    expectRunOutputShape(hermesOut)
    expectRunOutputShape(claudeOut)

    // The shared RunOutput surface (what the Aegis path consumes) is identical.
    const keys = (o: RunOutput) => Object.keys(o).sort()
    const SHARED = ['outcome', 'proposals', 'scanResults', 'tokensUsed', 'trace']
    expect(keys(hermesOut).filter((k) => SHARED.includes(k))).toEqual([...SHARED])
    expect(keys(claudeOut).filter((k) => SHARED.includes(k))).toEqual([...SHARED])

    // Both emit `proposals` as a DraftProposal[] (emitted-not-applied) — the key
    // parity assertion: downstream Aegis consumes them the same way regardless
    // of which driver ran.
    expect(Array.isArray(hermesOut.proposals)).toBe(true)
    expect(Array.isArray(claudeOut.proposals)).toBe(true)
    expect(hermesOut.outcome).toBe('completed')
    expect(claudeOut.outcome).toBe('completed')
  })
})
