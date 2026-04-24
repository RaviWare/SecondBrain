'use client'

/**
 * PrecisionGrid — aura.build 60B860 inspired
 * ------------------------------------------
 *  · 4 "instrument panel" cards in a single row
 *  · Each card: code label (top-left), LED indicator (top-right),
 *    bezel-framed visual, title + description below
 *  · Corner brackets frame the section heading
 *  · MK-style version tag between heading and grid
 *  · Uses our existing feature copy with instrument treatment
 *  · All four visuals are lightweight pure-SVG with live animations
 */
import { useEffect, useRef, useState } from 'react'
import { CalibrationDial } from '@/components/widgets/CalibrationDial'

export function PrecisionGrid() {
  return (
    <section id="features" className="relative py-16 md:py-36 overflow-hidden">
      {/* ambient plume */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(ellipse 70% 40% at 50% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)',
        }}
      />

      {/* ── Header with corner brackets ──────────────────── */}
      <div className="mx-auto max-w-6xl px-4 md:px-6 text-center relative">
        <CornerBrackets />
        <h2
          className="relative"
          style={{
            fontFamily: 'var(--font-inter), ui-sans-serif, system-ui',
            fontWeight: 600,
            fontSize: 'clamp(1.9rem, 5vw, 4.25rem)',
            lineHeight: 1.02,
            letterSpacing: '-0.03em',
          }}
        >
          <span className="block text-[var(--text-primary)]">The AI memory system</span>
          <span className="block brushed-text">for serious knowledge work.</span>
        </h2>

        <p className="type-body mt-5 mx-auto max-w-2xl">
          Capture sources, build a private knowledge base, search with citations,
          and keep your most important thinking connected every hour of the day.
        </p>

        <div className="mt-7 flex items-center justify-center gap-2">
          <span className="type-mono-xs text-[var(--text-muted)] tracking-[0.4em]">{'///'}</span>
          <span className="type-mono-xs text-[var(--text-muted)]">MEMORY ENGINE · 2026</span>
          <span className="type-mono-xs text-[var(--text-muted)] tracking-[0.4em]">{'///'}</span>
        </div>
      </div>

      {/* ── Instrument grid ──────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 md:px-6 mt-10 md:mt-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {CARDS.map((c, i) => (
            <InstrumentCard key={c.code} {...c} delay={i * 120} />
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════════════ */
function CornerBrackets() {
  const common =
    'absolute w-[22px] h-[22px] border-[var(--text-muted)] opacity-60'
  return (
    <>
      <span className={`${common} -top-8 -left-2 border-t border-l`} />
      <span className={`${common} -top-8 -right-2 border-t border-r`} />
      <span className={`${common} -bottom-6 -left-2 border-b border-l`} style={{ opacity: 0.35 }} />
      <span className={`${common} -bottom-6 -right-2 border-b border-r`} style={{ opacity: 0.35 }} />
    </>
  )
}

/* ═══════════════════════════════════════════════════════ */
type CardDef = {
  code: string
  title: string
  desc: string
  Visual: React.FC
}

function InstrumentCard({
  code,
  title,
  desc,
  Visual,
  delay,
}: CardDef & { delay: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setEntered(true)
          io.disconnect()
        }
      },
      { threshold: 0.2 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="group relative rounded-[22px] p-5 md:p-6 border border-[var(--border)] transition-all duration-500"
      style={{
        background: 'var(--metallic)',
        boxShadow: entered
          ? 'var(--shadow-2), inset 0 1px 0 rgba(255,255,255,0.04)'
          : 'var(--shadow-1)',
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateY(0)' : 'translateY(18px)',
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: 'var(--ease-out-expo)',
      }}
    >
      {/* bezel inner highlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[22px]"
        style={{ background: 'var(--metallic-hi)' }}
      />

      {/* code + LED */}
      <div className="relative flex items-center justify-between">
        <span className="type-mono-xs text-[var(--text-muted)] tracking-[0.18em]">{code}</span>
        <span
          className="h-2 w-2 rounded-full pulse-dot"
          style={{
            background: 'var(--accent)',
            boxShadow: '0 0 10px var(--accent), 0 0 20px color-mix(in srgb, var(--accent) 40%, transparent)',
          }}
        />
      </div>

      {/* instrument bezel */}
      <div
        className="relative mt-4 rounded-[14px] border border-[var(--border)] overflow-hidden"
        style={{
          background:
            'linear-gradient(160deg, #0a0a0c 0%, #050506 60%, #0c0c0e 100%)',
          aspectRatio: '4 / 3',
        }}
      >
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 100% 70% at 50% 110%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%)',
          }}
        />
        <div className="relative h-full w-full">
          <Visual />
        </div>
      </div>

      {/* title + desc */}
      <div className="relative mt-5">
        <h3 className="text-[1.05rem] md:text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
          {title}
        </h3>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">{desc}</p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   CARDS · uses existing feature copy, re-tagged with codes
   ═══════════════════════════════════════════════════════ */
