<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

> 📖 **READ `HANDOFF.md` FIRST.** It is the full operating manual for this project —
> the mandatory glass theme, the no-dummy-data rule, build/test/deploy process, the
> Coolify + cron setup, git safety, and local environment quirks. When a rule there
> conflicts with your defaults, that file wins. This `AGENTS.md` is the short version.

# SecondBrain OS — Agent Stack

This project is building a personal AI operating system: a knowledge vault (the
"brain") plus a per-user autonomous Hermes agent. Three layers, documented in
`docs/agent-stack/`:

1. **gstack** (`docs/agent-stack/10-GSTACK.md`) — dev workflow skills installed at
   `~/.kiro/skills/`. Use `/review` before merges, `/qa` after features, `/cso`
   before exposing the agent control plane. These build the app; they are not a
   product feature.
2. **GBrain** (`docs/agent-stack/20-GBRAIN.md`) — knowledge layer. Core patterns are
   already implemented natively: synthesis + gap analysis (`src/lib/claude.ts`
   `queryWiki`), self-wiring graph (`src/lib/auto-link.ts`), shared vault ops
   (`src/lib/vault-ops.ts`). Prefer these patterns when touching query/ingest.
3. **Hermes** (`docs/agent-stack/30-HERMES.md`) — per-user agent, one Docker
   container per user, brain = the user's vault via `/api/agent/*`, BYO LLM keys,
   bundled free. Single-tenant by design.

## Agent API (already built — token-authed, for external agents)
`/api/agent/manifest` (public descriptor), `/api/agent/query` (synthesis+gap),
`/api/agent/search` (raw retrieval), `/api/agent/ingest` (write). Auth: `Bearer sb_...`
minted in Settings → Agent Access. Auth + scopes in `src/lib/agent-auth.ts`.

## Testing
- `npm test` — fast unit suite (vitest)
- `npm run test:integration` — live tests against real MongoDB + Claude
- `npm run build` — must pass before shipping

## Security (non-negotiable)
The agent control plane will run user code in containers. Containers must be
non-root, resource-capped, network-isolated, and have NO host Docker socket.
Never log BYO API keys or brain tokens.