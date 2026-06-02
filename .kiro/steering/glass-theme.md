# Glass Theme — MANDATORY for every in-app page (always applies)

The product owner has repeatedly required that **every** `/app/*` page match the
dashboard's warm Apple-silicon **glass** look exactly — same background, tones,
texture. Surface_Skin decision = **hybrid** (keep glass everywhere; the cool-flat
Quiet Instrument tokens are NOT the visible skin). Do NOT ship a flat/dull page.

## The non-negotiable recipe (copy the dashboard, do not approximate)

1. **Page wrapper:** `<main className="sb-dashboard min-h-full text-[var(--dash-text)]">`
   — this paints the ambient **aurora** (`::before`) + **grid texture** (`::after`)
   backdrop. Without `.sb-dashboard` the page sits on a flat void.

2. **Every card/panel MUST carry the full texture stack like the dashboard StatCards do:**
   `className="dash-panel dash-grain dash-interactive ..."`
   - `dash-panel` = frosted glass (blur, sheen, ring, border).
   - `dash-grain` = the micro-noise texture (THE thing that makes it feel rich, not dull).
   - `dash-interactive` = hover lift + edge glow.
   - For hero/feature cards also add `dash-spotlight` + a `<span className="dash-spotlight-glow" />`
     as the first child, and wire `useSpotlight()` (`ref` + `onMouseMove`).
   - A plain `dash-panel` alone reads DULL. Default to `dash-panel dash-grain dash-interactive`.

3. **Tokens:** use `--dash-*` ONLY for in-scope content:
   surfaces `--dash-card-solid` (dark wells) / `--dash-glass`, text `--dash-text` /
   `--dash-muted` / `--dash-subtle`, accent `--dash-accent` / `--dash-accent-2` /
   `--dash-accent-soft`, borders `--dash-border` / `--dash-border-bright` /
   `--dash-border-glow`. Headings use `.dash-metallic-text`. Primary buttons use
   `.dash-accent-grad`. NEVER use the flat `--surface`/`--border`/`--accent`/`--text-*`
   tokens for in-app page content (those read dull/disconnected).

4. **Inset wells** (inputs, list rows, stat tiles) = `background: var(--dash-card-solid)`
   + `border: 1px solid var(--dash-border)`. NOT `--dash-soft` (too light/grey) for
   large surfaces — `--dash-soft` is only for tiny hover washes/icon chips.

5. **Portalled overlays** (Radix menus/tooltips/popovers) render at `<body>`, OUTSIDE
   `.sb-dashboard`, so `--dash-*` DON'T resolve → transparent menu / text bleed-through.
   Use ROOT tokens for those: `--bg-elev-3` (solid bg), `--surface-2`, `--border-bright`,
   `--text-primary`, `--accent`, `--shadow-3`. Always opaque background.

## Reference implementation
`src/components/dashboard/StatCard.tsx` → `dash-panel dash-grain dash-spotlight dash-interactive`.
Match that energy on every page. When in doubt, open the dashboard and compare side by side.

## Pages already synced (keep them this way)
dashboard, ingest, sidebar, wiki/memory, query/search, log, settings.
Remaining work pages + all future Hermes agent surfaces MUST follow this recipe.
