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
 * Renders:
 *  · Layer 1: outer compass ring + ticks + degree numbers
 *  · Layer 2: dashed crosshairs
 *  · Layer 3: anatomical brain silhouette with breathing + corpus callosum
 *  · Layer 4: synaptic connections (hemisphere-bound)
 *  · Layer 5: pulsing neural nodes
 *  · Layer 6: rotating scan arc with trailing ghost + leading spike
 *  · HUD:     GRAPH.INDEX · INGEST % · ENTITIES · KNOWLEDGE.LIVE
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
      OR = S * 0.415
      BR = S * 0.268
      initNodes()
    }

    // ── Nodes inside brain silhouette (excluding fissure) ──
    function initNodes() {
      nodes = []
      const TARGET_COUNT = 65
      const brainPath = makeBrainPath(1)
      for (let i = 0; i < TARGET_COUNT; i++) {
        let x = 0, y = 0, valid = false, tries = 0
        do {
          x = CX + (Math.random() - 0.5) * BR * 2.2
          y = CY + (Math.random() - 0.5) * BR * 2.2
          if (ctx!.isPointInPath(brainPath, x * DPR, y * DPR)) {
            if (Math.abs(x - CX) > BR * 0.05) valid = true
          }
          tries++
        } while (!valid && tries < 150)

        if (valid) {
          nodes.push({
            x, y, ox: x, oy: y,
            vx: (Math.random() - 0.5) * 0.035,
            vy: (Math.random() - 0.5) * 0.035,
            r: 0.8 + Math.random() * 1.1,
            ph: Math.random() * Math.PI * 2,
            sp: 0.5 + Math.random() * 0.8,
            brt: 0,
          })
        }
      }
    }

    // ── Layer 1 ─────────────────────────────────────
    function drawRing() {
      ctx!.save()
      ctx!.beginPath()
      ctx!.arc(CX, CY, OR, 0, Math.PI * 2)
      ctx!.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx!.lineWidth = 1.2
      ctx!.stroke()
      ctx!.beginPath()
      ctx!.arc(CX, CY, OR * 0.924, 0, Math.PI * 2)
      ctx!.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx!.lineWidth = 0.8
      ctx!.stroke()

      for (let deg = 0; deg < 360; deg += 10) {
        const rad = ((deg - 90) * Math.PI) / 180
        const isMaj = deg % 30 === 0
        const tickLen = isMaj ? 9 : 4.5
        const op = isMaj ? 0.30 : 0.11
        const x1 = CX + Math.cos(rad) * OR
        const y1 = CY + Math.sin(rad) * OR
        const x2 = CX + Math.cos(rad) * (OR - tickLen)
        const y2 = CY + Math.sin(rad) * (OR - tickLen)
        ctx!.beginPath()
        ctx!.moveTo(x1, y1)
        ctx!.lineTo(x2, y2)
        ctx!.strokeStyle = `rgba(255,255,255,${op})`
        ctx!.lineWidth = isMaj ? 0.9 : 0.6
        ctx!.stroke()
        if (isMaj) {
          const nr = OR - 20
          ctx!.font = '7px "JetBrains Mono", monospace'
          ctx!.fillStyle = 'rgba(255,255,255,0.20)'
          ctx!.textAlign = 'center'
          ctx!.textBaseline = 'middle'
          ctx!.fillText(String(deg), CX + Math.cos(rad) * nr, CY + Math.sin(rad) * nr)
        }
      }
      ;[0, 90, 180, 270].forEach((deg) => {
        const rad = ((deg - 90) * Math.PI) / 180
        const bx = CX + Math.cos(rad) * (OR - 4.5)
        const by = CY + Math.sin(rad) * (OR - 4.5)
        ctx!.save()
        ctx!.translate(bx, by)
        ctx!.rotate(rad + Math.PI / 2)
        ctx!.strokeStyle = 'rgba(255,255,255,0.18)'
        ctx!.lineWidth = 0.8
        ctx!.strokeRect(-4.5, -2, 9, 4)
        ctx!.restore()
      })
      ctx!.restore()
    }

    // ── Layer 2 ─────────────────────────────────────
    function drawCrosshairs() {
      ctx!.save()
      ctx!.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx!.lineWidth = 0.7
      ctx!.setLineDash([3, 6])
      const gap = OR * 0.3
      ;[
        [CX - OR * 0.97, CY, CX - gap, CY],
        [CX + gap, CY, CX + OR * 0.97, CY],
        [CX, CY - OR * 0.97, CX, CY - gap],
        [CX, CY + gap, CX, CY + OR * 0.97],
      ].forEach(([x1, y1, x2, y2]) => {
        ctx!.beginPath()
        ctx!.moveTo(x1, y1)
        ctx!.lineTo(x2, y2)
        ctx!.stroke()
      })
      ctx!.setLineDash([])
      ctx!.restore()
    }

    // ── Brain path ──────────────────────────────────
    function makeBrainPath(sc: number) {
      const r = BR * sc
      const p = new Path2D()
      p.moveTo(CX + r * 0.03, CY - r * 0.92)
      p.bezierCurveTo(CX + r * 0.35, CY - r * 0.95, CX + r * 0.65, CY - r * 0.70, CX + r * 0.75, CY - r * 0.40)
      p.bezierCurveTo(CX + r * 0.90, CY - r * 0.05, CX + r * 0.98, CY + r * 0.45, CX + r * 0.85, CY + r * 0.75)
      p.bezierCurveTo(CX + r * 0.70, CY + r * 1.05, CX + r * 0.25, CY + r * 1.05, CX + r * 0.03, CY + r * 0.95)
      p.bezierCurveTo(CX + r * 0.01, CY + r * 0.92, CX - r * 0.01, CY + r * 0.92, CX - r * 0.03, CY + r * 0.95)
      p.bezierCurveTo(CX - r * 0.25, CY + r * 1.05, CX - r * 0.70, CY + r * 1.05, CX - r * 0.85, CY + r * 0.75)
      p.bezierCurveTo(CX - r * 0.98, CY + r * 0.45, CX - r * 0.90, CY - r * 0.05, CX - r * 0.75, CY - r * 0.40)
      p.bezierCurveTo(CX - r * 0.65, CY - r * 0.70, CX - r * 0.35, CY - r * 0.95, CX - r * 0.03, CY - r * 0.92)
      p.closePath()
      return p
    }

    function drawBrain() {
      const t = frame / 60
      const sc = 1 + 0.014 * Math.sin(t * 0.72)
      const bp = makeBrainPath(sc)

      ctx!.save()
      ctx!.fillStyle = 'rgba(5, 7, 11, 0.90)'
      ctx!.fill(bp)
      ctx!.save()
      ctx!.clip(bp)
      const grd = ctx!.createRadialGradient(CX, CY, 0, CX, CY, BR * 1.1)
      grd.addColorStop(0, `rgba(${accentRGB},0.12)`)
      grd.addColorStop(0.5, 'rgba(255,255,255,0.02)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      ctx!.fillStyle = grd
      ctx!.fillRect(CX - BR * 1.2, CY - BR * 1.2, BR * 2.4, BR * 2.4)
      ctx!.restore()

      ctx!.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx!.lineWidth = 1.35
      ctx!.stroke(bp)

      ctx!.beginPath()
      ctx!.moveTo(CX, CY - BR * sc * 0.93)
      ctx!.lineTo(CX, CY + BR * sc * 0.68)
      ctx!.strokeStyle = 'rgba(255,255,255,0.065)'
      ctx!.lineWidth = 0.9
      ctx!.stroke()
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
          const maxD = BR * 0.35
          if (dist < maxD) {
            const base = (1 - dist / maxD) * 0.18
            const boost = Math.max(a.brt, b.brt) * 0.35
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.strokeStyle = `rgba(255,255,255,${Math.min(0.55, base + boost)})`
            ctx!.lineWidth = 0.45
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
        const alpha = Math.min(1, 0.42 + pulse * 0.35 + n.brt * 0.55)

        ctx!.save()
        if (n.brt > 0.08) {
          ctx!.shadowBlur = 5 + n.brt * 12
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
      const arcLen = 1.82
      const end = scanAngle
      const start = end - arcLen

      ctx!.save()
      ctx!.lineCap = 'round'

      for (let i = 4; i >= 1; i--) {
        const op = 0.055 - i * 0.011
        if (op <= 0) continue
        ctx!.beginPath()
        ctx!.arc(CX, CY, OR + 1.4, start - i * 0.22, start - (i - 1) * 0.22)
        ctx!.strokeStyle = `rgba(${accentRGB},${op})`
        ctx!.lineWidth = 1.1
        ctx!.stroke()
      }

      ctx!.beginPath()
      ctx!.arc(CX, CY, OR * 0.918, start, end)
      ctx!.strokeStyle = `rgba(${accentRGB},0.20)`
      ctx!.lineWidth = 1.0
      ctx!.stroke()

      ctx!.shadowBlur = 14
      ctx!.shadowColor = `rgba(${accentRGB},0.55)`
      ctx!.beginPath()
      ctx!.arc(CX, CY, OR + 1.4, start, end)
      ctx!.strokeStyle = `rgba(${accentRGB},0.88)`
      ctx!.lineWidth = 2.7
      ctx!.stroke()

      ctx!.beginPath()
      ctx!.arc(CX, CY, OR + 1.4, end - 0.08, end + 0.01)
      ctx!.strokeStyle = '#ffffff'
      ctx!.lineWidth = 4.5
      ctx!.stroke()
      ctx!.shadowBlur = 0

      ctx!.beginPath()
      ctx!.moveTo(CX + Math.cos(end) * (OR * 0.91), CY + Math.sin(end) * (OR * 0.91))
      ctx!.lineTo(CX + Math.cos(end) * (OR + 5), CY + Math.sin(end) * (OR + 5))
      ctx!.strokeStyle = `rgba(${accentRGB},0.70)`
      ctx!.lineWidth = 1.5
      ctx!.stroke()

      ctx!.restore()
    }

    // ── HUD ─────────────────────────────────────────
    function drawHUD() {
      const t = frame / 60
      ctx!.save()
      ctx!.font = '7px "JetBrains Mono", monospace'
      ctx!.textBaseline = 'middle'
      ctx!.fillStyle = 'rgba(255,255,255,0.28)'

      ctx!.textAlign = 'center'
      ctx!.fillText('GRAPH.INDEX', CX, CY - OR - 14)
      ctx!.fillText(
        `INGEST ${(97.8 + Math.sin(t * 0.38) * 1.1).toFixed(1)}%`,
        CX,
        CY + OR + 15
      )
      ctx!.textAlign = 'left'
      ctx!.fillText(`ENTITIES: ${nodes.length}`, CX - OR + 4, CY - OR + 8)
      ctx!.textAlign = 'right'
      ctx!.fillStyle = `rgba(${accentRGB},0.55)`
      ctx!.fillText('KNOWLEDGE.LIVE', CX + OR - 4, CY - OR + 8)
      ctx!.restore()
    }

    // ── Update ──────────────────────────────────────
    function update() {
      scanAngle += 0.0088
      if (scanAngle > Math.PI * 1.5) scanAngle -= Math.PI * 2
      nodes.forEach((n) => {
        let diff = Math.atan2(n.y - CY, n.x - CX) - scanAngle
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        n.brt += Math.abs(diff) < 0.22 ? 0.45 : -0.045
        n.brt = Math.max(0, Math.min(2.0, n.brt))
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
      drawRing()
      drawCrosshairs()
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
