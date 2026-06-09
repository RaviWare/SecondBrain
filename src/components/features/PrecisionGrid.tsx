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
    <section id="features" className="relative scroll-mt-28 overflow-hidden py-16 md:scroll-mt-32 md:py-24">
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
      <div className="mx-auto max-w-6xl px-4 md:px-6 text-center relative group">
        <div className="absolute inset-0 -z-10 rounded-full opacity-0 blur-[100px] transition-opacity duration-700 group-hover:opacity-100 bg-[var(--accent)]/10" />
        <CornerBrackets />

        <div className="mb-6 flex items-center justify-center">
          <div className="relative inline-flex items-center gap-3 rounded-full border border-[var(--accent)]/30 bg-[var(--surface)] px-4 py-1.5 shadow-[0_0_24px_rgba(255,122,31,0.15)] before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-r before:from-[var(--accent)] before:to-transparent before:opacity-10 transition-transform duration-500 hover:scale-105 hover:border-[var(--accent)]/60 cursor-default">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] animate-pulse" />
            <span className="type-mono-xs tracking-[0.2em] text-[var(--accent-bright)]">MEMORY ENGINE</span>
            <span className="type-mono-xs tracking-[0.2em] text-[var(--text-muted)]">· 2026</span>
          </div>
        </div>

        <h2
          className="relative inline-block"
          style={{
            fontFamily: 'var(--font-inter), ui-sans-serif, system-ui',
            fontWeight: 600,
            fontSize: 'clamp(2.2rem, 5vw, 4.5rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
          }}
        >
          <span className="block text-[var(--text-primary)] translate-y-2 opacity-0 animate-[rise_0.8s_ease-out_forwards]">
            Turn scattered knowledge
          </span>
          <span 
            className="block translate-y-2 opacity-0 animate-[rise_0.8s_ease-out_0.2s_forwards]"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-bright) 50%, var(--accent-deep) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 4px 12px rgba(255,122,31,0.2))'
            }}
          >
            into trusted memory.
          </span>
        </h2>

        <p className="type-body mt-6 mx-auto max-w-2xl text-[1.1rem] md:text-[1.25rem] text-[var(--text-secondary)] translate-y-2 opacity-0 animate-[rise_0.8s_ease-out_0.4s_forwards]">
          SecondBrain keeps your sources, summaries, links, and answers connected
          so important context is <span className="text-[var(--text-primary)] font-medium">never lost</span>.
        </p>

        <style jsx>{`
          @keyframes rise {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>

      {/* ── Instrument grid ──────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 md:px-6 mt-12 md:mt-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
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
    'absolute w-[32px] h-[32px] border-[var(--accent)] transition-all duration-700 pointer-events-none'
  return (
    <>
      <span className={`${common} -top-8 md:-top-12 left-0 md:-left-8 border-t-2 border-l-2 opacity-30 group-hover:opacity-100 group-hover:-translate-x-2 group-hover:-translate-y-2 group-hover:drop-shadow-[0_0_8px_var(--accent)]`} />
      <span className={`${common} -top-8 md:-top-12 right-0 md:-right-8 border-t-2 border-r-2 opacity-30 group-hover:opacity-100 group-hover:translate-x-2 group-hover:-translate-y-2 group-hover:drop-shadow-[0_0_8px_var(--accent)]`} />
      <span className={`${common} -bottom-6 md:-bottom-10 left-0 md:-left-8 border-b-2 border-l-2 opacity-20 group-hover:opacity-80 group-hover:-translate-x-2 group-hover:translate-y-2 group-hover:drop-shadow-[0_0_8px_var(--accent)]`} />
      <span className={`${common} -bottom-6 md:-bottom-10 right-0 md:-right-8 border-b-2 border-r-2 opacity-20 group-hover:opacity-80 group-hover:translate-x-2 group-hover:translate-y-2 group-hover:drop-shadow-[0_0_8px_var(--accent)]`} />
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
      className="group relative flex h-full flex-col rounded-2xl border border-[var(--border)] p-3.5 transition-all duration-500 md:rounded-[22px] md:p-5"
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
        className="relative mt-4 overflow-hidden rounded-[14px] border border-[var(--border)]"
        style={{
          background:
            'linear-gradient(160deg, #0a0a0c 0%, #050506 60%, #0c0c0e 100%)',
          aspectRatio: '16 / 11',
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
      <div className="relative mt-4 md:mt-5 flex flex-1 flex-col">
        <h3 className="text-[1.05rem] md:text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
          {title}
        </h3>
        <p className="mt-2 text-[0.8125rem] leading-[1.55] text-[var(--text-secondary)] md:text-[0.875rem] md:leading-[1.65]">{desc}</p>
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
    title: 'Monitor Live Telemetry',
    desc: 'Track real-time data ingestion, agent execution, and network throughput with zero latency.',
    Visual: StreamChart,
  },
  {
    code: 'MEM.02',
    title: 'Dynamic Agent Routing',
    desc: 'Intelligently balance task loads across active and standby LLM agents for maximum efficiency.',
    Visual: RoutingGraph,
  },
  {
    code: 'ANS.03',
    title: 'Continuous State Sync',
    desc: 'Maintain perfect memory replication across primary and secondary clusters with instant failover.',
    Visual: FailSafe,
  },
  {
    code: 'CLK.04',
    title: '24/7 Autonomous Operation',
    desc: 'Deploy persistent background daemons that index, synthesize, and monitor while you sleep.',
    Visual: DialMount,
  },
]

function DialMount() {
  const ref = useRef<HTMLDivElement>(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEntered(true)
          io.disconnect()
        }
      },
      { threshold: 0.45 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="absolute inset-0 grid place-items-center overflow-hidden rounded-xl border border-[var(--border-bright)] shadow-[inset_0_0_24px_rgba(255,255,255,0.02)]"
      style={{
        background:
          'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 15%, transparent), #050505 60%)',
      }}
    >
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(var(--accent) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
      <CalibrationDial
        className="feature-card-dial relative z-10 filter drop-shadow-[0_0_12px_rgba(255,122,31,0.25)]"
        label="ALWAYS ON"
        min={1}
        max={24}
        initial={1}
        step={0.5}
        majorEvery={6}
        bottomLeft="SYNC"
        bottomRight="24H"
        autoAnimate={entered}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   VISUAL · ING.01 — live EKG stream
   ═══════════════════════════════════════════════════════ */
function StreamChart() {
  const pts = [
    [0, 45], [6, 44], [12, 46], [18, 42], [24, 40], [30, 48],
    [36, 20], [40, 58], [46, 42], [52, 46], [58, 40], [64, 44],
    [70, 50], [76, 38], [82, 46], [88, 42], [94, 44], [100, 40],
  ]
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')
  const ghost = pts.map(([x, y], i) => [x, y + (i % 3 === 0 ? 4 : -2)] as [number, number])
  const ghostPath = ghost.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')

  return (
    <div className="absolute inset-2 rounded-xl overflow-hidden bg-[#050505] border border-[var(--border-bright)] shadow-[inset_0_0_20px_rgba(255,122,31,0.05)]">
      <svg className="absolute inset-0 h-full w-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="sg" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0 L0 0 0 10" fill="none" stroke="var(--accent-bright)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sg)" />
      </svg>

      <div className="absolute inset-x-2 top-2 flex items-center justify-between z-10">
        <span className="type-mono-xs text-[var(--accent-bright)] font-bold drop-shadow-[0_0_8px_rgba(255,122,31,0.6)]" style={{ letterSpacing: '0.18em' }}>
          STREAM.IO
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-[pulse_1.5s_infinite] shadow-[0_0_8px_var(--accent)]" />
          <span className="type-mono-xs text-[var(--accent-bright)] drop-shadow-[0_0_8px_rgba(255,122,31,0.5)]">
            LIVE
          </span>
        </span>
      </div>

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none">
        {/* Glow behind the path */}
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{
            filter: 'blur(4px)',
            opacity: 0.5,
            animation: 'ekg-shift 2.4s linear infinite',
          }}
        />
        <path
          d={ghostPath}
          fill="none"
          stroke="color-mix(in srgb, var(--accent) 30%, transparent)"
          strokeWidth="0.8"
          style={{ animation: 'ekg-shift 3.2s linear infinite' }}
        />
        <path
          d={path}
          fill="none"
          stroke="var(--accent-bright)"
          strokeWidth="1.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{
            filter: 'drop-shadow(0 0 2px #fff)',
            animation: 'ekg-shift 2.4s linear infinite',
          }}
        />
      </svg>

      {/* Scanning laser line overlay */}
      <div className="absolute inset-0 w-[20%] bg-gradient-to-r from-transparent via-[rgba(255,122,31,0.15)] to-transparent animate-[scan_3s_ease-in-out_infinite] skew-x-[-20deg]" />

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between text-[9px] px-2 py-1.5 border-t border-[var(--border-bright)] bg-[#0a0a0c]/80 backdrop-blur-sm z-10">
        <Metric label="RX" value="48.2k" tone="accent" />
        <Metric label="TX" value="12.1k" tone="muted" />
        <Metric label="ERR" value="0.00" tone="emerald" />
      </div>

      <style jsx>{`
        @keyframes ekg-shift {
          0% { transform: translateX(0); }
          100% { transform: translateX(-14%); }
        }
        @keyframes scan {
          0% { transform: translateX(-200%) skewX(-20deg); }
          100% { transform: translateX(500%) skewX(-20deg); }
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
      <span style={{ color, filter: tone !== 'muted' ? 'drop-shadow(0 0 4px currentColor)' : 'none' }}>{value}</span>
    </span>
  )
}

