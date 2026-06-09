'use client'

import { useEffect, useRef, useState } from 'react'
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
  CheckCircle2,
  Zap,
  ShieldCheck,
} from 'lucide-react'
import { BrainCanvas } from './BrainCanvas'

const TELEMETRY = [
  { target: 24, label: 'Always running', suffix: '/7' },
  { target: 100, label: 'Vault-grounded', suffix: '%' },
  { target: 0, label: 'Hallucinations', suffix: '' },
]

const SOURCES = [
  { icon: FileText, type: 'URL', title: 'Competitor intel ingested' },
  { icon: Database, type: 'PDF', title: 'Q2 strategy uploaded' },
  { icon: Search, type: 'NOTE', title: 'Board meeting transcribed' },
]

const WIKI_PAGES = [
  ['SOURCE', 'Q2 strategy brief'],
  ['CONCEPT', 'ICP insight — Series A'],
  ['SIGNAL', 'Churn pattern detected'],
  ['AGENT', 'Follow-up drafted'],
]

const TRUST_ITEMS = [
  { icon: ShieldCheck, label: 'Private vault — never shared' },
  { icon: Zap, label: 'Agents run 24/7' },
  { icon: CheckCircle2, label: 'Every answer cited' },
]

const VAULT_FEATURES = [
  { icon: ShieldCheck, label: 'Vault-grounded', desc: "Agents that know your business — not the internet's" },
  { icon: Database, label: 'Secure Storage', desc: "Your data is encrypted and isolated per workspace" },
  { icon: Search, label: 'Instant Recall', desc: "Find any past decision or document in seconds" }
]

const SQUAD_FEATURES = [
  { icon: Zap, label: 'Squad · always on', desc: "One ask. Your squad runs it. Results cited." },
  { icon: Network, label: 'Multi-Agent', desc: "Agents collaborate to solve complex, multi-step tasks" },
  { icon: Sparkles, label: 'Self-improving', desc: "Your squad learns your workflow preferences over time" }
]

const AGENT_RESPONSES = [
  { label: 'Agent · cited answer', text: "\"Based on your Q2 strategy doc and 3 board notes — here's what the data says.\"", tags: ['Your vault', '3 sources', 'No guessing'] },
  { label: 'Agent · market analysis', text: "\"Competitor Acme raised prices by 15%. I've drafted a counter-strategy memo.\"", tags: ['Market Intel', '1 source', 'Drafted'] },
  { label: 'Agent · synthesis', text: "\"I've summarized the 4-hour technical sync into 5 action items for the engineering team.\"", tags: ['Meeting Notes', '1 source', 'Actionable'] }
]

