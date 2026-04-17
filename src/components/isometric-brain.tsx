'use client'

import { useEffect, useRef } from 'react'

export function IsometricBrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let time = 0

    canvas.width = 500
    canvas.height = 400

    const toIso = (x: number, y: number, z: number) => ({
      sx: (x - y) * Math.cos(Math.PI / 6) * 28,
      sy: (x + y) * Math.sin(Math.PI / 6) * 28 - z * 28,
    })

    const drawCube = (gx: number, gy: number, gz: number, color: string, alpha: number) => {
      const cx = canvas.width / 2
      const cy = canvas.height / 2 + 40

      const corners = [
        toIso(gx, gy, gz),
        toIso(gx + 1, gy, gz),
        toIso(gx + 1, gy + 1, gz),
        toIso(gx, gy + 1, gz),
        toIso(gx, gy, gz + 1),
        toIso(gx + 1, gy, gz + 1),
        toIso(gx + 1, gy + 1, gz + 1),
        toIso(gx, gy + 1, gz + 1),
      ]

      const toScreen = (p: { sx: number; sy: number }) => ({
        x: cx + p.sx,
        y: cy + p.sy,
      })

      const pts = corners.map(toScreen)

      // Top face
      ctx.beginPath()
      ctx.moveTo(pts[4].x, pts[4].y)
      ctx.lineTo(pts[5].x, pts[5].y)
      ctx.lineTo(pts[6].x, pts[6].y)
      ctx.lineTo(pts[7].x, pts[7].y)
      ctx.closePath()
      ctx.fillStyle = `rgba(${color}, ${alpha * 1.0})`
      ctx.fill()
      ctx.strokeStyle = `rgba(${color}, ${alpha * 0.3})`
      ctx.lineWidth = 0.5
      ctx.stroke()

      // Right face
      ctx.beginPath()
      ctx.moveTo(pts[1].x, pts[1].y)
      ctx.lineTo(pts[5].x, pts[5].y)
      ctx.lineTo(pts[6].x, pts[6].y)
      ctx.lineTo(pts[2].x, pts[2].y)
      ctx.closePath()
      ctx.fillStyle = `rgba(${color}, ${alpha * 0.5})`
      ctx.fill()
      ctx.stroke()

      // Left face
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      ctx.lineTo(pts[4].x, pts[4].y)
      ctx.lineTo(pts[7].x, pts[7].y)
      ctx.lineTo(pts[3].x, pts[3].y)
      ctx.closePath()
      ctx.fillStyle = `rgba(${color}, ${alpha * 0.3})`
      ctx.fill()
      ctx.stroke()
    }

    const grid = [
      [0, 0, 1], [1, 0, 2], [2, 0, 1], [3, 0, 3],
      [0, 1, 2], [1, 1, 4], [2, 1, 3], [3, 1, 1],
      [0, 2, 1], [1, 2, 3], [2, 2, 5], [3, 2, 2],
      [0, 3, 2], [1, 3, 1], [2, 3, 2], [3, 3, 1],
    ]

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      time += 0.015

      const colors = [
        '124, 58, 237',  // violet
        '99, 102, 241',  // indigo
        '0, 212, 255',   // cyan
        '139, 92, 246',  // purple
        '67, 56, 202',   // deep indigo
      ]

      grid.forEach(([gx, gy, height], i) => {
        const pulse = Math.sin(time + i * 0.5) * 0.5 + 0.5
        const colorIdx = Math.floor((i + Math.floor(time * 0.5)) % colors.length)
        const h = Math.round(height + pulse * 1.5)

        for (let z = 0; z < h; z++) {
          const alpha = (0.3 + pulse * 0.4) * (z === h - 1 ? 1 : 0.6)
          drawCube(gx - 1.5, gy - 1.5, z, colors[colorIdx], alpha)
        }
      })

      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ maxWidth: 500, maxHeight: 400 }}
    />
  )
}