/* ═══════════════════════════════════════════════════════
   VISUAL · GRP.02 — load bar + routing graph
   ═══════════════════════════════════════════════════════ */
function RoutingGraph() {
  return (
    <div className="absolute inset-2 flex gap-2">
      <div className="w-[22%] rounded-xl border border-[var(--border-bright)] bg-[#050505] p-2 flex flex-col gap-1 shadow-[inset_0_0_12px_rgba(255,255,255,0.02)] z-10 relative">
        <span className="type-mono-xs text-[var(--text-muted)] font-bold tracking-widest" style={{ fontSize: 8 }}>LOAD</span>
        <div className="flex-1 flex flex-col gap-0.5 mt-1">
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
                boxShadow: i === 4 ? `0 0 10px \${c}` : 'none',
                animation: i === 4 ? 'load-pulse 1.8s ease-in-out infinite' : undefined,
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 rounded-xl border border-[var(--border-bright)] bg-[#050505] p-2 relative overflow-hidden shadow-[inset_0_0_12px_rgba(255,255,255,0.02)]">
        {/* Animated background grid */}
        <svg className="absolute inset-0 h-full w-full opacity-10" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="sg2" width="12" height="12" patternUnits="userSpaceOnUse">
              <path d="M12 0 L0 0 0 12" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sg2)" className="animate-[pulse_4s_infinite]" />
        </svg>

        <div className="absolute top-1.5 left-2 right-2 flex items-center justify-between type-mono-xs z-10" style={{ fontSize: 8 }}>
          <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded shadow-[0_0_12px_rgba(16,185,129,0.15)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--emerald)] animate-[pulse_2s_infinite]" />
            <span style={{ color: 'var(--emerald)' }} className="font-bold drop-shadow-[0_0_4px_rgba(16,185,129,0.5)]">RTE.A ACTIVE</span>
          </span>
        </div>

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none">
          {/* RTE.A Active Path Glow */}
          <path
            d="M5 42 L30 42 L55 22 L92 22"
            fill="none"
            stroke="var(--emerald)"
            strokeWidth="3"
            strokeLinejoin="round"
            style={{
              filter: 'blur(3px)',
              opacity: 0.4,
            }}
          />
          {/* RTE.A Active Path Line */}
          <path
            d="M5 42 L30 42 L55 22 L92 22"
            fill="none"
            stroke="#6ee7b7"
            strokeWidth="1.5"
            strokeLinejoin="round"
            style={{
              strokeDasharray: '200',
              strokeDashoffset: '200',
              animation: 'path-draw 2.2s var(--ease-out-expo) forwards, pulse-path 2s infinite 2.2s',
            }}
          />
          
          {/* RTE.B Standby Path */}
          <path
            d="M5 42 L30 42 L55 52 L92 52"
            fill="none"
            stroke="color-mix(in srgb, #ffffff 15%, transparent)"
            strokeWidth="1.2"
            strokeDasharray="3 3"
            className="animate-[dash-scroll_4s_linear_infinite]"
          />

          {/* Nodes */}
          <circle cx="5" cy="42" r="2.5" fill="#1a1a1d" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" />
          <circle cx="30" cy="42" r="2.5" fill="#1a1a1d" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" />
          
          <circle cx="55" cy="22" r="3" fill="#6ee7b7" stroke="var(--emerald)" strokeWidth="1" style={{ filter: 'drop-shadow(0 0 6px var(--emerald))' }} className="animate-[pulse_2s_infinite]" />
          <circle cx="92" cy="22" r="3" fill="#6ee7b7" stroke="var(--emerald)" strokeWidth="1" style={{ filter: 'drop-shadow(0 0 6px var(--emerald))' }} className="animate-[pulse_2s_infinite_0.5s]" />
          
          <circle cx="55" cy="52" r="2.5" fill="#1a1a1d" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
          <circle cx="92" cy="52" r="2.5" fill="var(--accent)" stroke="var(--accent-bright)" strokeWidth="0.8" style={{ filter: 'drop-shadow(0 0 4px var(--accent))' }} />
        </svg>

        <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between type-mono-xs z-10" style={{ fontSize: 8 }}>
          <span className="flex items-center gap-1.5 bg-[var(--accent)]/10 border border-[var(--accent)]/30 px-1.5 py-0.5 rounded shadow-[0_0_12px_rgba(255,122,31,0.1)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] opacity-70" />
            <span className="text-[var(--accent-bright)] font-bold">RTE.B STANDBY</span>
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes load-pulse { 0%, 100% { opacity: 1; transform: scaleY(1); } 50% { opacity: 0.55; transform: scaleY(0.85); } }
        @keyframes path-draw { to { stroke-dashoffset: 0; } }
        @keyframes dash-scroll { to { stroke-dashoffset: -24; } }
        @keyframes pulse-path { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   VISUAL · QRY.03 — twin servers / fail-safe
   ═══════════════════════════════════════════════════════ */
function FailSafe() {
  return (
    <div className="absolute inset-2 rounded-xl border border-[var(--border-bright)] bg-[#050505] relative flex items-center justify-around px-3 overflow-hidden shadow-[inset_0_0_24px_rgba(255,255,255,0.02)]">
      {/* Dynamic scanline background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100%_4px] animate-[scanlines_20s_linear_infinite]" />
      <svg className="absolute inset-0 h-full w-full opacity-30" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="sg3" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill="var(--accent-bright)" opacity="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sg3)" className="animate-[pulse_5s_infinite]" />
      </svg>

      <Server variant="primary" />
      <Connector />
      <Server variant="secondary" />
      
      <style jsx>{`
        @keyframes scanlines { 0% { background-position: 0 0; } 100% { background-position: 0 100px; } }
      `}</style>
    </div>
  )
}

function Server({ variant }: { variant: 'primary' | 'secondary' }) {
  const active = variant === 'primary'
  return (
    <div className="relative flex flex-col items-center gap-1.5 z-10" style={{ width: '34%' }}>
      <div
        className={`w-full rounded-lg border flex flex-col gap-1.5 p-2 transition-all duration-500 \${active ? 'shadow-[0_0_24px_rgba(16,185,129,0.15)] border-emerald-500/30' : 'border-white/10 shadow-lg'}`}
        style={{ background: 'linear-gradient(180deg, #111114, #050505)' }}
      >
        <div className="flex items-center justify-between w-full">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: active ? '#6ee7b7' : '#4a4a50',
              boxShadow: active ? '0 0 12px var(--emerald)' : 'none',
              animation: active ? 'srv-blink 1.2s ease-in-out infinite' : undefined,
            }}
          />
          {active && <span className="text-[6px] font-mono text-emerald-400 animate-pulse">UP</span>}
        </div>
        <div
          className="rounded-[4px] py-1.5 text-center transition-all duration-500"
          style={{
            background: active ? 'var(--emerald)' : '#1f1f24',
            color: active ? '#022c22' : '#8a8a90',
            fontFamily: 'var(--font-mono), monospace',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.15em',
            textShadow: active ? '0 0 8px rgba(255,255,255,0.4)' : 'none',
          }}
        >
          {active ? 'PRI' : 'SEC'}
        </div>
        <div className="space-y-1 mt-1">
          <span className="block h-1 w-full rounded-full" style={{ background: active ? 'rgba(110,231,183,0.3)' : 'rgba(255,255,255,0.1)' }} />
          <span className={`block h-1 rounded-full \${active ? 'bg-emerald-400/50 animate-[pulse-width_2s_infinite]' : 'w-[60%] bg-white/5'}`} style={{ width: active ? '85%' : '60%' }} />
        </div>
      </div>
      <style jsx>{`
        @keyframes srv-blink { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(0.85); } }
        @keyframes pulse-width { 0%, 100% { width: 85%; } 50% { width: 65%; } }
      `}</style>
    </div>
  )
}

function Connector() {
  return (
    <div className="relative flex flex-col items-center gap-1.5 z-10" style={{ width: '22%' }}>
      <div
        className="w-full rounded-[4px] text-center py-0.5 shadow-md"
        style={{
          background: '#111114',
          border: '1px solid rgba(255,122,31,0.3)',
        }}
      >
        <span className="font-bold animate-[pulse_2s_infinite]" style={{ fontFamily: 'var(--font-mono), monospace', fontSize: 7, color: 'var(--accent-bright)', letterSpacing: '0.15em' }}>
          SYNC
        </span>
      </div>
      <div className="relative w-full h-[3px] mt-0.5">
        <div className="absolute inset-0 rounded-full" style={{ background: 'rgba(255,122,31,0.1)' }} />
        
        {/* Glowing packet passing across */}
        <div
          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-transparent via-[var(--accent-bright)] to-transparent"
          style={{
            width: '80%',
            filter: 'drop-shadow(0 0 6px var(--accent))',
            animation: 'sync-packet 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite',
          }}
        />
        {/* Core highlight dot */}
        <div
          className="absolute inset-y-0 rounded-full bg-white"
          style={{
            width: '20%',
            animation: 'sync-packet-dot 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite',
            boxShadow: '0 0 8px #fff'
          }}
        />
      </div>
      <style jsx>{`
        @keyframes sync-packet {
          0% { left: -50%; opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        @keyframes sync-packet-dot {
          0% { left: -30%; opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { left: 120%; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
