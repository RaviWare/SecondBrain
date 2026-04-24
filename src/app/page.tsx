'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { Ticker } from '@/components/ticker'
import { SiteFooter } from '@/components/footer/SiteFooter'
import { Testimonials } from '@/components/testimonials/Testimonials'
import { PrecisionGrid } from '@/components/features/PrecisionGrid'
import { Hero } from '@/components/hero/Hero'
import { BrainMark } from '@/components/ui/BrainMark'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

const STEPS = [
  { num: '01', title: 'Capture', desc: 'Paste a URL, upload a document, or add raw notes. SecondBrain preserves the source and prepares it for long-term memory.' },
  { num: '02', title: 'Organize', desc: 'SecondBrain creates summaries, topics, entities, decisions, and evidence trails inside your private knowledge base.' },
  { num: '03', title: 'Recall', desc: 'Ask questions against your SecondBrain. Answers cite the exact memory pages and sources behind the response.' },
]

const PRINCIPLES = [
  {
    label: 'SecondBrain Core',
    title: 'An AI knowledge base that maintains itself',
    desc: 'Every source updates a persistent memory vault so understanding compounds instead of disappearing into chat history.',
  },
  {
    label: 'Always-On Memory',
    title: 'Your second brain runs 24 hours',
    desc: 'Current understanding stays clean while the evidence trail records where every answer and insight came from.',
  },
  {
    label: 'Linked Thinking',
    title: 'Context connects automatically',
    desc: 'Related people, ideas, sources, decisions, and themes become connected pages you can browse or search.',
  },
  {
    label: 'Living Graph',
    title: 'A visual map of your knowledge',
    desc: 'Topics, sources, people, and patterns become visible nodes you can browse, filter, and query.',
  },
]

const CAPABILITIES = [
  ['URL, text, PDF, DOCX, markdown, and transcript ingestion', 'Source intake'],
  ['Summaries, topics, entities, decisions, and synthesis pages', 'Memory schema'],
  ['Evidence trails and update history on every important page', 'Memory model'],
  ['Private vault with pages, sources, activity logs, and dashboard stats', 'Storage'],
  ['Expanded semantic search across connected knowledge', 'Retrieval'],
  ['Cited answers that link back into your knowledge base', 'Answer engine'],
]

const FLOW = [
  {
    code: 'SOURCE',
    title: 'Capture the signal',
    desc: 'Articles, files, notes, and raw text enter one clean ingest lane.',
  },
  {
    code: 'VAULT',
    title: 'Write the SecondBrain',
    desc: 'The AI turns sources into durable pages with summaries, tags, links, and evidence trails.',
  },
  {
    code: 'GRAPH',
    title: 'Connect the meaning',
    desc: 'Entities, concepts, sources, and patterns become navigable relationships.',
  },
  {
    code: 'ANSWER',
    title: 'Recall with citations',
    desc: 'Queries return grounded answers that point back into the wiki.',
  },
]

const VAULT_LAYERS = [
  ['raw sources', 'Immutable evidence inbox'],
  ['source summaries', 'One page per ingested item'],
  ['concepts and entities', 'People, products, ideas, methods'],
  ['patterns and synthesis', 'Cross-source understanding'],
  ['operation log', 'Every ingest and query recorded'],
]

const FAQS = [
  {
    q: 'What is SecondBrain Cloud?',
    a: 'SecondBrain Cloud is an AI second brain and personal knowledge base that captures your sources, organizes them into connected memory pages, and answers questions with citations back to your vault.',
  },
  {
    q: 'How is SecondBrain different from a chatbot with RAG?',
    a: 'SecondBrain does not rely only on retrieval at answer time. It maintains durable structure between your sources and your questions by creating summaries, topics, entities, synthesis pages, and evidence trails inside the knowledge base.',
  },
  {
    q: 'What can I ingest into SecondBrain?',
    a: 'The current product supports URLs, plain text, markdown, PDFs, DOCX files, and TXT files. The goal is to preserve the source and turn it into searchable, connected knowledge.',
  },
  {
    q: 'Who is SecondBrain for?',
    a: 'SecondBrain is built for researchers, founders, operators, creators, students, and teams who need a searchable, cited, and maintained memory system instead of scattered notes and one-off AI chats.',
  },
  {
    q: 'Does SecondBrain support wiki links and graph navigation?',
    a: 'Yes. The product is designed around connected memory pages, backlinks, node relationships, and a graph dashboard so users can browse meaning, not just files.',
  },
]

