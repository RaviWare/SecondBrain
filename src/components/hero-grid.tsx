'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

export function HeroGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let time = 0

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }

    resize()
    window.addEventListener('resize', resize)

    const nodes: Array<{ x: number; y: number; vx: number; vy: number; size: number; opacity: number }> = []

    for (let i = 0; i < 60; i++) {
      nodes.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
      })
    }

    const draw = () => {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight

      ctx.clearRect(0, 0, w, h)
      time += 0.005

      // Update nodes
      nodes.forEach(node => {
        node.x += node.vx
        node.y += node.vy
        if (node.x < 0 || node.x > w) node.vx *= -1
        if (node.y < 0 || node.y > h) node.vy *= -1
      })

      // Draw connections
      nodes.forEach((a, i) => {
        nodes.slice(i + 1).forEach(b => {
          const dist = Math.hypot(a.x - b.x, a.y - b.y)
          if (dist < 120) {
            const alpha = (1 - dist / 120) * 0.15
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        })
      })

      // Draw nodes
      nodes.forEach(node => {
        const pulse = Math.sin(time * 2 + node.x) * 0.3 + 0.7
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.size * pulse, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99, 102, 241, ${node.opacity * pulse})`
        ctx.fill()

        // Glow
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.size * 3 * pulse, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99, 102, 241, ${node.opacity * 0.05})`
        ctx.fill()
      })

      // Scan line
      const scanY = ((time * 40) % (h + 100)) - 50
      const gradient = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30)
      gradient.addColorStop(0, 'transparent')
      gradient.addColorStop(0.5, 'rgba(0, 212, 255, 0.04)')
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.fillRect(0, scanY - 30, w, 60)

      animationId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.8 }}
    />
  )
}
