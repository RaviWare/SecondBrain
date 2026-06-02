// @vitest-environment jsdom
//
// Feature: hermes-agents, Work_Board scaffold (task 5.1) — Req 8.1, 8.2, 8.3, 11.7.
//
// Component tests (jsdom) for the Work_Board page scaffold:
//   • Five columns in the canonical order Queued → Reading → Connecting →
//     Review → Woven in (Req 8.1).
//   • The Review column is the Aegis_Gate and the ONLY column carrying the warm
//     accent; the other four carry none (Req 8.2/8.3 — Property 17 reuse via
//     accent.ts). Verified through both the pure grouping (`groupWorkBoard`) and
//     the rendered `WorkColumn` (data-accent attribute).
//   • The mandatory glass texture stack on columns + cards (Req 11.7).
//   • No fabricated cards: an empty column renders the honest empty state.
//
// The default vitest environment is `node` (vitest.config.ts); this file opts into
// jsdom via the per-file docblock pragma, mirroring AgentCard.test.tsx.

import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { WorkBoard } from './WorkBoard'
import { WorkColumn } from './WorkColumn'
import { WorkItemCard } from './WorkItemCard'
import {
  groupWorkBoard,
  columnForProposal,
  columnForRunStep,
  COLUMN_LABEL,
  type WorkItemView,
} from '@/lib/agents/board-view'
import { WORK_BOARD_COLUMNS, type WorkBoardColumn } from '@/lib/agents/accent'
import type { ProposalView } from '@/lib/agents/aegis/queue-view'

afterEach(cleanup)

// A representative pending (Review) proposal as the board receives it.
const pendingProposal: ProposalView = {
  _id: 'p-review',
  agentId: 'a-1',
  kind: 'ingest',
  title: 'Ingest "Attention Is All You Need"',
  rationale: 'Cited across three notes but not yet in the vault.',
  citations: [{ url: 'https://arxiv.org/abs/1706.03762', quote: 'We propose a new simple network architecture.' }],
  status: 'pending',
}

// A representative applied (Woven in) proposal.
const appliedProposal: ProposalView = {
  ...pendingProposal,
  _id: 'p-woven',
  title: 'Synthesis: transformers vs RNNs',
  status: 'approved',
}

describe('groupWorkBoard — five columns in canonical pipeline order (Req 8.1)', () => {
  it('returns exactly the five columns in order Queued → Reading → Connecting → Review → Woven in', () => {
    const cols = groupWorkBoard({ proposals: [], activeRuns: [] })
    expect(cols.map((c) => c.column)).toEqual([
      'queued',
      'reading',
      'connecting',
      'review',
      'woven-in',
    ])
    // Mirrors the canonical constant exactly.
    expect(cols.map((c) => c.column)).toEqual([...WORK_BOARD_COLUMNS])
  })

  it('accent is true for EXACTLY the Review column (accent.ts reservation; Req 8.3)', () => {
    const cols = groupWorkBoard({ proposals: [], activeRuns: [] })
    const accented = cols.filter((c) => c.accent).map((c) => c.column)
    expect(accented).toEqual(['review'])
  })
})

describe('groupWorkBoard — real placement, no fabrication (Req 8.2)', () => {
  it('places a pending proposal in Review with the three decision actions', () => {
    const cols = groupWorkBoard({ proposals: [pendingProposal], activeRuns: [] })
    const review = cols.find((c) => c.column === 'review')!
    expect(review.items).toHaveLength(1)
    expect(review.items[0].actions).toEqual(['approve', 'refine', 'dismiss'])
    expect(review.items[0].what).toBe(pendingProposal.title)
  })

  it('places an approved proposal in Woven in with NO decision actions', () => {
    const cols = groupWorkBoard({ proposals: [appliedProposal], activeRuns: [] })
    const woven = cols.find((c) => c.column === 'woven-in')!
    expect(woven.items).toHaveLength(1)
    expect(woven.items[0].actions).toEqual([])
  })

  it('omits terminal-but-not-woven proposals (dismissed/refined/failed)', () => {
    expect(columnForProposal('dismissed')).toBeNull()
    expect(columnForProposal('refined')).toBeNull()
    expect(columnForProposal('failed')).toBeNull()
    const cols = groupWorkBoard({
      proposals: [{ ...pendingProposal, _id: 'x', status: 'dismissed' }],
      activeRuns: [],
    })
    expect(cols.every((c) => c.items.length === 0)).toBe(true)
  })

  it('places in-flight runs in the pre-Review column matching their trace step', () => {
    expect(columnForRunStep(null)).toBe('queued')
    expect(columnForRunStep('build-system-context')).toBe('queued')
    expect(columnForRunStep('fetch-source:Some Paper')).toBe('reading')
    expect(columnForRunStep('scan:clean')).toBe('reading')
    expect(columnForRunStep('plan-ingest:Some Paper')).toBe('connecting')

    const cols = groupWorkBoard({
      proposals: [],
      activeRuns: [{ _id: 'r-1', agentId: 'a-1', latestStep: 'plan-ingest:Paper' }],
    })
    const connecting = cols.find((c) => c.column === 'connecting')!
    expect(connecting.items).toHaveLength(1)
    expect(connecting.items[0].actions).toEqual([])
  })
})

