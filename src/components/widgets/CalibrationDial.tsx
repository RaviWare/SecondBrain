'use client'

/**
 * CalibrationDial — skeuomorphic rotary knob
 * ------------------------------------------
 * React port of a neumorphic dial: recessed outer plate, raised inner knob
 * with an orange dimple, tick ring + labels, progressive glowing arc, and a
 * center digital readout with mini progress bar.
 *
 * Interactions:
 *   · Pointer-drag on the knob to set target value
 *   · RAF lerp (0.15) eases current → target for buttery motion
 *   · Honours prefers-reduced-motion (snaps instantly, no RAF loop)
 *
 * Palette discipline:
 *   · Arc gradient stays inside the orange family (bright → deep) —
 *     no red; no secondary hue introduced
 *   · All body tones come from graphite / silver tokens
 */
import { useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  min?: number
  max?: number
  initial?: number
  label?: string
  unit?: string
  step?: number                 // increment for tick density (0.5 → half-unit minor ticks)
  majorEvery?: number           // every Nth whole unit is a major tick+label (default 3)
  bottomLeft?: string
  bottomRight?: string
  className?: string
}

export function CalibrationDial({
  min = 0,
  max = 12,
  initial = 4,
  label = 'CALIBRATION',
  unit,
  step = 0.5,
  majorEvery = 3,
  bottomLeft = 'CAL·01',
  bottomRight = 'CAL·02',
  className = '',
}: Props) {
  const START_ANGLE = 135
  const SWEEP = 270
  const CX = 140
  const CY = 140
  const R_TRACK = 90
  const R_TICK_IN = 104
  const R_TICK_OUT = 112
  const R_LABEL = 126

  const knobRef = useRef<HTMLDivElement>(null)
  const arcRef = useRef<SVGPathElement>(null)
  const [current, setCurrent] = useState(initial)
  const targetRef = useRef(initial)
  const draggingRef = useRef(false)
  const reducedMotionRef = useRef(false)

  // Build arc path + ticks + labels once.
  // IMPORTANT: round every coordinate to 3 decimals as a string so the SVG
  // markup produced on the server matches the client exactly (otherwise
  // 226.47283967946473 vs 226.47283967946476 trips React's hydration check).
  const { arcPath, ticks, labels } = useMemo(() => {
    const r3 = (n: number) => n.toFixed(3)
    const polar = (r: number, angDeg: number) => {
      const rad = (angDeg * Math.PI) / 180
      return { x: r3(CX + r * Math.cos(rad)), y: r3(CY + r * Math.sin(rad)) }
    }
    const s = polar(R_TRACK, START_ANGLE)
    const e = polar(R_TRACK, START_ANGLE + SWEEP)
    const large = SWEEP > 180 ? 1 : 0
    const arc = `M ${s.x} ${s.y} A ${R_TRACK} ${R_TRACK} 0 ${large} 1 ${e.x} ${e.y}`

    type Tick = { x1: string; y1: string; x2: string; y2: string; major: boolean }
    const ts: Tick[] = []
    type Label = { x: string; y: string; text: number }
    const ls: Label[] = []
    for (let t = min; t <= max + 1e-6; t += step) {
      const progress = (t - min) / (max - min)
      const angle = START_ANGLE + progress * SWEEP
      const isMajor = Math.abs(t - Math.round(t)) < 1e-6 && Math.round(t) % majorEvery === 0
      const p1 = polar(isMajor ? R_TICK_IN - 2 : R_TICK_IN, angle)
      const p2 = polar(R_TICK_OUT, angle)
      ts.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, major: isMajor })
      if (isMajor) {
        const lp = polar(R_LABEL, angle)
        ls.push({ x: lp.x, y: lp.y, text: Math.round(t) })
      }
    }
    return { arcPath: arc, ticks: ts, labels: ls }
  }, [min, max, step, majorEvery])

  // RAF easing loop + reduced-motion handling
  useEffect(() => {
    const mq = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null
    reducedMotionRef.current = !!mq?.matches
    const onChange = () => { reducedMotionRef.current = !!mq?.matches }
    mq?.addEventListener?.('change', onChange)

    let raf = 0
    const tick = () => {
      setCurrent((c) => {
        const t = targetRef.current
        if (reducedMotionRef.current) return t
        if (Math.abs(t - c) < 0.01) return c
        return c + (t - c) * 0.15
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      mq?.removeEventListener?.('change', onChange)
    }
  }, [])

  const progress = (current - min) / (max - min)
  const currentAngle = START_ANGLE + progress * SWEEP

  // Set arc dashoffset imperatively to avoid re-computing getTotalLength each render
  useEffect(() => {
    const a = arcRef.current
    if (!a) return
    const total = a.getTotalLength()
    a.style.strokeDasharray = String(total)
    a.style.strokeDashoffset = String(total * (1 - progress))
  }, [progress])

  // Pointer handling — map knob-local angle to value
  const handlePointer = (e: React.PointerEvent) => {
    const knob = knobRef.current
    if (!knob) return
    const rect = knob.getBoundingClientRect()
    const dx = e.clientX - rect.left - rect.width / 2
    const dy = e.clientY - rect.top - rect.height / 2
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI
    if (angle < 0) angle += 360
    let rel = angle - START_ANGLE
    if (rel < -90) rel += 360
    const p = Math.max(0, Math.min(1, rel / SWEEP))
    const newTarget = min + p * (max - min)
    targetRef.current = newTarget
    if (reducedMotionRef.current) setCurrent(newTarget)
  }

  return (
    <div className={`cal-dial relative ${className}`}>
      <div className="cal-plate">
        <div
          ref={knobRef}
          className="cal-knob-wrap"
          onPointerDown={(e) => {
            draggingRef.current = true
            knobRef.current?.setPointerCapture(e.pointerId)
            handlePointer(e)
          }}
          onPointerMove={(e) => draggingRef.current && handlePointer(e)}
          onPointerUp={() => (draggingRef.current = false)}
          onPointerCancel={() => (draggingRef.current = false)}
        >
          <svg viewBox="0 0 280 280" className="cal-svg">
            <defs>
              <linearGradient id="cal-arc-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%"  stopColor="#ff9146" />
                <stop offset="55%" stopColor="#ff7a1f" />
                <stop offset="100%" stopColor="#e85d00" />
              </linearGradient>
              <filter id="cal-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.2" result="b" />
                <feComposite in="SourceGraphic" in2="b" operator="over" />
              </filter>
            </defs>

            {/* Ticks */}
            <g>
              {ticks.map((t, i) => (
                <line
                  key={i}
                  x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                  stroke={t.major ? '#9a9aa0' : '#3a3a3f'}
                  strokeWidth={t.major ? 2 : 1.5}
                  strokeLinecap="round"
                />
              ))}
            </g>
            {/* Labels */}
            <g>
              {labels.map((l, i) => (
                <text
                  key={i}
                  x={l.x} y={l.y}
                  fill="#9a9aa0"
                  fontFamily="var(--font-mono), ui-monospace, monospace"
                  fontSize="10"
                  fontWeight={500}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {l.text}
                </text>
              ))}
            </g>
            {/* Track */}
            <path d={arcPath} fill="none" stroke="#111" strokeWidth={8} strokeLinecap="round" />
            {/* Arc (progressive) */}
            <path
              ref={arcRef}
              d={arcPath}
              fill="none"
              stroke="url(#cal-arc-grad)"
              strokeWidth={8}
              strokeLinecap="round"
              filter="url(#cal-glow)"
            />
          </svg>

          {/* Raised inner knob */}
          <div className="cal-knob">
            {/* orange dimple rotates with the value */}
            <div
              className="cal-dimple-ring"
              style={{ transform: `rotate(${currentAngle + 90}deg)` }}
            >
              <div className="cal-dimple" />
            </div>

            {/* Center digital readout */}
            <div className="cal-display">
              <span className="cal-label">{label}</span>
              <span className="cal-value">
                {Math.round(current)}
                {unit && <small className="cal-unit">{unit}</small>}
              </span>
              <div className="cal-bar-wrap">
                <div className="cal-bar" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom tag row */}
        <div className="cal-tags">
          <div className="cal-tag">
            <span className="cal-tag-dot cal-tag-dot--bright" />
            <span>{bottomLeft}</span>
          </div>
          <div className="cal-tag">
            <span className="cal-tag-dot cal-tag-dot--silver" />
            <span>{bottomRight}</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .cal-dial { width: 100%; aspect-ratio: 1 / 1; }
        .cal-plate {
          position: absolute;
          inset: 0;
          background: #0c0c0c;
          border: 1px solid #000;
          border-radius: 40px;
          box-shadow:
            inset 5px 5px 15px rgba(0,0,0,1),
            inset -2px -2px 5px rgba(255,255,255,0.06);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cal-knob-wrap {
          position: relative;
          width: 70%;
          aspect-ratio: 1 / 1;
          border-radius: 50%;
          touch-action: none;
          user-select: none;
          box-shadow:
            inset 4px 4px 10px rgba(0,0,0,0.9),
            inset -2px -2px 4px rgba(255,255,255,0.03);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: grab;
        }
        .cal-knob-wrap:active { cursor: grabbing; }
        .cal-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
        }
        .cal-knob {
          position: relative;
          z-index: 2;
          width: 58%;
          aspect-ratio: 1 / 1;
          border-radius: 50%;
          background: linear-gradient(135deg, #2a2a2e 0%, #0a0a0b 100%);
          border: 1px solid #1c1c20;
          box-shadow:
            10px 10px 20px rgba(0,0,0,0.8),
            -2px -2px 5px rgba(255,255,255,0.04),
            inset 1px 1px 2px rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cal-dimple-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          transition: transform 75ms ease-out;
        }
        .cal-dimple {
          position: absolute;
          top: 6px;
          left: 50%;
          transform: translateX(-50%);
          width: 6px;
          height: 12px;
          border-radius: 999px;
          background: var(--accent);
          box-shadow:
            0 0 10px var(--accent),
            inset 1px 1px 1px rgba(255,255,255,0.5);
        }
        .cal-display {
          position: absolute;
          inset: 8px;
          border-radius: 50%;
          background: #17171a;
          border: 1px solid #0e0e11;
          box-shadow:
            inset 0 2px 10px rgba(0,0,0,0.9),
            0 1px 1px rgba(255,255,255,0.04);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .cal-label {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 9px;
          font-weight: 500;
          color: #6a6a70;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          text-shadow: 1px 1px 0 rgba(0,0,0,0.8);
          margin-bottom: 3px;
        }
        .cal-value {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: clamp(28px, 4.8vw, 44px);
          font-weight: 400;
          letter-spacing: -0.02em;
          color: var(--accent);
          line-height: 1;
          text-shadow: 0 0 10px color-mix(in srgb, var(--accent) 50%, transparent);
          display: inline-flex;
          align-items: baseline;
          gap: 2px;
        }
        .cal-unit {
          font-size: 0.4em;
          opacity: 0.7;
          margin-left: 2px;
        }
        .cal-bar-wrap {
          width: 34px;
          height: 2px;
          margin-top: 10px;
          background: color-mix(in srgb, var(--accent) 25%, transparent);
          border-radius: 999px;
          overflow: hidden;
        }
        .cal-bar {
          height: 100%;
          background: var(--accent);
          box-shadow: 0 0 6px var(--accent);
          transition: width 120ms ease-out;
        }
        .cal-tags {
          position: absolute;
          bottom: 18px;
          left: 0;
          right: 0;
          padding: 0 14%;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          pointer-events: none;
        }
        .cal-tag {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .cal-tag-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .cal-tag-dot--bright {
          background: var(--accent-bright);
          box-shadow: 0 0 6px var(--accent-bright);
        }
        .cal-tag-dot--silver {
          background: #c8c8cf;
          box-shadow: 0 0 5px rgba(200,200,207,0.45);
        }
        .cal-tag span:last-child {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 8.5px;
          letter-spacing: 0.22em;
          color: #6a6a70;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  )
}
