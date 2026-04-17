'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { gsap } from 'gsap'
import { HeroGrid } from '@/components/hero-grid'
import { IsometricBrain } from '@/components/isometric-brain'
import { Ticker } from '@/components/ticker'

const NAV_LINKS = ['Features', 'How it works', 'Pricing', 'Docs']

const STATS = [
  { value: '10x', label: 'Faster recall', sub: 'vs manual search' },
  { value: '<2s', label: 'Ingest time', sub: 'per source' },
  { value: '100%', label: 'Cited answers', sub: 'no hallucinations' },
  { value: '∞', label: 'Knowledge links', sub: 'auto-generated' },
]

const FEATURES = [
  {
    col: 'col-span-2',
    tag: 'INGESTION ENGINE',
    title: 'Paste a URL. Claude does the rest.',
    desc: 'Drop any link, article, PDF or raw text. Our AI reads, summarizes, and structures it into your personal wiki — automatically. Cross-links to existing knowledge included.',
    accent: 'violet',
    icon: '⬡',
  },
  {
    col: 'col-span-1',
    tag: 'KNOWLEDGE GRAPH',
    title: 'Auto-linked concepts',
    desc: 'Every ingest updates related pages. Your knowledge compounds.',
    accent: 'cyan',
    icon: '◈',
  },
  {
    col: 'col-span-1',
    tag: 'QUERY ENGINE',
    title: 'Cited AI answers',
    desc: 'Ask anything. Get answers with exact wiki citations.',
    accent: 'indigo',
    icon: '◎',
  },
  {
    col: 'col-span-1',
    tag: 'WIKI READER',
    title: 'Wikipedia-style layout',
    desc: 'Backlinks, related pages, confidence scores, tags.',
    accent: 'violet',
    icon: '▣',
  },
  {
    col: 'col-span-2',
    tag: 'YOUR DATA',
    title: 'Own your knowledge base completely',
    desc: 'Edit any page manually. Export full vault as markdown. No black boxes — your second brain is readable, editable, exportable.',
    accent: 'cyan',
    icon: '⬡',
  },
]

