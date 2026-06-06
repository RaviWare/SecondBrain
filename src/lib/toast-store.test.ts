// Unit tests for the toast store (`@/lib/toast-store`).
//
// The store is framework-free, so it runs with plain calls — no DOM, no React. These
// pin: enqueue + ordering, replace-by-id (no duplicates), dismiss, the MAX_TOASTS cap
// (oldest dropped), tone/duration defaults, and subscriber notification.

import { describe, it, expect, vi } from 'vitest'
import { ToastStore, MAX_TOASTS } from './toast-store'

describe('ToastStore', () => {
  it('enqueues a toast with sensible defaults (info tone, default duration)', () => {
    const s = new ToastStore()
    const id = s.add({ title: 'Saved' })
    const [t] = s.getToasts()
    expect(t.id).toBe(id)
    expect(t.title).toBe('Saved')
    expect(t.tone).toBe('info')
    expect(t.durationMs).toBeGreaterThan(0)
  })

  it('replaces an existing toast with the same id instead of duplicating', () => {
    const s = new ToastStore()
    s.add({ id: 'x', title: 'First' })
    s.add({ id: 'x', title: 'Second' })
    const toasts = s.getToasts()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].title).toBe('Second')
  })

  it('dismisses a toast by id and is a no-op for an unknown id', () => {
    const s = new ToastStore()
    const id = s.add({ title: 'Bye' })
    s.dismiss('nope') // no-op
    expect(s.getToasts()).toHaveLength(1)
    s.dismiss(id)
    expect(s.getToasts()).toHaveLength(0)
  })

  it('caps at MAX_TOASTS, dropping the oldest first', () => {
    const s = new ToastStore()
    for (let i = 0; i < MAX_TOASTS + 3; i += 1) s.add({ title: `t${i}` })
    const toasts = s.getToasts()
    expect(toasts).toHaveLength(MAX_TOASTS)
    // The oldest (t0..t2) were dropped; the newest survive in order.
    expect(toasts[0].title).toBe('t3')
    expect(toasts[toasts.length - 1].title).toBe(`t${MAX_TOASTS + 2}`)
  })

  it('respects an explicit sticky duration of 0', () => {
    const s = new ToastStore()
    s.add({ title: 'Sticky', durationMs: 0 })
    expect(s.getToasts()[0].durationMs).toBe(0)
  })

  it('notifies subscribers on add and dismiss, and stops after unsubscribe', () => {
    const s = new ToastStore()
    const seen: number[] = []
    const unsub = s.subscribe((toasts) => seen.push(toasts.length))
    const id = s.add({ title: 'a' })
    s.dismiss(id)
    expect(seen).toEqual([1, 0])
    unsub()
    s.add({ title: 'b' })
    expect(seen).toEqual([1, 0]) // no further notifications
  })

  it('clear() removes everything and notifies once', () => {
    const s = new ToastStore()
    s.add({ title: 'a' })
    s.add({ title: 'b' })
    const spy = vi.fn()
    s.subscribe(spy)
    s.clear()
    expect(s.getToasts()).toHaveLength(0)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('records createdAt from the injected clock (deterministic ordering)', () => {
    let now = 1000
    const s = new ToastStore(() => now)
    s.add({ title: 'first' })
    now = 2000
    s.add({ title: 'second' })
    const [a, b] = s.getToasts()
    expect(a.createdAt).toBe(1000)
    expect(b.createdAt).toBe(2000)
  })
})
