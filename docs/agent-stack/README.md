# Agent Stack — SecondBrain OS

Documentation for the three-layer agent system that turns SecondBrain into a
personal AI operating system.

| Doc | What it covers |
|---|---|
| [`00-PLAN.md`](./00-PLAN.md) | Production plan, locked decisions, architecture, cost model, phases |
| [`10-GSTACK.md`](./10-GSTACK.md) | gstack dev skills (✅ installed) — how we build the app |
| [`20-GBRAIN.md`](./20-GBRAIN.md) | GBrain knowledge layer — patterns already shipped + optional full engine |
| [`30-HERMES.md`](./30-HERMES.md) | Per-user Hermes agent — architecture, wiring, security |
| `40-HETZNER-RUNBOOK.md` | Server deploy runbook (created at Phase 0/1) |

## The three layers

1. **gstack** — developer tooling (build the app). Not shipped to users.
2. **GBrain** — the knowledge layer. Core patterns are live natively in the app.
3. **Hermes** — the per-user autonomous agent. Bundled free, one container per user.

## Current status

- ✅ gstack installed (54 skills, `~/.kiro/skills/`)
- ✅ GBrain patterns live: synthesis + gap analysis, self-wiring graph (tested)
- ✅ Agent API for external agents: `/api/agent/{query,search,ingest,manifest,tokens}`
- ⏳ Hermes per-user provisioning — planned (Phases 2-5), needs server specs to size

## Next action
Provide Hetzner server specs (RAM/vCPU) to set the concurrency cap, then I build
Phase 2 (provisioner + control plane + chat UI) in-repo and hand you the deploy runbook.
