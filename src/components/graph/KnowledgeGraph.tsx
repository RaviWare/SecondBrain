'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

export interface GraphNode {
  id: string
  title: string
  type: string
  summary?: string
  subtitle?: string
  icon?: IconKey
  tags?: string[]
  connectionCount: number
  updatedAt?: string
  createdAt?: string
}

export interface GraphEdge {
  source: string
  target: string
}

interface PhysicsNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedId?: string | null
  highlightId?: string | null
  /** When set, the graph eases its viewport to centre this node. */
  focusNodeId?: string | null
  /** Bump to re-trigger focus on the same node (e.g. second click of same row). */
  focusNonce?: number
  onNodeClick: (node: GraphNode | null) => void
  className?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Palette — monochrome, aligned with the three-colour system.
// Edges are white at low alpha; nodes are surface cards with a subtle white
// stroke. The only "colour" is `--accent` for the central hub and selection.
// ─────────────────────────────────────────────────────────────────────────────
const ACCENT       = '#ff7a1f'
const ACCENT_SOFT  = 'rgba(255,122,31,0.18)'
const CARD_FILL    = '#0f0f12'
const CARD_HIGH    = '#17171c'
const RING         = 'rgba(255,255,255,0.22)'
const RING_BRIGHT  = 'rgba(255,255,255,0.55)'
const EDGE         = 'rgba(255,255,255,0.18)'
const EDGE_HOT     = 'rgba(255,122,31,0.75)'
const TEXT         = 'rgba(255,255,255,0.92)'
const TEXT_SOFT    = 'rgba(255,255,255,0.55)'
const TEXT_DIM     = 'rgba(255,255,255,0.32)'

// ─────────────────────────────────────────────────────────────────────────────
// Icon library — tiny canvas-path glyphs in the Lucide stroke style.
// Each icon draws inside a 24×24 box centred at (0,0). Kept hand-rolled to
// avoid pulling a heavy SVG-path parser into a canvas hot-loop.
// ─────────────────────────────────────────────────────────────────────────────
type IconKey =
  | 'core' | 'book' | 'brain' | 'user' | 'search' | 'clock'
  | 'concept' | 'person' | 'organization' | 'entity' | 'tool'
  | 'synthesis' | 'pattern' | 'event' | 'source' | 'query'

