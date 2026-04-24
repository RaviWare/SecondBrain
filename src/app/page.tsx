'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Ticker } from '@/components/ticker'
import { SiteFooter } from '@/components/footer/SiteFooter'
import { Testimonials } from '@/components/testimonials/Testimonials'
import { PrecisionGrid } from '@/components/features/PrecisionGrid'
import { Hero } from '@/components/hero/Hero'
import { BrainMark } from '@/components/ui/BrainMark'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const NAV_LINKS = ['Features', 'How it works', 'Pricing', 'Docs']

const STEPS = [
  { num: '01', title: 'Ingest', desc: 'Paste a URL or text. We fetch and clean it automatically.' },
  { num: '02', title: 'Process', desc: 'Claude reads the source and writes structured wiki pages with cross-links.' },
  { num: '03', title: 'Query', desc: 'Ask any question. Get answers cited from your own wiki pages.' },
]

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] overflow-x-hidden">

      {/* Nav — Apple Silicon treatment */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          scrolled ? 'glass-bright border-b border-[var(--border)]' : ''
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-3 group">
            <span
              className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-[var(--border-bright)] transition-all duration-300 group-hover:border-[var(--border-glow)]"
              style={{ background: 'var(--metallic)' }}
            >
              <span
                aria-hidden
                className="absolute inset-0 pointer-events-none rounded-full"
                style={{ background: 'var(--metallic-hi)' }}
              />
              <BrainMark
                size={24}
                className="relative z-[1] text-[#e5e5ea] transition-transform duration-500 group-hover:scale-[1.08]"
              />
            </span>
            <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
              SecondBrain<span className="text-[var(--text-muted)] font-normal ml-1">Cloud</span>
            </span>
          </Link>

          {/* Links */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a
                key={l}
                href={`#${l.toLowerCase().replace(' ', '-')}`}
                className="type-mono-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {l}
              </a>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-3 py-2"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-[10px] border border-[var(--border-bright)] px-4 py-2 text-xs font-semibold tracking-[-0.005em] transition-all duration-300 hover:border-[var(--border-glow)] hover:-translate-y-[1px]"
              style={{
                background: 'var(--metallic)',
                boxShadow: 'var(--shadow-1)',
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: 'var(--metallic-hi)' }}
              />
              <span className="relative z-[1] brushed-text">Get started free</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero — SecondBrain two-column with autonomous brain canvas */}
      <Hero />

      {/* Ticker */}
      <Ticker />

      {/* How it works */}
      <section id="how-it-works" className="py-32 relative">
        <div className="absolute inset-0 dot-bg opacity-40" />
        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="text-center mb-16">
            <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">HOW IT WORKS</p>
            <h2 className="type-h2">Three steps to a smarter you</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <div
                key={i}
                className="relative rounded-2xl p-8 border border-[var(--border)] overflow-hidden group transition-all duration-300 hover:-translate-y-[2px] hover:border-[var(--border-bright)]"
                style={{ background: 'var(--metallic)', boxShadow: 'var(--shadow-1)' }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl"
                  style={{ background: 'var(--metallic-hi)' }}
                />
                <div className="absolute top-0 left-0 w-full h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
                />
                <p className="relative z-[1] mono text-6xl font-black text-[var(--text-muted)] opacity-20 mb-4 select-none">{step.num}</p>
                <div className="relative z-[1] w-8 h-px mb-4" style={{ background: 'var(--accent)' }} />
                <h3 className="relative z-[1] text-xl font-semibold mb-3 text-[var(--text-primary)]">{step.title}</h3>
                <p className="relative z-[1] text-[var(--text-secondary)] text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — aura 60B860 inspired instrument grid */}
      <PrecisionGrid />

      {/* Telemetry section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full blur-[80px]"
          style={{ background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}
        />

        <div className="max-w-7xl mx-auto px-6 relative">
          <div
            className="relative rounded-2xl p-8 md:p-12 border border-[var(--border)] overflow-hidden"
            style={{ background: 'var(--metallic)', boxShadow: 'var(--shadow-2)' }}
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: 'var(--metallic-hi)' }} />
            <div className="relative z-[1] flex items-center gap-3 mb-8">
              <span
                className="w-2 h-2 rounded-full pulse-dot"
                style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }}
              />
              <span className="type-mono-xs text-[var(--text-muted)] tracking-widest">SYSTEM TELEMETRY · LIVE</span>
            </div>

            <div className="relative z-[1] grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: 'INGEST LATENCY', value: '1.8s', bar: 72 },
                { label: 'QUERY LATENCY', value: '0.9s', bar: 45 },
                { label: 'ACCURACY',      value: '99.2%', bar: 99 },
                { label: 'UPTIME',        value: '99.9%', bar: 99 },
              ].map((m, i) => (
                <div key={i} className="space-y-3">
                  <p className="type-mono-xs text-[var(--text-muted)] tracking-widest">{m.label}</p>
                  <p className="text-3xl font-semibold text-[var(--text-primary)] tracking-tight">{m.value}</p>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${m.bar}%`,
                        background: i % 2 === 0 ? 'var(--accent)' : 'var(--brushed-silver)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-32">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">PRICING</p>
            <h2 className="type-h2">Simple, transparent pricing</h2>
            <p className="text-[var(--text-secondary)] mt-4 text-sm">Start free. Scale as you grow.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                name: 'Free', price: '$0', period: 'forever',
                features: ['25 ingests / month', '50 queries / month', '1 vault', 'URL + text ingestion', 'Full wiki reader', 'Claude Haiku AI'],
                cta: 'Get started free', href: '/sign-up', highlight: false,
              },
              {
                name: 'Pro', price: '$18', period: '/month',
                features: ['Unlimited ingests', 'Unlimited queries', '3 vaults', 'Claude Sonnet (better quality)', 'Priority support', 'Vault markdown export', 'API access'],
                cta: 'Start Pro', href: '/sign-up', highlight: true,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className="relative rounded-2xl p-8 border overflow-hidden transition-all duration-300 hover:-translate-y-[2px]"
                style={{
                  background: 'var(--metallic)',
                  borderColor: plan.highlight ? 'var(--border-glow)' : 'var(--border)',
                  boxShadow: plan.highlight ? 'var(--shadow-2), var(--glow-accent)' : 'var(--shadow-1)',
                }}
              >
                <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: 'var(--metallic-hi)' }} />

                {plan.highlight && (
                  <div
                    className="absolute top-4 right-4 type-mono-xs px-2.5 py-1 rounded-full tracking-widest border"
                    style={{
                      background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--accent) 32%, transparent)',
                      color: 'var(--accent-bright)',
                    }}
                  >
                    POPULAR
                  </div>
                )}
                <div
                  className="absolute top-0 left-0 right-0 h-px opacity-60"
                  style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
                />

                <p className="relative z-[1] type-mono-xs text-[var(--text-muted)] tracking-widest mb-2">{plan.name.toUpperCase()}</p>
                <div className="relative z-[1] flex items-end gap-1 mb-6">
                  <p className="text-5xl font-semibold tracking-tight">{plan.price}</p>
                  <p className="text-[var(--text-muted)] mb-1">{plan.period}</p>
                </div>

                <ul className="relative z-[1] space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                      <span
                        className="w-1 h-1 rounded-full shrink-0"
                        style={{ background: plan.highlight ? 'var(--accent)' : 'var(--text-muted)' }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className="relative z-[1] block text-center text-sm font-semibold py-3.5 rounded-xl transition-all duration-300 border"
                  style={
                    plan.highlight
                      ? {
                          color: 'var(--text-inverse)',
                          background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                          borderColor: 'transparent',
                          boxShadow: 'var(--shadow-2)',
                        }
                      : {
                          color: 'var(--text-primary)',
                          background: 'transparent',
                          borderColor: 'var(--border-bright)',
                        }
                  }
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 50%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%)',
          }}
        />
        <div className="max-w-3xl mx-auto px-6 text-center relative">
          <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-4">GET STARTED</p>
          <h2 className="text-5xl font-semibold mb-6 leading-tight tracking-tight">
            Initialize your<br />
            <span className="brushed-text">second brain</span>
          </h2>
          <p className="text-[var(--text-secondary)] mb-10 text-lg">Free forever. No credit card. Start in 30 seconds.</p>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-3 text-base font-semibold px-8 py-4 rounded-xl transition-all duration-300 hover:-translate-y-[1px]"
            style={{
              color: 'var(--text-inverse)',
              background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
              boxShadow: 'var(--shadow-2)',
            }}
          >
            Initialize system
            <span className="mono opacity-70">→</span>
          </Link>
        </div>
      </section>

      {/* Testimonials */}
      <Testimonials />

      {/* Footer — DD146-inspired scroll reveal wordmark */}
      <SiteFooter />
    </div>
  )
}
