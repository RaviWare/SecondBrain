// Container security-invariant tests for the agent provisioner (task 8.5).
//
// Validates: Requirements 11.3 (and the AGENTS.md security mandate)
//   "WHERE the System provisions an agent container, THE System SHALL run the
//    container as a non-root user, with resource caps, network isolation, and NO
//    access to the host Docker socket, IN EVERY ENVIRONMENT including development
//    and testing."
//
// These are static/smoke assertions over the `HostConfig` that
// `DockerProvisioner.provision` hands to `dockerode.createContainer`. No real
// Docker daemon is involved: `dockerode` is mocked so `createContainer` simply
// records the argument it was called with. We assert the hard-isolation guards
// (`CapDrop:['ALL']`, `no-new-privileges`, resource caps, `RestartPolicy:'no'`,
// and NO host docker-socket bind mount) hold identically across NODE_ENV =
// production / development / test — proving the guards are env-independent.
//
// We also pin the BYO-key handling shape (key flows into the container `Env`,
// never into the inspectable `Labels`) and the `getProvisioner()` driver
// selection. No SUT is modified; if a guard is missing the test fails loudly.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ── dockerode mock (hoisted above the SUT import) ─────────────────────────────
// `createContainer` records its call args and returns a fake startable container.
// `getContainer` backs the idempotent pre-remove (`this.remove(...).catch()`).
const dockerMocks = vi.hoisted(() => {
  const start = vi.fn(async () => {})
  const remove = vi.fn(async () => {})
  const createContainer = vi.fn(async () => ({ id: 'fake-container-id', start }))
  const getContainer = vi.fn(() => ({ remove, start, inspect: vi.fn(), stop: vi.fn() }))
  return { createContainer, getContainer, start, remove }
})

vi.mock('dockerode', () => ({
  default: vi.fn().mockImplementation(() => ({
    createContainer: dockerMocks.createContainer,
    getContainer: dockerMocks.getContainer,
  })),
}))

import { DockerProvisioner, NullProvisioner, type ProvisionInput } from '@/lib/agent-provisioner'

// ── A representative provision input ──────────────────────────────────────────
const INPUT: ProvisionInput = {
  userId: 'user_sec_1',
  containerName: 'hermes-abc123def456',
  brainToken: 'sb_brain_token_value_should_never_leak_0123456789',
  brainApiBase: 'http://secondbrain-web:3000',
  llmProvider: 'anthropic',
  llmModel: 'claude-3-5-sonnet',
  llmApiKey: 'sk-ant-secret-byo-key-value-0123456789',
}

// Loose shape of the object passed to dockerode.createContainer.
type CreateArg = {
  name?: string
  Image?: string
  Env?: string[]
  Labels?: Record<string, string>
  HostConfig?: {
    NetworkMode?: string
    Memory?: number
    NanoCpus?: number
    PidsLimit?: number
    CapDrop?: string[]
    SecurityOpt?: string[]
    RestartPolicy?: { Name?: string }
    Binds?: string[]
    Mounts?: unknown[]
    ReadonlyRootfs?: boolean
  }
}

/** Drive a real `DockerProvisioner.provision` and capture the createContainer arg. */
async function provisionAndCapture(): Promise<CreateArg> {
  const provisioner = new DockerProvisioner()
  await provisioner.provision(INPUT)
  const calls = dockerMocks.createContainer.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[calls.length - 1][0] as CreateArg
}

/** The full set of non-negotiable container-hardening invariants (Req 11.3). */
function assertSecurityInvariants(arg: CreateArg) {
  const hc = arg.HostConfig ?? {}

  // Drop ALL Linux capabilities.
  expect(hc.CapDrop).toEqual(['ALL'])

  // No privilege escalation.
  expect(hc.SecurityOpt).toContain('no-new-privileges')

  // Resource caps are applied and strictly positive.
  expect(typeof hc.Memory).toBe('number')
  expect(hc.Memory as number).toBeGreaterThan(0)
  expect(typeof hc.NanoCpus).toBe('number')
  expect(hc.NanoCpus as number).toBeGreaterThan(0)
  expect(typeof hc.PidsLimit).toBe('number')
  expect(hc.PidsLimit as number).toBeGreaterThan(0)

  // Never auto-restart (no surprise resurrection of a killed agent).
  expect(hc.RestartPolicy?.Name).toBe('no')

  // Network isolation: pinned to a dedicated agent network, never host networking.
  expect(typeof hc.NetworkMode).toBe('string')
  expect(hc.NetworkMode).not.toBe('host')

  // NO host Docker socket / bind mounts of any kind.
  const binds = hc.Binds
  expect(binds === undefined || (Array.isArray(binds) && binds.length === 0)).toBe(true)

  // Deep, exhaustive check: the host docker socket must not appear ANYWHERE in
  // the create spec (no Binds, no Mounts, no env smuggling).
  const deep = JSON.stringify(arg)
  expect(deep).not.toContain('docker.sock')
  expect(deep).not.toContain('/var/run/docker')
}

// ── Env save/restore (we mutate NODE_ENV + driver selection per case) ─────────
const ENV_KEYS = ['NODE_ENV', 'AGENT_DRIVER', 'DOCKER_HOST', 'DOCKER_SOCKET'] as const
let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  vi.clearAllMocks()
  savedEnv = {}
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

