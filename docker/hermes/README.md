# Hermes agent sandbox image

The per-user agent container for SecondBrain OS. One container = one user's Hermes
agent, with their SecondBrain vault as its memory (via the token-authed agent API).

## Build

```bash
docker build -t secondbrain/hermes-agent:latest docker/hermes
```

The control plane references this image via the `HERMES_IMAGE` env (default
`secondbrain/hermes-agent:latest`).

## What's inside
- **Hermes Agent** (Nous Research) — the autonomous agent runtime
- **gstack** skill pack (`--host hermes`) — thinking / review / QA skills
- **GBrain** skill pack source — brain-first patterns
- **SecondBrain brain connector** (`connector/secondbrain_brain.py`) — calls
  `/api/agent/{query,search,ingest}` with the injected scoped token
- **idle-watchdog.sh** — stops the container after `IDLE_STOP_MINUTES` idle to free RAM
- **entrypoint.sh** — configures Hermes from env, registers the brain, starts watchdog

## Runtime env contract (injected by the provisioner — never baked in)
| Env | Meaning |
|---|---|
| `SECONDBRAIN_USER_ID` | Clerk user id (labels/logs) |
| `SECONDBRAIN_API_BASE` | Base URL of the SecondBrain agent API |
| `SECONDBRAIN_TOKEN` | Scoped `sb_...` bearer token (read+write) |
| `LLM_PROVIDER` / `LLM_MODEL` / `LLM_API_KEY` | BYO model config (key not stored server-side) |
| `IDLE_STOP_MINUTES` | Idle auto-stop window (default 10) |

## Security
- Non-root user (`agent`, uid 10001)
- Provisioner sets: `CapDrop ALL`, `no-new-privileges`, memory/cpu/pids caps
- No host docker socket mounted
- Network restricted to the brain API + the chosen LLM provider (Caddy/network policy)

## Status
Beta scaffold. The `hermes config` / `hermes mcp` wiring in `entrypoint.sh` is
best-effort and will be tightened against the installed Hermes CLI version during
Phase 4/5 integration testing on the server.
