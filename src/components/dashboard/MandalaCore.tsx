'use client'

/**
 * MandalaCore — animated radial-symmetry mandala for the "Ask anything" card.
 * Layered concentric geometry (tick ring, lotus petals, hexagram, breathing
 * core) with counter-rotating layers, orbiting dots, and energy pulses that
 * travel out to six memory nodes. Pure SVG + CSS; honours reduced-motion.
 */

const CX = 140
const CY = 116
const ORIGIN = `${CX}px ${CY}px`

const toRad = (deg: number) => (deg * Math.PI) / 180
const pt = (angleDeg: number, r: number) => [
  CX + r * Math.cos(toRad(angleDeg)),
  CY + r * Math.sin(toRad(angleDeg)),
] as const

/** A pointed lotus petal pointing along `angle`, from innerR to outerR. */
function petalPath(angle: number, innerR: number, outerR: number, spread: number) {
  const [tx, ty] = pt(angle, outerR)
  const [blx, bly] = pt(angle - spread, innerR)
  const [brx, bry] = pt(angle + spread, innerR)
  const [clx, cly] = pt(angle - spread * 0.7, (innerR + outerR) / 2)
  const [crx, cry] = pt(angle + spread * 0.7, (innerR + outerR) / 2)
  return `M${blx.toFixed(1)} ${bly.toFixed(1)} Q${clx.toFixed(1)} ${cly.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)} Q${crx.toFixed(1)} ${cry.toFixed(1)} ${brx.toFixed(1)} ${bry.toFixed(1)} Z`
}

function ring(count: number, startDeg: number, r: number) {
  return Array.from({ length: count }, (_, i) => startDeg + (360 / count) * i).map(a => pt(a, r))
}

// Six memory nodes at hexagonal positions (top, then clockwise).
const NODE_ANGLES = [-90, -30, 30, 90, 150, 210]
const NODE_R = 92
const nodes = NODE_ANGLES.map(a => pt(a, NODE_R))

const outerPetals = Array.from({ length: 12 }, (_, i) => i * 30)
const innerPetals = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5)
const ticks = Array.from({ length: 48 }, (_, i) => i * 7.5)
const hexA = ring(3, -90, 30)
const hexB = ring(3, 30, 30)