function drawIcon(ctx: CanvasRenderingContext2D, key: IconKey, size: number, stroke: string) {
  const s = size / 24
  ctx.save()
  ctx.scale(s, s)
  ctx.strokeStyle = stroke
  ctx.fillStyle = stroke
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (key) {
    case 'core':
    case 'brain':
    case 'concept': {
      // Two mirrored half-brain lobes.
      ctx.beginPath()
      ctx.moveTo(-2, -8); ctx.bezierCurveTo(-8, -8, -9, -2, -7, 0)
      ctx.bezierCurveTo(-9, 2, -8, 8, -2, 8); ctx.lineTo(-2, -8)
      ctx.moveTo(2, -8);  ctx.bezierCurveTo(8, -8, 9, -2, 7, 0)
      ctx.bezierCurveTo(9, 2, 8, 8, 2, 8);   ctx.lineTo(2, -8)
      ctx.stroke()
      break
    }
    case 'book':
    case 'source':
    case 'source-summary' as IconKey: {
      ctx.beginPath()
      ctx.moveTo(-7, -8); ctx.lineTo(-7, 8); ctx.lineTo(7, 8); ctx.lineTo(7, -8)
      ctx.lineTo(-4, -8); ctx.bezierCurveTo(-6, -8, -7, -7, -7, -5)
      ctx.stroke()
      ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(-4, 8); ctx.stroke()
      break
    }
    case 'user':
    case 'person': {
      ctx.beginPath(); ctx.arc(0, -3, 3.2, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-6, 8); ctx.bezierCurveTo(-6, 3, 6, 3, 6, 8)
      ctx.stroke()
      break
    }
    case 'search':
    case 'query':
    case 'query-answer' as IconKey: {
      ctx.beginPath(); ctx.arc(-1.5, -1.5, 5, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(2.5, 2.5); ctx.lineTo(7, 7); ctx.stroke()
      break
    }
    case 'clock':
    case 'event': {
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -4)
      ctx.moveTo(0, 0); ctx.lineTo(4, 2); ctx.stroke()
      break
    }
    case 'organization': {
      // Stacked rectangles — "org chart" feel.
      ctx.strokeRect(-7, -8, 14, 5)
      ctx.strokeRect(-7, -1, 14, 5)
      ctx.strokeRect(-7, 6, 14, 2)
      break
    }
    case 'entity': {
      // Hexagon.
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2
        const x = Math.cos(a) * 7.5
        const y = Math.sin(a) * 7.5
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath(); ctx.stroke()
      break
    }
    case 'tool': {
      // Wrench diagonal.
      ctx.beginPath()
      ctx.moveTo(-6, 6); ctx.lineTo(2, -2)
      ctx.arc(0, -4, 3.5, Math.PI * 0.25, Math.PI * 1.75, true)
      ctx.lineTo(-4, 4); ctx.closePath()
      ctx.stroke()
      break
    }
    case 'synthesis': {
      // Converging triangles.
      ctx.beginPath()
      ctx.moveTo(-8, -6); ctx.lineTo(0, 0); ctx.lineTo(-8, 6)
      ctx.moveTo(8, -6);  ctx.lineTo(0, 0); ctx.lineTo(8, 6)
      ctx.stroke()
      break
    }
    case 'pattern': {
      // Grid of dots.
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          ctx.beginPath()
          ctx.arc(i * 4, j * 4, 1.1, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break
    }
    default: {
      // Plain ring.
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke()
    }
  }
  ctx.restore()
}

function iconForType(type: string): IconKey {
  const map: Record<string, IconKey> = {
    concept: 'concept',
    person: 'person',
    organization: 'organization',
    entity: 'entity',
    tool: 'tool',
    synthesis: 'synthesis',
    pattern: 'pattern',
    event: 'event',
    'source-summary': 'book',
    'query-answer': 'search',
  }
  return map[type] ?? 'concept'
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo orbit — an ambient backdrop shown when the vault has no real nodes.
// Six-node hub-and-spoke layout, themed around the app's actual domain
// (knowledge / research) rather than arbitrary AI buzzwords.
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_NODES: GraphNode[] = [
  { id: 'core',      title: 'Core',      subtitle: 'Vault',      type: 'hub',     icon: 'core',   connectionCount: 5 },
  { id: 'sources',   title: 'Sources',   subtitle: 'Library',    type: 'source',  icon: 'book',   connectionCount: 1 },
  { id: 'concepts',  title: 'Concepts',  subtitle: 'Ideas',      type: 'concept', icon: 'brain',  connectionCount: 1 },
  { id: 'people',    title: 'People',    subtitle: 'Network',    type: 'person',  icon: 'user',   connectionCount: 1 },
  { id: 'queries',   title: 'Queries',   subtitle: 'Answers',    type: 'query',   icon: 'search', connectionCount: 1 },
  { id: 'timeline',  title: 'Timeline',  subtitle: 'Activity',   type: 'event',   icon: 'clock',  connectionCount: 1 },
]

const DEMO_EDGES: GraphEdge[] = [
  { source: 'core', target: 'sources'  },
  { source: 'core', target: 'concepts' },
  { source: 'core', target: 'people'   },
  { source: 'core', target: 'queries'  },
  { source: 'core', target: 'timeline' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Node sizing — real nodes scale with degree; demo nodes have fixed sizes so
// the hub reads as the focal point even when the viewport is small.
// ─────────────────────────────────────────────────────────────────────────────
// Larger nodes = more room for crisp typography. Hub reads as the focal
// point; satellites are still compact enough that 6 fit comfortably on a
// 1280-wide panel.
function realRadius(connectionCount: number) {
  return Math.min(38 + connectionCount * 3, 64)
}
function demoRadius(id: string) {
  return id === 'core' ? 74 : 58
}

export function KnowledgeGraph({ nodes, edges, selectedId, highlightId: _highlightId, focusNodeId, focusNonce, onNodeClick, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const physicsRef = useRef<PhysicsNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  const animRef = useRef<number>(0)
  const simStableRef = useRef(false)
  const isDemoRef = useRef(false)
  const hoveredRef = useRef<string | null>(null)
  const selectedIdRef = useRef<string | null>(selectedId ?? null)
  const dragRef = useRef<{ id: string; ox: number; oy: number; moved: boolean } | null>(null)
  const offsetRef = useRef({ x: 0, y: 0, scale: 1 })
  // Target viewport — render loop eases offsetRef toward this each frame.
  const targetRef = useRef<{ x: number; y: number; scale: number } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)
  const [, setTick] = useState(0) // keep for future tooltip use

  useEffect(() => {
    selectedIdRef.current = selectedId ?? null
  }, [selectedId])

  // ── Focus a node (from props) ──────────────────────────────────────────────
  // Pan the viewport so the target node lands in the canvas centre and zoom in
  // a touch so it reads as "this is the thing you asked about". The render
  // loop handles the ease so the user sees a fluid transition, not a snap.
  useEffect(() => {
    if (!focusNodeId) return
    const canvas = canvasRef.current
    if (!canvas) return
    const W = Number(canvas.dataset.cssW) || canvas.width
    const H = Number(canvas.dataset.cssH) || canvas.height
    const n = physicsRef.current.find(p => p.id === focusNodeId)
    if (!n) return
    const scale = Math.max(offsetRef.current.scale, 1.4)
    targetRef.current = {
      x: (W / 2 - n.x) * scale,
      y: (H / 2 - n.y) * scale,
      scale,
    }
  }, [focusNodeId, focusNonce])

  // ── Layout init ─────────────────────────────────────────────────────────────
  // Demo mode lays satellites on a fixed ring around the hub so the backdrop
  // reads as intentional design rather than a settled physics simulation.
  // Real data still uses the force-directed layout for arbitrary topologies.
  const layout = useCallback((ns: GraphNode[], es: GraphEdge[], demo: boolean) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const W = Number(canvas.dataset.cssW) || canvas.width
    const H = Number(canvas.dataset.cssH) || canvas.height

    if (demo) {
      const cx = W / 2
      const cy = H / 2
      const ring = Math.min(W, H) * 0.28
      const satellites = ns.filter(n => n.id !== 'core')
      physicsRef.current = ns.map((node) => {
        if (node.id === 'core') {
          return { ...node, x: cx, y: cy, vx: 0, vy: 0, radius: demoRadius(node.id) }
        }
        const idx = satellites.findIndex(n => n.id === node.id)
        // Start from -90° so the first satellite sits above the hub.
        const angle = (idx / satellites.length) * Math.PI * 2 - Math.PI / 2
        return {
          ...node,
          x: cx + Math.cos(angle) * ring,
          y: cy + Math.sin(angle) * ring,
          vx: 0, vy: 0,
          radius: demoRadius(node.id),
        }
      })
      edgesRef.current = es
      simStableRef.current = true // no physics in demo
      return
    }

    const existing = new Map(physicsRef.current.map(n => [n.id, n]))
    physicsRef.current = ns.map(node => {
      const prev = existing.get(node.id)
      const radius = realRadius(node.connectionCount)
      return prev
        ? { ...node, x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy, radius }
        : {
          ...node,
          x: W / 2 + (Math.random() - 0.5) * W * 0.5,
          y: H / 2 + (Math.random() - 0.5) * H * 0.5,
          vx: 0, vy: 0,
          radius,
        }
    })
    edgesRef.current = es
    simStableRef.current = false
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    offsetRef.current = { x: 0, y: 0, scale: 1 }
  }, [nodes.length])

  useEffect(() => {
    const demo = nodes.length === 0
    isDemoRef.current = demo
    const ns = demo ? DEMO_NODES : nodes
    const es = demo ? DEMO_EDGES : edges
    layout(ns, es, demo)
  }, [nodes, edges, layout])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    // Size the backing store at devicePixelRatio so strokes and text render
    // at native resolution (the difference between "crisp" and "fuzzy" on a
    // retina display). Drawing is still expressed in CSS pixels thanks to the
    // ctx.scale(dpr, dpr) in the render loop — we store the intended CSS size
    // on dataset so the loop reads the logical dimensions, not the backing.
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = parent.clientWidth
      const h = parent.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      canvas.dataset.cssW = String(w)
      canvas.dataset.cssH = String(h)
      canvas.dataset.dpr = String(dpr)
      if (isDemoRef.current) layout(DEMO_NODES, DEMO_EDGES, true)
      else simStableRef.current = false
    }

    const ro = new ResizeObserver(resize)
    ro.observe(parent)
    resize()
    if (isDemoRef.current) layout(DEMO_NODES, DEMO_EDGES, true)

    return () => ro.disconnect()
  }, [layout])

  // ── Render + physics loop ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame = 0
    const step = () => {
      animRef.current = requestAnimationFrame(step)
      frame++
      const nodes = physicsRef.current
      const edges = edgesRef.current
      // Work in CSS pixels; dpr scaling is applied once per frame below.
      const W = Number(canvas.dataset.cssW) || canvas.width
      const H = Number(canvas.dataset.cssH) || canvas.height
      const dpr = Number(canvas.dataset.dpr) || 1
      const cx = W / 2
      const cy = H / 2
      // Ease viewport toward any pending focus target.
      if (targetRef.current) {
        const t = targetRef.current
        const cur = offsetRef.current
        const nx = cur.x + (t.x - cur.x) * 0.15
        const ny = cur.y + (t.y - cur.y) * 0.15
        const ns = cur.scale + (t.scale - cur.scale) * 0.15
        offsetRef.current = { x: nx, y: ny, scale: ns }
        if (Math.abs(t.x - nx) < 0.5 && Math.abs(t.y - ny) < 0.5 && Math.abs(t.scale - ns) < 0.002) {
          offsetRef.current = { x: t.x, y: t.y, scale: t.scale }
          targetRef.current = null
        }
      }

      const { x: ox, y: oy, scale } = offsetRef.current
      const demo = isDemoRef.current
      const selId = selectedIdRef.current
      const hovId = hoveredRef.current

      // ── Physics (real-data only) ──────────────────────────────────────────
      if (!demo && !simStableRef.current) {
        const REPEL = 2400
        const SPRING = 0.04
        const REST = 160
        const GRAVITY = 0.018
        const DAMP = 0.82

        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j]
            const dx = b.x - a.x, dy = b.y - a.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const force = REPEL / (dist * dist)
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            a.vx -= fx; a.vy -= fy
            b.vx += fx; b.vy += fy
          }
        }

        const nodeMap = new Map(nodes.map(n => [n.id, n]))
        for (const e of edges) {
          const a = nodeMap.get(e.source); const b = nodeMap.get(e.target)
          if (!a || !b) continue
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = SPRING * (dist - REST)
          const fx = (dx / dist) * force, fy = (dy / dist) * force
          a.vx += fx; a.vy += fy
          b.vx -= fx; b.vy -= fy
        }

        let totalKE = 0
        for (const n of nodes) {
          n.vx += (cx - n.x) * GRAVITY
          n.vy += (cy - n.y) * GRAVITY
          n.vx *= DAMP; n.vy *= DAMP
          n.x += n.vx; n.y += n.vy
          totalKE += n.vx * n.vx + n.vy * n.vy
        }
        if (frame > 120 && totalKE < 0.5) simStableRef.current = true
      }

      // ── Draw ───────────────────────────────────────────────────────────────
      // Clear in backing-store pixels, then scale the context so the rest of
      // the render code can work in CSS pixels. textRendering + imageSmoothing
      // give strokes and glyphs the crispest path to the backing store.
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.scale(dpr, dpr)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.save()
      ctx.translate(cx + ox, cy + oy)
      ctx.scale(scale, scale)
      ctx.translate(-cx, -cy)

      // Compute each node's actual render position (including ambient bob)
      // so edges and hit-test both agree with the drawn card.
      const indexById = new Map(nodes.map((n, i) => [n.id, i]))
      const renderPos = (n: PhysicsNode) => {
        if (!demo || n.id === 'core') return { x: n.x, y: n.y }
        const dx = n.x - cx, dy = n.y - cy
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const off = Math.sin(frame / 48 + (indexById.get(n.id) ?? 0) * 1.3) * 3
        return { x: n.x + (dx / dist) * off, y: n.y + (dy / dist) * off }
      }
      const nodeMap = new Map(nodes.map(n => [n.id, n]))

      // Edges first — thin line with a small dot marker at the midpoint.
      // Lines terminate at the node's visual border, not its centre, so the
      // marker stays visible and the geometry reads cleanly.
      for (const e of edges) {
        const a = nodeMap.get(e.source)
        const b = nodeMap.get(e.target)
        if (!a || !b) continue

        const pa = renderPos(a); const pb = renderPos(b)
        const dx = pb.x - pa.x, dy = pb.y - pa.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const ux = dx / dist, uy = dy / dist
        const ax = pa.x + ux * a.radius
        const ay = pa.y + uy * a.radius
        const bx = pb.x - ux * b.radius
        const by = pb.y - uy * b.radius

        const touchesSel = selId && (e.source === selId || e.target === selId)
        ctx.strokeStyle = touchesSel ? EDGE_HOT : EDGE
        ctx.lineWidth = touchesSel ? 1.4 : 1

        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()

        // Midpoint dot marker — reads as "pulse" along the connection.
        const mx = (ax + bx) / 2
        const my = (ay + by) / 2
        ctx.fillStyle = touchesSel ? ACCENT : RING_BRIGHT
        ctx.beginPath()
        ctx.arc(mx, my, touchesSel ? 3 : 2.4, 0, Math.PI * 2)
        ctx.fill()
      }

      // Ambient motion — satellites in demo mode bob gently on their radial
      // axis (different phase per index) and the hub glow breathes. Real-data
      // nodes stay pinned to the physics solve so panning feels deterministic.
      const bob = (id: string, index: number) => {
        if (!demo || id === 'core') return 0
        return Math.sin(frame / 48 + index * 1.3) * 3
      }
      const hubPulse = demo ? (Math.sin(frame / 52) * 0.12 + 0.88) : 1

      // Viewport culling — skip nodes that fall entirely outside the visible
      // world rect. At scale=1 this is a no-op for small graphs; at 10k+ nodes
      // or heavy zoom-in it cuts the per-frame cost to what's actually visible.
      // World-space visible rect: invert the render transform on (0..W, 0..H).
      const visLeft   = (0 - cx - ox) / scale + cx
      const visRight  = (W - cx - ox) / scale + cx
      const visTop    = (0 - cy - oy) / scale + cy
      const visBottom = (H - cy - oy) / scale + cy

      // Nodes — circular cards with icon + title + subtitle.
      nodes.forEach((n, index) => {
        // Cull if the whole card (centre ± radius) sits outside the viewport.
        if (n.x + n.radius < visLeft || n.x - n.radius > visRight ||
            n.y + n.radius < visTop  || n.y - n.radius > visBottom) return
        const isSelected = n.id === selId
        const isHovered  = n.id === hovId
        const isHub      = demo && n.id === 'core'
        const r = n.radius

        // Apply ambient bob along the vector from hub outward so satellites
        // breathe radially rather than drifting sideways.
        let drawX = n.x, drawY = n.y
        if (demo && !isHub) {
          const dx = n.x - cx, dy = n.y - cy
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const off = bob(n.id, index)
          drawX += (dx / dist) * off
          drawY += (dy / dist) * off
        }

        const connected = selId
          ? edges.some(e => (e.source === selId && e.target === n.id) || (e.target === selId && e.source === n.id))
          : false
        const dim = selId && !isSelected && !connected

        // Subtle accent wash behind the hub / selected node.
        if (isHub || isSelected) {
          const glowR = r * (2.4 + (isHub ? hubPulse * 0.6 : 0))
          const glow = ctx.createRadialGradient(drawX, drawY, r * 0.4, drawX, drawY, glowR)
          glow.addColorStop(0, ACCENT_SOFT)
          glow.addColorStop(1, 'rgba(255,122,31,0)')
          ctx.beginPath()
          ctx.arc(drawX, drawY, glowR, 0, Math.PI * 2)
          ctx.fillStyle = glow
          ctx.fill()
        }

        // Card fill — radial so the top-left edge reads as lit.
        const cardGrd = ctx.createRadialGradient(drawX - r * 0.4, drawY - r * 0.5, 0, drawX, drawY, r)
        cardGrd.addColorStop(0, CARD_HIGH)
        cardGrd.addColorStop(1, CARD_FILL)
        ctx.beginPath()
        ctx.arc(drawX, drawY, r, 0, Math.PI * 2)
        ctx.fillStyle = cardGrd
        ctx.globalAlpha = dim ? 0.35 : 1
        ctx.fill()

        // Ring.
        ctx.beginPath()
        ctx.arc(drawX, drawY, r, 0, Math.PI * 2)
        ctx.strokeStyle = isSelected || isHub
          ? ACCENT
          : isHovered ? RING_BRIGHT : RING
        ctx.lineWidth = isSelected || isHub ? 1.5 : 1
        ctx.stroke()
        ctx.globalAlpha = 1

        // Icon + labels. Layout: icon above centre, title on centre, subtitle
        // as a mono label below centre. Larger sizes + tracked subtitle read
        // cleanly at DPR 1/1.5/2.
        const showCompact = r < 42
        const iconKey: IconKey = n.icon ?? iconForType(n.type)
        const iconSize = showCompact ? 18 : 24
        const titleSize = showCompact ? 12 : 14
        const subSize   = showCompact ? 9  : 10

        // Vertical rhythm relative to the centre: icon, title, subtitle.
        const iconY  = drawY - (showCompact ? 13 : 17)
        const titleY = drawY + (showCompact ? 6 : 9)
        const subY   = drawY + (showCompact ? 22 : 26)

        ctx.save()
        ctx.translate(drawX, iconY)
        drawIcon(ctx, iconKey, iconSize, dim ? TEXT_DIM : TEXT)
        ctx.restore()

        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // Title — crisp, 600 weight, -0.02em tracking via letterSpacing.
        ctx.fillStyle = dim ? TEXT_DIM : TEXT
        ctx.font = `600 ${titleSize}px -apple-system, "SF Pro Text", "Inter", system-ui, sans-serif`
        const maxTitleChars = showCompact ? 10 : 14
        const title = n.title.length > maxTitleChars ? n.title.slice(0, maxTitleChars - 1) + '…' : n.title
        ctx.fillText(title, drawX, titleY)

        // Subtitle — mono + uppercase + tracking, sized as a meta label.
        const sub = n.subtitle
        if (sub && r >= 40) {
          ctx.fillStyle = dim ? TEXT_DIM : TEXT_SOFT
          ctx.font = `500 ${subSize}px "SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace`
          const letterSpaced = sub.toUpperCase().split('').join('\u2009') // thin-space tracking
          ctx.fillText(letterSpaced, drawX, subY)
        }
      })

      ctx.restore()
    }

    step()
    return () => cancelAnimationFrame(animRef.current)
  }, [])

  // ── Hit test (world space) ─────────────────────────────────────────────────
  const hitTest = useCallback((ex: number, ey: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const px = ex - rect.left
    const py = ey - rect.top
    const { x: ox, y: oy, scale } = offsetRef.current
    // Work in CSS pixels so the hit-test geometry matches the drawn cards.
    const W = Number(canvas.dataset.cssW) || canvas.width
    const H = Number(canvas.dataset.cssH) || canvas.height
    const wx = (px - (W / 2 + ox)) / scale + W / 2
    const wy = (py - (H / 2 + oy)) / scale + H / 2

    for (const n of physicsRef.current) {
      const dx = wx - n.x, dy = wy - n.y
      if (dx * dx + dy * dy <= (n.radius + 2) * (n.radius + 2)) return n
    }
    return null
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (panRef.current) {
      offsetRef.current = {
        ...offsetRef.current,
        x: panRef.current.ox + (e.clientX - panRef.current.startX),
        y: panRef.current.oy + (e.clientY - panRef.current.startY),
      }
      return
    }
    if (dragRef.current) {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const { x: ox, y: oy, scale } = offsetRef.current
      const W = Number(canvas.dataset.cssW) || canvas.width
      const H = Number(canvas.dataset.cssH) || canvas.height
      const wx = (e.clientX - rect.left - (W / 2 + ox)) / scale + W / 2
      const wy = (e.clientY - rect.top - (H / 2 + oy)) / scale + H / 2
      const n = physicsRef.current.find(n => n.id === dragRef.current!.id)
      if (n) {
        const dx = wx - n.x, dy = wy - n.y
        if (dx * dx + dy * dy > 4) dragRef.current.moved = true
        n.x = wx; n.y = wy; n.vx = 0; n.vy = 0
      }
      return
    }

    const hit = hitTest(e.clientX, e.clientY)
    hoveredRef.current = hit?.id ?? null
    const cv = canvasRef.current
    if (cv) cv.style.cursor = hit ? 'pointer' : ''
    setTick(t => (t + 1) & 0xff) // trigger a re-render so React knows hover state moved
  }, [hitTest])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const hit = hitTest(e.clientX, e.clientY)
    if (hit) {
      // Every node is draggable — in demo mode this lets users reshape the
      // orbit, which is the "move over" affordance the product asks for.
      dragRef.current = { id: hit.id, ox: hit.x, oy: hit.y, moved: false }
      simStableRef.current = false
      // Cancel any in-flight focus ease once the user takes manual control.
      targetRef.current = null
    } else {
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        ox: offsetRef.current.x,
        oy: offsetRef.current.y,
      }
      targetRef.current = null
    }
  }, [hitTest])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const hit = hitTest(e.clientX, e.clientY)
    const canvas = canvasRef.current
    if (!canvas) return
    const W = Number(canvas.dataset.cssW) || canvas.width
    const H = Number(canvas.dataset.cssH) || canvas.height
    if (!hit) {
      // Empty-area double-click: reset viewport.
      targetRef.current = { x: 0, y: 0, scale: 1 }
      return
    }
    const scale = Math.max(offsetRef.current.scale, 1.6)
    targetRef.current = {
      x: (W / 2 - hit.x) * scale,
      y: (H / 2 - hit.y) * scale,
      scale,
    }
    onNodeClick(hit)
  }, [hitTest, onNodeClick])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const wasDrag = dragRef.current
    const wasPan = panRef.current
    dragRef.current = null
    panRef.current = null

    const hit = hitTest(e.clientX, e.clientY)

    if (wasDrag) {
      // A pure click (no drag motion) should still select the node — without
      // this, click-on-node would be swallowed by the drag branch.
      if (!wasDrag.moved && hit && hit.id === wasDrag.id) onNodeClick(hit)
      return
    }

    if (wasPan) {
      const dx = Math.abs(offsetRef.current.x - wasPan.ox)
      const dy = Math.abs(offsetRef.current.y - wasPan.oy)
      if (dx < 4 && dy < 4) {
        // Treat as a click — either select the hit node or deselect.
        if (hit) onNodeClick(hit)
        else onNodeClick(null)
      }
    }
  }, [hitTest, onNodeClick])

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    // Cancel any focus ease the moment the user scrolls — they took over.
    targetRef.current = null
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    offsetRef.current = {
      ...offsetRef.current,
      scale: Math.max(0.3, Math.min(3, offsetRef.current.scale * factor)),
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = null
    dragRef.current = null
    panRef.current = null
  }, [])

  return (
    <div className={`relative w-full h-full ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  )
}
