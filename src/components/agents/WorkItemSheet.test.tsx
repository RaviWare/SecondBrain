// @vitest-environment jsdom
//
// Feature: hermes-agents, Phase 5 board: side sheet why/3-actions (Req 8.6/8.7) +
// glass (11.7). Property 16 reuse (queue anatomy: what · why · ≥1 citation · the
// three decisions) realised on the Work_Item side sheet.
//
// Component tests (jsdom) for `WorkItemSheet` (task 5.3), the detail surface that
// opens when a Work_Item is selected on the board. These EXTEND the Phase-5 board
// coverage that already lives in WorkBoard.test.tsx (5.1: five-column order,
// Review-only accent, column/card glass) — they do NOT duplicate it. Here we
// assert the pieces unique to the side sheet:
//   • the mandatory "why" evidence block — rationale + EVERY citation (quote +
//     a source link) — that is never hidden (Req 8.7, Property 16 reuse);
//   • EXACTLY the three decisions Approve / Refine / Dismiss for a Review
//     (Aegis_Gate) Work_Item, and NO decisions for a non-Review item (Req 8.7);
//   • the inline-overlay dialog semantics (`role="dialog"` / `aria-modal`) and the
//     close affordances (X button + Escape) calling `onClose` (Req 8.6);
//   • the glass recipe on the inline panel (`dash-panel dash-grain`, Req 11.7).
//
// The default vitest environment is `node` (vitest.config.ts); this file opts into
// jsdom via the per-file docblock pragma on line 1, mirroring WorkBoard.test.tsx.

import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkItemSheet } from './WorkItemSheet'
import type { WorkItemView } from '@/lib/agents/board-view'

afterEach(cleanup)

// A factual Review (Aegis_Gate) Work_Item carrying ≥1 citation, exactly as the
// board hands it to the sheet (via groupWorkBoard → toQueueItem). Two citations so
// we can assert the sheet renders the FULL evidence (all citations), not just the
// card's first-citation hint.
const reviewItem: WorkItemView = {
  id: 'wi-review',
  column: 'review',
  agentId: 'a-1',
  kind: 'ingest',
  what: 'Ingest "Attention Is All You Need"',
  why: 'Cited across three of your notes but not yet in the vault.',
  citations: [
    { url: 'https://arxiv.org/abs/1706.03762', quote: 'We propose a new simple network architecture, the Transformer.' },
    { url: 'https://example.com/notes', quote: 'Referenced again in your transformer notes.' },
  ],
  isFactual: true,
  actions: ['approve', 'refine', 'dismiss'],
  children: [],
}

// A non-Review (Woven in) item — same evidence, but no decisions are offered off
// the gate (groupWorkBoard sets actions: [] for every non-Review column).
const wovenItem: WorkItemView = {
  ...reviewItem,
  id: 'wi-woven',
  column: 'woven-in',
  what: 'Synthesis: transformers vs RNNs',
  actions: [],
}

const noop = () => {}

