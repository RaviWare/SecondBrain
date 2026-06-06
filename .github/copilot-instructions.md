# SecondBrain Cloud — Copilot / agent instructions

**Read [`HANDOFF.md`](../HANDOFF.md) at the repo root before doing anything.** It is the
single source of truth for this project and overrides default behavior when they conflict.
[`AGENTS.md`](../AGENTS.md) is the short version.

## Non-negotiables (full detail in HANDOFF.md)

- 🎨 **Glass theme is MANDATORY on every `/app/*` page.** Wrap pages in
  `<main className="sb-dashboard ...">`; build cards with
  `dash-panel dash-grain dash-interactive`; use `--dash-*` tokens only for in-app
  content. Portalled overlays (Radix/`createPortal`) use ROOT tokens (`--bg-elev-3`,
  `--surface-2`, `--border-bright`, `--text-primary`, `--accent`, `--shadow-3`) and must
  be opaque. Reference: `src/components/dashboard/StatCard.tsx`.
- 🚫 **No dummy data.** Honest empty/zero states, real data only — never fabricate
  numbers, curves, counts, or always-on indicators.
- **Next.js 16** has breaking changes vs. training data — consult
  `node_modules/next/dist/docs/` before writing Next-specific code.
- **Verify:** run `npm run build` and `npx vitest run` before claiming done; add tests
  (vitest + fast-check for pure logic) for new features/bugfixes.
- **Naming:** never use "Hermes"/"gstack"/"GBrain" in user-facing copy.
- **Git safety:** feature branches + PRs; never commit secrets; always exclude
  `.vscode/settings.json`; stage specific files (never `git add .`).
