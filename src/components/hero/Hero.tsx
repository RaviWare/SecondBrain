'use client'

/**
 * Hero — SecondBrain landing hero
 * -------------------------------
 * Two-column layout (55/45 on desktop), React-ported from the provided
 * index.html / design-system.css / gsap-engine.js specs.
 *
 *  · GSAP entrance timeline: eyebrow → headline word-split → desc → CTAs → telemetry
 *  · CountUp on the three telemetry figures (triggered on mount)
 *  · BrainCanvas on the right column (autonomous neural graph)
 *  · Uses Phase-1 orange/black tokens; keeps the provided copy verbatim
 */
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import { BrainCanvas } from './BrainCanvas'

const HEADLINE_LINES = ['Your Second Brain.', 'Always On.']

const TELEMETRY = [
  { target: 40231,    label: 'USERS',   delay: 0 },
  { target: 12400000, label: 'PAGES',   delay: 0.8 },
  { target: 3400000,  label: 'QUERIES', delay: 1.6 },
]

export function Hero() {
  const rootRef = useRef<HTMLElement>(null)
  const h1Ref = useRef<HTMLHeadingElement>(null)
  const counterRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    const ctx = gsap.context(() => {
      const h1 = h1Ref.current
      if (!h1) return

      // Split each .line into <span.word-wrap><span.word-inner>word</span></span>
      h1.querySelectorAll('.line').forEach((line) => {
        const text = (line.textContent || '').trim()
        const words = text.split(/\s+/)
        line.innerHTML = words
          .map(
            (w) =>
              `<span class="word-wrap"><span class="word-inner">${w}</span></span>`
          )
          .join(' ')
      })

      const tl = gsap.timeline({ delay: 0.15 })

      tl.from('.hero-eyebrow', {
        opacity: 0, y: 14, duration: 0.55, ease: 'power3.out',
      })
        .from(
          '.word-inner',
          { yPercent: 120, opacity: 0, duration: 0.72, stagger: 0.055, ease: 'power3.out' },
          '-=0.25'
        )
        .from(
          '.hero-desc',
          { opacity: 0, y: 18, duration: 0.6, ease: 'power2.out' },
          '-=0.4'
        )
        .from(
          '.hero-ctas .hero-btn',
          { opacity: 0, y: 14, scale: 0.96, duration: 0.5, stagger: 0.1, ease: 'back.out(1.8)' },
          '-=0.4'
        )
        .from(
          '.hero-tel',
          { opacity: 0, duration: 0.5, ease: 'power2.out' },
          '-=0.3'
        )

      // Count-ups run in parallel with the final timeline beats
      counterRefs.current.forEach((el, i) => {
        if (!el) return
        const target = TELEMETRY[i].target
        const obj = { val: 0 }
        gsap.to(obj, {
          val: target,
          duration: 2.2,
          delay: 0.6,
          ease: 'power2.out',
          onUpdate() {
            el.textContent = Math.floor(obj.val).toLocaleString()
          },
        })
      })
    }, rootRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={rootRef}
      id="hero"
      aria-labelledby="hero-heading"
      className="hero-root relative"
    >
      {/* ── Ambient layers ────────────────────────── */}
      {/* primary plume */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 55% 45% at 28% 38%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 62%)',
        }}
      />
      {/* secondary cold plume behind the canvas */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 40% 42% at 78% 55%, color-mix(in srgb, #e5e5ea 5%, transparent), transparent 60%)',
        }}
      />
      {/* grid + fade */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 grid-bg opacity-40"
        style={{
          maskImage:
            'radial-gradient(ellipse 70% 70% at 50% 50%, #000 30%, transparent 85%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 70% at 50% 50%, #000 30%, transparent 85%)',
        }}
      />
      {/* soft scanline sweep */}
      <div aria-hidden className="hero-scanline" />

      {/* ── Left: copy ─────────────────────────────── */}
      <div className="hero-content">
        <div className="hero-eyebrow">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 type-mono-xs"
            style={{
              borderColor: 'var(--border-bright)',
              background: 'var(--surface-2)',
              color: 'var(--text-secondary)',
              letterSpacing: '0.14em',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full pulse-dot"
              style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }}
            />
            AI-POWERED KNOWLEDGE OS
          </span>
        </div>

        <h1 ref={h1Ref} id="hero-heading" className="hero-h1">
          {HEADLINE_LINES.map((line, i) => (
            <span key={i} className="line">
              {line}
            </span>
          ))}
        </h1>

        <p className="hero-desc">
          Paste anything. AI structures it into a searchable,
          <br />
          interconnected knowledge graph that grows
          <br />
          exponentially smarter over time.
        </p>

        <div className="hero-ctas">
          <Link href="/sign-up" className="hero-btn hero-btn-primary">
            Start Free <span aria-hidden>→</span>
          </Link>
          <a href="#how-it-works" className="hero-btn hero-btn-ghost">
            <span aria-hidden>▶</span> See How It Works
          </a>
        </div>

        <div className="hero-tel" aria-label="Platform statistics">
          {TELEMETRY.map((t, i) => (
            <div className="tel-item" key={t.label}>
              <span
                className="tel-dot"
                aria-hidden
                style={{ animationDelay: `${t.delay}s` }}
              />
              <span
                ref={(el) => {
                  counterRefs.current[i] = el
                }}
                data-count={t.target}
                aria-label={`${t.target.toLocaleString()} ${t.label.toLowerCase()}`}
              >
                0
              </span>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: brain canvas + instrument frame ──── */}
      <div className="hero-visual" id="hero-canvas-container">
        {/* HUD corner brackets */}
        <span aria-hidden className="hud-bracket tl" />
        <span aria-hidden className="hud-bracket tr" />
        <span aria-hidden className="hud-bracket bl" />
        <span aria-hidden className="hud-bracket br" />

        {/* top-left meta stamp */}
        <div aria-hidden className="hero-meta meta-tl">
          <span className="meta-dot" />
          NEURAL · ENGINE · ONLINE
        </div>
        {/* bottom-right sector tag */}
        <div aria-hidden className="hero-meta meta-br">
          SECTOR · 07 / GRAPH · v1.4
        </div>

        <BrainCanvas className="w-full h-full" />
      </div>

      {/* ── Scroll indicator ─────────────────────────── */}
      <div aria-hidden className="hero-scroll">
        <span className="scroll-label">SCROLL</span>
        <span className="scroll-track">
          <span className="scroll-dot" />
        </span>
      </div>

      {/* ─────────────────────────────────────────────
          Hero-scoped CSS (grid layout, h1, CTAs, telemetry)
          ───────────────────────────────────────────── */}
      <style jsx>{`
        .hero-root {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 55% 45%;
          align-items: center;
          padding: calc(72px + 40px) 24px 80px;
          gap: 48px;
          border-bottom: 1px solid var(--border);
          position: relative;
          z-index: 1;
        }
        @media (max-width: 900px) {
          .hero-root {
            grid-template-columns: 1fr;
            padding: 120px 20px 64px;
          }
        }

        .hero-content {
          max-width: 580px;
          justify-self: end;
          width: 100%;
        }
        @media (max-width: 1200px) {
          .hero-content { max-width: 560px; justify-self: center; }
        }

        .hero-eyebrow { margin-bottom: 32px; }

        :global(.hero-h1) {
          font-family: var(--font-inter), ui-sans-serif, system-ui, -apple-system, sans-serif;
          font-size: clamp(54px, 5.8vw, 84px);
          font-weight: 700;
          line-height: 1.04;
          letter-spacing: -0.032em;
          margin-bottom: 28px;
          color: var(--text-primary);
        }
        :global(.hero-h1 .line) { display: block; }
        :global(.hero-h1 .line:nth-child(2)) {
          background: var(--brushed-silver);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }
        :global(.word-wrap) {
          display: inline-block;
          overflow: hidden;
          vertical-align: bottom;
          line-height: 1.12;
        }
        :global(.word-inner) { display: inline-block; }

        .hero-desc {
          font-size: 15px;
          color: var(--text-secondary);
          line-height: 1.85;
          margin-bottom: 40px;
          max-width: 460px;
        }

        .hero-ctas {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 60px;
          flex-wrap: wrap;
        }

        :global(.hero-btn) {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 44px;
          padding: 0 20px;
          border-radius: var(--radius-md);
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.005em;
          transition: all 0.3s var(--ease-out-expo);
          border: 1px solid transparent;
          white-space: nowrap;
        }
        :global(.hero-btn-primary) {
          color: var(--text-inverse);
          background: linear-gradient(135deg, var(--accent-bright), var(--accent));
          box-shadow: var(--shadow-2);
        }
        :global(.hero-btn-primary:hover) {
          box-shadow: var(--glow-accent);
          transform: translateY(-1px);
        }
        :global(.hero-btn-ghost) {
          color: var(--text-secondary);
          border-color: var(--border-bright);
          background: transparent;
        }
        :global(.hero-btn-ghost:hover) {
          color: var(--text-primary);
          border-color: var(--border-glow);
          background: color-mix(in srgb, var(--accent) 6%, transparent);
        }

        .hero-tel {
          display: flex;
          align-items: center;
          gap: 36px;
          padding-top: 28px;
          border-top: 1px solid var(--border);
          flex-wrap: wrap;
        }
        .tel-item {
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 10px;
          letter-spacing: 0.15em;
          color: var(--text-muted);
          text-transform: uppercase;
          font-family: var(--font-mono), monospace;
        }
        .tel-item > span:nth-child(2) {
          color: var(--text-primary);
          font-weight: 600;
          letter-spacing: 0.02em;
          font-size: 12px;
        }
        .tel-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 6px var(--accent);
          animation: hero-pulse-dot 2.5s ease-in-out infinite;
        }
        @keyframes hero-pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.7); }
        }

        .hero-visual {
          height: 600px;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        @media (max-width: 900px) {
          .hero-visual { height: 480px; }
        }

        /* ── HUD corner brackets ─────────────────────── */
        .hud-bracket {
          position: absolute;
          width: 22px;
          height: 22px;
          border: 1px solid var(--border-bright);
          opacity: 0.6;
          pointer-events: none;
        }
        .hud-bracket.tl { top: 8px;    left: 8px;    border-right: none; border-bottom: none; }
        .hud-bracket.tr { top: 8px;    right: 8px;   border-left: none;  border-bottom: none; }
        .hud-bracket.bl { bottom: 8px; left: 8px;    border-right: none; border-top: none; }
        .hud-bracket.br { bottom: 8px; right: 8px;   border-left: none;  border-top: none; }

        /* ── Meta tags on the canvas frame ───────────── */
        .hero-meta {
          position: absolute;
          z-index: 2;
          font-family: var(--font-mono), monospace;
          font-size: 9.5px;
          letter-spacing: 0.18em;
          color: var(--text-muted);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--surface) 70%, transparent);
          backdrop-filter: blur(6px);
          border-radius: 999px;
        }
        .meta-tl { top: 22px; left: 22px; }
        .meta-br { bottom: 22px; right: 22px; }
        .meta-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 6px var(--accent);
          animation: hero-pulse-dot 2.5s ease-in-out infinite;
        }

        /* ── Scan-line sweep overlay ─────────────────── */
        .hero-scanline {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(180deg,
              transparent 0%,
              color-mix(in srgb, var(--accent) 4%, transparent) 50%,
              transparent 100%);
          mix-blend-mode: screen;
          animation: hero-scan 9s ease-in-out infinite;
          opacity: 0.6;
          z-index: 0;
        }
        @keyframes hero-scan {
          0%   { transform: translateY(-100%); opacity: 0; }
          40%  { opacity: 0.55; }
          100% { transform: translateY(100%); opacity: 0; }
        }

        /* ── Scroll indicator ─────────────────────────── */
        .hero-scroll {
          position: absolute;
          left: 50%;
          bottom: 28px;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          font-family: var(--font-mono), monospace;
          font-size: 9px;
          letter-spacing: 0.3em;
          color: var(--text-muted);
          z-index: 2;
          pointer-events: none;
        }
        .scroll-label { opacity: 0.65; }
        .scroll-track {
          width: 1px;
          height: 42px;
          background: color-mix(in srgb, var(--border-bright) 70%, transparent);
          position: relative;
          overflow: hidden;
        }
        .scroll-dot {
          position: absolute;
          left: -1px;
          top: 0;
          width: 3px;
          height: 8px;
          border-radius: 2px;
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
          animation: hero-scroll-drop 2.2s cubic-bezier(.6,.05,.4,1) infinite;
        }
        @keyframes hero-scroll-drop {
          0%   { transform: translateY(-10px); opacity: 0; }
          25%  { opacity: 1; }
          75%  { opacity: 1; }
          100% { transform: translateY(42px); opacity: 0; }
        }
        @media (max-width: 900px) {
          .hero-scroll { display: none; }
          .meta-tl, .meta-br { font-size: 8.5px; padding: 4px 8px; }
        }
      `}</style>
    </section>
  )
}
