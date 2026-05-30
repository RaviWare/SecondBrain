'use client'

import { useEffect, useRef, useState } from 'react'

type TypewriterOptions = {
  /** ms per character while typing */
  typeSpeed?: number
  /** ms per character while deleting */
  deleteSpeed?: number
  /** ms to hold a fully-typed phrase before deleting */
  holdMs?: number
  /** ms to pause on empty before typing the next phrase */
  pauseMs?: number
  /** when false, the effect pauses and clears (e.g. input focused/filled) */
  enabled?: boolean
}

/**
 * Cycles through phrases with a type → hold → delete → next rhythm.
 * Returns the currently visible substring. Respects prefers-reduced-motion
 * (falls back to the first phrase, statically).
 */
export function useTypewriter(phrases: readonly string[], options: TypewriterOptions = {}) {
  const { typeSpeed = 45, deleteSpeed = 24, holdMs = 1600, pauseMs = 420, enabled = true } = options

  const [text, setText] = useState('')
  const phraseIndex = useRef(0)
  const charIndex = useRef(0)
  const phase = useRef<'typing' | 'holding' | 'deleting'>('typing')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!phrases.length) return

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced) {
      setText(phrases[0])
      return
    }

    if (!enabled) {
      if (timer.current) clearTimeout(timer.current)
      setText('')
      charIndex.current = 0
      phase.current = 'typing'
      return
    }

    const step = () => {
      const current = phrases[phraseIndex.current % phrases.length]

      if (phase.current === 'typing') {
        charIndex.current += 1
        setText(current.slice(0, charIndex.current))
        if (charIndex.current >= current.length) {
          phase.current = 'holding'
          timer.current = setTimeout(step, holdMs)
        } else {
          timer.current = setTimeout(step, typeSpeed)
        }
        return
      }

      if (phase.current === 'holding') {
        phase.current = 'deleting'
        timer.current = setTimeout(step, deleteSpeed)
        return
      }

      // deleting
      charIndex.current -= 1
      setText(current.slice(0, Math.max(0, charIndex.current)))
      if (charIndex.current <= 0) {
        phase.current = 'typing'
        phraseIndex.current = (phraseIndex.current + 1) % phrases.length
        timer.current = setTimeout(step, pauseMs)
      } else {
        timer.current = setTimeout(step, deleteSpeed)
      }
    }

    timer.current = setTimeout(step, typeSpeed)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [phrases, typeSpeed, deleteSpeed, holdMs, pauseMs, enabled])

  return text
}
