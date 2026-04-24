'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * SiteFooter — DD146-inspired (aura.build)
 * ----------------------------------------
 *  · Top hairline with animated glow sweep
 *  · 4 link columns + newsletter card on a 12-col grid
 *  · Giant scroll-revealed "SECOND BRAIN" wordmark (per-letter stagger + gradient wipe)
 *  · Status / legal row with pulsing ops dot
 *  · Fully theme-aware — uses Phase 1 design tokens only
 */
const WORDMARK = ['SECOND', 'BRAIN']

export function SiteFooter() {
  const rootRef = useRef<HTMLElement>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setRevealed(true),
      { threshold: 0.15 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <footer
      ref={rootRef}
      className="relative overflow-hidden bg-[var(--bg)]"
      style={{ isolation: 'isolate' }}
    >
      {/* ── Animated hairline divider ────────────────────── */}
      <div className="relative h-px w-full bg-[var(--border)]">
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-[40%]',
            'bg-[linear-gradient(90deg,transparent,var(--border-glow),transparent)]',
            revealed ? 'footer-hairline-anim' : 'opacity-0'
          )}
        />
      </div>

      {/* ── Soft backdrop plume (keeps footer cohesive with hero) ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 100%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(var(--border-bright) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage:
            'radial-gradient(ellipse 80% 60% at 50% 100%, #000 10%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 60% at 50% 100%, #000 10%, transparent 75%)',
        }}
      />

      {/* ── Top content: link columns + newsletter ───────── */}
      <div className="mx-auto max-w-7xl px-4 md:px-6 pt-16 md:pt-24 pb-10 md:pb-14">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
          {/* Brand · newsletter */}
          <div className="md:col-span-5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-[var(--radius-sm)] metallic grid place-items-center">
                <Sparkles size={15} className="relative z-[1] text-[var(--accent-bright)]" />
              </div>
              <div>
                <div className="type-mono-xs text-[var(--text-muted)]">SECONDBRAIN · CLOUD</div>
                <div className="type-h5 brushed-text">Your second brain, wired.</div>
              </div>
            </div>

            <p className="type-body-sm mt-4 md:mt-5 max-w-sm">
              Ingest anything, query everything. A compiled source of truth with a preserved timeline —
              shipped as your personal AI knowledge base.
            </p>

            <form
              className="mt-6 md:mt-7 max-w-sm"
              onSubmit={(e) => {
                e.preventDefault()
                // hook up in Phase 2 (Resend/Loops)
              }}
            >
              <label className="type-mono-xs text-[var(--text-muted)] mb-2 block">
                JOIN · THE · BUILD · LOG
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input type="email" required placeholder="you@domain.com" />
                <button
                  type="submit"
                  className={cn(
                    'inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] px-4',
                    'text-[var(--text-inverse)] text-sm font-medium whitespace-nowrap',
                    'bg-[linear-gradient(135deg,var(--accent-bright),var(--accent))]',
                    'shadow-[var(--shadow-2)] hover:shadow-[var(--glow-accent)]',
                    'transition-all duration-300'
                  )}
                >
                  Subscribe <ArrowUpRight size={14} />
                </button>
              </div>
              <p className="type-caption mt-2">Build notes + release posts. No spam, unsubscribe any time.</p>
            </form>
          </div>

          {/* Spacer on lg */}
          <div className="hidden md:block md:col-span-1" />

          {/* Link columns */}
          <FooterCol title="Product" links={PRODUCT} />
          <FooterCol title="Resources" links={RESOURCES} />
          <FooterCol title="Company" links={COMPANY} />
        </div>

        {/* Pill row · quick actions */}
        <div className="mt-10 md:mt-14 flex flex-wrap items-center gap-2">
          {PILLS.map((p) => (
            <Link
              key={p.label}
              href={p.href}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1',
                'type-mono-xs text-[var(--text-secondary)]',
                'border-[var(--border-bright)] bg-[var(--surface-2)]',
                'hover:text-[var(--text-primary)] hover:border-[var(--border-glow)]',
                'transition-all duration-300'
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Giant wordmark with scroll reveal ───────────── */}
      <div className="relative select-none px-4 md:px-6 pb-8 md:pb-10 overflow-hidden">
        <div
          aria-hidden
          className="mx-auto max-w-7xl flex justify-center"
          style={{
            maskImage:
              'linear-gradient(180deg, transparent 0%, #000 18%, #000 70%, color-mix(in srgb, #000 30%, transparent) 100%)',
            WebkitMaskImage:
              'linear-gradient(180deg, transparent 0%, #000 18%, #000 70%, color-mix(in srgb, #000 30%, transparent) 100%)',
          }}
        >
          <div
            className="flex items-baseline justify-center"
            style={{
              fontFamily: 'var(--font-inter), ui-sans-serif, system-ui',
              fontWeight: 700,
              fontSize: 'clamp(2.25rem, 10.2vw, 10rem)',
              lineHeight: 0.9,
              letterSpacing: '-0.045em',
              whiteSpace: 'nowrap',
            }}
          >
            {WORDMARK.map((group, gi) => (
              <span
                key={gi}
                className="inline-flex"
                style={{ marginRight: gi < WORDMARK.length - 1 ? '0.22em' : 0 }}
              >
                {group.split('').map((ch, i) => {
                  const flatIndex =
                    WORDMARK.slice(0, gi).reduce((n, g) => n + g.length, 0) + i
                  return (
                    <span
                      key={i}
                      className={cn(
                        'inline-block brushed-text',
                        revealed ? 'footer-letter-in' : 'opacity-0 translate-y-[40%]'
                      )}
                      style={{
                        animationDelay: `${flatIndex * 55}ms`,
                        transitionDelay: `${flatIndex * 55}ms`,
                      }}
                    >
                      {ch}
                    </span>
                  )
                })}
              </span>
            ))}
          </div>
        </div>

        {/* Gradient sweep over wordmark */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-full',
            revealed && 'footer-sweep'
          )}
          style={{
            background:
              'linear-gradient(105deg, transparent 40%, color-mix(in srgb, var(--accent) 22%, transparent) 50%, transparent 60%)',
            mixBlendMode: 'screen',
          }}
        />
      </div>

      {/* ── Bottom status row ────────────────────────────── */}
      <div className="border-t border-[var(--border)]">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-4 md:py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="type-mono-xs text-[var(--text-muted)]">© 2026 · SECONDBRAIN CLOUD</span>
            <span className="hidden md:inline text-[var(--text-muted)]">·</span>
            <span className="hidden md:inline type-mono-xs text-[var(--text-muted)]">
              INSPIRED BY KARPATHY&apos;S LLM WIKI
            </span>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full pulse-dot"
                style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }}
              />
              <span className="type-mono-xs text-[var(--text-secondary)]">ALL SYSTEMS OPERATIONAL</span>
            </div>
            <span className="type-mono-xs text-[var(--text-muted)]">v0.1 · FOUNDATION</span>
          </div>
        </div>
      </div>

      {/* ── Scoped keyframes for footer-only motion ──────── */}
      <style jsx>{`
        .footer-letter-in {
          animation: letterIn 0.9s var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
          transform: translateY(40%);
          opacity: 0;
        }
        @keyframes letterIn {
          0%   { opacity: 0; transform: translateY(40%); filter: blur(6px); }
          60%  { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }

        .footer-sweep {
          animation: sweep 3.2s var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) 0.4s forwards;
          transform: translateX(-30%);
          opacity: 0;
        }
        @keyframes sweep {
          0%   { transform: translateX(-30%); opacity: 0; }
          25%  { opacity: 1; }
          100% { transform: translateX(40%); opacity: 0; }
        }

        .footer-hairline-anim {
          animation: hairline 2.4s var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
          transform: translateX(-100%);
        }
        @keyframes hairline {
          0%   { transform: translateX(-100%); opacity: 0; }
          20%  { opacity: 1; }
          100% { transform: translateX(260%); opacity: 0.3; }
        }
      `}</style>
    </footer>
  )
}