// ── 1 + 2. Core HostConfig security invariants ────────────────────────────────
describe('DockerProvisioner.provision — container security invariants (Req 11.3)', () => {
  it('builds a HostConfig that drops ALL caps, forbids privilege escalation, caps resources, and never restarts', async () => {
    const arg = await provisionAndCapture()
    assertSecurityInvariants(arg)
  })

  it('starts the created container (provision is a create-then-start)', async () => {
    await provisionAndCapture()
    expect(dockerMocks.start).toHaveBeenCalledTimes(1)
  })

  // ── 3. "in all envs": guards are env-independent ───────────────────────────
  it.each(['production', 'development', 'test'] as const)(
    'enforces the SAME hardening guards when NODE_ENV=%s',
    async (env) => {
      vi.clearAllMocks()
      process.env.NODE_ENV = env
      // A fresh provisioner per case (the Docker ctor reads DOCKER_HOST/socket env).
      const provisioner = new DockerProvisioner()
      await provisioner.provision(INPUT)
      const arg = dockerMocks.createContainer.mock.calls.at(-1)![0] as CreateArg
      assertSecurityInvariants(arg)
    },
  )

  it('produces byte-identical HostConfig guards across production/development/test', async () => {
    const guards: string[] = []
    for (const env of ['production', 'development', 'test'] as const) {
      vi.clearAllMocks()
      process.env.NODE_ENV = env
      const arg = await provisionAndCapture()
      const hc = arg.HostConfig ?? {}
      guards.push(
        JSON.stringify({
          CapDrop: hc.CapDrop,
          SecurityOpt: hc.SecurityOpt,
          PidsLimit: hc.PidsLimit,
          RestartPolicy: hc.RestartPolicy,
          Binds: hc.Binds ?? null,
        }),
      )
    }
    // All three serialized guard sets are identical.
    expect(new Set(guards).size).toBe(1)
  })

  // ── 4. BYO key handling shape ──────────────────────────────────────────────
  it('passes the BYO LLM key through the container Env, never into the inspectable Labels', async () => {
    const arg = await provisionAndCapture()

    // The key flows into the container env, exactly once, as LLM_API_KEY=...
    const env = arg.Env ?? []
    expect(env).toContain(`LLM_API_KEY=${INPUT.llmApiKey}`)

    // Labels are non-secret metadata: the key must NOT appear there.
    const labels = arg.Labels ?? {}
    const labelsStr = JSON.stringify(labels)
    expect(labelsStr).not.toContain(INPUT.llmApiKey)
    // Labels carry only the agent marker + owning user id (documents intent).
    expect(labels['secondbrain.agent']).toBe('true')
    expect(labels['secondbrain.userId']).toBe(INPUT.userId)
  })

  it('injects the scoped brain token via Env (not Labels), keeping it out of persisted metadata', async () => {
    const arg = await provisionAndCapture()
    const env = arg.Env ?? []
    expect(env).toContain(`SECONDBRAIN_TOKEN=${INPUT.brainToken}`)
    expect(JSON.stringify(arg.Labels ?? {})).not.toContain(INPUT.brainToken)
  })
})

// ── 5. getProvisioner() driver selection ──────────────────────────────────────
// getProvisioner memoizes a module-level singleton, so we vi.resetModules() and
// re-import per case to get a clean selection. The dockerode mock still applies
// to the freshly imported module (vi.mock is hoisted and global to this file).
describe('getProvisioner — driver selection (Req 11.3 applies to the docker driver)', () => {
  it('returns a NullProvisioner when AGENT_DRIVER=null', async () => {
    vi.resetModules()
    process.env.AGENT_DRIVER = 'null'
    const mod = await import('@/lib/agent-provisioner')
    const p = mod.getProvisioner()
    expect(p).toBeInstanceOf(mod.NullProvisioner)
  })

  it('returns a DockerProvisioner when AGENT_DRIVER=docker', async () => {
    vi.resetModules()
    process.env.AGENT_DRIVER = 'docker'
    const mod = await import('@/lib/agent-provisioner')
    const p = mod.getProvisioner()
    expect(p).toBeInstanceOf(mod.DockerProvisioner)
  })

  it('memoizes the selected provisioner (same instance on repeat calls)', async () => {
    vi.resetModules()
    process.env.AGENT_DRIVER = 'null'
    const mod = await import('@/lib/agent-provisioner')
    expect(mod.getProvisioner()).toBe(mod.getProvisioner())
  })
})

// ── NullProvisioner: dev/test driver runs nothing, exposes no container ────────
describe('NullProvisioner — records intent but runs no container', () => {
  it('returns a synthetic containerId and an exists:false / running:false status', async () => {
    const p = new NullProvisioner()
    const { containerId } = await p.provision(INPUT)
    expect(containerId).toBe(`null-${INPUT.containerName}`)

    const status = await p.status()
    expect(status).toEqual({ exists: false, running: false, containerId: null })

    // Lifecycle ops are safe no-ops (never touch a daemon).
    await expect(p.start()).resolves.toBeUndefined()
    await expect(p.stop()).resolves.toBeUndefined()
    await expect(p.remove()).resolves.toBeUndefined()
  })
})
