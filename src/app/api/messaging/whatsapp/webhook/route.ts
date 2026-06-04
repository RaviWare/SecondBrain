// ── /api/messaging/whatsapp/webhook — Meta Cloud API → us ─────────────────────
// GET  → Meta's verification handshake (echoes hub.challenge when the verify
//        token matches WHATSAPP_VERIFY_TOKEN).
// POST → inbound messages. A message containing a valid link code binds that
//        phone number to the pending link; otherwise we reply (best-effort) with
//        help text. Never 500s back to Meta.
import { NextRequest, NextResponse } from 'next/server'
import { agentLog } from '@/lib/agents/redact'
import { extractLinkCode } from '@/lib/messaging/link-code'
import { confirmCode } from '@/lib/messaging/link-service'
import { whatsappConfigured, sendWhatsAppMessage } from '@/lib/messaging/whatsapp'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')
  const expected = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  if (!whatsappConfigured()) return NextResponse.json({ ok: true })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: true }) }

  try {
    // Navigate the Cloud API webhook shape: entry[].changes[].value.messages[].
    const entry = (body.entry as Array<Record<string, unknown>> | undefined)?.[0]
    const change = (entry?.changes as Array<Record<string, unknown>> | undefined)?.[0]
    const value = change?.value as Record<string, unknown> | undefined
    const messages = value?.messages as Array<Record<string, unknown>> | undefined
    const msg = messages?.[0]
    if (!msg) return NextResponse.json({ ok: true })

    const from = typeof msg.from === 'string' ? msg.from : null // sender phone (digits)
    const text = ((msg.text as Record<string, unknown> | undefined)?.body as string) ?? ''
    if (!from) return NextResponse.json({ ok: true })

    const code = extractLinkCode(text)
    if (code) {
      const ok = await confirmCode('whatsapp', code, from, from)
      await sendWhatsAppMessage(
        from,
        ok
          ? '✅ Linked. Your SecondBrain squad will message you here when something needs you.'
          : '⚠️ That link code is invalid or expired. Open SecondBrain → Integrations → WhatsApp for a fresh one.',
      )
    } else {
      await sendWhatsAppMessage(
        from,
        'To connect this number, open SecondBrain → Integrations → WhatsApp and send the code it gives you.',
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    agentLog.error('[messaging/whatsapp/webhook] handler failed', err)
    return NextResponse.json({ ok: true })
  }
}
