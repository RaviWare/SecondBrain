// ── /api/messaging/email — Clerk-authed Email link management ─────────────────
// GET status · POST { address } emails a one-time code · PUT { code } confirms it
// · PATCH notify prefs · DELETE revoke. No inbound webhook: the user types the
// emailed code back into the app to prove they own the address.
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { MessagingLink } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { getLink, startLink, updateNotify, revokeLink, confirmCode } from '@/lib/messaging/link-service'
import { emailConfigured, sendEmail } from '@/lib/messaging/email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!emailConfigured()) return NextResponse.json({ configured: false, status: 'unconfigured' })
  try {
    const link = await getLink(userId, 'email')
    // For email we never expose the code to the browser (it's sent to the inbox);
    // surface only whether we're awaiting confirmation.
    return NextResponse.json({ configured: true, status: link.status, handle: link.handle, notify: link.notify, linkedAt: link.linkedAt })
  } catch (err) {
    agentLog.error('[messaging/email] status failed', err)
    return NextResponse.json({ error: 'Could not load status' }, { status: 500 })
  }
}

/** POST { address } → mint a code and EMAIL it (never returned to the client). */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!emailConfigured()) return NextResponse.json({ error: 'Email is not configured.' }, { status: 503 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const address = typeof body.address === 'string' ? body.address.trim() : ''
  if (!EMAIL_RE.test(address)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })

  try {
    const link = await startLink(userId, 'email')
    // Stash the target address on the (pending) link's handle so confirm can bind it.
    await connectDB()
    await MessagingLink.updateOne({ userId, channel: 'email', status: 'pending' }, { $set: { handle: address } })

    const code = link.code
    if (!code) return NextResponse.json({ error: 'Could not generate a code.' }, { status: 500 })
    const sent = await sendEmail(
      address,
      'Confirm your SecondBrain email alerts',
      `<p>Enter this code in SecondBrain → Integrations → Email to confirm alerts:</p>` +
        `<p style="font-size:22px;font-weight:700;letter-spacing:.1em">${code}</p>` +
        `<p style="color:#888;font-size:12px">This code expires in 15 minutes. If you didn't request it, ignore this email.</p>`,
    )
    if (!sent.ok) return NextResponse.json({ error: 'Could not send the email.' }, { status: 502 })
    return NextResponse.json({ status: 'pending', address })
  } catch (err) {
    agentLog.error('[messaging/email] mint failed', err)
    return NextResponse.json({ error: 'Could not start linking' }, { status: 500 })
  }
}

/** PUT { code } → confirm the emailed code and bind the address. */
export async function PUT(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const code = typeof body.code === 'string' ? body.code.trim().toLowerCase() : ''
  if (!code) return NextResponse.json({ error: 'Enter the code from your email.' }, { status: 400 })

  try {
    await connectDB()
    const pending = await MessagingLink.findOne({ userId, channel: 'email', status: 'pending' }).lean()
    const address = pending?.handle ?? ''
    const ok = await confirmCode('email', code, address, address, { userId })
    if (!ok) return NextResponse.json({ error: 'That code is invalid or expired.' }, { status: 400 })
    return NextResponse.json({ ok: true, status: 'linked' })
  } catch (err) {
    agentLog.error('[messaging/email] confirm failed', err)
    return NextResponse.json({ error: 'Could not confirm the code.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const n = (body.notify ?? {}) as Record<string, unknown>
  try {
    const notify = await updateNotify(userId, 'email', { proposals: n.proposals === true, runs: n.runs === true, support: n.support === true })
    if (!notify) return NextResponse.json({ error: 'No linked email' }, { status: 404 })
    return NextResponse.json({ ok: true, notify })
  } catch (err) {
    agentLog.error('[messaging/email] prefs failed', err)
    return NextResponse.json({ error: 'Could not update preferences' }, { status: 500 })
  }
}

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await revokeLink(userId, 'email')
    return NextResponse.json({ ok: true })
  } catch (err) {
    agentLog.error('[messaging/email] revoke failed', err)
    return NextResponse.json({ error: 'Could not revoke link' }, { status: 500 })
  }
}
