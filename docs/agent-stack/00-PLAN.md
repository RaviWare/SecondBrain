# SecondBrain OS — Production Plan

**Vision:** SecondBrain becomes a full personal AI operating system. Every user gets
(1) their private knowledge vault (the "brain") and (2) their own autonomous Hermes
agent that uses that vault as its memory. The agent is bundled free.

---

## Locked decisions

| Decision | Choice | Why |
|---|---|---|
| **App host** | Hetzner (self-hosted Docker) | Already purchased; flat cost, no per-request cloud billing |
| **Database** | MongoDB Atlas ($500 credits) | Zero migration; managed backups/scaling |
| **Per-user agent isolation** | One Docker container per user, on the Hetzner box | Hermes is single-tenant by design; isolation = safety |
| **Model API keys** | BYO (user supplies their own) | User pays the LLM provider → zero token cost to us |
| **Pricing for Hermes** | Bundled FREE | Compute is on a box we already pay for; tokens are BYO → ~zero marginal cost. Massive differentiator. |
| **Revenue lever (optional, later)** | Gate *concurrent agents* / *always-on (no idle-stop)* behind Pro | Protects server RAM without paywalling the feature |
| **Access** | In-app chat first; Telegram/Discord later | Fastest path to value |

### Cost model (why free works)
- **Compute:** agent containers run on the Hetzner server we already pay a flat monthly fee for. No marginal cost per agent.
- **LLM tokens:** BYO keys → the user's provider bills the user directly. No cost to us.
- **The only finite resource is server RAM** (~0.5–1 GB per *active* agent). Protected by **idle-auto-stop** + a **concurrency cap**, not by charging money.

---

## Target architecture

```
                          Hetzner server (Docker host)
┌──────────────────────────────────────────────────────────────────┐
│  Caddy  (reverse proxy, automatic HTTPS)                           │
│     │                                                              │
│     ├─▶ secondbrain-web  (Next.js — app + agent control plane)     │
│     │       │  • Clerk auth (control plane)                        │
│     │       │  • Agent API (token-authed brain access)             │
│     │       │  • Docker engine API → provision per-user agents     │
│     │       ▼                                                      │
│     │   ┌──────────── isolated "agents" docker network ─────────┐  │
│     │   │  hermes-<userA>   hermes-<userB>   hermes-<userC> ...  │  │
│     │   │  • non-root, CPU/mem capped, no host docker socket     │  │
│     │   │  • egress limited to: brain API + chosen LLM provider  │  │
│     │   │  • idle-auto-stop after N minutes                      │  │
│     │   └─────────────────────────────────────────────────────────┘  │
│     └─▶ (MongoDB stays on Atlas — not on this box)                 │
└──────────────────────────────────────────────────────────────────┘
```

The web app is the **control plane**. It never runs agent code itself — it asks
the Docker engine to start/stop sandboxed Hermes containers, and injects each
user's scoped brain token so the agent's memory IS that user's vault (via the
`/api/agent/*` endpoints already built).

---

## Build phases

### Phase 0 — Server prep (you run, I provide the runbook)
Docker + Compose, Caddy (HTTPS), `ufw` firewall, swap, fail2ban, a dedicated
isolated `agents` Docker network. → `docs/agent-stack/40-HETZNER-RUNBOOK.md`

### Phase 1 — Deploy SecondBrain
Build existing Dockerfile, `docker-compose.yml` with secrets, domain + HTTPS.
App live on the Hetzner box, pointed at Atlas.

### Phase 2 — Agent control plane (I build, in-repo)
- `UserAgent` Mongo model — status, containerId, scoped token id, resource caps, lastActiveAt
- `AgentProvisioner` abstraction + **Docker driver** (create/start/stop/inspect via dockerode)
- Control routes (Clerk-authed): `POST /api/agent-instance/provision|start|stop`, `GET /api/agent-instance/status`
- Auto-mints a per-user **read+write brain token** and injects it into the container env

### Phase 3 — Hermes sandbox image (I build)
- `docker/hermes/Dockerfile` — Hermes pre-installed, headless config
- Wires the SecondBrain agent API as the agent's brain/memory (MCP/tool)
- Non-root user, idle-stop timer, BYO key passed at provision time
- gstack + GBrain skills baked in (see install docs)

### Phase 4 — In-app chat (I build)
- `/app/agent` page — provision-on-first-use, BYO-key entry, streaming chat, activity feed

### Phase 5 — Guardrails + ops (I build)
- Per-user CPU/mem/token/time caps, idle auto-stop, concurrency cap
- Command-approval policy, audit log, health/monitoring

---

## What needs YOU vs what I do

| I build (in repo, tested locally) | You run (with my runbook) |
|---|---|
| `UserAgent` model, provisioner, control API | `docker compose up` on Hetzner |
| Hermes sandbox Dockerfile + compose + Caddyfile | DNS A-record → server IP |
| `/app/agent` chat UI | Paste secrets into `.env` on server |
| Guardrails, audit, idle-stop | Atlas IP allowlist for server IP |
| Full Hetzner deploy runbook | Run the runbook step by step |

---

## Server capacity (confirmed: Hetzner 4 vCPU / 8 GB / 80 GB)

| Slice | Budget |
|---|---|
| OS + Docker + Caddy | ~1.5 GB |
| secondbrain-web (Next standalone) | ~0.7 GB |
| **Available for agents** | **~5.5 GB** |
| Per active Hermes container | ~0.5–1 GB |
| **Concurrency cap (active agents)** | **`MAX_ACTIVE_AGENTS=4`** (conservative) |
| Idle auto-stop | 10 min of inactivity |
| Per-container limits | `--cpus=0.75 --memory=900m --pids-limit=256` |

Registered users can be unlimited; only ~4 run *at once*. Idle-stop frees RAM fast.
When demand exceeds this, add a second Hetzner node — the `AgentProvisioner`
abstraction is built to target multiple Docker hosts later. Disk (80 GB) is ample
since all agent containers share one base image layer.
