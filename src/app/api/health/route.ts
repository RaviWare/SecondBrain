// ── /api/health — public liveness probe (for Coolify / Traefik health checks) ──
// Unauthenticated, dependency-free, and fast. Returns 200 + minimal JSON whenever
// the Next.js server process is up and serving. We deliberately do NOT touch the
// database here: a liveness probe should report "is the app process alive and
// routing?" — not "is Mongo reachable?". Coupling the health check to the DB would
// make a transient DB blip tear down a perfectly-serving container (and the app
// already degrades gracefully on DB errors per-route). If you later want a deeper
// READINESS probe, add a separate endpoint that pings the DB with a short timeout.
//
// Coolify Healthcheck config: Path = /api/health, Port = 3000, Method = GET.
import { NextResponse } from 'next/server'

// Never statically prerender — always answer live.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    { status: 'ok', service: 'secondbrain', ts: new Date().toISOString() },
    { status: 200 },
  )
}
