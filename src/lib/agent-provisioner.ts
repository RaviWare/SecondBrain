// ── Agent Provisioner ─────────────────────────────────────────────────────────
// Abstraction over "where agents run". The Docker driver creates one sandboxed
// Hermes container per user on the local Docker host. The interface is designed
// so a future driver (remote Docker host #2, k8s, etc.) can be swapped in without
// touching the control-plane routes.
//
// SECURITY: agent containers are non-root, CPU/mem/pids-capped, on an isolated
// network, and have NO access to the host Docker socket. The BYO LLM key is passed
// as an env var at start time and never persisted to the database.
import Docker from 'dockerode'

export type ProvisionInput = {
  userId: string
  /** Stable container name, e.g. hermes-<short-user-hash> */
  containerName: string
  /** Scoped SecondBrain brain token (Bearer) the agent uses as its memory. */
  brainToken: string
  /** Public base URL of the SecondBrain agent API the container should call. */
  brainApiBase: string
  /** BYO model config (key is NOT stored in DB — only flows through here). */
  llmProvider: string
  llmModel: string
  llmApiKey: string
}

export type AgentRuntimeStatus = {
  exists: boolean
  running: boolean
  containerId: string | null
  state?: string
}

export interface AgentProvisioner {
  provision(input: ProvisionInput): Promise<{ containerId: string }>
  start(containerName: string): Promise<void>
  stop(containerName: string): Promise<void>
  remove(containerName: string): Promise<void>
  status(containerName: string): Promise<AgentRuntimeStatus>
}

// ── Config (env-driven so it differs dev vs prod) ─────────────────────────────
const HERMES_IMAGE = process.env.HERMES_IMAGE || 'secondbrain/hermes-agent:latest'
const AGENT_NETWORK = process.env.AGENT_NETWORK || 'agents'
const AGENT_CPUS = Number(process.env.AGENT_CPUS || '0.75')
const AGENT_MEMORY_MB = Number(process.env.AGENT_MEMORY_MB || '900')
const AGENT_PIDS_LIMIT = Number(process.env.AGENT_PIDS_LIMIT || '256')

// ── Docker driver ─────────────────────────────────────────────────────────────
export class DockerProvisioner implements AgentProvisioner {
  private docker: Docker

  constructor() {
    // Defaults to the local socket (/var/run/docker.sock). On the Hetzner host the
    // web container mounts the socket read-only; in dev it talks to local Docker.
    this.docker = new Docker(
      process.env.DOCKER_HOST
        ? { host: process.env.DOCKER_HOST, port: Number(process.env.DOCKER_PORT || 2375) }
        : { socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' }
    )
  }

  async provision(input: ProvisionInput): Promise<{ containerId: string }> {
    // Remove any stale container with the same name first (idempotent re-provision).
    await this.remove(input.containerName).catch(() => {})

    const container = await this.docker.createContainer({
      name: input.containerName,
      Image: HERMES_IMAGE,
      Env: [
        `SECONDBRAIN_USER_ID=${input.userId}`,
        `SECONDBRAIN_API_BASE=${input.brainApiBase}`,
        `SECONDBRAIN_TOKEN=${input.brainToken}`,
        `LLM_PROVIDER=${input.llmProvider}`,
        `LLM_MODEL=${input.llmModel}`,
        `LLM_API_KEY=${input.llmApiKey}`,
        `IDLE_STOP_MINUTES=${process.env.AGENT_IDLE_STOP_MINUTES || '10'}`,
      ],
      Labels: {
        'secondbrain.agent': 'true',
        'secondbrain.userId': input.userId,
      },
      HostConfig: {
        NetworkMode: AGENT_NETWORK,
        // Hard isolation + caps:
        ReadonlyRootfs: false, // Hermes writes to ~/.hermes; use a tmpfs/volume instead of host
        Memory: AGENT_MEMORY_MB * 1024 * 1024,
        NanoCpus: Math.round(AGENT_CPUS * 1e9),
        PidsLimit: AGENT_PIDS_LIMIT,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        RestartPolicy: { Name: 'no' },
        // NOTE: the host docker socket is NEVER mounted into agent containers.
      },
    })

    await container.start()
    return { containerId: container.id }
  }

  async start(containerName: string): Promise<void> {
    const c = this.docker.getContainer(containerName)
    const info = await c.inspect()
    if (!info.State.Running) await c.start()
  }

  async stop(containerName: string): Promise<void> {
    const c = this.docker.getContainer(containerName)
    await c.stop({ t: 5 }).catch((e: { statusCode?: number }) => {
      // 304 = already stopped; ignore
      if (e?.statusCode !== 304) throw e
    })
  }

  async remove(containerName: string): Promise<void> {
    const c = this.docker.getContainer(containerName)
    await c.remove({ force: true })
  }

  async status(containerName: string): Promise<AgentRuntimeStatus> {
    try {
      const info = await this.docker.getContainer(containerName).inspect()
      return {
        exists: true,
        running: info.State.Running,
        containerId: info.Id,
        state: info.State.Status,
      }
    } catch {
      return { exists: false, running: false, containerId: null }
    }
  }
}

// ── Null driver (local dev without Docker) ────────────────────────────────────
// Lets the control plane + UI be developed/tested without a Docker daemon. It
// records intent but runs nothing. Selected when AGENT_DRIVER=null.
export class NullProvisioner implements AgentProvisioner {
  async provision(input: ProvisionInput) {
    return { containerId: `null-${input.containerName}` }
  }
  async start() {}
  async stop() {}
  async remove() {}
  async status(): Promise<AgentRuntimeStatus> {
    return { exists: false, running: false, containerId: null }
  }
}

let _provisioner: AgentProvisioner | null = null
export function getProvisioner(): AgentProvisioner {
  if (_provisioner) return _provisioner
  const driver = process.env.AGENT_DRIVER || (process.env.NODE_ENV === 'production' ? 'docker' : 'null')
  _provisioner = driver === 'docker' ? new DockerProvisioner() : new NullProvisioner()
  return _provisioner
}
