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
- [ ] Phase 2 — `UserAgent` model + provisioner + control API (in repo)
- [ ] Phase 3 — Hermes sandbox Dockerfile
- [ ] Phase 4 — `/app/agent` chat UI
- [ ] Phase 5 — Guardrails + audit + idle-stop

## Full reference
- README: https://github.com/NousResearch/hermes-agent
- Docs: https://hermes-agent.nousresearch.com/docs/
