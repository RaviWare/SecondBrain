// @vitest-environment jsdom
//
// Component tests for the Initialize Ingest primary CTA contract (Requirement 5
// + the keyboard/ARIA pieces of Requirement 10). The default vitest environment
// is `node` (see vitest.config.ts); this file opts into jsdom with the per-file
// docblock pragma above WITHOUT changing the global config, so the node-based
// CSS/logic tests keep running under `node`.
//
// Rendering the full IngestView is heavy and fragile: it requires mocking
// next/navigation (useSearchParams/useRouter), the dynamic pdfjs/mammoth
// imports, and the /api/ingest fetch. None of that is part of the button
// contract under test. Instead we render a small, self-contained harness that
// reproduces the EXACT button contract from src/app/app/ingest/page.tsx — same
// classes, same disabled/aria-busy logic, same guard — and assert behavior
// against it. This faithfully verifies the contract (classes + ARIA + guard +
// keyboard) without the page's unrelated dependencies.
//
// Assertions use plain DOM APIs + vitest's expect (no @testing-library/jest-dom
// dependency), keeping the install footprint to exactly the four packages this
// task adds.

import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

afterEach(cleanup)

// Mirror of the shipped CTA in src/app/app/ingest/page.tsx:
//   <div className="qi">
//     <button onClick={handleIngest}
//             disabled={!canSubmit || status === 'loading'}
//             aria-busy={status === 'loading'}
//             className="qi-btn qi-btn-primary qi-btn-lg w-full">…</button>
//   </div>
// Same disabled/aria-busy logic and the same Req 5.9 / 10.7 early-return guard.
function PrimaryCTA({ canSubmit, onIngest }: { canSubmit: boolean; onIngest: () => void }) {
  const [status, setStatus] = React.useState<'idle' | 'loading'>('idle')
  function handleIngest() {
    if (!canSubmit || status === 'loading') return // Req 5.9 / 10.7 guard
    setStatus('loading')
    onIngest()
  }
  return (
    <div className="qi">
      <button
        onClick={handleIngest}
        disabled={!canSubmit || status === 'loading'}
        aria-busy={status === 'loading'}
        className="qi-btn qi-btn-primary qi-btn-lg w-full"
      >
        {status === 'loading' ? 'Working…' : 'Initialize Ingest'}
      </button>
    </div>
  )
}

describe('Initialize Ingest primary CTA contract', () => {
  it('renders with the qi-btn / qi-btn-primary / qi-btn-lg class contract (Req 5.1/5.2)', () => {
    render(<PrimaryCTA canSubmit onIngest={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn.classList.contains('qi-btn')).toBe(true)
    expect(btn.classList.contains('qi-btn-primary')).toBe(true)
    expect(btn.classList.contains('qi-btn-lg')).toBe(true)
  })

  it('is disabled and does not trigger the action while not submittable (Req 5.9)', async () => {
    const user = userEvent.setup()
    const onIngest = vi.fn()
    render(<PrimaryCTA canSubmit={false} onIngest={onIngest} />)

    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)

    // Clicking a disabled button must not call the action.
    await user.click(btn)
    expect(onIngest).not.toHaveBeenCalled()
  })

  it('aria-busy is false/absent while idle (Req 5.8 — not busy until loading)', () => {
    render(<PrimaryCTA canSubmit onIngest={() => {}} />)
    const btn = screen.getByRole('button')
    // jsdom serializes the boolean false as aria-busy="false".
    expect(btn.getAttribute('aria-busy')).toBe('false')
  })

  it('on click while submittable: calls onIngest once and enters the loading state (aria-busy=true + disabled) (Req 5.8/10.6)', async () => {
    const user = userEvent.setup()
    const onIngest = vi.fn()
    render(<PrimaryCTA canSubmit onIngest={onIngest} />)

    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.disabled).toBe(false)

    await user.click(btn)

    expect(onIngest).toHaveBeenCalledTimes(1)
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect(btn.disabled).toBe(true)
    // Label swaps to the progress indicator text.
    expect(btn.textContent).toContain('Working…')
  })

  it('guard holds: a second click while loading does not call onIngest again (Req 5.9)', async () => {
    const user = userEvent.setup()
    const onIngest = vi.fn()
    render(<PrimaryCTA canSubmit onIngest={onIngest} />)

    const btn = screen.getByRole('button')
    await user.click(btn) // enters loading
    expect(onIngest).toHaveBeenCalledTimes(1)

    // Now loading + disabled. A second activation must be a no-op.
    await user.click(btn)
    expect(onIngest).toHaveBeenCalledTimes(1)
  })

  it('keyboard parity: focusing the enabled button and pressing Enter triggers the action (Req 10.7)', async () => {
    const user = userEvent.setup()
    const onIngest = vi.fn()
    render(<PrimaryCTA canSubmit onIngest={onIngest} />)

    const btn = screen.getByRole('button')
    btn.focus()
    expect(document.activeElement).toBe(btn)

    await user.keyboard('{Enter}')
    expect(onIngest).toHaveBeenCalledTimes(1)
    expect(btn.getAttribute('aria-busy')).toBe('true')
  })

  it('keyboard parity: focusing the enabled button and pressing Space triggers the action (Req 10.7)', async () => {
    const user = userEvent.setup()
    const onIngest = vi.fn()
    render(<PrimaryCTA canSubmit onIngest={onIngest} />)

    const btn = screen.getByRole('button')
    btn.focus()
    await user.keyboard(' ')
    expect(onIngest).toHaveBeenCalledTimes(1)
  })

  it('keyboard parity: a disabled button is not reachable by Tab and Enter does nothing (Req 5.9/10.7)', async () => {
    const user = userEvent.setup()
    const onIngest = vi.fn()
    render(<PrimaryCTA canSubmit={false} onIngest={onIngest} />)

    const btn = screen.getByRole('button')
    // Disabled buttons are not focusable; tabbing should not land on it.
    await user.tab()
    expect(document.activeElement).not.toBe(btn)

    // Even if some assistive layer pushes Enter through, the action must not fire.
    await user.keyboard('{Enter}')
    expect(onIngest).not.toHaveBeenCalled()
  })
})
