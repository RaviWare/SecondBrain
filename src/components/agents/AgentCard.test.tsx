// @vitest-environment jsdom
//
// Feature: hermes-agents, Properties 16/17 (dashboard half): glass recipe +
// review-accent reservation + queue anatomy.
//
// Component tests (jsdom) for the Squad Dashboard's glass recipe and the
// review-only accent reservation, asserted against the real, exported pieces the
// dashboard renders:
//   • `AgentCard` (task 3.4) — the roster card. Verifies the mandatory glass
//     texture stack (`dash-panel dash-grain dash-interactive` + `dash-spotlight`
//     and a `.dash-spotlight-glow` child) and the dashboard half of Property 17
//     (the warm accent is exposed IFF status === 'review').
//   • `toQueueItem` (`@/lib/agents/aegis/queue-view`) — the shared view-model the
//     Aegis Queue rail renders. Verifies the dashboard half of Property 16: the
//     consistent queue anatomy (what / why / ≥1 citation for factual proposals /
//     EXACTLY the three actions approve·refine·dismiss).
//
// The default vitest environment is `node` (see vitest.config.ts); this file opts
// into jsdom via the per-file docblock pragma on line 1 WITHOUT changing the
// global config, mirroring src/app/app/ingest/ingest-button.test.tsx.
//
// Why not render the whole page (src/app/app/agents/page.tsx)? It is a
// `'use client'` page that fetches `/api/agents/dashboard` on mount, so testing it
// would require mocking `fetch` and exercising none of the recipe contract under
// test. We test the smaller EXPORTED pieces instead (the prompt's guidance).
//
// PORTAL OVERLAYS (root-token rule): N/A for this surface. The dashboard's Aegis
// Queue uses an INLINE refine composer and an INLINE undo toast (see
// AegisQueuePanel in page.tsx) — it deliberately avoids Radix portals — so there
// is no `<body>`-level overlay whose `--dash-*` tokens could fail to resolve. The
// root-token portal rule from glass-theme.md therefore does not apply here; we do
// not force a contrived portal test.

import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AgentCard } from './AgentCard'
import { AGENT_STATUSES, type AgentStatus } from '@/lib/agents/accent'
import { toQueueItem, type ProposalView } from '@/lib/agents/aegis/queue-view'

afterEach(cleanup)

// Real skill ids from src/lib/skills/catalog.ts (getSkill is the real catalog).
const KNOWN_SKILL_IDS = ['research-analyst', 'meeting-prep'] as const
const KNOWN_SKILL_NAMES = ['Research Analyst', 'Meeting Prep'] as const

// Render one card and hand back its root <article>. The card's root element is the
// <article> AgentCard renders; querying it directly lets us assert classes/attrs.
function renderCard(overrides: Partial<React.ComponentProps<typeof AgentCard>> = {}) {
  const props: React.ComponentProps<typeof AgentCard> = {
    name: 'Atlas',
    role: 'scout',
    status: 'live',
    trustScore: 72,
    skillIds: [...KNOWN_SKILL_IDS],
    now: 'Scanning sources for new material',
    ...overrides,
  }
  const { container } = render(<AgentCard {...props} />)
  const article = container.querySelector('article')
  if (!article) throw new Error('AgentCard did not render an <article> root')
  return { article, container }
}

// The status indicator dot is the only span carrying the `h-2.5` size class.
function statusDot(article: Element): Element {
  const dot = Array.from(article.querySelectorAll('span')).find((s) =>
    s.className.includes('h-2.5'),
  )
  if (!dot) throw new Error('status indicator dot not found')
  return dot
}

describe('AgentCard — glass recipe (Req 6.10, 11.7)', () => {
  it('root carries the mandatory texture stack: dash-panel + dash-grain + dash-interactive (+ dash-spotlight)', () => {
    const { article } = renderCard()
    expect(article.classList.contains('dash-panel')).toBe(true)
    expect(article.classList.contains('dash-grain')).toBe(true)
    expect(article.classList.contains('dash-interactive')).toBe(true)
    // Feature card → also the spotlight treatment.
    expect(article.classList.contains('dash-spotlight')).toBe(true)
  })

  it('renders the .dash-spotlight-glow child required by the spotlight recipe', () => {
    const { article } = renderCard()
    expect(article.querySelector('.dash-spotlight-glow')).not.toBeNull()
  })
})