describe('WorkBoard render — columns, labels, glass recipe (Req 8.1, 11.7)', () => {
  it('renders all five column headings in order', () => {
    const cols = groupWorkBoard({ proposals: [], activeRuns: [] })
    render(<WorkBoard columns={cols} />)
    for (const column of WORK_BOARD_COLUMNS) {
      expect(screen.getByText(COLUMN_LABEL[column])).not.toBeNull()
    }
  })

  it('every column panel carries the mandatory texture stack', () => {
    const { container } = render(
      <WorkColumn column="queued" items={[]} />,
    )
    const panel = container.querySelector('section')!
    expect(panel.classList.contains('dash-panel')).toBe(true)
    expect(panel.classList.contains('dash-grain')).toBe(true)
    expect(panel.classList.contains('dash-interactive')).toBe(true)
    // honest empty state — no fabricated cards
    expect(screen.getByText('Nothing here yet')).not.toBeNull()
  })
})

describe('WorkColumn — Review-only accent (Property 17 reuse; Req 8.3)', () => {
  it('the Review column exposes data-accent="review"', () => {
    const { container } = render(<WorkColumn column="review" items={[]} />)
    const panel = container.querySelector('section')!
    expect(panel.getAttribute('data-accent')).toBe('review')
  })

  it('every non-Review column exposes NO accent', () => {
    const nonReview = WORK_BOARD_COLUMNS.filter((c) => c !== 'review')
    for (const column of nonReview) {
      cleanup()
      const { container } = render(<WorkColumn column={column as WorkBoardColumn} items={[]} />)
      const panel = container.querySelector('section')!
      expect(panel.hasAttribute('data-accent')).toBe(false)
    }
  })
})

describe('WorkItemCard — glass recipe + Review-only accent', () => {
  const item: WorkItemView = {
    id: 'wi-1',
    column: 'review',
    agentId: 'a-1',
    kind: 'ingest',
    what: 'Ingest a paper',
    why: 'Because it is cited a lot',
    citations: [{ quote: 'A quote' }],
    isFactual: true,
    actions: ['approve', 'refine', 'dismiss'],
    children: [],
  }

  it('carries the full texture stack + spotlight glow child', () => {
    const { container } = render(<WorkItemCard item={item} column="review" />)
    const article = container.querySelector('article')!
    expect(article.classList.contains('dash-panel')).toBe(true)
    expect(article.classList.contains('dash-grain')).toBe(true)
    expect(article.classList.contains('dash-spotlight')).toBe(true)
    expect(article.classList.contains('dash-interactive')).toBe(true)
    expect(article.querySelector('.dash-spotlight-glow')).not.toBeNull()
  })

  it('a Review card gets the accent; a non-Review card does not', () => {
    const { container: reviewC } = render(<WorkItemCard item={item} column="review" />)
    expect(reviewC.querySelector('article')!.getAttribute('data-accent')).toBe('review')
    cleanup()
    const { container: queuedC } = render(
      <WorkItemCard item={{ ...item, column: 'queued' }} column="queued" />,
    )
    expect(queuedC.querySelector('article')!.hasAttribute('data-accent')).toBe(false)
  })
})

// ── Drag restricted to Review (task 5.6 extension; Req 8.4/8.5) ───────────────
// Feature: hermes-agents, Phase 5 board: drag restricted to Review (Req 8.4/8.5).
// These EXTEND the 5.1 coverage above (five-column order · Review-only accent ·
// column/card glass) without duplicating it: here we assert that drag is enabled
// IFF a card sits in the Review (Aegis_Gate) column, and that ONLY the Review
// column renders the Approve / Reject decision drop zones.
describe('Review-only drag + decision drop zones (Req 8.4/8.5)', () => {
  const dragItem: WorkItemView = {
    id: 'wi-drag',
    column: 'review',
    agentId: 'a-1',
    kind: 'ingest',
    what: 'Ingest a paper',
    why: 'Because it is cited a lot',
    citations: [{ quote: 'A quote' }],
    isFactual: true,
    actions: ['approve', 'refine', 'dismiss'],
    children: [],
  }

  it('a Review card is draggable (draggable=true + data-draggable="true")', () => {
    const { container } = render(<WorkItemCard item={dragItem} column="review" />)
    const article = container.querySelector('article') as HTMLElement
    expect(article.getAttribute('data-draggable')).toBe('true')
    expect(article.draggable).toBe(true)
  })

  it('a non-Review card is NOT draggable (no data-draggable + draggable=false)', () => {
    const nonReview = WORK_BOARD_COLUMNS.filter((c) => c !== 'review')
    for (const column of nonReview) {
      cleanup()
      const { container } = render(
        <WorkItemCard item={{ ...dragItem, column, actions: [] }} column={column as WorkBoardColumn} />,
      )
      const article = container.querySelector('article') as HTMLElement
      expect(article.hasAttribute('data-draggable')).toBe(false)
      expect(article.draggable).toBe(false)
    }
  })

  it('the Review column renders the Approve + Reject decision drop zones', () => {
    const { container } = render(
      <WorkColumn column="review" items={[dragItem]} onResolve={() => {}} />,
    )
    expect(container.querySelector('[data-review-dropzones]')).not.toBeNull()
    expect(container.querySelector('[data-dropzone="approve"]')).not.toBeNull()
    expect(container.querySelector('[data-dropzone="dismiss"]')).not.toBeNull()
  })

  it('a non-Review column renders NO drop zones, even with items + a resolver', () => {
    const nonReview = WORK_BOARD_COLUMNS.filter((c) => c !== 'review')
    for (const column of nonReview) {
      cleanup()
      const { container } = render(
        <WorkColumn
          column={column as WorkBoardColumn}
          items={[{ ...dragItem, column: column as WorkBoardColumn, actions: [] }]}
          onResolve={() => {}}
        />,
      )
      expect(container.querySelector('[data-review-dropzones]')).toBeNull()
      expect(container.querySelector('[data-dropzone]')).toBeNull()
    }
  })
})
