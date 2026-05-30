'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Animates a number from 0 → target on mount (once visible).
 * Respects prefers-reduced-motion by jumping straight to the target.
 */
export function useCountUp(target: number, durationMs = 1400, startDelayMs = 0) {
  const [value, setValue] = useState(0)
  const ref = useRef<HTMLElement | null>(null)
  const started = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced) {
      setValue(target)
      return
    }

    const run = () => {
      if (started.current) return
      started.current = true
      const start = performance.now() + startDelayMs

      const tick = (now: number) => {
        const elapsed = now - start
        if (elapsed < 0) {
          requestAnimationFrame(tick)
          return
        }
        const progress = Math.min(1, elapsed / durationMs)
        // easeOutExpo
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
        setValue(Math.round(eased * target))
        if (progress < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          run()
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [target, durationMs, startDelayMs])

  return { value, ref }
}