const STEPS = [
  { num: '01', title: 'Ingest', desc: 'Paste a URL or text. We fetch and clean it automatically.' },
  { num: '02', title: 'Process', desc: 'Claude reads the source and writes structured wiki pages with cross-links.' },
  { num: '03', title: 'Query', desc: 'Ask any question. Get answers cited from your own wiki pages.' },
]

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero-badge', { opacity: 0, y: -20, duration: 0.6, ease: 'power2.out' })
      gsap.from('.hero-headline', { opacity: 0, y: 40, duration: 0.8, delay: 0.2, ease: 'power3.out' })
      gsap.from('.hero-sub', { opacity: 0, y: 20, duration: 0.7, delay: 0.4, ease: 'power2.out' })
      gsap.from('.hero-cta', { opacity: 0, y: 20, duration: 0.6, delay: 0.6, ease: 'power2.out' })
      gsap.from('.hero-stats', { opacity: 0, y: 30, duration: 0.6, delay: 0.8, ease: 'power2.out', stagger: 0.1 })
      gsap.from('.hero-visual', { opacity: 0, scale: 0.95, duration: 1, delay: 0.3, ease: 'power2.out' })
    }, heroRef)

    return () => ctx.revert()
  }, [])

  return (
    <div className="min-h-screen bg-[#04040a] text-white overflow-x-hidden">

      {/* Nav */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${scrolled ? 'glass border-b border-white/5' : ''}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-sm font-bold shadow-lg shadow-violet-500/20">
              S
            </div>
            <span className="font-semibold text-sm tracking-tight">
              Second<span className="text-violet-400">Brain</span>
              <span className="text-white/20">Cloud</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => (
              <a key={l} href={`#${l.toLowerCase().replace(' ', '-')}`}
                className="text-xs text-white/40 hover:text-white/80 transition-colors tracking-widest uppercase font-medium">
                {l}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-xs text-white/40 hover:text-white transition-colors px-3 py-2">
              Sign in
            </Link>
            <Link href="/sign-up"
              className="btn-primary text-xs font-semibold px-4 py-2.5 rounded-lg relative z-10">
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col pt-32 pb-16 grid-bg overflow-hidden">
        {/* Radial glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] rounded-full bg-cyan-400/3 blur-[100px] pointer-events-none" />

        <HeroGrid />

        <div className="relative z-10 max-w-7xl mx-auto px-6 w-full flex-1 flex flex-col lg:flex-row items-center gap-16">
          {/* Left */}
          <div className="flex-1 max-w-2xl">
            <div className="hero-badge inline-flex items-center gap-2 glass border border-violet-500/20 text-violet-300 text-xs px-3 py-1.5 rounded-full mb-8 mono tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 pulse-dot" />
              SYSTEM ONLINE · CLAUDE HAIKU ACTIVE
            </div>

            <h1 ref={headlineRef} className="hero-headline text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight mb-6">
              Your AI that
              <br />
              <span className="gradient-text">builds your</span>
              <br />
              knowledge base
            </h1>

            <p className="hero-sub text-lg text-white/40 leading-relaxed mb-10 max-w-lg">
              Ingest any URL, article, or document. Claude structures it into a personal Wikipedia — with cross-links, backlinks, and citations. Query it like a database.
            </p>

            <div className="hero-cta flex items-center gap-4 flex-wrap">
              <Link href="/sign-up"
                className="btn-primary inline-flex items-center gap-2 text-sm font-semibold px-6 py-3.5 rounded-xl relative z-10">
                Initialize your brain
                <span className="text-white/60">→</span>
              </Link>
              <Link href="/sign-in"
                className="btn-ghost inline-flex items-center gap-2 text-sm px-6 py-3.5 rounded-xl">
                Sign in
              </Link>
            </div>

            <p className="hero-cta mono text-xs text-white/20 mt-4 tracking-wider">
              NO CREDIT CARD · 25 FREE INGESTS/MONTH
            </p>

            {/* Stats row */}
            <div className="mt-14 grid grid-cols-4 gap-4">
              {STATS.map((s, i) => (
                <div key={i} className="hero-stats">
                  <p className="text-2xl font-black gradient-text-static">{s.value}</p>
                  <p className="text-xs text-white/60 mt-1">{s.label}</p>
                  <p className="mono text-[10px] text-white/20">{s.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Isometric visual */}
          <div className="hero-visual flex-1 flex items-center justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-600/10 to-transparent rounded-3xl blur-xl" />
              <div className="glass border border-white/5 rounded-2xl p-8 relative">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
                  <span className="mono text-xs text-white/30 tracking-wider">KNOWLEDGE GRAPH · LIVE</span>
                </div>
                <IsometricBrain />
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[['12', 'PAGES'], ['5', 'SOURCES'], ['48', 'LINKS']].map(([v, l]) => (
                    <div key={l} className="glass border border-white/5 rounded-lg px-3 py-2 text-center">
                      <p className="text-lg font-black text-violet-400">{v}</p>
                      <p className="mono text-[10px] text-white/30 tracking-widest">{l}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ticker */}
      <Ticker />

      {/* How it works */}
      <section id="how-it-works" className="py-32 relative">
        <div className="absolute inset-0 dot-bg opacity-40" />
        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="text-center mb-16">
            <p className="mono text-xs text-violet-400 tracking-widest mb-3">HOW IT WORKS</p>
            <h2 className="text-4xl font-black">Three steps to a smarter you</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => (
              <div key={i} className="glass border border-white/5 rounded-2xl p-8 card-hover relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <p className="mono text-6xl font-black text-white/5 mb-4 select-none">{step.num}</p>
                <div className="w-8 h-px bg-violet-500 mb-4" />
                <h3 className="text-xl font-bold mb-3 text-white/90">{step.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features bento */}
      <section id="features" className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="mono text-xs text-cyan-400 tracking-widest mb-3">CAPABILITIES</p>
            <h2 className="text-4xl font-black">Everything your second brain needs</h2>
          </div>

          <div className="grid grid-cols-3 gap-4 auto-rows-[200px]">
            {FEATURES.map((f, i) => {
              const accentColors: Record<string, string> = {
                violet: 'from-violet-600/10 border-violet-500/20 text-violet-400',
                cyan: 'from-cyan-600/10 border-cyan-500/20 text-cyan-400',
                indigo: 'from-indigo-600/10 border-indigo-500/20 text-indigo-400',
              }
              const accent = accentColors[f.accent] || accentColors.violet

              return (
                <div
                  key={i}
                  className={`${f.col} row-span-${i === 0 || i === 4 ? '2' : '1'} glass bg-gradient-to-br ${accent.split(' ')[0]} to-transparent border ${accent.split(' ')[1]} rounded-2xl p-7 card-hover group relative overflow-hidden flex flex-col justify-between`}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-radial opacity-20 blur-2xl" />
                  <div>
                    <p className={`mono text-[10px] tracking-widest mb-4 ${accent.split(' ')[2]}`}>{f.tag}</p>
                    <h3 className="text-xl font-bold text-white/90 mb-3 leading-snug">{f.title}</h3>
                    <p className="text-white/40 text-sm leading-relaxed">{f.desc}</p>
                  </div>
                  <div className={`text-4xl opacity-10 group-hover:opacity-20 transition-opacity ${accent.split(' ')[2]}`}>
                    {f.icon}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Telemetry section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-violet-600/5 rounded-full blur-[80px]" />

        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="glass border border-white/5 rounded-2xl p-8 md:p-12">
            <div className="flex items-center gap-3 mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
              <span className="mono text-xs text-white/30 tracking-widest">SYSTEM TELEMETRY · LIVE</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: 'INGEST LATENCY', value: '1.8s', bar: 72, color: 'bg-violet-500' },
                { label: 'QUERY LATENCY', value: '0.9s', bar: 45, color: 'bg-cyan-500' },
                { label: 'ACCURACY', value: '99.2%', bar: 99, color: 'bg-emerald-500' },
                { label: 'UPTIME', value: '99.9%', bar: 99, color: 'bg-indigo-500' },
              ].map((m, i) => (
                <div key={i} className="space-y-3">
                  <p className="mono text-[10px] text-white/30 tracking-widest">{m.label}</p>
                  <p className="text-3xl font-black text-white/90">{m.value}</p>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${m.color} rounded-full transition-all duration-1000`}
                      style={{ width: `${m.bar}%` }}
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
            <p className="mono text-xs text-violet-400 tracking-widest mb-3">PRICING</p>
            <h2 className="text-4xl font-black">Simple, transparent pricing</h2>
            <p className="text-white/40 mt-4 text-sm">Start free. Scale as you grow.</p>
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
            ].map(plan => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 border card-hover relative overflow-hidden ${
                  plan.highlight
                    ? 'bg-gradient-to-br from-violet-900/30 to-indigo-900/20 border-violet-500/30'
                    : 'glass border-white/5'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute top-4 right-4 mono text-[10px] bg-violet-500/20 text-violet-300 px-2.5 py-1 rounded-full tracking-widest border border-violet-500/30">
                    POPULAR
                  </div>
                )}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent opacity-50" />

                <p className="mono text-xs text-white/40 tracking-widest mb-2">{plan.name.toUpperCase()}</p>
                <div className="flex items-end gap-1 mb-6">
                  <p className="text-5xl font-black">{plan.price}</p>
                  <p className="text-white/30 mb-1">{plan.period}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm text-white/60">
                      <span className={`w-1 h-1 rounded-full shrink-0 ${plan.highlight ? 'bg-violet-400' : 'bg-white/20'}`} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className={`block text-center text-sm font-semibold py-3.5 rounded-xl transition-all duration-300 ${
                    plan.highlight
                      ? 'btn-primary relative z-10'
                      : 'btn-ghost'
                  }`}
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
        <div className="absolute inset-0 bg-gradient-to-r from-violet-900/10 via-transparent to-cyan-900/10" />
        <div className="max-w-3xl mx-auto px-6 text-center relative">
          <p className="mono text-xs text-violet-400 tracking-widest mb-4">GET STARTED</p>
          <h2 className="text-5xl font-black mb-6 leading-tight">
            Initialize your<br />
            <span className="gradient-text">second brain</span>
          </h2>
          <p className="text-white/40 mb-10 text-lg">Free forever. No credit card. Start in 30 seconds.</p>
          <Link href="/sign-up"
            className="btn-primary inline-flex items-center gap-3 text-sm font-semibold px-8 py-4 rounded-xl relative z-10 text-base">
            Initialize system
            <span className="mono text-white/50">→</span>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-xs font-bold">S</div>
            <span className="mono text-xs text-white/20">SECONDBRAINCLOUD · 2026</span>
          </div>
          <p className="mono text-xs text-white/15">INSPIRED BY ANDREJ KARPATHY'S LLM WIKI</p>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
            <span className="mono text-xs text-white/20">ALL SYSTEMS OPERATIONAL</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