/* ────────────────────────────────────────────────────── */
function FooterCol({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string; external?: boolean }[]
}) {
  return (
    <div className="md:col-span-2">
      <div className="type-mono-xs text-[var(--text-muted)] mb-4">{title.toUpperCase()}</div>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              target={l.external ? '_blank' : undefined}
              rel={l.external ? 'noreferrer' : undefined}
              className={cn(
                'group inline-flex items-center gap-1 text-sm',
                'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                'transition-colors duration-200'
              )}
            >
              <span className="relative">
                {l.label}
                <span
                  aria-hidden
                  className="absolute left-0 -bottom-0.5 h-px w-0 bg-[var(--accent)] transition-all duration-300 group-hover:w-full"
                />
              </span>
              {l.external && (
                <ArrowUpRight
                  size={12}
                  className="opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0"
                />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Link data (swap routes as real pages land) ─────── */
const PRODUCT = [
  { label: 'Dashboard', href: '/app/dashboard' },
  { label: 'Ingest', href: '/app/ingest' },
  { label: 'Wiki', href: '/app/wiki' },
  { label: 'Query', href: '/app/query' },
  { label: 'Pricing', href: '/#pricing' },
]
const RESOURCES = [
  { label: 'Design system', href: '/design-system' },
  { label: 'Build log', href: '/blog' },
  { label: 'Docs', href: '/docs' },
  { label: 'Changelog', href: '/changelog' },
]
const COMPANY = [
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
]
const PILLS = [
  { label: 'Private vaults', href: '#' },
  { label: 'Cited AI answers', href: '#' },
  { label: 'Knowledge graph', href: '#' },
  { label: 'Secure sign-in', href: '#' },
]