describe('AgentCard — review-accent reservation (Property 17, dashboard half; Req 6.6)', () => {
  it('status="review" exposes the review accent (data-accent="review" + accent ring + data-status)', () => {
    const { article } = renderCard({ status: 'review' })
    expect(article.getAttribute('data-accent')).toBe('review')
    expect(article.getAttribute('data-status')).toBe('review')
    // The accent ring is applied only while awaiting sign-off.
    expect(article.className.includes('ring-1')).toBe(true)
    // The status label reflects the awaiting-sign-off state.
    expect(screen.getByText('Awaiting sign-off')).not.toBeNull()
  })

  it('every NON-review status (live/idle/paused/error) exposes NO accent', () => {
    const nonReview = AGENT_STATUSES.filter((s) => s !== 'review')
    // Sanity: the four documented non-review statuses are present.
    expect(nonReview).toEqual(['live', 'idle', 'paused', 'error'])

    for (const status of nonReview) {
      cleanup()
      const { article } = renderCard({ status })
      expect(article.getAttribute('data-status')).toBe(status)
      // data-accent must be absent (undefined → attribute not serialized).
      expect(article.hasAttribute('data-accent')).toBe(false)
      // No accent ring on non-review cards.
      expect(article.className.includes('ring-1')).toBe(false)
    }
  })

  it('EXACTLY the review status owns the accent across all statuses', () => {
    const withAccent = AGENT_STATUSES.filter((status) => {
      cleanup()
      const { article } = renderCard({ status })
      return article.getAttribute('data-accent') === 'review'
    })
    expect(withAccent).toEqual(['review'])
  })
})

describe('AgentCard — status color language (Req 6.5)', () => {
  it('the review dot uses the reserved accent token; live uses the green/live treatment; they differ', () => {
    const { article: reviewCard } = renderCard({ status: 'review' })
    const reviewDot = statusDot(reviewCard).className
    cleanup()
    const { article: liveCard } = renderCard({ status: 'live' })
    const liveDot = statusDot(liveCard).className

    expect(reviewDot.includes('bg-[var(--dash-accent)]')).toBe(true)
    expect(liveDot.includes('bg-emerald-400')).toBe(true)
    expect(liveDot.includes('dash-live-dot')).toBe(true)
    // Review's status color is distinct from live's.
    expect(reviewDot).not.toBe(liveDot)
  })

  it('idle/paused/error do NOT use the reserved accent dot token', () => {
    for (const status of ['idle', 'paused', 'error'] as AgentStatus[]) {
      cleanup()
      const { article } = renderCard({ status })
      expect(statusDot(article).className.includes('bg-[var(--dash-accent)]')).toBe(false)
    }
  })
})

describe('AgentCard — skill chips + trust band (Req 6.3)', () => {
  it('renders a chip for each KNOWN skill id and the Trust_Band label', () => {
    renderCard({ skillIds: [...KNOWN_SKILL_IDS], trustScore: 72 })
    for (const name of KNOWN_SKILL_NAMES) {
      expect(screen.getByText(name)).not.toBeNull()
    }
    // trustScore 72 → 'proving' band (40–79).
    expect(screen.getByText('Proving')).not.toBeNull()
  })

  it('skips unknown skill ids gracefully (only known skills become chips)', () => {
    const { container } = renderCard({
      skillIds: ['research-analyst', 'does-not-exist', 'meeting-prep'],
    })
    // The chips live in the only flex-wrap container in the card.
    const chipWrap = container.querySelector('.flex-wrap')
    expect(chipWrap).not.toBeNull()
    expect(chipWrap!.children.length).toBe(KNOWN_SKILL_IDS.length) // 2 — unknown dropped
    expect(screen.getByText('Research Analyst')).not.toBeNull()
    expect(screen.getByText('Meeting Prep')).not.toBeNull()
  })

  it('renders the empty "No skills assigned" state when no known skills resolve', () => {
    renderCard({ skillIds: ['does-not-exist'] })
    expect(screen.getByText('No skills assigned')).not.toBeNull()
  })
})

describe('Aegis Queue anatomy via toQueueItem (Property 16, dashboard half; Req 3.2)', () => {
  // A representative factual proposal (kind 'ingest') as the dashboard rail receives.
  const factualProposal: ProposalView = {
    _id: 'p-1',
    agentId: 'a-1',
    kind: 'ingest',
    title: 'Ingest "Attention Is All You Need"',
    rationale: 'This paper is cited across three of your notes but is not yet in the vault.',
    citations: [
      { url: 'https://arxiv.org/abs/1706.03762', quote: 'We propose a new simple network architecture, the Transformer.' },
    ],
    status: 'pending',
  }

  it('exposes what (title), why (rationale), ≥1 citation, and EXACTLY [approve, refine, dismiss]', () => {
    const item = toQueueItem(factualProposal)
    expect(item.what).toBe(factualProposal.title)
    expect(item.why).toBe(factualProposal.rationale)
    expect(item.isFactual).toBe(true)
    expect(item.citations.length).toBeGreaterThanOrEqual(1)
    // Exactly the three decision actions, in display order.
    expect(item.actions).toEqual(['approve', 'refine', 'dismiss'])
  })

  it('hands out a fresh actions array so callers cannot mutate the shared constant', () => {
    const a = toQueueItem(factualProposal)
    const b = toQueueItem(factualProposal)
    expect(a.actions).not.toBe(b.actions)
    expect(a.actions).toEqual(b.actions)
  })
})
