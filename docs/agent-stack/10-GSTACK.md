# gstack — Developer Workflow Skills

> **What it is:** Garry Tan's opinionated Claude Code skill pack (CEO review, design
> review, eng review, QA, ship, security audit, etc.). It is a **development tool for
> building this app** — NOT a runtime feature shipped to end users. It lives in your
> agent's skills directory, not in the product.

## Status: ✅ Installed

- **54 skills** installed to `~/.kiro/skills/` (this machine runs Kiro)
- Source clone: `~/.claude/skills/gstack`
- Browse tooling built

## Install (already done — re-run to update)

```bash
# Clone (one time)
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack

# Set up for the host agent (Kiro here; also supports claude, codex, cursor, etc.)
~/.claude/skills/gstack/setup --host kiro

# Update later
~/.claude/skills/gstack/setup --host kiro      # re-run after `git pull`
git -C ~/.claude/skills/gstack pull
```

> Other hosts: `--host claude | codex | cursor | opencode | factory | hermes | gbrain`.
> The Hermes sandbox image installs the gstack skill pack with `--host hermes`.

## The skills (what each specialist does)

**Plan → Build → Review → Ship sprint:**

| Skill | Role |
|---|---|
| `/office-hours` | YC-style product interrogation — reframes the idea before code |
| `/plan-ceo-review` | Challenge scope, find the 10-star product |
| `/plan-eng-review` | Lock architecture, data flow, edge cases, tests |
| `/plan-design-review` | Rate design dimensions 0-10, catch AI slop |
| `/plan-devex-review` | Developer-experience review for APIs/CLIs/SDKs |
| `/autoplan` | Runs CEO → design → eng review automatically |
| `/design-consultation`, `/design-shotgun`, `/design-html` | Build a design system, explore variants, ship production HTML |
| `/review` | Staff-engineer pre-merge diff review (auto-fixes obvious bugs) |
| `/investigate` | Root-cause debugging (no fixes without investigation) |
| `/qa`, `/qa-only` | Real-browser QA, find + fix bugs, regression tests |
| `/design-review`, `/devex-review` | Live audits of shipped UI / developer experience |
| `/cso` | OWASP Top 10 + STRIDE security audit |
| `/ship`, `/land-and-deploy` | Run tests, bump version, PR, merge, verify in prod |
| `/canary`, `/benchmark` | Post-deploy monitoring; perf baselines |
| `/document-release`, `/document-generate` | Keep docs current; generate missing docs |
| `/retro` | Weekly engineering retrospective |
| `/browse`, `/open-gstack-browser` | Real Chromium for the agent |
| `/codex` | Second opinion from OpenAI Codex CLI |
| `/careful`, `/freeze`, `/guard`, `/unfreeze` | Safety guardrails for destructive ops |
| `/learn` | Persistent learnings across sessions |
| `/setup-gbrain`, `/sync-gbrain` | Wire GBrain as the agent's memory |

## How we use it on this project

- Run `/review` before merging any branch.
- Run `/qa <url>` on the deployed app after each feature.
- Run `/cso` before exposing the agent control plane publicly (it executes
  user code — security audit is mandatory).
- Use `/ship` to bump VERSION + open PRs.

## Full reference
- README: https://github.com/garrytan/gstack
- Skill deep-dives: `~/.claude/skills/gstack/docs/skills.md`