const CARDS: CardDef[] = [
  {
    code: 'CAP.01',
    title: 'Capture every source',
    desc: 'Add links, PDFs, documents, notes, and transcripts. SecondBrain preserves the original source and turns it into searchable knowledge.',
    Visual: StreamChart,
  },
  {
    code: 'MEM.02',
    title: 'Memory that stays current',
    desc: 'Each topic keeps the latest understanding, source history, and evidence trail so your knowledge base improves over time.',
    Visual: RoutingGraph,
  },
  {
    code: 'ANS.03',
    title: 'Cited AI search',
    desc: 'Ask natural-language questions and get grounded answers with references back to the pages and sources behind them.',
    Visual: FailSafe,
  },
  {
    code: 'CLK.04',
    title: '24 hour memory graph',
    desc: 'Browse topics, people, decisions, sources, and patterns as a living map that keeps your second brain active around the clock.',
    Visual: DialMount,
  },
]

function DialMount() {
  return (
    <div className="absolute inset-0 grid place-items-center p-2">
      <CalibrationDial
        label="ALWAYS ON"
        min={0}
        max={24}
        initial={24}
        step={0.5}
        majorEvery={6}
        bottomLeft="SYNC"
        bottomRight="24H"
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   VISUAL · ING.01 — live EKG stream
   ═══════════════════════════════════════════════════════ */
function StreamChart() {
  // Pre-computed polyline (looping waveform with a spike)
  const pts = [
    [0, 45], [6, 44], [12, 46], [18, 42], [24, 40], [30, 48],
    [36, 20], [40, 58], [46, 42], [52, 46], [58, 40], [64, 44],
    [70, 50], [76, 38], [82, 46], [88, 42], [94, 44], [100, 40],
  ]
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')
  const ghost = pts.map(([x, y], i) => [x, y + (i % 3 === 0 ? 4 : -2)] as [number, number])
  const ghostPath = ghost.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')

  return (
    <div className="absolute inset-2 rounded-[10px] overflow-hidden bg-[#0a0a0c] border border-[var(--border)]">
      {/* grid */}
      <svg className="absolute inset-0 h-full w-full opacity-30" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="sg" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0 L0 0 0 10" fill="none" stroke="rgba(255,122,31,0.22)" strokeWidth="0.4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sg)" />
      </svg>

      {/* header strip */}
      <div className="absolute inset-x-2 top-2 flex items-center justify-between">
        <span className="type-mono-xs" style={{ color: 'var(--accent-bright)', letterSpacing: '0.18em' }}>
          STREAM.IO
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full pulse-dot"
            style={{ background: 'var(--accent)' }}
          />
          <span className="type-mono-xs" style={{ color: 'var(--accent-bright)' }}>
            LIVE
          </span>
        </span>
      </div>

      {/* waveform */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
      >
        <path
          d={ghostPath}
          fill="none"
          stroke="color-mix(in srgb, var(--accent) 40%, transparent)"
          strokeWidth="0.6"
          opacity="0.4"
          style={{ animation: 'ekg-shift 3.2s linear infinite' }}
        />
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{
            filter: 'drop-shadow(0 0 3px var(--accent))',
            animation: 'ekg-shift 2.4s linear infinite',
          }}
        />
      </svg>

      {/* footer metrics */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between text-[9px] px-2 py-1.5 border-t border-[var(--border)]" style={{ background: '#0a0a0c' }}>
        <Metric label="RX" value="48.2k" tone="accent" />
        <Metric label="TX" value="12.1k" tone="muted" />
        <Metric label="ERR" value="0.00" tone="emerald" />
      </div>

      <style jsx>{`
        @keyframes ekg-shift {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-14%); }
        }
      `}</style>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'accent' | 'muted' | 'emerald' }) {
  const color =
    tone === 'accent' ? 'var(--accent-bright)' :
    tone === 'emerald' ? 'var(--emerald)' :
    'var(--text-muted)'
  return (
    <span className="type-mono font-medium">
      <span style={{ color: 'var(--text-muted)' }}>{label} </span>
      <span style={{ color }}>{value}</span>
    </span>
  )
}

/* ═══════════════════════════════════════════════════════
   VISUAL · GRP.02 — load bar + routing graph
   ═══════════════════════════════════════════════════════ */
function RoutingGraph() {
  return (
    <div className="absolute inset-2 flex gap-2">
      {/* load bar */}
      <div className="w-[22%] rounded-[8px] border border-[var(--border)] bg-[#0a0a0c] p-2 flex flex-col gap-1">
        <span className="type-mono-xs text-[var(--text-muted)]" style={{ fontSize: 8 }}>LOAD</span>
        <div className="flex-1 flex flex-col gap-0.5">
          {[
            'rgba(255,77,77,0.85)',
            'rgba(255,77,77,0.55)',
            'rgba(255,122,31,0.85)',
            'rgba(255,166,36,0.65)',
            'var(--emerald)',
          ].map((c, i) => (
            <span
              key={i}
              className="flex-1 rounded-[2px]"
              style={{
                background: c,
                animation: i === 4 ? 'load-pulse 1.8s ease-in-out infinite' : undefined,
              }}
            />
          ))}
        </div>
      </div>

      {/* graph pane */}
      <div className="flex-1 rounded-[8px] border border-[var(--border)] bg-[#0a0a0c] p-2 relative">
        <svg className="absolute inset-0 h-full w-full opacity-25" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="sg2" width="8" height="8" patternUnits="userSpaceOnUse">
              <path d="M8 0 L0 0 0 8" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sg2)" />
        </svg>

        {/* label */}
        <div className="absolute top-1.5 left-2 right-2 flex items-center justify-between type-mono-xs" style={{ fontSize: 8 }}>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--emerald)' }} />
            <span style={{ color: 'var(--emerald)' }}>RTE.A ACTIVE</span>
          </span>
        </div>

        {/* paths */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none">
          {/* active path */}
          <path
            d="M5 42 L30 42 L55 22 L92 22"
            fill="none"
            stroke="var(--emerald)"
            strokeWidth="1.4"
            strokeLinejoin="round"
            style={{
              filter: 'drop-shadow(0 0 2px var(--emerald))',
              strokeDasharray: '200',
              strokeDashoffset: '200',
              animation: 'path-draw 2.2s var(--ease-out-expo) forwards',
            }}
          />
          {/* inactive path */}
          <path
            d="M5 42 L30 42 L55 52 L92 52"
            fill="none"
            stroke="color-mix(in srgb, #ffffff 22%, transparent)"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          {/* nodes */}
          <circle cx="5" cy="42" r="2" fill="#2a2a30" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <circle cx="30" cy="42" r="2" fill="#2a2a30" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <circle cx="55" cy="22" r="2.2" fill="var(--emerald)" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" />
          <circle cx="92" cy="22" r="2.2" fill="var(--emerald)" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" />
          <circle cx="55" cy="52" r="2" fill="#2a2a30" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
          <circle cx="92" cy="52" r="2" fill="var(--accent)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        </svg>

        {/* bottom label */}
        <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between type-mono-xs" style={{ fontSize: 8 }}>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
            <span style={{ color: 'var(--accent-bright)' }}>RTE.B STANDBY</span>
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes load-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        @keyframes path-draw  { to { stroke-dashoffset: 0; } }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   VISUAL · QRY.03 — twin servers / fail-safe
   ═══════════════════════════════════════════════════════ */
function FailSafe() {
  return (
    <div className="absolute inset-2 rounded-[8px] border border-[var(--border)] bg-[#0a0a0c] relative flex items-center justify-around px-3">
      {/* grid */}
      <svg className="absolute inset-0 h-full w-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="sg3" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill="rgba(255,255,255,0.3)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sg3)" />
      </svg>

      <Server variant="primary" />
      <Connector />
      <Server variant="secondary" />
    </div>
  )
}

function Server({ variant }: { variant: 'primary' | 'secondary' }) {
  const active = variant === 'primary'
  return (
    <div
      className="relative flex flex-col items-center gap-1.5"
      style={{ width: '34%' }}
    >
      <div
        className="w-full rounded-[6px] border flex flex-col gap-1 p-2"
        style={{
          background: 'linear-gradient(180deg,#2a2a30,#1a1a1d)',
          borderColor: 'rgba(255,255,255,0.1)',
        }}
      >
        <span
          className="h-2.5 w-2.5 rounded-full self-start"
          style={{
            background: active ? 'var(--emerald)' : '#4a4a50',
            boxShadow: active ? '0 0 8px var(--emerald)' : 'none',
            animation: active ? 'srv-blink 1.6s ease-in-out infinite' : undefined,
          }}
        />
        <div
          className="rounded-[3px] py-1 text-center"
          style={{
            background: active ? 'var(--emerald)' : '#3a3a40',
            color: active ? '#06220f' : '#c8c8cf',
            fontFamily: 'var(--font-mono), monospace',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.1em',
          }}
        >
          {active ? 'PRI' : 'SEC'}
        </div>
        <div className="space-y-0.5 mt-0.5">
          <span className="block h-0.5 w-full rounded" style={{ background: 'rgba(255,255,255,0.18)' }} />
          <span className="block h-0.5 w-[80%] rounded" style={{ background: 'rgba(255,255,255,0.12)' }} />
        </div>
      </div>
      <style jsx>{`
        @keyframes srv-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  )
}

function Connector() {
  return (
    <div className="relative flex flex-col items-center gap-1" style={{ width: '18%' }}>
      <div
        className="w-full rounded-[3px] text-center py-0.5"
        style={{
          background: '#2a2a30',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 7, color: '#8a8a90', letterSpacing: '0.1em' }}>
          SYNC
        </span>
      </div>
      <div className="relative w-full h-[2px]">
        <div className="absolute inset-0 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <div
          className="absolute inset-y-0 left-0 rounded"
          style={{
            width: '60%',
            background: 'var(--accent)',
            boxShadow: '0 0 4px var(--accent)',
            animation: 'sync-pulse 2s ease-in-out infinite',
          }}
        />
      </div>
      <style jsx>{`
        @keyframes sync-pulse {
          0%   { left: 0;   width: 0%;  }
          50%  { left: 20%; width: 60%; }
          100% { left: 100%; width: 0%; }
        }
      `}</style>
    </div>
  )
}

/* WIK.04 visual is now rendered by CalibrationDial (see DialMount above). */
