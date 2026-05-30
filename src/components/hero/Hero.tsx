'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import {
  ArrowRight,
  Brain,
  Database,
  FileText,
  Network,
  Search,
  Sparkles,
} from 'lucide-react'
import { BrainCanvas } from './BrainCanvas'

const TELEMETRY = [
  { target: 24, label: 'Always on', suffix: '/7' },
  { target: 5, label: 'Memory layers', suffix: '' },
  { target: 100, label: 'Cited recall', suffix: '%' },
]

const STACK = [
  'Private memory vault',
  'Cited answers',
  '24/7 agents',
  'Knowledge graph',
]

const SOURCES = [
  { icon: FileText, type: 'URL', title: 'Research article saved' },
  { icon: Database, type: 'PDF', title: 'Market analysis uploaded' },
  { icon: Search, type: 'NOTE', title: 'Meeting transcript added' },
]

const WIKI_PAGES = [
  ['SOURCE', 'Research summary'],
  ['CONCEPT', 'Customer insight'],
  ['PATTERN', 'Growth signal'],
  ['ACTION', 'Next decision'],
]

export function Hero() {
  const rootRef = useRef<HTMLElement>(null)
  const counterRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap
        .timeline({ delay: 0.12 })
        .from('.hero-reveal', {
          opacity: 0,
          y: 22,
          duration: 0.74,
          stagger: 0.08,
          ease: 'power3.out',
        })
        .from(
          '.lab-card',
          {
            opacity: 0,
            y: 24,
            scale: 0.97,
            duration: 0.72,
            stagger: 0.09,
            ease: 'power3.out',
          },
          '-=0.46'
        )
        .from(
          '.signal-path',
          {
            scaleX: 0,
            transformOrigin: 'left center',
            duration: 0.9,
            ease: 'power3.out',
          },
          '-=0.5'
        )

      counterRefs.current.forEach((el, i) => {
        if (!el) return
        const obj = { value: 0 }
        const target = TELEMETRY[i].target
        gsap.to(obj, {
          value: target,
          duration: 2,
          delay: 0.6 + i * 0.12,
          ease: 'power2.out',
          onUpdate() {
            el.textContent = `${Math.floor(obj.value).toLocaleString()}${TELEMETRY[i].suffix}`
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
      className="hero-root relative isolate overflow-hidden border-b border-[var(--border)] px-4 pb-10 pt-[104px] md:px-6 md:pb-20 md:pt-32"
    >
      <div aria-hidden className="absolute inset-0 -z-20 grid-bg opacity-35" />
      <div aria-hidden className="hero-aurora hero-aurora-a" />
      <div aria-hidden className="hero-aurora hero-aurora-b" />
      <div aria-hidden className="hero-noise" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:gap-10">
        <div className="max-w-[660px]">
          <div className="hero-reveal inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border-bright)] bg-[color-mix(in_srgb,var(--surface)_82%,transparent)] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-secondary)] backdrop-blur-xl">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_16px_var(--accent)]" />
            Your AI operating system
          </div>

          <h1
            id="hero-heading"
            className="hero-title hero-reveal mt-5 max-w-[14ch] text-[clamp(3.1rem,7vw,6.4rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-[var(--text-primary)] max-[720px]:text-[clamp(2.6rem,12vw,3.7rem)] max-[480px]:text-[clamp(2.15rem,11vw,2.9rem)] md:mt-7"
          >
            Your second brain,
            <span className="block brushed-text">with a team that runs it.</span>
          </h1>

          <p className="hero-copy hero-reveal mt-5 max-w-xl text-[15px] leading-7 text-[var(--text-secondary)] md:text-lg md:leading-9">
            Everything you read, write, and decide becomes a private, searchable memory.
            Then a team of always-on AI agents works that memory for you, around the clock,
            with cited answers and zero hallucinated facts.
          </p>

          <div className="hero-reveal mt-5 flex flex-wrap gap-2">
            {STACK.map((item) => (
              <span
                key={item}
                className="rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_70%,transparent)] px-3 py-2 text-[9px] uppercase tracking-[0.13em] text-[var(--text-secondary)] backdrop-blur"
              >
                {item}
              </span>
            ))}
          </div>

          <div className="hero-reveal mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/sign-up"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--accent-bright),var(--accent))] px-5 text-sm font-semibold text-[var(--text-inverse)] shadow-[0_16px_42px_color-mix(in_srgb,var(--accent)_28%,transparent)] transition duration-300 hover:-translate-y-0.5"
            >
              Build my second brain
              <ArrowRight size={16} strokeWidth={2.3} />
            </Link>
            <Link
              href="/#see-it"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--border-bright)] bg-[color-mix(in_srgb,var(--surface)_64%,transparent)] px-5 text-sm font-semibold text-[var(--text-primary)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-[var(--border-glow)]"
            >
              See the agents work
              <Sparkles size={15} strokeWidth={2.2} />
            </Link>
          </div>

          <div className="hero-reveal mt-8 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-5 sm:max-w-lg">
            {TELEMETRY.map((item, i) => (
              <div
                key={item.label}
                className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_48%,transparent)] p-3"
              >
                <span
                  ref={(el) => {
                    counterRefs.current[i] = el
                  }}
                  className="block text-xl font-semibold text-[var(--text-primary)]"
                >
                  0
                </span>
                <span className="mt-1 block text-[9px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-lab relative min-h-[500px] lg:min-h-[650px]">
          <div className="lab-card lab-shell relative overflow-hidden rounded-[28px] border border-[var(--border-bright)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] p-3 shadow-[0_34px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            <div className="absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_78%_22%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_28%,rgba(255,255,255,0.03))]" />
            <div className="hero-console relative rounded-[22px] border border-[var(--border)] bg-[rgba(5,5,7,0.62)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
                  <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                    Memory engine
                  </span>
                </div>
                <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  24 hour recall
                </span>
              </div>

              <div className="preview-grid grid gap-3 p-3 md:grid-cols-[0.78fr_1.22fr] md:p-4">
                <div className="space-y-3">
                  <div className="source-panel rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_76%,transparent)] p-3">
                    <p className="mb-3 text-[9px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Ingest queue
                    </p>
                    <div className="space-y-2">
                      {SOURCES.map(({ icon: Icon, type, title }) => (
                        <div
                          key={title}
                          className="source-row flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.03)] p-2.5"
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent-bright)]">
                            <Icon size={15} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[8px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                              {type}
                            </span>
                            <span className="block truncate text-xs font-medium text-[var(--text-primary)]">
                              {title}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="wiki-panel rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Memory pages
                      </p>
                      <Brain size={14} className="text-[var(--accent-bright)]" />
                    </div>
                    <div className="space-y-2">
                      {WIKI_PAGES.map(([type, title]) => (
                        <div key={title} className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-[var(--text-secondary)]">
                            {title}
                          </span>
                          <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-1 text-[7px] uppercase tracking-[0.12em] text-[var(--accent-bright)]">
                            {type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="graph-panel dark-preview relative min-h-[360px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[radial-gradient(circle_at_50%_42%,rgba(255,124,37,0.14),transparent_36%),rgba(255,255,255,0.025)] p-4">
                  <div className="flex items-center justify-between">
                    <span className="preview-chip rounded-full border border-[var(--border)] bg-black/35 px-3 py-1.5 text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)] backdrop-blur">
                      Living memory
                    </span>
                    <span className="preview-chip preview-chip-accent rounded-full border border-[var(--border)] bg-black/35 px-3 py-1.5 text-[9px] uppercase tracking-[0.16em] text-[var(--accent-bright)] backdrop-blur">
                      Always on
                    </span>
                  </div>

                  <BrainMemoryVisual />

                  <div className="query-card dark-preview relative rounded-2xl border border-[var(--border-bright)] bg-black/45 p-4 backdrop-blur-xl">
                    <div className="mb-3 flex items-center gap-2">
                      <Network size={16} className="text-[var(--accent-bright)]" />
                      <p className="preview-muted text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        Cited answer
                      </p>
                    </div>
                    <p className="preview-title text-sm font-semibold leading-6 text-[var(--text-primary)]">
                      Answers stay connected to the sources, notes, and decisions
                      behind them.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['Cited sources', 'Linked context', 'Memory graph'].map((tag) => (
                        <span
                          key={tag}
                          className="preview-pill rounded-full border border-[var(--border)] px-2.5 py-1 text-[8px] uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lab-card float-card float-card-a">
            <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Searchable memory
            </span>
            <strong className="mt-2 block text-sm text-[var(--text-primary)]">
              Every source becomes reusable knowledge
            </strong>
          </div>

          <div className="lab-card float-card float-card-b">
            <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
              24 hour assistant
            </span>
            <strong className="mt-2 block text-sm text-[var(--text-primary)]">
              Your second brain keeps working
            </strong>
          </div>

          <div className="signal-path signal-path-a" aria-hidden />
          <div className="signal-path signal-path-b" aria-hidden />
        </div>
      </div>

      <style jsx>{`
        .hero-root {
          min-height: 100svh;
        }
        .hero-aurora {
          position: absolute;
          pointer-events: none;
          z-index: -10;
          filter: blur(14px);
          opacity: 0.92;
        }
        .hero-aurora-a {
          left: -12%;
          top: 18%;
          width: 62vw;
          height: 58vw;
          background: radial-gradient(circle, color-mix(in srgb, var(--accent) 18%, transparent), transparent 64%);
        }
        .hero-aurora-b {
          right: -18%;
          top: 6%;
          width: 58vw;
          height: 58vw;
          background: radial-gradient(circle, rgba(229, 229, 234, 0.12), transparent 62%);
        }
        .hero-noise {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: -5;
          background:
            linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.54) 100%),
            repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 7px);
          mask-image: linear-gradient(180deg, #000 0%, transparent 95%);
          -webkit-mask-image: linear-gradient(180deg, #000 0%, transparent 95%);
        }
        .lab-shell {
          animation: hero-float 8s ease-in-out infinite;
        }
        .source-row {
          animation: row-pulse 4.2s ease-in-out infinite;
        }
        .source-row:nth-child(2) {
          animation-delay: 0.45s;
        }
        .source-row:nth-child(3) {
          animation-delay: 0.9s;
        }
        .float-card {
          position: absolute;
          z-index: 4;
          max-width: 245px;
          border: 1px solid var(--border-bright);
          border-radius: 18px;
          background: color-mix(in srgb, var(--surface) 72%, transparent);
          box-shadow: var(--shadow-2);
          padding: 14px;
          backdrop-filter: blur(18px);
        }
        .float-card-a {
          left: -18px;
          bottom: 62px;
        }
        .float-card-b {
          right: -10px;
          top: 44px;
        }
        .signal-path {
          position: absolute;
          z-index: 3;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--accent), transparent);
          box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 60%, transparent);
          opacity: 0.72;
        }
        .signal-path-a {
          left: 18px;
          right: 25%;
          top: 118px;
        }
        .signal-path-b {
          left: 16%;
          right: 28px;
          bottom: 132px;
        }
        @keyframes hero-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes row-pulse {
          0%, 100% { border-color: var(--border); }
          50% { border-color: color-mix(in srgb, var(--accent) 48%, var(--border)); }
        }
        :global([data-theme='light']) .hero-root {
          background:
            radial-gradient(ellipse 72% 42% at 18% 18%, rgba(255, 122, 31, 0.12), transparent 58%),
            linear-gradient(180deg, #fffdf8 0%, #f8f2e8 54%, #fffaf3 100%);
        }
        :global([data-theme='light']) .hero-noise {
          opacity: 0.62;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, rgba(246, 237, 222, 0.28) 100%),
            repeating-linear-gradient(90deg, rgba(61, 43, 22, 0.035) 0 1px, transparent 1px 8px);
        }
        :global([data-theme='light']) .hero-aurora-a {
          opacity: 0.55;
        }
        :global([data-theme='light']) .hero-aurora-b {
          opacity: 0.18;
        }
        :global([data-theme='light']) .lab-shell {
          background: rgba(255, 255, 255, 0.84);
          border-color: rgba(54, 38, 22, 0.16);
          box-shadow:
            0 1px 0 rgba(255, 255, 255, 0.95) inset,
            0 28px 80px rgba(60, 42, 20, 0.16);
        }
        :global([data-theme='light']) .hero-console {
          background: linear-gradient(180deg, rgba(255, 252, 246, 0.92), rgba(246, 238, 225, 0.84));
          border-color: rgba(54, 38, 22, 0.10);
        }
        :global([data-theme='light']) .dark-preview {
          --text-primary: #f8f7f4;
          --text-secondary: rgba(248, 247, 244, 0.72);
          --text-muted: rgba(248, 247, 244, 0.46);
          --border: rgba(255,255,255,0.10);
          --border-bright: rgba(255,255,255,0.16);
          background:
            radial-gradient(circle at 50% 42%, rgba(255, 122, 31, 0.18), transparent 38%),
            linear-gradient(145deg, rgba(34, 33, 31, 0.98), rgba(15, 15, 15, 0.98));
          color: #f8f7f4;
          border-color: rgba(255, 255, 255, 0.14);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.10),
            0 18px 44px rgba(43, 31, 18, 0.24);
        }
        :global([data-theme='light']) .preview-chip {
          color: rgba(248, 247, 244, 0.74);
          background: rgba(0, 0, 0, 0.36);
          border-color: rgba(255, 255, 255, 0.14);
        }
        :global([data-theme='light']) .preview-chip-accent {
          color: #ff8a32;
        }
        :global([data-theme='light']) .preview-title {
          color: #f8f7f4;
        }
        :global([data-theme='light']) .preview-muted,
        :global([data-theme='light']) .preview-pill {
          color: rgba(248, 247, 244, 0.55);
          border-color: rgba(255, 255, 255, 0.12);
        }
        :global([data-theme='light']) .source-panel,
        :global([data-theme='light']) .wiki-panel {
          background: rgba(255, 255, 255, 0.78);
          border-color: rgba(54, 38, 22, 0.10);
          box-shadow: 0 10px 30px rgba(60, 42, 20, 0.06);
        }
        :global([data-theme='light']) .source-row {
          background: rgba(255, 255, 255, 0.72);
          border-color: rgba(54, 38, 22, 0.10);
        }
        @media (max-width: 1024px) {
          .hero-root {
            min-height: auto;
          }
          .hero-lab {
            min-height: 560px;
          }
          .float-card-a {
            left: 10px;
            bottom: 22px;
          }
          .float-card-b {
            right: 10px;
            top: 20px;
          }
        }
        @media (max-width: 720px) {
          .hero-root {
            padding-top: 100px;
            padding-bottom: 30px;
          }
          .hero-title {
            letter-spacing: -0.052em;
            max-width: 9ch;
          }
          .hero-lab {
            min-height: auto;
          }
          .lab-shell {
            border-radius: 22px;
            padding: 10px;
            animation: none;
          }
          .preview-grid {
            grid-template-columns: 1fr;
          }
          .graph-panel {
            min-height: 270px;
          }
          .float-card,
          .signal-path {
            display: none;
          }
        }
        @media (max-width: 480px) {
          .hero-root {
            padding-inline: 14px;
            padding-top: 96px;
          }
          .hero-title {
            max-width: 8.8ch;
            line-height: 0.94;
          }
          .hero-copy {
            margin-top: 16px;
            font-size: 13px;
            line-height: 1.58;
          }
          .lab-shell {
            margin-inline: -2px;
          }
          .hero-reveal.mt-8.grid {
            display: none;
          }
          .source-panel {
            padding: 10px;
          }
          .source-row:nth-child(3),
          .wiki-panel {
            display: none;
          }
          .graph-panel {
            min-height: 250px;
          }
          .query-card {
            padding: 12px;
            border-radius: 16px;
          }
          .query-card p {
            font-size: 12px;
            line-height: 1.55;
          }
        }
      `}</style>
    </section>
  )
}

function BrainMemoryVisual() {
  return (
    <div className="brain-memory dark-preview relative mx-auto my-4 aspect-square w-full max-w-[330px] overflow-hidden rounded-[28px] border border-[var(--border)] bg-[radial-gradient(circle_at_50%_48%,rgba(255,124,37,0.12),transparent_42%),rgba(0,0,0,0.28)]">
      <div className="absolute inset-0 opacity-85">
        <BrainCanvas className="h-full w-full" />
      </div>
      <div className="brain-glow" aria-hidden />
      <style jsx>{`
        .brain-memory {
          box-shadow:
            inset 0 0 55px rgba(0, 0, 0, 0.82),
            0 0 34px color-mix(in srgb, var(--accent) 12%, transparent);
        }
        .brain-glow {
          position: absolute;
          inset: 24%;
          border-radius: 999px;
          background: radial-gradient(circle, color-mix(in srgb, var(--accent) 18%, transparent), transparent 64%);
          filter: blur(18px);
          opacity: 0.9;
          animation: brain-glow-pulse 4.8s ease-in-out infinite;
        }
        @keyframes brain-glow-pulse {
          0%, 100% { opacity: 0.42; transform: scale(0.96); }
          50% { opacity: 0.78; transform: scale(1.06); }
        }
        @media (max-width: 480px) {
          .brain-memory {
            max-width: 238px;
            border-radius: 22px;
          }
        }
      `}</style>
    </div>
  )
}