const USE_CASES = [
  {
    title: 'Researchers and analysts',
    desc: 'Turn papers, reports, transcripts, and notes into a cited research knowledge base with connected concepts and source-level recall.',
  },
  {
    title: 'Founders and operators',
    desc: 'Keep strategy docs, customer calls, product notes, and market research inside one AI second brain your team can actually query.',
  },
  {
    title: 'Creators and students',
    desc: 'Capture articles, ideas, highlights, course material, and references into a personal knowledge base that compounds over time.',
  },
  {
    title: 'Product and engineering teams',
    desc: 'Build a living wiki for specs, decisions, retros, docs, and architecture notes with graph navigation and timeline-backed changes.',
  },
]

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'SecondBrain Cloud',
      url: SITE_URL,
      description:
        'SecondBrain Cloud is an AI second brain and personal knowledge base that builds and maintains a linked wiki from your sources.',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'SecondBrain Cloud',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: SITE_URL,
      description:
        'AI second brain software for ingesting sources, building a personal knowledge base, browsing a graph, and querying a linked wiki with citations.',
      offers: [
        { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Free' },
        { '@type': 'Offer', price: '18', priceCurrency: 'USD', name: 'Pro' },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    },
  ]

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] overflow-x-hidden">
      <Script
        id="structured-data"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Nav — Apple Silicon treatment */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          scrolled ? 'glass-bright border-b border-[var(--border)]' : ''
        }`}
      >
        <div className="max-w-7xl mx-auto px-3.5 md:px-6 py-2.5 md:py-4 flex items-center justify-between gap-2.5 md:gap-3">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 md:gap-3 group min-w-0">
            <span
              className="relative grid h-8 w-8 md:h-9 md:w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border-bright)] transition-all duration-300 group-hover:border-[var(--border-glow)]"
              style={{ background: 'var(--metallic)' }}
            >
              <span
                aria-hidden
                className="absolute inset-0 pointer-events-none rounded-full"
                style={{ background: 'var(--metallic-hi)' }}
              />
              <BrainMark
                size={22}
                className="relative z-[1] text-[#e5e5ea] transition-transform duration-500 group-hover:scale-[1.08]"
              />
            </span>
            <span className="text-[13px] md:text-sm font-semibold tracking-tight text-[var(--text-primary)] truncate">
              SecondBrain<span className="hidden sm:inline text-[var(--text-muted)] font-normal ml-1">Cloud</span>
            </span>
          </Link>

          {/* Links */}
          <div className="hidden md:flex items-center gap-6 lg:gap-8">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="type-mono-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="hidden sm:inline text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors px-2.5 py-2"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-[10px] border border-[var(--border-bright)] px-2.5 sm:px-3 md:px-4 py-2 text-[10.5px] md:text-xs font-semibold tracking-[-0.005em] transition-all duration-300 hover:border-[var(--border-glow)] hover:-translate-y-[1px]"
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
              <span className="relative z-[1] brushed-text">
                <span className="sm:hidden">Start free</span>
                <span className="hidden sm:inline">Get started free</span>
              </span>
            </Link>
          </div>
        </div>
        <div className="md:hidden max-w-7xl mx-auto px-3.5 pb-2.5 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="mono text-[9px] tracking-widest px-2.5 py-1.5 rounded-full border whitespace-nowrap"
                style={{
                  color: 'var(--text-secondary)',
                  borderColor: 'var(--border)',
                  background: 'color-mix(in srgb, var(--surface) 76%, transparent)',
                }}
              >
                {l.label.toUpperCase()}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Hero — SecondBrain two-column with autonomous brain canvas */}
      <Hero />

      {/* Ticker */}
      <Ticker />

      {/* Product thesis */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 dot-bg opacity-30" />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)' }}
        />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-8 md:gap-10 lg:gap-14 items-start">
            <div className="lg:sticky lg:top-28">
              <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-4">
                PRODUCT THESIS
              </p>
              <h2 className="text-3xl md:text-6xl font-semibold tracking-tight leading-[1.02] text-[var(--text-primary)]">
                Your SecondBrain
                <span className="block brushed-text">learns in layers.</span>
              </h2>
              <p className="mt-5 text-sm md:text-base text-[var(--text-secondary)] leading-7 md:leading-8 max-w-xl">
                SecondBrain Cloud is AI second brain software for people who need a private,
                searchable knowledge base instead of scattered notes and disposable chat output.
                It turns sources into connected memory, evidence trails, and grounded answers
                that cite their path through your vault.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {['Ingest', 'Compile', 'Link', 'Query', 'Maintain'].map((item) => (
                  <span
                    key={item}
                    className="mono text-[10px] tracking-widest px-3 py-2 rounded-full border"
                    style={{
                      color: 'var(--text-secondary)',
                      background: 'color-mix(in srgb, var(--surface) 78%, transparent)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    {item.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              {PRINCIPLES.map((p, i) => (
                <div
                  key={p.label}
                  className="relative rounded-2xl p-5 md:p-6 border overflow-hidden fade-up"
                  style={{
                    background: 'var(--metallic)',
                    borderColor: 'var(--border-bright)',
                    boxShadow: 'var(--shadow-1)',
                    animationDelay: `${i * 80}ms`,
                  }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2xl"
                    style={{ background: 'var(--metallic-hi)' }}
                  />
                  <div className="relative z-[1]">
                    <p
                      className="mono text-[10px] tracking-widest mb-5"
                      style={{ color: i % 2 === 0 ? 'var(--accent-bright)' : '#c8c8cf' }}
                    >
                      {p.label.toUpperCase()}
                    </p>
                    <h3 className="text-base md:text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                      {p.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 md:leading-7 text-[var(--text-secondary)]">
                      {p.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SecondBrain loop */}
      <section className="relative py-16 md:py-28 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-35" />
        <div
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 28%, transparent), transparent)' }}
        />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 md:gap-6 mb-10 md:mb-14">
            <div>
              <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">
                SECONDBRAIN LOOP
              </p>
              <h2 className="text-3xl md:text-6xl font-semibold tracking-tight leading-tight">
                From source
                <span className="block brushed-text">to structured recall.</span>
              </h2>
            </div>
            <p className="max-w-md text-sm md:text-base leading-7 md:leading-8 text-[var(--text-secondary)]">
              SecondBrain follows one durable loop: ingest sources, build a maintained knowledge base,
              connect pages into a living memory graph, and return cited answers when you query
              your own knowledge base.
            </p>
          </div>

          <div className="relative">
            <div className="flow-rail" aria-hidden>
              <span />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
              {FLOW.map((item, i) => (
                <div
                  key={item.code}
                  className="flow-card relative rounded-2xl p-4 md:p-5 border overflow-hidden"
                  style={{
                    background: 'var(--metallic)',
                    borderColor: 'var(--border-bright)',
                    boxShadow: 'var(--shadow-1)',
                    animationDelay: `${i * 160}ms`,
                  }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2xl"
                    style={{ background: 'var(--metallic-hi)' }}
                  />
                  <div className="relative z-[1]">
                    <div className="flex items-center justify-between mb-8 md:mb-10">
                      <span className="mono text-[9px] tracking-widest text-[var(--text-muted)]">
                        {item.code}
                      </span>
                      <span
                        className="flow-node"
                        style={{ animationDelay: `${i * 0.35}s` }}
                      />
                    </div>
                    <h3 className="text-base md:text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 md:leading-7 text-[var(--text-secondary)]">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <style jsx>{`
          .flow-rail {
            position: absolute;
            left: 10%;
            right: 10%;
            top: 28px;
            height: 1px;
            background: var(--border);
            overflow: hidden;
            z-index: 0;
          }
          .flow-rail span {
            position: absolute;
            inset-block: 0;
            width: 28%;
            background: linear-gradient(90deg, transparent, var(--accent), transparent);
            box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 55%, transparent);
            animation: flow-scan 5.8s var(--ease-out-expo) infinite;
          }
          .flow-card {
            animation: flow-rise 0.8s var(--ease-out-expo) both;
          }
          .flow-card:hover {
            border-color: var(--border-glow) !important;
            transform: translateY(-2px);
            transition: transform 0.3s var(--ease-out-expo), border-color 0.3s var(--ease-out-expo);
          }
          .flow-node {
            width: 10px;
            height: 10px;
            border-radius: 999px;
            background: var(--accent);
            box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 10%, transparent), 0 0 18px var(--accent);
            animation: flow-pulse 2.8s ease-in-out infinite;
          }
          @keyframes flow-scan {
            0% { transform: translateX(-120%); opacity: 0; }
            12% { opacity: 1; }
            82% { opacity: 1; }
            100% { transform: translateX(420%); opacity: 0; }
          }
          @keyframes flow-pulse {
            0%, 100% { transform: scale(1); opacity: 0.85; }
            50% { transform: scale(0.72); opacity: 0.45; }
          }
          @keyframes flow-rise {
            from { opacity: 0; transform: translateY(18px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @media (max-width: 768px) {
            .flow-rail {
              left: 30px;
              right: auto;
              top: 0;
              bottom: 0;
              width: 1px;
              height: auto;
            }
            .flow-rail span {
              width: 1px;
              height: 140px;
              background: linear-gradient(180deg, transparent, var(--accent), transparent);
              animation: flow-scan-mobile 5.8s var(--ease-out-expo) infinite;
            }
            @keyframes flow-scan-mobile {
              0% { transform: translateY(-120%); opacity: 0; }
              12% { opacity: 1; }
              82% { opacity: 1; }
              100% { transform: translateY(420%); opacity: 0; }
            }
          }
        `}</style>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-16 md:py-32 relative">
        <div className="absolute inset-0 dot-bg opacity-40" />
        <div className="max-w-7xl mx-auto px-4 md:px-6 relative">
          <div className="text-center mb-10 md:mb-16">
            <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">HOW IT WORKS</p>
            <h2 className="type-h2">Three steps to an always-on memory</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {STEPS.map((step, i) => (
              <div
                key={i}
                className="relative rounded-2xl p-6 md:p-8 border border-[var(--border)] overflow-hidden group transition-all duration-300 hover:-translate-y-[2px] hover:border-[var(--border-bright)]"
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
                <p className="relative z-[1] mono text-5xl md:text-6xl font-black text-[var(--text-muted)] opacity-20 mb-4 select-none">{step.num}</p>
                <div className="relative z-[1] w-8 h-px mb-4" style={{ background: 'var(--accent)' }} />
                <h3 className="relative z-[1] text-lg md:text-xl font-semibold mb-3 text-[var(--text-primary)]">{step.title}</h3>
                <p className="relative z-[1] text-[var(--text-secondary)] text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — aura 60B860 inspired instrument grid */}
      <PrecisionGrid />

      {/* Vault anatomy */}
      <section className="relative py-16 md:py-28 overflow-hidden">
        <div className="absolute inset-0 dot-bg opacity-25" />
        <div className="relative mx-auto max-w-7xl px-4 md:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-8 md:gap-10 lg:gap-16 items-center">
            <div>
              <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">
                VAULT ANATOMY
              </p>
              <h2 className="text-3xl md:text-6xl font-semibold tracking-tight leading-tight">
                A SecondBrain is
                <span className="block brushed-text">more than storage.</span>
              </h2>
              <p className="mt-6 text-sm md:text-base leading-8 text-[var(--text-secondary)] max-w-xl">
                Storage keeps files. SecondBrain keeps structure: what happened, what changed,
                what connects, and what the system currently understands.
              </p>
            </div>

            <div
              className="relative rounded-2xl border overflow-hidden p-2.5 md:p-3"
              style={{
                background: 'var(--metallic)',
                borderColor: 'var(--border-bright)',
                boxShadow: 'var(--shadow-2)',
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-2xl"
                style={{ background: 'var(--metallic-hi)' }}
              />
              <div className="relative z-[1] rounded-xl overflow-hidden border border-[var(--border)]">
                <div
                  className="flex items-center justify-between px-3 md:px-4 py-3 border-b border-[var(--border)]"
                  style={{ background: 'color-mix(in srgb, var(--surface-2) 72%, transparent)' }}
                >
                  <span className="mono text-[10px] tracking-widest text-[var(--text-muted)]">
                    SECONDBRAIN / VAULT
                  </span>
                  <span className="mono text-[9px] tracking-widest" style={{ color: 'var(--accent-bright)' }}>
                    LIVE
                  </span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {VAULT_LAYERS.map(([name, desc], i) => (
                    <div
                      key={name}
                      className="vault-row grid grid-cols-[auto_1fr] gap-3 md:gap-4 px-3 md:px-4 py-3.5 md:py-4"
                      style={{ animationDelay: `${i * 120}ms` }}
                    >
                      <span
                        className="mt-1 h-2 w-2 rounded-full"
                        style={{
                          background: i === 0 ? '#c8c8cf' : 'var(--accent)',
                          boxShadow: i === 0 ? 'none' : '0 0 10px var(--accent)',
                        }}
                      />
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {name}
                        </p>
                        <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">
                          {desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
          .vault-row {
            animation: vault-row-in 0.7s var(--ease-out-expo) both;
            background: color-mix(in srgb, var(--surface) 42%, transparent);
          }
          .vault-row:nth-child(even) {
            background: color-mix(in srgb, var(--surface-2) 46%, transparent);
          }
          .vault-row:hover {
            background: color-mix(in srgb, var(--accent) 7%, var(--surface));
          }
          @keyframes vault-row-in {
            from { opacity: 0; transform: translateX(16px); }
            to { opacity: 1; transform: translateX(0); }
          }
        `}</style>
      </section>

      {/* System model */}
      <section className="py-16 md:py-24 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />

        <div className="max-w-7xl mx-auto px-4 md:px-6 relative">
          <div
            className="relative rounded-2xl p-5 md:p-8 border border-[var(--border)] overflow-hidden"
            style={{ background: 'var(--metallic)', boxShadow: 'var(--shadow-2)' }}
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: 'var(--metallic-hi)' }} />
            <div className="relative z-[1] grid grid-cols-1 lg:grid-cols-[0.72fr_1.28fr] gap-8">
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <span
                    className="w-2 h-2 rounded-full pulse-dot"
                    style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }}
                  />
                  <span className="type-mono-xs text-[var(--text-muted)] tracking-widest">SECONDBRAIN ENGINE · LIVE</span>
                </div>
                <h2 className="text-2xl md:text-5xl font-semibold tracking-tight leading-tight">
                  A real product loop,
                  <span className="block brushed-text">not a mockup.</span>
                </h2>
                <p className="mt-5 text-sm md:text-base leading-8 text-[var(--text-secondary)]">
                  SecondBrain connects source capture, private memory pages, cited AI search,
                  activity logs, and a graph dashboard into one SaaS workspace for knowledge work.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CAPABILITIES.map(([title, label], i) => (
                  <div
                    key={title}
                    className="rounded-xl p-4 border"
                    style={{
                      background: 'color-mix(in srgb, var(--surface-2) 72%, transparent)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="mono text-[9px] tracking-widest text-[var(--text-muted)]">
                        {label.toUpperCase()}
                      </span>
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: i % 2 === 0 ? 'var(--accent)' : '#c8c8cf',
                          boxShadow: i % 2 === 0 ? '0 0 8px var(--accent)' : 'none',
                        }}
                      />
                    </div>
                    <p className="text-sm leading-6 text-[var(--text-primary)]">
                      {title}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 dot-bg opacity-25" />
        <div className="relative max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 md:gap-8 mb-10 md:mb-12">
            <div>
              <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">
                BUILT FOR REAL WORK
              </p>
              <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight">
                One SecondBrain,
                <span className="block brushed-text">many knowledge workflows.</span>
              </h2>
            </div>
            <p className="max-w-2xl text-sm md:text-base leading-7 md:leading-8 text-[var(--text-secondary)]">
              The same system can act as a personal knowledge base, research wiki, internal team memory,
              meeting intelligence layer, and AI search surface for everything you already know.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
            {USE_CASES.map((item, i) => (
              <div
                key={item.title}
                className="relative rounded-2xl border overflow-hidden p-5 md:p-6"
                style={{
                  background: 'var(--metallic)',
                  borderColor: 'var(--border-bright)',
                  boxShadow: 'var(--shadow-1)',
                  animationDelay: `${i * 100}ms`,
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl"
                  style={{ background: 'var(--metallic-hi)' }}
                />
                <div className="relative z-[1]">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <span className="mono text-[9px] tracking-widest text-[var(--text-muted)]">
                      USE CASE {String(i + 1).padStart(2, '0')}
                    </span>
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        background: i % 2 === 0 ? 'var(--accent)' : '#c8c8cf',
                        boxShadow: i % 2 === 0 ? '0 0 8px var(--accent)' : 'none',
                      }}
                    />
                  </div>
                  <h3 className="text-base md:text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 md:leading-7 text-[var(--text-secondary)]">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 md:py-32">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="text-center mb-10 md:mb-16">
            <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">PRICING</p>
            <h2 className="type-h2">Simple, transparent pricing</h2>
            <p className="text-[var(--text-secondary)] mt-4 text-sm md:text-base max-w-2xl mx-auto">
              Start with a free AI second brain, then upgrade when you need more vaults,
              more ingestion, stronger models, and faster knowledge workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {[
              {
                name: 'Free', price: '$0', period: 'forever',
                features: ['25 ingests / month', '50 queries / month', '1 vault', 'URL + text ingestion', 'Full memory reader', 'AI cited answers'],
                cta: 'Get started free', href: '/sign-up', highlight: false,
              },
              {
                name: 'Pro', price: '$18', period: '/month',
                features: ['Unlimited ingests', 'Unlimited queries', '3 vaults', 'Advanced AI reasoning', 'Priority support', 'Vault markdown export', 'API access'],
                cta: 'Start Pro', href: '/sign-up', highlight: true,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className="relative rounded-2xl p-6 md:p-8 border overflow-hidden transition-all duration-300 hover:-translate-y-[2px]"
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
                <div className="relative z-[1] flex items-end gap-1 mb-5 md:mb-6">
                  <p className="text-4xl md:text-5xl font-semibold tracking-tight">{plan.price}</p>
                  <p className="text-[var(--text-muted)] mb-1">{plan.period}</p>
                </div>

                <ul className="relative z-[1] space-y-3 mb-6 md:mb-8">
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
      <section className="py-16 md:py-24 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 50%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%)',
          }}
        />
        <div className="max-w-3xl mx-auto px-4 md:px-6 text-center relative">
          <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-4">GET STARTED</p>
          <h2 className="text-4xl md:text-5xl font-semibold mb-5 md:mb-6 leading-tight tracking-tight">
            Initialize your<br />
            <span className="brushed-text">second brain</span>
          </h2>
          <p className="text-[var(--text-secondary)] mb-8 md:mb-10 text-base md:text-lg leading-7">
            Ingest your first source, build your first linked page, and start querying a personal knowledge base that keeps getting sharper.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex w-full sm:w-auto justify-center items-center gap-3 text-sm md:text-base font-semibold px-6 md:px-8 py-3.5 md:py-4 rounded-xl transition-all duration-300 hover:-translate-y-[1px]"
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

      {/* FAQ */}
      <section id="faq" className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[0.86fr_1.14fr] gap-8 md:gap-10 lg:gap-14 items-start">
            <div className="lg:sticky lg:top-28">
              <p className="type-mono-xs text-[var(--text-muted)] tracking-widest mb-3">FAQ</p>
              <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight">
                Questions people ask
                <span className="block brushed-text">before they trust a second brain.</span>
              </h2>
              <p className="mt-5 text-sm md:text-base leading-7 md:leading-8 text-[var(--text-secondary)] max-w-xl">
                These answers are written for humans first, but they also make the product intent
                legible to search engines and AI systems that are trying to understand what
                SecondBrain actually does.
              </p>
            </div>

            <div className="space-y-3 md:space-y-4">
              {FAQS.map((item, i) => (
                <article
                  key={item.q}
                  className="relative rounded-2xl border overflow-hidden"
                  style={{
                    background: 'var(--metallic)',
                    borderColor: 'var(--border-bright)',
                    boxShadow: 'var(--shadow-1)',
                    animationDelay: `${i * 90}ms`,
                  }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2xl"
                    style={{ background: 'var(--metallic-hi)' }}
                  />
                  <div className="relative z-[1] p-5 md:p-6">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="mono text-[9px] tracking-widest text-[var(--text-muted)]">
                        FAQ {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: i % 2 === 0 ? 'var(--accent)' : '#c8c8cf',
                          boxShadow: i % 2 === 0 ? '0 0 8px var(--accent)' : 'none',
                        }}
                      />
                    </div>
                    <h3 className="text-base md:text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                      {item.q}
                    </h3>
                    <p className="mt-3 text-sm leading-6 md:leading-7 text-[var(--text-secondary)]">
                      {item.a}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <Testimonials />

      {/* Footer — DD146-inspired scroll reveal wordmark */}
      <SiteFooter />
    </div>
  )
}
