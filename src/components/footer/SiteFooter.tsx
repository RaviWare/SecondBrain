'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'

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

      {/* ── Soft backdrop plume ── */}
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
        className="pointer-events-none absolute inset-0 -z-10 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(var(--border-bright) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage:
            'radial-gradient(ellipse 80% 60% at 50% 100%, #000 10%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 60% at 50% 100%, #000 10%, transparent 75%)',
        }}
      />

      {/* ── Top content ───────── */}
      <div className="mx-auto max-w-7xl px-4 md:px-6 pt-10 md:pt-16 pb-6 md:pb-8">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 md:gap-10 lg:gap-12">
          {/* Brand · newsletter */}
          <div className="col-span-2 md:col-span-5 lg:col-span-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] grid place-items-center shadow-[0_0_12px_rgba(255,122,31,0.1)]">
                  <Sparkles size={14} className="text-[var(--accent-bright)]" />
                </div>
                <div>
                  <div className="type-mono-xs text-[var(--accent-bright)] tracking-[0.15em] text-[9px]">SECONDBRAIN · CLOUD</div>
                  <div className="text-[1.05rem] font-semibold tracking-tight text-[var(--text-primary)]">Your second brain, wired.</div>
                </div>
              </div>
              <p className="text-[0.85rem] leading-[1.6] text-[var(--text-secondary)]">
                Ingest anything, query everything. A compiled source of truth with a preserved timeline.
              </p>
            </div>

            <form
              className="mt-6 md:mt-8 relative max-w-sm"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="relative flex items-center p-1 rounded-[14px] border border-[var(--border)] bg-[var(--surface-glass)] focus-within:border-[var(--accent)]/50 focus-within:shadow-[0_0_16px_rgba(255,122,31,0.15)] transition-all duration-300">
                <Input 
                  type="email" 
                  required 
                  placeholder="Join the build log..." 
                  className="border-0 bg-transparent h-9 text-[0.85rem] focus-visible:ring-0 px-3 w-full shadow-none"
                />
                <button
                  type="submit"
                  className={cn(
                    'shrink-0 flex h-8 w-8 items-center justify-center rounded-[10px]',
                    'bg-[linear-gradient(135deg,var(--accent-bright),var(--accent))]',
                    'text-[var(--text-inverse)] shadow-[var(--shadow-1)] hover:shadow-[0_0_12px_var(--accent)]',
                    'transition-all duration-300 hover:scale-105'
                  )}
                >
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </form>
          </div>

          <div className="hidden lg:block lg:col-span-2" />

          {/* Link columns */}
          <div className="col-span-2 md:col-span-7 lg:col-span-6 grid grid-cols-2 sm:grid-cols-3 gap-6 md:gap-8">
            <FooterCol title="Product" links={PRODUCT} />
            <FooterCol title="Resources" links={RESOURCES} />
            <FooterCol title="Company" links={COMPANY} />
          </div>
        </div>

        {/* Pill row · quick actions */}
        <div className="mt-8 md:mt-12 flex flex-wrap items-center gap-2">
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
      <div className="relative select-none px-4 md:px-6 pb-4 md:pb-6 overflow-hidden">
        <div
          aria-hidden
          className="mx-auto max-w-7xl flex justify-center"
          style={{
            maskImage:
              'linear-gradient(180deg, #000 0%, #000 40%, color-mix(in srgb, #000 10%, transparent) 100%)',
            WebkitMaskImage:
              'linear-gradient(180deg, #000 0%, #000 40%, color-mix(in srgb, #000 10%, transparent) 100%)',
          }}
        >
          <div
            className="flex items-baseline justify-center"
            style={{
              fontFamily: 'var(--font-inter), ui-sans-serif, system-ui',
              fontWeight: 800,
              fontSize: 'clamp(2.5rem, 9vw, 6.5rem)',
              lineHeight: 0.85,
              letterSpacing: '-0.04em',
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
                        'inline-block relative',
                        revealed ? 'footer-letter-in' : 'opacity-0'
                      )}
                      style={{
                        animationDelay: `${flatIndex * 60}ms`,
                      }}
                    >
                      <span 
                        className="block"
                        style={{
                          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 50%, var(--accent-deep, #e65c00) 100%)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          filter: 'drop-shadow(0 4px 24px rgba(255,122,31,0.3))'
                        }}
                      >
                        {ch}
                      </span>
                    </span>
                  )
                })}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom status row ────────────────────────────── */}
      <div className="border-t border-[var(--border)] bg-[#030304]/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row items-center justify-between gap-3">
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
          animation: letterIn 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
        @keyframes letterIn {
          0%   { opacity: 0; transform: scale(0.92) translateY(12%); filter: blur(12px); }
          100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
        }

        .footer-hairline-anim {
          animation: hairline 2s var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
          transform: translateX(-100%);
        }
        @keyframes hairline {
          0%   { transform: translateX(-100%); opacity: 0; }
          20%  { opacity: 1; }
          100% { transform: translateX(260%); opacity: 0.2; }
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
    <div className="flex flex-col">
      <div className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3 md:mb-4">{title.toUpperCase()}</div>
      <ul className="space-y-2 md:space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              target={l.external ? '_blank' : undefined}
              rel={l.external ? 'noreferrer' : undefined}
              className={cn(
                'group inline-flex items-center gap-1.5 text-[0.85rem] md:text-sm',
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
                  className="opacity-0 -translate-x-1 text-[var(--accent)] transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0"
                />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Link data ─────── */
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
