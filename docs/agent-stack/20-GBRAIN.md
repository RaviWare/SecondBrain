# GBrain — Knowledge Layer

> **What it is:** Garry Tan's persistent knowledge engine (hybrid search, self-wiring
> graph, synthesis + gap analysis, dream cycle). Two ways it relates to us:
> (A) we re-implemented its core *patterns* natively in our Next.js + MongoDB stack
> (already shipped), and (B) the optional standalone GBrain CLI/daemon can run on the
> Hetzner box as a shared brain if we ever want its full feature set.

## A. GBrain patterns already LIVE in SecondBrain ✅

These are implemented natively in the app and verified with integration tests
against real MongoDB + Claude:

| GBrain concept | Where it lives in our code | Status |
|---|---|---|
| **Compiled Truth + Timeline** page format | `src/lib/claude.ts` (`WIKI_SCHEMA`) | shipped |
| **Multi-query expansion + RRF** retrieval | `src/lib/vault-ops.ts` (`runQuery`) | shipped |
| **Synthesis "think" + gap analysis** (what the brain doesn't know) | `src/lib/claude.ts` (`queryWiki` → `GapAnalysis`), UI in `/app/query` | shipped + tested |
| **Self-wiring knowledge graph** (auto `[[wikilink]]` edges, bidirectional) | `src/lib/auto-link.ts` (`wireGraphBatch`), called in ingest | shipped + tested |
| **Signal/entity extraction** on ingest | `src/lib/claude.ts` (`extractEntities`) | shipped |

**Tests:** `src/lib/auto-link.test.ts` (7 unit), `src/test/gbrain.integration.test.ts`
(live MongoDB + Claude). Run: `npm test` (unit) / `npm run test:integration` (live).

## B. Optional: full GBrain CLI/daemon on the server

If we later want GBrain's *full* engine (dream cycle cron, MCP server, 43 skills,
schema packs) as a shared brain the Hermes agents can also hit, install it on the
Hetzner box:

```bash
# Install the CLI (Bun-based)
bun install -g github:garrytan/gbrain

# Local PGLite brain (zero server) OR point at Postgres/Supabase
gbrain init --pglite
gbrain doctor

# Serve it over MCP so agents (Hermes, Claude Code) can use it as a tool
gbrain serve --http      # OAuth 2.1 + admin dashboard; deploy behind Caddy
```

> **Note:** This is a *separate* engine from our native implementation. For the
> product today we use the native patterns (above) because they share our exact
> stack (MongoDB + Clerk + Claude) and need no extra service. The standalone GBrain
> is an option for a power-user "shared org brain," not a requirement.

### The 43 GBrain skills (reference)
Routing table: https://github.com/garrytan/gbrain/blob/master/skills/RESOLVER.md
Key skills: `signal-detector`, `brain-ops`, `query` (search + graph-query),
`enrich`, `capture`, `idea-ingest`, `media-ingest`, `meeting-ingestion`,
`maintain` (dream cycle), `citation-fixer`, `minion-orchestrator`, `cron-scheduler`,
`schema-author`, `setup`, `cold-start`, `migrate`.

## How Hermes connects to OUR brain (the integration we built)

Hermes doesn't need standalone GBrain — it uses **our** agent API as its brain:

```
secondbrain_query   POST /api/agent/query    → synthesis + gap analysis
secondbrain_search  GET  /api/agent/search   → raw retrieval (no LLM cost)
secondbrain_ingest  POST /api/agent/ingest   → add source, auto-wire graph
manifest            GET  /api/agent/manifest → MCP-style tool descriptor
```

Auth: `Authorization: Bearer sb_...` (token minted per user in Settings → Agent Access).
See `30-HERMES.md` for how the per-user agent is wired to these.

## Full reference
- README: https://github.com/garrytan/gbrain
- Install for agents: https://raw.githubusercontent.com/garrytan/gbrain/master/INSTALL_FOR_AGENTS.md