export function Hero() {
  const rootRef = useRef<HTMLElement>(null)
  const counterRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [featureIdx, setFeatureIdx] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setFeatureIdx(prev => (prev + 1) % 3)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap
        .timeline({ delay: 0.08 })
        .from('.hero-badge', {
          opacity: 0,
          y: 12,
          duration: 0.55,
          ease: 'power3.out',
        })
        .from(
          '.hero-headline',
          {
            opacity: 0,
            y: 28,
            duration: 0.72,
            ease: 'power3.out',
          },
          '-=0.32'
        )
        .from(
          '.hero-sub',
          {
            opacity: 0,
            y: 18,
            duration: 0.6,
            ease: 'power3.out',
          },
          '-=0.46'
        )
        .from(
          '.hero-cta-row',
          {
            opacity: 0,
            y: 14,
            duration: 0.55,
            ease: 'power3.out',
          },
          '-=0.38'
        )
        .from(
          '.hero-trust',
          {
            opacity: 0,
            y: 10,
            duration: 0.45,
            ease: 'power3.out',
          },
          '-=0.32'
        )
        .from(
          '.hero-panel',
          {
            opacity: 0,
            y: 32,
            scale: 0.975,
            duration: 0.82,
            ease: 'power3.out',
          },
          '-=0.72'
        )
        .from(
          '.hero-metric',
          {
            opacity: 0,
            y: 14,
            duration: 0.5,
            stagger: 0.1,
            ease: 'power3.out',
          },
          '-=0.46'
        )

      counterRefs.current.forEach((el, i) => {
        if (!el) return
        const obj = { value: 0 }
        const target = TELEMETRY[i].target
        gsap.to(obj, {
          value: target,
          duration: 2.2,
          delay: 0.7 + i * 0.15,
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
      className="hero-root relative isolate overflow-hidden border-b border-[var(--border)]"
    >
      {/* Ambient layers */}
      <div aria-hidden className="absolute inset-0 -z-20 grid-bg opacity-30" />
      <div aria-hidden className="hero-glow-a" />
      <div aria-hidden className="hero-glow-b" />
      <div aria-hidden className="hero-scanline" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-6 px-4 pb-10 pt-[108px] md:gap-10 md:px-6 md:pb-16 md:pt-[120px] lg:grid-cols-[1fr_1.08fr] lg:gap-12 lg:pb-20">

        {/* ── Left column ── */}
        <div className="max-w-[600px]">

          {/* Badge */}
          <div className="hero-badge inline-flex items-center gap-2.5 rounded-full border border-[var(--border-bright)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-3 md:px-3.5 py-1.5 md:py-2 backdrop-blur-xl max-w-full">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
            <span className="text-[9px] md:text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)] text-left md:text-center truncate md:whitespace-normal">
              Private AI OS · Agents that know your business
            </span>
          </div>

          {/* Headline */}
          <h1
            id="hero-heading"
            className="hero-headline mt-5 text-[3.2rem] md:text-[clamp(3.2rem,6.5vw,5.6rem)] font-semibold leading-[1.1] md:leading-[0.93] tracking-tight md:tracking-[-0.048em] text-[var(--text-primary)]"
          >
            Your brain.<br />
            <span className="brushed-text">Your squad.<br />Always on.</span>
          </h1>

          {/* Body */}
          <p className="hero-sub mt-4 max-w-[44ch] text-[14px] leading-[1.6] text-[var(--text-secondary)] md:text-[16px] md:mt-5">
            SecondBrain is a private knowledge vault and a team of always-on AI agents — built on your data, not the internet's. Your agents know your business because they live inside it. Cited answers, zero guesses, 24/7.
          </p>

          {/* CTAs */}
          <div className="hero-cta-row mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Link
              href="/sign-up"
              id="hero-cta-primary"
              className="inline-flex justify-center h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold transition-all duration-300 hover:-translate-y-0.5 w-full sm:w-auto"
              style={{
                color: 'var(--text-inverse)',
                background: 'linear-gradient(135deg, var(--accent-bright), var(--accent))',
                boxShadow: '0 12px 36px color-mix(in srgb, var(--accent) 32%, transparent)',
              }}
            >
              Start Building
              <ArrowRight size={16} strokeWidth={2.4} />
            </Link>
            <Link
              href="/#see-it"
              id="hero-cta-secondary"
              className="inline-flex justify-center h-12 items-center gap-2 rounded-xl border border-[var(--border-bright)] bg-[color-mix(in_srgb,var(--surface)_60%,transparent)] px-5 text-[15px] font-semibold text-[var(--text-primary)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--border-glow)] w-full sm:w-auto"
            >
              Watch it work
              <Sparkles size={15} strokeWidth={2.2} />
            </Link>
          </div>

          {/* Trust row */}
          <div className="hero-trust mt-6 grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-x-5 gap-y-3">
            {TRUST_ITEMS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon size={14} className="shrink-0 text-[var(--accent)]" />
                <span className="text-[12px] md:text-[11px] text-[var(--text-muted)] tracking-wide">{label}</span>
              </div>
            ))}
          </div>

          {/* Telemetry strip */}
          <div className="hero-trust mt-8 hidden sm:grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-6 max-w-sm">
            {TELEMETRY.map((item, i) => (
              <div key={item.label} className="hero-metric">
                <span
                  ref={(el) => { counterRefs.current[i] = el }}
                  className="block text-2xl font-semibold tracking-tight text-[var(--text-primary)]"
                >
                  0
                </span>
                <span className="mt-1 block text-[9px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right column — Product visual ── */}
        <div className="hero-lab relative min-h-[480px] lg:min-h-[600px]">

          {/* Main panel */}
          <div className="hero-panel lab-shell relative overflow-hidden rounded-[26px] border border-[var(--border-bright)] shadow-[0_40px_130px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
            <div className="absolute inset-0 rounded-[26px] bg-[radial-gradient(circle_at_74%_18%,color-mix(in_srgb,var(--accent)_20%,transparent),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.07),transparent_30%,rgba(255,255,255,0.025))]" />

            {/* Console chrome */}
            <div className="hero-console relative rounded-[22px] border border-[var(--border)] bg-[rgba(5,5,7,0.65)] m-2.5">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
                  <span className="text-[9px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                    Memory engine
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                  <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--accent-bright)]">
                    Live
                  </span>
                </div>
              </div>

              <div className="preview-grid grid gap-3 p-3 md:grid-cols-[0.76fr_1.24fr] md:p-3.5">
                {/* Left column */}
                <div className="space-y-3">
                  {/* Ingest queue */}
                  <div className="source-panel rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] p-3">
                    <p className="mb-2.5 text-[8px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Ingest queue
                    </p>
                    <div className="space-y-1.5">
                      {SOURCES.map(({ icon: Icon, type, title }) => (
                        <div
                          key={title}
                          className="source-row flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.025)] p-2"
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent-bright)]">
                            <Icon size={13} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[7px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                              {type}
                            </span>
                            <span className="block truncate text-[11px] font-medium text-[var(--text-primary)]">
                              {title}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Memory pages */}
                  <div className="wiki-panel rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_68%,transparent)] p-3">
                    <div className="mb-2.5 flex items-center justify-between">
                      <p className="text-[8px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        Memory pages
                      </p>
                      <Brain size={12} className="text-[var(--accent-bright)]" />
                    </div>
                    <div className="space-y-2">
                      {WIKI_PAGES.map(([type, title]) => (
                        <div key={title} className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-[var(--text-secondary)]">
                            {title}
                          </span>
                          <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-2 py-0.5 text-[7px] uppercase tracking-[0.12em] text-[var(--accent-bright)]">
                            {type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right column — brain canvas */}
                <div className="graph-panel dark-preview relative min-h-[340px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[radial-gradient(circle_at_50%_42%,rgba(255,124,37,0.13),transparent_38%),rgba(0,0,0,0.28)] p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="preview-chip rounded-full border border-[var(--border)] bg-black/30 px-2.5 py-1 text-[8px] uppercase tracking-[0.16em] text-[var(--text-secondary)] backdrop-blur">
                      Living memory
                    </span>
                    <span className="preview-chip preview-chip-accent rounded-full border border-[var(--border)] bg-black/30 px-2.5 py-1 text-[8px] uppercase tracking-[0.16em] text-[var(--accent-bright)] backdrop-blur">
                      Always on
                    </span>
                  </div>

                  <BrainMemoryVisual />

                  <div className="query-card dark-preview relative rounded-xl border border-[var(--border-bright)] bg-black/50 p-3 backdrop-blur-xl transition-all duration-300">
                    <div className="mb-2 flex items-center gap-2">
                      <Network size={13} className="text-[var(--accent-bright)]" />
                      <p className="preview-muted text-[9px] uppercase tracking-[0.16em] text-[var(--text-muted)] animate-[fade-in_0.4s_ease-out]" key={AGENT_RESPONSES[featureIdx].label}>
                        {AGENT_RESPONSES[featureIdx].label}
                      </p>
                    </div>
                    <p className="preview-title text-[12px] font-semibold leading-5 text-[var(--text-primary)] animate-[fade-in_0.4s_ease-out] min-h-[40px]" key={AGENT_RESPONSES[featureIdx].text}>
                      {AGENT_RESPONSES[featureIdx].text}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5 animate-[fade-in_0.4s_ease-out]" key={AGENT_RESPONSES[featureIdx].tags.join(',')}>
                      {AGENT_RESPONSES[featureIdx].tags.map((tag) => (
                        <span
                          key={tag}
                          className="preview-pill rounded-full border border-[var(--border)] px-2 py-0.5 text-[7px] uppercase tracking-[0.12em] text-[var(--text-secondary)]"
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

          {/* Floating metric cards */}
          <div className="float-card float-card-a lab-card transition-all duration-300">
            <div className="flex items-center gap-2 mb-2 animate-[fade-in_0.4s_ease-out]" key={VAULT_FEATURES[featureIdx].label}>
              {(() => {
                const Icon = VAULT_FEATURES[featureIdx].icon
                return <Icon size={13} className="text-[var(--accent)]" />
              })()}
              <span className="text-[8px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{VAULT_FEATURES[featureIdx].label}</span>
            </div>
            <strong className="block text-[13px] leading-5 text-[var(--text-primary)] animate-[fade-in_0.4s_ease-out]" key={VAULT_FEATURES[featureIdx].desc}>
              {VAULT_FEATURES[featureIdx].desc}
            </strong>
          </div>

          <div className="float-card float-card-b lab-card transition-all duration-300">
            <div className="flex items-center gap-2 mb-2 animate-[fade-in_0.4s_ease-out]" key={SQUAD_FEATURES[featureIdx].label}>
              {(() => {
                const Icon = SQUAD_FEATURES[featureIdx].icon
                return <Icon size={13} className="text-[var(--accent)]" />
              })()}
              <span className="text-[8px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{SQUAD_FEATURES[featureIdx].label}</span>
            </div>
            <strong className="block text-[13px] leading-5 text-[var(--text-primary)] animate-[fade-in_0.4s_ease-out]" key={SQUAD_FEATURES[featureIdx].desc}>
              {SQUAD_FEATURES[featureIdx].desc}
            </strong>
          </div>

          </div>
      </div>

      <style jsx>{`
        .hero-root {
          min-height: min(92svh, 900px);
        }

        /* ── Ambient glows ── */
        .hero-glow-a {
          position: absolute;
          pointer-events: none;
          z-index: -10;
          left: -8%;
          top: 10%;
          width: 55vw;
          height: 55vw;
          background: radial-gradient(circle, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%);
          filter: blur(18px);
          opacity: 0.85;
        }
        .hero-glow-b {
          position: absolute;
          pointer-events: none;
          z-index: -10;
          right: -14%;
          top: 4%;
          width: 52vw;
          height: 52vw;
          background: radial-gradient(circle, rgba(229, 229, 234, 0.08), transparent 62%);
          filter: blur(14px);
        }
        .hero-scanline {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: -5;
          background:
            linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.48) 100%),
            repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.016) 0 1px, transparent 1px 7px);
          mask-image: linear-gradient(180deg, #000 0%, transparent 90%);
          -webkit-mask-image: linear-gradient(180deg, #000 0%, transparent 90%);
        }

        /* ── CTA Buttons ── */
        .hero-btn-primary {
          background: linear-gradient(135deg, var(--accent-bright), var(--accent));
          box-shadow: 0 12px 36px color-mix(in srgb, var(--accent) 30%, transparent);
        }
        .hero-btn-primary:hover {
          background: linear-gradient(135deg, var(--accent-bright) 10%, var(--accent));
          box-shadow: 0 18px 48px color-mix(in srgb, var(--accent) 40%, transparent);
        }

        /* ── Lab shell ── */
        .lab-shell {
          background: color-mix(in srgb, var(--surface) 68%, transparent);
          animation: hero-float 8s ease-in-out infinite;
        }

        /* ── Source rows ── */
        .source-row {
          animation: row-pulse 4s ease-in-out infinite;
        }
        .source-row:nth-child(2) { animation-delay: 0.42s; }
        .source-row:nth-child(3) { animation-delay: 0.84s; }

        /* ── Float cards ── */
        .float-card {
          position: absolute;
          z-index: 4;
          max-width: 230px;
          border: 1px solid var(--border-bright);
          border-radius: 16px;
          background: color-mix(in srgb, var(--surface) 78%, transparent);
          box-shadow: var(--shadow-2);
          padding: 13px 14px;
          backdrop-filter: blur(20px);
        }
        .float-card-a {
          left: -20px;
          bottom: 56px;
        }
        .float-card-b {
          right: -12px;
          top: 40px;
        }

        /* ── Animations ── */
        @keyframes hero-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-7px); }
        }
        @keyframes row-pulse {
          0%, 100% { border-color: var(--border); }
          50% { border-color: color-mix(in srgb, var(--accent) 44%, var(--border)); }
        }

        /* ── Light theme overrides ── */
        :global([data-theme='light']) .hero-root {
          background:
            radial-gradient(ellipse 72% 42% at 18% 18%, rgba(255, 122, 31, 0.10), transparent 58%),
            linear-gradient(180deg, #fffdf8 0%, #f8f2e8 54%, #fffaf3 100%);
        }
        :global([data-theme='light']) .hero-scanline {
          opacity: 0.55;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, rgba(246, 237, 222, 0.28) 100%),
            repeating-linear-gradient(90deg, rgba(61, 43, 22, 0.030) 0 1px, transparent 1px 8px);
        }
        :global([data-theme='light']) .hero-glow-a { opacity: 0.50; }
        :global([data-theme='light']) .hero-glow-b { opacity: 0.15; }
        :global([data-theme='light']) .lab-shell {
          background: rgba(255, 255, 255, 0.86);
          border-color: rgba(54, 38, 22, 0.16);
          box-shadow:
            0 1px 0 rgba(255, 255, 255, 0.95) inset,
            0 32px 90px rgba(60, 42, 20, 0.14);
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
        :global([data-theme='light']) .preview-chip { color: rgba(248, 247, 244, 0.74); background: rgba(0,0,0,0.34); border-color: rgba(255,255,255,0.14); }
        :global([data-theme='light']) .preview-chip-accent { color: #ff8a32; }
        :global([data-theme='light']) .preview-title { color: #f8f7f4; }
        :global([data-theme='light']) .preview-muted,
        :global([data-theme='light']) .preview-pill { color: rgba(248, 247, 244, 0.52); border-color: rgba(255,255,255,0.12); }
        :global([data-theme='light']) .source-panel,
        :global([data-theme='light']) .wiki-panel {
          background: rgba(255, 255, 255, 0.80);
          border-color: rgba(54, 38, 22, 0.10);
          box-shadow: 0 10px 30px rgba(60, 42, 20, 0.06);
        }
        :global([data-theme='light']) .source-row {
          background: rgba(255, 255, 255, 0.74);
          border-color: rgba(54, 38, 22, 0.10);
        }

        /* ── Responsive ── */
        @media (max-width: 1024px) {
          .hero-root { min-height: auto; }
          .hero-lab { min-height: 540px; }
          .float-card-a { left: 10px; bottom: 20px; }
          .float-card-b { right: 10px; top: 18px; }
        }
        @media (max-width: 720px) {
          .hero-root { padding-top: 96px; padding-bottom: 28px; }
          .hero-lab { min-height: auto; }
          .lab-shell { border-radius: 20px; padding: 8px; animation: none; }
          .preview-grid { grid-template-columns: 1fr !important; }
          .graph-panel { min-height: 260px; }
          .float-card { display: none; }
        }
        @media (max-width: 480px) {
          .hero-root { padding-inline: 14px; padding-top: 92px; }
          .hero-console { margin: 6px; }
          .source-row:nth-child(3), .wiki-panel { display: none; }
          .graph-panel { min-height: 240px; }
          .query-card { padding: 10px; border-radius: 14px; }
          .query-card p { font-size: 11px; line-height: 1.52; }
        }
      `}</style>
    </section>
  )
}

function BrainMemoryVisual() {
  return (
    <div className="brain-memory dark-preview relative mx-auto my-3 aspect-square w-full max-w-[300px] overflow-hidden rounded-[24px] border border-[var(--border)] bg-[radial-gradient(circle_at_50%_48%,rgba(255,124,37,0.12),transparent_42%),rgba(0,0,0,0.28)]">
      {/* Mandala Tech Animation Background Layer */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          {/* Outer tech ring with notches */}
          <circle cx="100" cy="100" r="85" fill="none" stroke="var(--accent)" strokeWidth="0.75" strokeDasharray="3 6" className="animate-spin-slow" />
          {/* Inner ticks ring */}
          <circle cx="100" cy="100" r="72" fill="none" stroke="var(--border-bright)" strokeWidth="1.25" strokeDasharray="40 8 10 8" className="animate-spin-reverse-medium opacity-70" />
          {/* Third concentric ring */}
          <circle cx="100" cy="100" r="58" fill="none" stroke="var(--accent-bright)" strokeWidth="0.5" strokeDasharray="1 10" className="animate-spin-fast" />
          {/* HUD Tech ticks at 4 compass directions */}
          <line x1="100" y1="8" x2="100" y2="18" stroke="var(--accent-bright)" strokeWidth="1.5" className="animate-pulse" />
          <line x1="100" y1="182" x2="100" y2="192" stroke="var(--accent-bright)" strokeWidth="1.5" className="animate-pulse" />
          <line x1="8" y1="100" x2="18" y2="100" stroke="var(--accent-bright)" strokeWidth="1.5" className="animate-pulse" />
          <line x1="182" y1="100" x2="192" y2="100" stroke="var(--accent-bright)" strokeWidth="1.5" className="animate-pulse" />
        </svg>
      </div>

      <div className="absolute inset-0 opacity-90">
        <BrainCanvas className="h-full w-full" />
      </div>
      <div className="brain-glow" aria-hidden />
      <style jsx>{`
        .brain-memory {
          box-shadow:
            inset 0 0 50px rgba(0, 0, 0, 0.78),
            0 0 28px color-mix(in srgb, var(--accent) 10%, transparent);
        }
        .brain-glow {
          position: absolute;
          inset: 22%;
          border-radius: 999px;
          background: radial-gradient(circle, color-mix(in srgb, var(--accent) 16%, transparent), transparent 64%);
          filter: blur(16px);
          opacity: 0.85;
          animation: brain-glow-pulse 4.6s ease-in-out infinite;
        }
        .animate-spin-slow {
          transform-origin: center;
          animation: spin-slow 24s linear infinite;
        }
        .animate-spin-reverse-medium {
          transform-origin: center;
          animation: spin-reverse-medium 14s linear infinite;
        }
        .animate-spin-fast {
          transform-origin: center;
          animation: spin-slow 8s linear infinite;
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-reverse-medium {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes brain-glow-pulse {
          0%, 100% { opacity: 0.38; transform: scale(0.95); }
          50% { opacity: 0.74; transform: scale(1.07); }
        }
        @media (max-width: 480px) {
          .brain-memory { max-width: 220px; border-radius: 20px; }
        }
      `}</style>
    </div>
  )
}