export function MandalaCore() {
  const accent = 'var(--dash-accent)'
  const accent2 = 'var(--dash-accent-2)'

  return (
    <div className="relative mx-auto grid h-48 w-56 place-items-center 2xl:h-52 2xl:w-64">
      <svg viewBox="0 0 280 230" className="h-full w-full overflow-visible" role="img" aria-label="Animated knowledge mandala">
        <defs>
          <radialGradient id="mc-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent2} />
            <stop offset="100%" stopColor={accent} />
          </radialGradient>
          <radialGradient id="mc-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.4" />
            <stop offset="55%" stopColor={accent} stopOpacity="0.12" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <filter id="mc-soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <filter id="mc-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* breathing halo */}
        <circle className="mandala-halo" cx={CX} cy={CY} r="62" fill="url(#mc-halo)" />

        {/* node connections + traveling pulses (behind mandala) */}
        <g>
          {nodes.map(([nx, ny], i) => (
            <line
              key={`l-${i}`}
              x1={CX}
              y1={CY}
              x2={nx}
              y2={ny}
              stroke={`color-mix(in srgb, ${accent} 26%, transparent)`}
              strokeWidth="1.1"
            />
          ))}
          {nodes.map(([nx, ny], i) => (
            <circle key={`pulse-${i}`} r="2.2" fill={accent} filter="url(#mc-soft)">
              <animateMotion dur={`${2.6 + i * 0.22}s`} repeatCount="indefinite" path={`M${CX} ${CY} L${nx} ${ny}`} />
              <animate attributeName="opacity" values="0;1;1;0" dur={`${2.6 + i * 0.22}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>

        {/* outer tick ring — slow clockwise */}
        <g
          className="mandala-layer"
          style={{ transformOrigin: ORIGIN, transformBox: 'view-box', animation: 'mandala-spin 60s linear infinite' }}
        >
          {ticks.map((a, i) => {
            const [x1, y1] = pt(a, 58)
            const [x2, y2] = pt(a, i % 4 === 0 ? 50 : 54)
            return (
              <line
                key={`t-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={`color-mix(in srgb, ${accent} ${i % 4 === 0 ? 55 : 28}%, transparent)`}
                strokeWidth={i % 4 === 0 ? 1.3 : 0.8}
                strokeLinecap="round"
              />
            )
          })}
          <circle cx={CX} cy={CY} r="60" fill="none" stroke={`color-mix(in srgb, ${accent} 22%, transparent)`} strokeWidth="0.8" strokeDasharray="1 5" />
        </g>

        {/* outer lotus — counter-clockwise */}
        <g
          className="mandala-layer"
          style={{ transformOrigin: ORIGIN, transformBox: 'view-box', animation: 'mandala-spin-rev 48s linear infinite' }}
        >
          {outerPetals.map((a, i) => (
            <path
              key={`op-${i}`}
              d={petalPath(a - 90, 30, 49, 9)}
              fill={`color-mix(in srgb, ${accent} 7%, transparent)`}
              stroke={`color-mix(in srgb, ${accent} 34%, transparent)`}
              strokeWidth="0.8"
            />
          ))}
        </g>

        {/* dashed mid ring — clockwise */}
        <g
          className="mandala-layer"
          style={{ transformOrigin: ORIGIN, transformBox: 'view-box', animation: 'mandala-spin 30s linear infinite' }}
        >
          <circle cx={CX} cy={CY} r="40" fill="none" stroke={`color-mix(in srgb, ${accent} 40%, transparent)`} strokeWidth="1" strokeDasharray="3 6" />
        </g>

        {/* hexagram star — counter-clockwise */}
        <g
          className="mandala-layer"
          style={{ transformOrigin: ORIGIN, transformBox: 'view-box', animation: 'mandala-spin-rev 36s linear infinite' }}
        >
          <polygon
            points={hexA.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke={`color-mix(in srgb, ${accent} 42%, transparent)`}
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <polygon
            points={hexB.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke={`color-mix(in srgb, ${accent} 42%, transparent)`}
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
        </g>

        {/* inner lotus — clockwise */}
        <g
          className="mandala-layer"
          style={{ transformOrigin: ORIGIN, transformBox: 'view-box', animation: 'mandala-spin 24s linear infinite' }}
        >
          {innerPetals.map((a, i) => (
            <path
              key={`ip-${i}`}
              d={petalPath(a - 90, 12, 27, 13)}
              fill={`color-mix(in srgb, ${accent} 12%, transparent)`}
              stroke={`color-mix(in srgb, ${accent} 48%, transparent)`}
              strokeWidth="0.8"
            />
          ))}
        </g>

        {/* orbiting dots */}
        <g className="mandala-layer" style={{ transformOrigin: ORIGIN, transformBox: 'view-box', animation: 'mandala-spin 14s linear infinite' }}>
          {ring(3, -90, 33).map(([x, y], i) => (
            <circle key={`od-${i}`} cx={x} cy={y} r="1.8" fill={accent} className="mandala-layer" style={{ animation: 'mandala-twinkle 2.4s ease-in-out infinite', animationDelay: `${i * 0.4}s` }} />
          ))}
        </g>

        {/* breathing core + glyph */}
        <g className="mandala-breathe" filter="url(#mc-glow)">
          <circle cx={CX} cy={CY} r="20" fill={`color-mix(in srgb, ${accent} 16%, transparent)`} stroke="url(#mc-core)" strokeWidth="2" />
          <g transform={`translate(${CX - 12} ${CY - 12})`}>
            <path
              d="M12 2c-5 0-8 3-8 7 0 2 1 3 2 4-1 1-2 2-2 4 0 4 3 7 8 7s8-3 8-7c0-2-1-3-2-4 1-1 2-2 2-4 0-4-3-7-8-7Z"
              fill="none"
              stroke="url(#mc-core)"
              strokeWidth="2"
            />
            <path d="M12 2v22M5 9h14M5 17h14" stroke="url(#mc-core)" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        </g>

        {/* memory nodes */}
        {nodes.map(([nx, ny], i) => (
          <g key={`n-${i}`}>
            <rect
              x={nx - 14}
              y={ny - 14}
              width="28"
              height="28"
              rx="8"
              fill="var(--dash-card-strong)"
              stroke={`color-mix(in srgb, ${accent} 34%, transparent)`}
              strokeWidth="1.2"
            />
            <rect
              x={nx - 6}
              y={ny - 6}
              width="12"
              height="12"
              rx="3.5"
              fill={`color-mix(in srgb, ${accent} 24%, transparent)`}
              className="mandala-layer"
              style={{ transformOrigin: `${nx}px ${ny}px`, transformBox: 'view-box', animation: 'mandala-twinkle 3s ease-in-out infinite', animationDelay: `${i * 0.3}s` }}
            />
          </g>
        ))}
      </svg>
    </div>
  )
}
