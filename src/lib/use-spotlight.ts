'use client'

import { useCallback, useRef } from 'react'

/**
 * Apple-style glass spotlight. Returns a ref + onMouseMove handler that writes
 * the pointer position into --mx / --my CSS vars on the element, so the
 * `.dash-spotlight` border + glow track the cursor. Pure CSS does the painting;
 * this just feeds coordinates. rAF-throttled to stay buttery.
 */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  const frame = useRef<number | null>(null)

  const onMouseMove = useCallback((e: React.MouseEvent<T>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty('--mx', `${x}px`)
      el.style.setProperty('--my', `${y}px`)
      frame.current = null
    })
  }, [])

  return { ref, onMouseMove }
}
