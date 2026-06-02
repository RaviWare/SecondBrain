# Agent Stack — SecondBrain OS

Documentation for the three-layer agent system that turns SecondBrain into a
personal AI operating system.

| Doc | What it covers |
|---|---|
| [`00-PLAN.md`](./00-PLAN.md) | Production plan, locked decisions, architecture, cost model, phases |
| [`10-GSTACK.md`](./10-GSTACK.md) | gstack dev skills (✅ installed) — how we build the app |
| [`20-GBRAIN.md`](./20-GBRAIN.md) | GBrain knowledge layer — patterns already shipped + optional full engine |
| [`30-HERMES.md`](./30-HERMES.md) | Per-user Hermes agent — architecture, wiring, security |
| [`50-AGENTS-OS.md`](./50-AGENTS-OS.md) | Hermes Agents OS — the shipped multi-agent orchestration layer |
| `40-HETZNER-RUNBOOK.md` | Server deploy runbook (created at Phase 0/1) |

## The three layers

1. **gstack** — developer tooling (build the app). Not shipped to users.
2. **GBrain** — the knowledge layer. Core patterns are live natively in the app.
3. **Hermes** — the per-user autonomous agent. Bundled free, one container per user.

On top of these sits **Hermes Agents OS** — the Pro-tier multi-agent orchestration
layer (squad of configurable agents, the Aegis propose-never-write gate, trust +
budget + scheduler). It is built and lives under `/app/agents/*`. See
[`50-AGENTS-OS.md`](./50-AGENTS-OS.md).

## Current status

- ✅ gstack installed (skills under `~/.kiro/skills/`)
- ✅ GBrain patterns live: synthesis + gap analysis, self-wiring graph (tested)
- ✅ Agent API for external agents: `/api/agent/{query,search,ingest,manifest,tokens}`
- ✅ Hermes per-user container control plane: `UserAgent` model, `DockerProvisioner`
  (non-root, capped, no host socket), control routes `/api/agent-instance/{provision,
  start,stop,status}`, the sandbox image (`docker/hermes/`), and the `/app/agent` chat UI.
- ✅ **Hermes Agents OS** (Pro-tier multi-agent layer) — all 8 phases built and green
  (579 unit/property tests, 59 files; build clean). Surfaces: `/app/agents`
  (squad dashboard), `/builder`, `/board`, `/skills`, `/cost`. The propose-never-write
  spine, trust engine, content scanner, skills library, three-level budget caps, and
  scheduler all live. Both runner drivers (`ClaudeVaultRunner` default,
  `HermesContainerRunner` via `AGENT_RUNNER=hermes`) plug in behind one interface.
- ✅ `/cso` security audit run against the control plane — no critical/high; two MEDIUM
  hardening items found and fixed. See `docs/agent-stack/50-AGENTS-OS.md` → Security.

## Outstanding (infra / verification, not spec code)

- Live container wire-protocol for `HermesContainerRunner` (`TODO(hermes-live)`),
  its scoped brain-token mint, the always-on scheduler worker, and the production
  cron-evaluator swap. Tracked in [`DEFERRED-WORK.md`](./DEFERRED-WORK.md).
- Owed verification: `npm run test:integration` (live MongoDB + Claude) and a visual
  pass on `/app/agents/cost`.