describe('WorkItemSheet — inline overlay dialog semantics (Req 8.6)', () => {
  it('renders nothing when no item is selected (closed)', () => {
    const { container } = render(<WorkItemSheet item={null} onClose={noop} />)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('opens as a modal dialog when an item is supplied', () => {
    const { container } = render(<WorkItemSheet item={reviewItem} onClose={noop} />)
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.getAttribute('aria-modal')).toBe('true')
  })
})

describe('WorkItemSheet — mandatory "why" evidence block (Req 8.7, Property 16 reuse)', () => {
  it('always renders the rationale and EVERY citation (quote + source link)', () => {
    const { container } = render(
      <WorkItemSheet item={reviewItem} onClose={noop} onResolve={noop} />,
    )

    // The "why" section header is always present (never hideable).
    const why = container.querySelector('section[aria-label="Why — evidence"]')
    expect(why).not.toBeNull()

    // rationale
    expect(screen.getByText(reviewItem.why)).not.toBeNull()

    // EVERY citation quote is shown (full evidence, not just the first hint)…
    for (const c of reviewItem.citations) {
      expect(screen.getByText(c.quote)).not.toBeNull()
    }
    // …each with its source link rendered as an anchor to the citation url.
    for (const c of reviewItem.citations) {
      expect(within(why as HTMLElement).queryByText(c.quote)).not.toBeNull()
      expect(container.querySelector(`a[href="${c.url}"]`)).not.toBeNull()
    }
  })

  it('still renders the why block for a NON-Review item (evidence is never gated)', () => {
    const { container } = render(<WorkItemSheet item={wovenItem} onClose={noop} onResolve={noop} />)
    expect(container.querySelector('section[aria-label="Why — evidence"]')).not.toBeNull()
    expect(screen.getByText(wovenItem.why)).not.toBeNull()
    expect(screen.getByText(wovenItem.citations[0].quote)).not.toBeNull()
  })
})

describe('WorkItemSheet — decisions: exactly three at the gate, none off it (Req 8.7)', () => {
  it('a Review item exposes EXACTLY the three decisions Approve / Refine / Dismiss', () => {
    const { container } = render(
      <WorkItemSheet item={reviewItem} onClose={noop} onResolve={noop} />,
    )
    const decision = container.querySelector('section[aria-label="Decision"]') as HTMLElement
    expect(decision).not.toBeNull()

    const buttons = Array.from(decision.querySelectorAll('button'))
    expect(buttons).toHaveLength(3)
    const labels = buttons.map((b) => b.textContent?.trim())
    expect(labels.some((l) => l?.includes('Approve'))).toBe(true)
    expect(labels.some((l) => l?.includes('Refine'))).toBe(true)
    expect(labels.some((l) => l?.includes('Dismiss'))).toBe(true)
  })

  it('approving invokes onResolve with the item and the approve action', async () => {
    const onResolve = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <WorkItemSheet item={reviewItem} onClose={noop} onResolve={onResolve} />,
    )
    const decision = container.querySelector('section[aria-label="Decision"]') as HTMLElement
    const approve = within(decision).getByText('Approve').closest('button')!
    await user.click(approve)
    expect(onResolve).toHaveBeenCalledWith(reviewItem, 'approve')
  })

  it('a NON-Review item offers NO decision buttons (actions empty off the gate)', () => {
    const { container } = render(<WorkItemSheet item={wovenItem} onClose={noop} onResolve={noop} />)
    expect(container.querySelector('section[aria-label="Decision"]')).toBeNull()
    expect(screen.queryByText('Approve')).toBeNull()
    expect(screen.queryByText('Refine')).toBeNull()
    expect(screen.queryByText('Dismiss')).toBeNull()
  })
})

describe('WorkItemSheet — close affordances (Req 8.6)', () => {
  it('clicking the X close button calls onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<WorkItemSheet item={reviewItem} onClose={onClose} onResolve={noop} />)
    const closeBtn = container.querySelector('button[aria-label="Close"]') as HTMLElement
    expect(closeBtn).not.toBeNull()
    await user.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('pressing Escape calls onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<WorkItemSheet item={reviewItem} onClose={onClose} onResolve={noop} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking the scrim (outside) calls onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<WorkItemSheet item={reviewItem} onClose={onClose} onResolve={noop} />)
    const scrim = container.querySelector('button[aria-label="Close detail"]') as HTMLElement
    expect(scrim).not.toBeNull()
    await user.click(scrim)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('WorkItemSheet — glass recipe on the inline panel (Req 11.7)', () => {
  it('the side-sheet panel carries the dash-panel + dash-grain texture stack', () => {
    const { container } = render(<WorkItemSheet item={reviewItem} onClose={noop} onResolve={noop} />)
    const panel = container.querySelector('aside') as HTMLElement
    expect(panel).not.toBeNull()
    expect(panel.classList.contains('dash-panel')).toBe(true)
    expect(panel.classList.contains('dash-grain')).toBe(true)
  })
})
