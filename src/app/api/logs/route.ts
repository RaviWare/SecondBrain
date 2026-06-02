import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Log } from '@/lib/models'

const OPERATIONS = ['ingest', 'query', 'lint'] as const

// Logs within this many days are protected from the default "clear all".
const RETENTION_DAYS = 14

/**
 * Build the Mongo filter from query params, scoped to the user.
 *  - op:    operation type (ingest|query|lint), optional
 *  - from:  ISO date (inclusive lower bound on createdAt), optional
 *  - to:    ISO date (inclusive upper bound on createdAt), optional
 *  - month: YYYY-MM convenience (expands to the whole month), optional
 *  - year:  YYYY convenience (expands to the whole year), optional
 */
function buildFilter(userId: string, params: URLSearchParams): Record<string, unknown> {
  const filter: Record<string, unknown> = { userId }

  const op = params.get('op')
  if (op && (OPERATIONS as readonly string[]).includes(op)) filter.operation = op

  const range: Record<string, Date> = {}
  const from = params.get('from')
  const to = params.get('to')
  const month = params.get('month') // YYYY-MM
  const year = params.get('year')   // YYYY

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    range.$gte = new Date(Date.UTC(y, m - 1, 1))
    range.$lt = new Date(Date.UTC(y, m, 1))
  } else if (year && /^\d{4}$/.test(year)) {
    const y = Number(year)
    range.$gte = new Date(Date.UTC(y, 0, 1))
    range.$lt = new Date(Date.UTC(y + 1, 0, 1))
  } else {
    if (from && !Number.isNaN(Date.parse(from))) range.$gte = new Date(from)
    if (to && !Number.isNaN(Date.parse(to))) {
      // inclusive end-of-day for a plain date
      const d = new Date(to)
      d.setUTCHours(23, 59, 59, 999)
      range.$lte = d
    }
  }
  if (Object.keys(range).length) filter.createdAt = range

  return filter
}

function toCSV(rows: Array<Record<string, unknown>>): string {
  const headers = ['createdAt', 'operation', 'summary', 'tokensUsed', 'pagesAffected']
  const escape = (v: unknown) => {
    const s = Array.isArray(v) ? v.join('; ') : String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map(h => escape(r[h])).join(','))
  return lines.join('\n')
}

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const { searchParams } = new URL(req.url)
  const filter = buildFilter(userId, searchParams)

  // Export path: stream the full filtered set as a download (JSON or CSV).
  const format = searchParams.get('export')
  if (format === 'json' || format === 'csv') {
    const rows = await Log.find(filter, 'operation summary tokensUsed pagesAffected createdAt')
      .sort({ createdAt: -1 })
      .lean()
    const stamp = new Date().toISOString().slice(0, 10)
    if (format === 'csv') {
      const csv = toCSV(rows as unknown as Array<Record<string, unknown>>)
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="activity-log-${stamp}.csv"`,
        },
      })
    }
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="activity-log-${stamp}.json"`,
      },
    })
  }

  // Paginated list.
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 30))
  const skip = (page - 1) * pageSize

  const [logs, total] = await Promise.all([
    Log.find(filter, 'operation summary tokensUsed pagesAffected createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    Log.countDocuments(filter),
  ])

  // Retention status (unfiltered, user-scoped): how much history sits OUTSIDE
  // vs. INSIDE the protected 14-day window. Drives the gated clear-all flow:
  // the force-delete option only unlocks once older history is already gone.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const [olderCount, recentCount] = await Promise.all([
    Log.countDocuments({ userId, createdAt: { $lt: cutoff } }),
    Log.countDocuments({ userId, createdAt: { $gte: cutoff } }),
  ])

  return NextResponse.json({
    logs,
    total,
    page,
    pageSize,
    hasMore: skip + logs.length < total,
    retention: { days: RETENTION_DAYS, olderCount, recentCount },
  })
}

/**
 * Selective deletion. Body options (all scoped to the user's own logs):
 *  - { ids: string[] }            delete specific entries
 *  - { op, from, to, month, year} delete everything matching the same filter as GET
 *  - { all: true }                clear history, but PRESERVE the last 14 days
 *  - { all: true, force: true }   clear EVERYTHING incl. the last 14 days
 * Returns the deleted count and how many recent entries were preserved.
 * Irreversible.
 */
export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const body = await req.json().catch(() => ({}))

  // Cutoff: logs at or after this instant are within the protected window.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  let filter: Record<string, unknown>
  let preserved = 0

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    // Explicit per-entry deletes always honor the user's exact selection.
    filter = { userId, _id: { $in: body.ids } }
  } else if (body.all === true) {
    if (body.force === true) {
      // Forced clear — everything, including the last 14 days (UI double-confirms).
      filter = { userId }
    } else {
      // Default clear — preserve the last RETENTION_DAYS of history.
      filter = { userId, createdAt: { $lt: cutoff } }
      preserved = await Log.countDocuments({ userId, createdAt: { $gte: cutoff } })
    }
  } else {
    // Reuse the same filter semantics as GET, from the body.
    const params = new URLSearchParams()
    for (const k of ['op', 'from', 'to', 'month', 'year']) {
      if (body[k]) params.set(k, String(body[k]))
    }
    if ([...params.keys()].length === 0) {
      return NextResponse.json(
        { error: 'Provide ids, a date/op filter, or all:true to delete logs.' },
        { status: 400 },
      )
    }
    filter = buildFilter(userId, params)
  }

  const res = await Log.deleteMany(filter)
  return NextResponse.json({
    ok: true,
    deleted: res.deletedCount ?? 0,
    preserved,
    retentionDays: RETENTION_DAYS,
  })
}
