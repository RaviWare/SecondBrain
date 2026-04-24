'use client'

/**
 * BrainCanvas — autonomous neural graph renderer
 * ----------------------------------------------
 * Ported from the provided initBrainViz() to React with:
 *  · ResizeObserver cleanup + RAF cancellation on unmount
 *  · DPR-aware canvas sizing to a centered square
 *  · Orange (--accent) tinted scan arc + node glow to match palette
 *  · Respects prefers-reduced-motion (draws a single frame, no loop)
 *
 * Renders a quiet always-on brain graph: soft brain silhouette, living nodes,
 * restrained source-link orbit, and minimal status labels.
 */
import { useEffect, useRef } from 'react'

export function BrainCanvas({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Orange accent (CSS var → RGB) for scan arc / node halos
    const accentRGB = readCssVarRGB('--accent') ?? '255, 122, 31'

    let W = 0, H = 0, CX = 0, CY = 0, OR = 0, BR = 0, S = 0
    let frame = 0
    let scanAngle = -Math.PI / 2
    let rafId = 0
    type Node = {
      x: number; y: number; ox: number; oy: number
      vx: number; vy: number
      r: number; ph: number; sp: number; brt: number
    }
    let nodes: Node[] = []

    // ── Size canvas ─────────────────────────────────
    function resize() {
      W = container!.clientWidth
      H = container!.clientHeight
      S = Math.min(W, H)
      canvas!.width = S * DPR
      canvas!.height = S * DPR
      canvas!.style.width = S + 'px'
      canvas!.style.height = S + 'px'
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0)
      CX = S / 2
      CY = S / 2
      OR = S * 0.39
      BR = S * 0.34
      initNodes()
    }

    // ── Nodes inside brain silhouette (excluding fissure) ──
    function initNodes() {
      nodes = []
      const TARGET_COUNT = 38
      const brainPath = makeBrainPath(1)
      for (let i = 0; i < TARGET_COUNT; i++) {
        let x = 0, y = 0, valid = false, tries = 0
        do {
      x = CX + (Math.random() - 0.5) * BR * 2.0
      y = CY + (Math.random() - 0.5) * BR * 1.82
          if (ctx!.isPointInPath(brainPath, x * DPR, y * DPR)) {
            if (Math.abs(x - CX) > BR * 0.05) valid = true
          }
          tries++
        } while (!valid && tries < 150)

        if (valid) {
          nodes.push({
            x, y, ox: x, oy: y,
            vx: (Math.random() - 0.5) * 0.018,
            vy: (Math.random() - 0.5) * 0.018,
            r: 0.72 + Math.random() * 0.85,
            ph: Math.random() * Math.PI * 2,
            sp: 0.5 + Math.random() * 0.8,
            brt: 0,
          })
        }
      }
    }

    // ── Minimal always-on activity halo ─────────────
    function drawHalo() {
      ctx!.save()
      for (let deg = 0; deg < 360; deg += 30) {
        const rad = ((deg - 90) * Math.PI) / 180
        const isMaj = deg % 90 === 0
        const tickLen = isMaj ? 9 : 4
        const op = isMaj ? 0.18 : 0.08
        const x1 = CX + Math.cos(rad) * OR
        const y1 = CY + Math.sin(rad) * OR
        const x2 = CX + Math.cos(rad) * (OR - tickLen)
        const y2 = CY + Math.sin(rad) * (OR - tickLen)
        ctx!.beginPath()
        ctx!.moveTo(x1, y1)
        ctx!.lineTo(x2, y2)
        ctx!.strokeStyle = `rgba(255,255,255,${op})`
        ctx!.lineWidth = isMaj ? 0.9 : 0.55
        ctx!.stroke()
      }
      ctx!.restore()
    }

    // ── Ambient power wash behind the brain ─────────
    function drawPowerField() {
      ctx!.save()
      const t = frame / 60
      const pulse = 0.9 + Math.sin(t * 0.72) * 0.08
      const grd = ctx!.createRadialGradient(CX, CY + BR * 0.05, 0, CX, CY, BR * 1.28 * pulse)
      grd.addColorStop(0, `rgba(${accentRGB},0.14)`)
      grd.addColorStop(0.46, `rgba(${accentRGB},0.05)`)
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      ctx!.fillStyle = grd
      ctx!.beginPath()
      ctx!.arc(CX, CY, BR * 1.38 * pulse, 0, Math.PI * 2)
      ctx!.fill()
      ctx!.restore()
    }

    // ── Brain path ──────────────────────────────────
    function makeBrainPath(sc: number) {
      const r = BR * sc
      const p = new Path2D()
      p.moveTo(CX - r * 0.08, CY - r * 0.86)
      p.bezierCurveTo(CX - r * 0.48, CY - r * 0.98, CX - r * 0.86, CY - r * 0.64, CX - r * 0.88, CY - r * 0.24)
      p.bezierCurveTo(CX - r * 1.05, CY + r * 0.02, CX - r * 0.96, CY + r * 0.52, CX - r * 0.72, CY + r * 0.78)
      p.bezierCurveTo(CX - r * 0.50, CY + r * 1.02, CX - r * 0.20, CY + r * 0.92, CX - r * 0.05, CY + r * 0.98)
      p.bezierCurveTo(CX - r * 0.02, CY + r * 1.03, CX + r * 0.02, CY + r * 1.03, CX + r * 0.05, CY + r * 0.98)
      p.bezierCurveTo(CX + r * 0.20, CY + r * 0.92, CX + r * 0.50, CY + r * 1.02, CX + r * 0.72, CY + r * 0.78)
      p.bezierCurveTo(CX + r * 0.96, CY + r * 0.52, CX + r * 1.05, CY + r * 0.02, CX + r * 0.88, CY - r * 0.24)
      p.bezierCurveTo(CX + r * 0.86, CY - r * 0.64, CX + r * 0.48, CY - r * 0.98, CX + r * 0.08, CY - r * 0.86)
      p.bezierCurveTo(CX + r * 0.03, CY - r * 0.90, CX - r * 0.03, CY - r * 0.90, CX - r * 0.08, CY - r * 0.86)
      p.closePath()
      return p
    }

    function drawBrain() {
      const t = frame / 60
      const sc = 1 + 0.014 * Math.sin(t * 0.72)
      const bp = makeBrainPath(sc)

      ctx!.save()
      ctx!.shadowBlur = 18
      ctx!.shadowColor = `rgba(${accentRGB},0.12)`
      ctx!.fillStyle = 'rgba(5, 7, 11, 0.82)'
      ctx!.fill(bp)
      ctx!.shadowBlur = 0
      ctx!.save()
      ctx!.clip(bp)
      const grd = ctx!.createRadialGradient(CX, CY, 0, CX, CY, BR * 1.1)
      grd.addColorStop(0, `rgba(${accentRGB},0.17)`)
      grd.addColorStop(0.52, 'rgba(255,255,255,0.025)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      ctx!.fillStyle = grd
      ctx!.fillRect(CX - BR * 1.2, CY - BR * 1.2, BR * 2.4, BR * 2.4)
      ctx!.restore()

      ctx!.strokeStyle = 'rgba(255,255,255,0.30)'
      ctx!.lineWidth = 1.35
      ctx!.stroke(bp)

      drawCorticalLines(bp, sc)

      ctx!.beginPath()
      ctx!.moveTo(CX, CY - BR * sc * 0.78)
      ctx!.bezierCurveTo(CX - BR * 0.035, CY - BR * 0.30, CX + BR * 0.045, CY + BR * 0.28, CX, CY + BR * sc * 0.80)
      ctx!.strokeStyle = 'rgba(255,255,255,0.16)'
      ctx!.lineWidth = 0.9
      ctx!.stroke()
      ctx!.restore()
    }

    function drawCorticalLines(bp: Path2D, sc: number) {
      const t = frame / 60
      ctx!.save()
      ctx!.clip(bp)
      ctx!.lineCap = 'round'
      const lines = [
        [-0.66, -0.46, -0.45, -0.68, -0.22, -0.54, -0.28, -0.30],
        [-0.78, -0.08, -0.52, -0.24, -0.34, -0.07, -0.44, 0.18],
        [-0.58, 0.34, -0.40, 0.16, -0.18, 0.30, -0.22, 0.56],
        [0.24, -0.56, 0.48, -0.70, 0.68, -0.45, 0.55, -0.18],
        [0.34, -0.02, 0.58, -0.18, 0.72, 0.08, 0.54, 0.30],
        [0.20, 0.44, 0.46, 0.22, 0.68, 0.46, 0.44, 0.66],
      ]
      lines.forEach((line, i) => {
        const glow = 0.045 + Math.max(0, Math.sin(t * 0.9 + i * 1.8)) * 0.055
        ctx!.beginPath()
        ctx!.moveTo(CX + BR * sc * line[0], CY + BR * sc * line[1])
        ctx!.bezierCurveTo(
          CX + BR * sc * line[2], CY + BR * sc * line[3],
          CX + BR * sc * line[4], CY + BR * sc * line[5],
          CX + BR * sc * line[6], CY + BR * sc * line[7]
        )
        ctx!.strokeStyle = `rgba(255,255,255,${glow})`
        ctx!.lineWidth = 0.8
        ctx!.stroke()
      })
      ctx!.restore()
    }

    // ── Layer 4 ─────────────────────────────────────
    function drawConnections() {
      ctx!.save()
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          if ((a.x < CX && b.x > CX) || (a.x > CX && b.x < CX)) continue
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = Math.hypot(dx, dy)
          const maxD = BR * 0.27
          if (dist < maxD) {
            const base = (1 - dist / maxD) * 0.08
            const boost = Math.max(a.brt, b.brt) * 0.22
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.strokeStyle = `rgba(255,255,255,${Math.min(0.55, base + boost)})`
            ctx!.lineWidth = 0.38
            ctx!.stroke()
          }
        }
      }
      ctx!.restore()
    }

    // ── Layer 5 ─────────────────────────────────────
    function drawNodes() {
      const t = frame / 60
      nodes.forEach((n) => {
        const pulse = 0.5 + 0.5 * Math.sin(t * n.sp + n.ph)
        const r = n.r * (1 + pulse * 0.28)
        const alpha = Math.min(0.92, 0.34 + pulse * 0.26 + n.brt * 0.48)

        ctx!.save()
        if (n.brt > 0.08) {
          ctx!.shadowBlur = 4 + n.brt * 9
          ctx!.shadowColor = `rgba(${accentRGB},0.75)`
        }
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx!.fillStyle =
          n.brt > 0.2
            ? `rgba(${accentRGB},${Math.min(1, alpha + 0.1)})`
            : `rgba(255,255,255,${alpha})`
        ctx!.fill()
        ctx!.restore()
      })
    }

    // ── Layer 6 ─────────────────────────────────────
    function drawScanArc() {
      const arcLen = 0.82
      const end = scanAngle
      const start = end - arcLen

      ctx!.save()
      ctx!.lineCap = 'round'

      for (let i = 2; i >= 1; i--) {
        const op = 0.035 - i * 0.011
        if (op <= 0) continue
        ctx!.beginPath()
        ctx!.arc(CX, CY, OR, start - i * 0.18, start - (i - 1) * 0.18)
        ctx!.strokeStyle = `rgba(${accentRGB},${op})`
        ctx!.lineWidth = 1
        ctx!.stroke()
      }

      ctx!.shadowBlur = 12
      ctx!.shadowColor = `rgba(${accentRGB},0.50)`
      ctx!.beginPath()
      ctx!.arc(CX, CY, OR, start, end)
      ctx!.strokeStyle = `rgba(${accentRGB},0.78)`
      ctx!.lineWidth = 2.1
      ctx!.stroke()

      ctx!.beginPath()
      ctx!.arc(CX, CY, OR, end - 0.055, end + 0.01)
      ctx!.strokeStyle = `rgba(${accentRGB},0.92)`
      ctx!.lineWidth = 3.2
      ctx!.stroke()
      ctx!.shadowBlur = 0
      ctx!.restore()
    }

    // ── Minimal status labels ───────────────────────
    function drawHUD() {
      ctx!.save()
      ctx!.font = '7px "JetBrains Mono", monospace'
      ctx!.textBaseline = 'middle'
      ctx!.fillStyle = 'rgba(255,255,255,0.26)'

      ctx!.textAlign = 'left'
      ctx!.fillStyle = `rgba(${accentRGB},0.70)`
      ctx!.fillText('24/7 MEMORY', CX - OR + 10, CY - OR - 6)
      ctx!.textAlign = 'right'
      ctx!.fillText('ALWAYS ACTIVE', CX + OR - 10, CY - OR - 6)
      ctx!.textAlign = 'center'
      ctx!.fillStyle = 'rgba(255,255,255,0.32)'
      ctx!.fillText('SOURCE LINKED', CX, CY + OR + 13)
      ctx!.restore()
    }

    // ── Update ──────────────────────────────────────
    function update() {
      scanAngle += 0.0062
      if (scanAngle > Math.PI * 1.5) scanAngle -= Math.PI * 2
      nodes.forEach((n) => {
        let diff = Math.atan2(n.y - CY, n.x - CX) - scanAngle
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        n.brt += Math.abs(diff) < 0.18 ? 0.34 : -0.038
        n.brt = Math.max(0, Math.min(1.5, n.brt))
        n.x += n.vx
        n.y += n.vy
        n.vx -= (n.x - n.ox) * 0.00055
        n.vy -= (n.y - n.oy) * 0.00055
        n.vx *= 0.981
        n.vy *= 0.981
      })
      frame++
    }

    function render() {
      ctx!.clearRect(0, 0, S, S)
      drawPowerField()
      drawHalo()
      drawBrain()
      drawConnections()
      drawNodes()
      drawScanArc()
      drawHUD()
      if (!reducedMotion) {
        update()
        rafId = requestAnimationFrame(render)
      }
    }

    const ro = new ResizeObserver(resize)
    ro.observe(container)
    resize()
    render()

    return () => {
      ro.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        aria-label="Neural brain visualization"
        style={{ display: 'block', margin: '0 auto' }}
      />
    </div>
  )
}

/** Read `--accent` as an "r, g, b" string for rgba() composition. */
function readCssVarRGB(name: string): string | null {
  if (typeof window === 'undefined') return null
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw) return null
  // Supports #RRGGBB, #RGB, rgb(), rgba()
  if (raw.startsWith('#')) {
    const hex = raw.slice(1)
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
    const n = parseInt(full, 16)
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
  }
  const m = raw.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const parts = m[1].split(',').slice(0, 3).map((s) => s.trim())
    return parts.join(', ')
  }
  return null
}
