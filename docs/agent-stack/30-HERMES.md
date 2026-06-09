# Hermes Agent — Per-User Autonomous Agent

> **What it is:** Nous Research's self-improving autonomous agent (learning loop,
> skill creation, cron, messaging gateways, 40+ tools). In SecondBrain OS, **each
> user gets their own isolated Hermes container** whose memory is that user's vault.

## Key fact: Hermes is single-tenant

One Hermes process = one user's agent (one `~/.hermes`, one SOUL, one memory, one
set of keys). Multi-user therefore means **one container per user**, never one
shared Hermes. This drives the entire architecture (see `00-PLAN.md`).

## How a user's agent is wired

```
User ── chat ──▶ secondbrain-web ── docker API ──▶ hermes-<userId> container
                                                        │
                                                        │ uses as its brain (BYO LLM key)
                                                        ▼
                              SecondBrain agent API  (Bearer sb_<scoped token>)
                              /api/agent/query|search|ingest
                                                        │
                                                        ▼
                                              user's MongoDB vault
```

- **Brain = the user's vault**, via the token-authed `/api/agent/*` endpoints.
- **LLM = the user's own key** (BYO), entered in `/app/agent`, passed to the
  container at provision time as an env var. Never logged, never shared.
- **Isolation:** non-root, CPU/mem capped, on the `agents` Docker network, NO host
  Docker socket, egress restricted to the brain API + the chosen LLM provider.
- **Lifecycle:** provisioned on first use, idle-auto-stopped after N minutes,
  re-started on next message. Concurrency capped to fit server RAM.

## Skills baked into the sandbox image

The Hermes sandbox image installs:
- **gstack** skill pack (`./setup --host hermes`) — thinking/review/QA skills
- **GBrain** skills (the markdown skillpack) so the agent knows brain-first patterns
- A SecondBrain **brain connector** that registers `secondbrain_query/search/ingest`
  as native tools pointing at the user's scoped token

## Updating the Hermes Sandbox Image (Server)

Coolify automatically deploys the main SecondBrain web app on push, but the Hermes sandbox container (`secondbrain/hermes-agent:latest`) is a separate image that must be updated manually.

1. **SSH into the server**: `ssh root@<hetzner-ip>`
2. **Navigate to project**: `cd /var/www/SecondBrain` (or where the repo is cloned)
3. **Pull and Build**: 
   ```bash
   git pull origin main
   docker build -t secondbrain/hermes-agent:latest docker/hermes
   ```
This automatically fetches the newest Hermes installer script inside the Dockerfile.

## Manual Hermes install (reference — the standalone runtime)

This is what the sandbox image automates. Do NOT run this on the app host outside a
container; it executes shell commands.

```bash
# Official installer (Linux/macOS/WSL2)
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
source ~/.bashrc

hermes setup            # full wizard
hermes model            # pick the BYO model/provider
hermes tools            # enable tools
hermes gateway          # (optional) Telegram/Discord/Slack gateway
```

Key CLI:
| Command | Purpose |
|---|---|
| `hermes` | Interactive agent CLI |
| `hermes model [provider:model]` | Choose LLM (BYO key) |
| `hermes tools` | Toggle tools |
| `hermes gateway start` | Messaging gateway |
| `hermes config set` | Set config values |
| `hermes doctor` | Diagnose |

## Pricing: bundled FREE

Hermes is included at no extra charge. Compute runs on the Hetzner box we already
pay for; LLM tokens are the user's (BYO). The only protected resource is server RAM,
guarded by idle-auto-stop + a concurrency cap (see `00-PLAN.md` cost model). A future
Pro lever could gate *concurrent agents* or *always-on* mode — not the feature.

## Security posture (must-haves before public launch)

- Container runs **non-root**, read-only root FS where possible.
- **No host Docker socket** inside agent containers.
- **Network policy:** agents can reach only the brain API + the LLM provider.
- **Resource caps:** `--cpus`, `--memory`, pids-limit per container.
- **Command-approval policy** on Hermes (no unrestricted shell).
- **Audit log** of every provision/start/stop and agent tool call.
- Run `/cso` (gstack) against the control plane before exposing it.

## Build status
- [x] Phase 2 — `UserAgent` model + provisioner + control API (in repo:
  `src/lib/agent-service.ts`, `src/lib/agent-provisioner.ts`,
  `/api/agent-instance/{provision,start,stop,status}`)
- [x] Phase 3 — Hermes sandbox Dockerfile (`docker/hermes/`, brain connector +
  idle-watchdog + entrypoint)
- [x] `/app/agent` chat UI (`src/app/app/agent/page.tsx`)
- [x] Guardrails + idle-stop — provisioner enforces non-root / CapDrop ALL /
  no-new-privileges / resource caps / no host socket (test-pinned in
  `agent-provisioner.test.ts`); idle auto-stop via `idle-watchdog.sh`
- [ ] Container audit log of every provision/start/stop + agent tool call (deferred)
- [ ] `HermesContainerRunner` live wire-protocol — the driver exists behind the
  `AgentRunner` interface (`AGENT_RUNNER=hermes`) and is read-only-scoped so
  propose-never-write holds, but the live container round-trip is `TODO(hermes-live)`.
  See `50-AGENTS-OS.md` and `DEFERRED-WORK.md`.

> The multi-agent orchestration layer that sits ON TOP of this per-user container
> (squad, Aegis gate, trust, budget, scheduler) is **Hermes Agents OS** — built and
> documented in [`50-AGENTS-OS.md`](./50-AGENTS-OS.md).

## Full reference
- README: https://github.com/NousResearch/hermes-agent
- Docs: https://hermes-agent.nousresearch.com/docs/
