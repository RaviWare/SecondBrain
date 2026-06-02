// @vitest-environment jsdom
// Feature: hermes-agents, Req 7.1/7.5/11.7: two-pane builder layout + editable preview + glass recipe
//
// Component test for the Conversational Agent Builder (task 4.5,
// src/app/app/agents/builder/page.tsx). The default vitest environment is `node`
// (see vitest.config.ts); this file opts into jsdom via the per-file docblock
// pragma above WITHOUT changing the global config — mirroring the convention in
// src/app/app/ingest/ingest-button.test.tsx.
//
// We render the REAL page (not a harness). The builder is a `'use client'`
// component whose only non-pure dependencies are `next/navigation`
// (`useSearchParams`/`useRouter`) and the edit-mode `fetch`. Everything else it
// imports (`@/lib/agents/builder`, `role-defaults`, `skills/catalog`,
// `use-spotlight`, `utils`, `lucide-react`) is pure and DB-free, so the real page
// mounts cleanly under jsdom once navigation is mocked. With EMPTY search params
// the page is in CREATE mode and the `?agentId=`/`?edit=` fetch effect
// early-returns, so no network call happens on mount; we still mock `fetch`
// defensively. Asserting against the real page means the class/layout assertions
// reflect the actual shipped markup.

import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// CREATE mode: empty params (no agentId/edit/role) → no mount fetch; noop router.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// Import AFTER the mock is registered (vi.mock is hoisted above imports).
import AgentBuilderPage from './page'

beforeEach(() => {
  // Defensive: create mode triggers no fetch, but stub it so any stray call is safe.
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  }) as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Conversational Agent Builder — two-pane layout + editable preview + glass recipe', () => {
  // ── Req 7.1: two-pane layout (conversation pane + live preview pane) ─────────
  it('renders a two-pane layout: a conversation pane and a live preview pane (Req 7.1)', () => {
    render(<AgentBuilderPage />)

    // LEFT pane is headed "Conversation"; RIGHT pane is headed "Live preview".
    expect(screen.getByRole('heading', { name: 'Conversation' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Live preview' })).toBeTruthy()

    // The conversation pane carries a message composer; the preview pane carries
    // the directly-editable name field — both panes are concretely present.
    expect(screen.getByLabelText('Send message')).toBeTruthy()
    expect(screen.getByPlaceholderText('Name your agent')).toBeTruthy()
  })

  // ── Req 7.5: every config field is directly editable in the preview ──────────
  it('lets the user edit a config field directly in the preview — typing the name updates it (Req 7.5)', async () => {
    const user = userEvent.setup()
    render(<AgentBuilderPage />)

    const nameInput = screen.getByPlaceholderText('Name your agent') as HTMLInputElement
    expect(nameInput.value).toBe('')

    // Direct hand-edit flows through the SAME mergePreview fold as the
    // conversation, so the controlled preview reflects the typed value exactly.
    await user.type(nameInput, 'Pricing Scout')
    expect(nameInput.value).toBe('Pricing Scout')
  })

  it('reflects a preview button-group edit directly — picking the Daily schedule reveals its cron (Req 7.5)', async () => {
    const user = userEvent.setup()
    render(<AgentBuilderPage />)

    // The schedule picker is an in-scope button group (no portal/select overlay).
    // Picking "Daily" sets schedule={kind:'scheduled', cron:'0 9 * * *'}, which the
    // preview reflects by revealing the cron well seeded with that expression.
    await user.click(screen.getByRole('button', { name: 'Daily' }))

    const cronInput = screen.getByPlaceholderText('cron expression e.g. 0 9 * * *') as HTMLInputElement
    expect(cronInput).toBeTruthy()
    expect(cronInput.value).toBe('0 9 * * *')
  })

  // ── Req 11.7 / glass recipe (also dashboard Req 6.10 recipe parity) ──────────
  it('conforms to the glass recipe: sb-dashboard shell + dash-panel/dash-grain/dash-interactive panels + hero spotlight (Req 11.7)', () => {
    const { container } = render(<AgentBuilderPage />)

    // 1. Shell paints the ambient aurora + grid texture.
    const shell = container.querySelector('main.sb-dashboard')
    expect(shell).not.toBeNull()

    // 2. Every panel carries the full texture stack (frosted glass + micro-noise +
    //    hover lift). Both the conversation pane and the preview pane qualify.
    const texturedPanels = container.querySelectorAll('.dash-panel.dash-grain.dash-interactive')
    expect(texturedPanels.length).toBeGreaterThanOrEqual(2)

    // 3. The hero preview panel additionally carries dash-spotlight + a
    //    .dash-spotlight-glow child as its first element (cursor-tracked glow).
    const spotlightPanel = container.querySelector('.dash-spotlight')
    expect(spotlightPanel).not.toBeNull()
    expect(spotlightPanel?.querySelector('.dash-spotlight-glow')).not.toBeNull()
  })

  // ── Portal overlays: N/A (documented, not forced) ────────────────────────────
  it('uses inline in-scope pickers (no Radix/portal overlays) — the root-token portal rule is N/A (Req 11.7)', () => {
    render(<AgentBuilderPage />)

    // The builder's role / schedule / sign-off / trust-scope pickers are all
    // in-scope button groups and inset wells, NOT portalled Radix menus/popovers.
    // So nothing renders at <body> OUTSIDE .sb-dashboard, and the glass recipe's
    // "portalled overlays must use ROOT tokens" rule simply does not apply here —
    // there is no transparent-overlay token hazard to test.
    expect(document.querySelector('[data-radix-popper-content-wrapper]')).toBeNull()
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    // Everything visible lives inside the single glass shell.
    const shell = document.querySelector('main.sb-dashboard')
    expect(shell).not.toBeNull()
    expect(shell?.contains(screen.getByLabelText('Send message'))).toBe(true)
    expect(shell?.contains(screen.getByPlaceholderText('Name your agent'))).toBe(true)
  })
})
