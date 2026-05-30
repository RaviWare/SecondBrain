// ── Agent service (control-plane logic) ───────────────────────────────────────
// Orchestrates the per-user Hermes agent lifecycle: mint a scoped brain token,
// provision/start/stop the container, enforce the concurrency cap, and keep the
// UserAgent record in sync. API routes stay thin and call into here.
import { createHash } from 'node:crypto'
import { connectDB } from '@/lib/mongodb'
import { UserAgent, AgentToken } from '@/lib/models'
import { generateToken } from '@/lib/agent-auth'
import { getProvisioner, type ProvisionInput } from '@/lib/agent-provisioner'

const MAX_ACTIVE_AGENTS = Number(process.env.MAX_ACTIVE_AGENTS || '4')

export class AgentServiceError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

/** Stable, collision-resistant container name from a Clerk userId. */
function containerNameFor(userId: string): string {
  const hash = createHash('sha256').update(userId).digest('hex').slice(0, 12)
  return `hermes-${hash}`
}

function brainApiBase(): string {
  // Inside the docker network the agent reaches the web app by service name.
  // Falls back to the public URL for dev / single-host setups.
  return process.env.INTERNAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://secondbrain-web:3000'
}

export type AgentView = {
  status: string
  running: boolean
  llmProvider: string | null
  llmModel: string | null
  lastActiveAt: string | null
  lastError: string | null
}

type UserAgentDoc = {
  status: string
  running?: boolean
  llmProvider: string | null
  llmModel: string | null
  lastActiveAt?: Date | null
  lastError: string | null
} | null

function toView(agent: UserAgentDoc, running?: boolean): AgentView {
  if (!agent) {
    return { status: 'none', running: false, llmProvider: null, llmModel: null, lastActiveAt: null, lastError: null }
  }
  return {
    status: agent.status,
    running: running ?? agent.status === 'running',
    llmProvider: agent.llmProvider,
    llmModel: agent.llmModel,
    lastActiveAt: agent.lastActiveAt?.toISOString() ?? null,
    lastError: agent.lastError,
  }
}

export async function getAgent(userId: string): Promise<AgentView> {
  await connectDB()
  const agent = await UserAgent.findOne({ userId })
  if (!agent) return toView(null)

  // Reconcile with the real container state (only meaningful for the Docker driver).
  let running = agent.status === 'running'
  if (agent.containerName) {
    const rt = await getProvisioner().status(agent.containerName)
    // Only trust the runtime when the container actually exists; the Null driver
    // (dev/test) reports exists:false and must NOT downgrade DB state.
    if (rt.exists) {
      running = rt.running
      if (agent.status === 'running' && !rt.running) {
        agent.status = 'stopped'
        await agent.save()
      }
    }
  }
  return toView(agent, running)
}

async function activeAgentCount(excludeUserId?: string): Promise<number> {
  const q: Record<string, unknown> = { status: 'running' }
  if (excludeUserId) q.userId = { $ne: excludeUserId }
  return UserAgent.countDocuments(q)
}

/**
 * Provision (or re-provision) a user's agent: mint a fresh scoped brain token,
 * start a sandboxed Hermes container wired to the user's vault + BYO LLM key.
 */
export async function provisionAgent(
  userId: string,
  opts: { llmProvider: string; llmModel: string; llmApiKey: string }
): Promise<AgentView> {
  if (!opts.llmApiKey?.trim()) throw new AgentServiceError('LLM API key required', 400)
  if (!opts.llmProvider?.trim() || !opts.llmModel?.trim()) {
    throw new AgentServiceError('LLM provider and model required', 400)
  }

  await connectDB()

  if ((await activeAgentCount(userId)) >= MAX_ACTIVE_AGENTS) {
    throw new AgentServiceError('Server is at capacity. Try again shortly.', 503)
  }

  const containerName = containerNameFor(userId)

  // Revoke any prior token for this agent, mint a fresh read+write one.
  const prior = await UserAgent.findOne({ userId })
  if (prior?.tokenId) {
    await AgentToken.updateOne({ _id: prior.tokenId }, { revoked: true }).catch(() => {})
  }
  const { token, tokenHash, prefix } = generateToken()
  const tokenDoc = await AgentToken.create({
    userId, name: 'Hermes agent (auto)', tokenHash, prefix, scopes: ['read', 'write'],
  })

  await UserAgent.updateOne(
    { userId },
    {
      userId,
      status: 'provisioning',
      containerName,
      tokenId: String(tokenDoc._id),
      llmProvider: opts.llmProvider,
      llmModel: opts.llmModel,
      lastError: null,
    },
    { upsert: true }
  )

  const input: ProvisionInput = {
    userId,
    containerName,
    brainToken: token,
    brainApiBase: brainApiBase(),
    llmProvider: opts.llmProvider,
    llmModel: opts.llmModel,
    llmApiKey: opts.llmApiKey,
  }

  try {
    const { containerId } = await getProvisioner().provision(input)
    await UserAgent.updateOne(
      { userId },
      { status: 'running', containerId, lastActiveAt: new Date() }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Provision failed'
    await UserAgent.updateOne({ userId }, { status: 'error', lastError: message })
    throw new AgentServiceError(`Failed to start agent: ${message}`, 500)
  }

  // Return the persisted state directly. We don't run getAgent()'s container
  // reconciliation here because the container was just started — and the Null
  // driver (dev/test) reports nothing, which would spuriously downgrade status.
  const fresh = await UserAgent.findOne({ userId })
  return toView(fresh)
}

export async function startAgent(userId: string): Promise<AgentView> {
  await connectDB()
  const agent = await UserAgent.findOne({ userId })
  if (!agent?.containerName) throw new AgentServiceError('No agent provisioned. Provision first.', 404)

  if ((await activeAgentCount(userId)) >= MAX_ACTIVE_AGENTS) {
    throw new AgentServiceError('Server is at capacity. Try again shortly.', 503)
  }

  try {
    await getProvisioner().start(agent.containerName)
    agent.status = 'running'
    agent.lastActiveAt = new Date()
    agent.lastError = null
    await agent.save()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Start failed'
    agent.status = 'error'
    agent.lastError = message
    await agent.save()
    throw new AgentServiceError(message, 500)
  }
  return getAgent(userId)
}

export async function stopAgent(userId: string): Promise<AgentView> {
  await connectDB()
  const agent = await UserAgent.findOne({ userId })
  if (!agent?.containerName) return getAgent(userId)

  await getProvisioner().stop(agent.containerName).catch(() => {})
  agent.status = 'stopped'
  await agent.save()
  return getAgent(userId)
}

export { MAX_ACTIVE_AGENTS }
