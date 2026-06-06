// @vitest-environment jsdom
//
// Feature: mission-orchestrator, task 5.7 — glass conformance + honest empty state.
//
// Component tests (jsdom) for the Mission Orchestrator's glass recipe (Req 12.10)
// and its honest zero/empty states (Req 8.4, 11.5, 11.6), asserted against the
// real, exported pieces the mission detail page renders:
//   • `ObservabilityPanel` + `deriveObservability` (task 5.4,
//     `./ObservabilityPanel`) — the per-mission cost/observability feature card.
//     Verifies the mandatory glass texture stack (`dash-panel dash-grain
//     dash-interactive` + `dash-spotlight` and a `.dash-spotlight-glow` child),
//     and that an all-zero mission shows REAL zeros + the honest empty
//     contribution state + an "Unlimited" pill for unset ceilings — never a
//     fabricated number or a bogus progress bar.
//   • `KillSwitch` (task 5.5, `./KillSwitch`) — the pause/resume/abort control.
//     Verifies the in-scope buttons render for a running mission, the honest
//     "no running mission to control" state for a terminal lifecycle, and that
//     the PORTALLED abort-confirm overlay (mounted at `<body>`, OUTSIDE
//     `.sb-dashboard`) uses ROOT tokens only — never `--dash-*`, which would not
//     resolve outside the dashboard shell (glass-theme.md RULE #5).
//
// The default vitest environment is `node` (vitest.config.ts); this file opts into
// jsdom via the per-file docblock pragma on line 1 WITHOUT changing the global
// config, mirroring src/components/agents/AgentCard.test.tsx.
//
// Why not render the whole detail page? It is a `'use client'` page that fetches on
// mount (router + fetch), which would require mocks and exercise none of the recipe
// contract under test. We test the smaller EXPORTED, cleanly-renderable pieces — the
// guidance the page's own observability/kill-switch surfaces are composed from.

import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ObservabilityPanel, deriveObservability, type ObservabilityRows } from './ObservabilityPanel'
import { KillSwitch } from './KillSwitch'

afterEach(cleanup)

// ── ObservabilityPanel render helpers ───────────────────────────────────────────

// Representative non-empty rows: two agents with real completed tasks + real Run
// usage against finite ceilings. Drives the glass-recipe assertions.
const REPRESENTATIVE_ROWS: ObservabilityRows = {
  tasks: [
    { status: 'completed', assignedAgentId: 'a-1' },
    { status: 'running', assignedAgentId: 'a-2' },
    { status: 'pending' },
  ],
  runs: [
    { agentId: 'a-1', tokensUsed: 1200, cost: 0.42 },
    { agentId: 'a-2', tokensUsed: 800, cost: 0.18 },
  ],
  ceiling: { tokenCeiling: 10_000, costCeiling: 5 },
  agentNames: { 'a-1': 'Atlas', 'a-2': 'Scout' },
}

// Render the panel from already-fetched rows (the page's derive-then-render path) and
// hand back its root <section> (the element carrying the texture stack).
function renderPanel(rows: ObservabilityRows, lifecycleState: React.ComponentProps<typeof ObservabilityPanel>['lifecycleState'] = 'running') {
  const derived = deriveObservability(rows)
  const { container } = render(<ObservabilityPanel lifecycleState={lifecycleState} {...derived} />)
  const root = container.querySelector('section')
  if (!root) throw new Error('ObservabilityPanel did not render a <section> root')
  return { root, container }
}

describe('ObservabilityPanel — glass recipe (Req 12.10)', () => {
  it('root carries the mandatory texture stack: dash-panel + dash-grain + dash-interactive', () => {
    const { root } = renderPanel(REPRESENTATIVE_ROWS)
    expect(root.classList.contains('dash-panel')).toBe(true)
    expect(root.classList.contains('dash-grain')).toBe(true)
    expect(root.classList.contains('dash-interactive')).toBe(true)
  })

  it('is a feature card: also carries dash-spotlight + a .dash-spotlight-glow child', () => {
    const { root } = renderPanel(REPRESENTATIVE_ROWS)
    expect(root.classList.contains('dash-spotlight')).toBe(true)
    expect(root.querySelector('.dash-spotlight-glow')).not.toBeNull()
  })
})

describe('ObservabilityPanel — honest zero / empty state (Req 8.4, 11.5, 11.6)', () => {
  // An all-zero mission: no tasks, no runs, no ceilings — the honest empty state.
  const EMPTY_ROWS: ObservabilityRows = {
    tasks: [],
    runs: [],
    ceiling: { tokenCeiling: 0, costCeiling: 0 },
  }

  it('shows REAL zeros for every per-status task tile (not a missing/fabricated value)', () => {
    const { container } = renderPanel(EMPTY_ROWS)
    const tiles = container.querySelectorAll('[data-status]')
    // All five statuses render — zero included, never dropped.
    expect(tiles.length).toBe(5)
    for (const tile of Array.from(tiles)) {
      // The first span in each tile is the count value; an honest 0.
      expect(tile.querySelector('span')?.textContent).toBe('0')
    }
    // Header subtitle reflects the true empty graph.
    expect(screen.getByText('No tasks yet')).not.toBeNull()
  })

  it('shows real $0.00 cost and 0 tokens used (honest zero, not fabricated)', () => {
    const { container } = renderPanel(EMPTY_ROWS)
    // Locate the "Tokens used" well and assert its value is a real 0.
    const tokenLabel = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent === 'Tokens used',
    )
    expect(tokenLabel).toBeDefined()
    expect(tokenLabel!.parentElement?.querySelector('span:last-child')?.textContent).toBe('0')
    // Cost reads exactly $0.00 — never rounded up from nothing.
    expect(screen.getAllByText('$0.00').length).toBeGreaterThanOrEqual(1)
  })

  it('shows the honest "No agent activity yet" empty contribution state', () => {
    renderPanel(EMPTY_ROWS)
    expect(screen.getByText('No agent activity yet')).not.toBeNull()
  })

  it('shows "Unlimited" for unset ceilings and renders NO bogus progress bar', () => {
    const { container } = renderPanel(EMPTY_ROWS)
    // Both the token + cost budget rows render the Unlimited pill (ratio === null).
    expect(screen.getAllByText('Unlimited').length).toBe(2)
    // An unlimited ceiling draws no bar — there is no fabricated metering.
    expect(container.querySelectorAll('[role="progressbar"]').length).toBe(0)
  })

  it('a mission WITH real usage renders metered bars instead of Unlimited', () => {
    // Contrast case: finite ceilings ⇒ real progressbars, no Unlimited pills. Confirms
    // the empty-state assertions above are driven by the data, not always true.
    const { container } = renderPanel(REPRESENTATIVE_ROWS)
    expect(container.querySelectorAll('[role="progressbar"]').length).toBe(2)
    expect(screen.queryByText('Unlimited')).toBeNull()
    // The real per-agent contributions surface (no empty state).
    expect(screen.queryByText('No agent activity yet')).toBeNull()
    expect(screen.getByText('Atlas')).not.toBeNull()
    expect(screen.getByText('Scout')).not.toBeNull()
  })
})

// ── KillSwitch ──────────────────────────────────────────────────────────────────

describe('KillSwitch — in-scope controls per lifecycle (Req 5.10, 12.10)', () => {
  it('a running mission exposes Pause + Abort, but not Resume', () => {
    render(<KillSwitch missionId="m-1" lifecycle="running" />)
    expect(screen.getByLabelText('Pause mission')).not.toBeNull()
    expect(screen.getByLabelText('Abort mission')).not.toBeNull()
    expect(screen.queryByLabelText('Resume mission')).toBeNull()
  })

  it('a paused mission exposes Resume + Abort, but not Pause', () => {
    render(<KillSwitch missionId="m-1" lifecycle="paused" />)
    expect(screen.getByLabelText('Resume mission')).not.toBeNull()
    expect(screen.getByLabelText('Abort mission')).not.toBeNull()
    expect(screen.queryByLabelText('Pause mission')).toBeNull()
  })

  it('a terminal lifecycle shows the honest "no running mission to control" state, no buttons', () => {
    render(<KillSwitch missionId="m-1" lifecycle="completed" />)
    expect(screen.getByText('No running mission to control.')).not.toBeNull()
    // No actionable controls for a terminal mission.
    expect(screen.queryByLabelText('Pause mission')).toBeNull()
    expect(screen.queryByLabelText('Resume mission')).toBeNull()
    expect(screen.queryByLabelText('Abort mission')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('KillSwitch — portalled abort overlay uses ROOT tokens, not --dash-* (glass-theme RULE #5; Req 12.10)', () => {
  it('opening abort confirm renders a role="dialog" portalled at document.body', () => {
    render(<KillSwitch missionId="m-1" lifecycle="running" />)
    // No dialog until the user asks to abort.
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByLabelText('Abort mission'))

    const dialog = screen.getByRole('dialog')
    expect(dialog).not.toBeNull()
    // Portalled OUTSIDE the dashboard shell — mounted directly under <body>.
    expect(document.body.contains(dialog)).toBe(true)
    expect(dialog.closest('.sb-dashboard')).toBeNull()
  })

  it('no element in the portalled overlay references a --dash-* token in its inline style', () => {
    render(<KillSwitch missionId="m-1" lifecycle="running" />)
    fireEvent.click(screen.getByLabelText('Abort mission'))
    const dialog = screen.getByRole('dialog')

    // Every inline-styled node in the overlay subtree (the dialog included) must avoid
    // `--dash-*` — those custom props don't cascade to a body-level portal, so using
    // them would render a transparent, bleed-through panel.
    const styled = [dialog, ...Array.from(dialog.querySelectorAll('[style]'))]
    for (const el of styled) {
      expect(el.getAttribute('style') ?? '').not.toContain('--dash-')
    }
  })

  it('the dialog panel uses root tokens (--bg-elev-3 solid bg, --text-primary, --border-bright)', () => {
    render(<KillSwitch missionId="m-1" lifecycle="running" />)
    fireEvent.click(screen.getByLabelText('Abort mission'))
    const dialog = screen.getByRole('dialog')

    // The opaque panel is the node painting a solid root-token background.
    const panel = dialog.querySelector('[style*="--bg-elev-3"]') as HTMLElement | null
    expect(panel).not.toBeNull()
    const style = panel!.getAttribute('style') ?? ''
    expect(style).toContain('--bg-elev-3') // solid, always-opaque background
    expect(style).toContain('--text-primary')
    expect(style).toContain('--border-bright')
  })
})
