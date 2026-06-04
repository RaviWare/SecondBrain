// ── Shared link lifecycle service ─────────────────────────────────────────────
// Channel-agnostic async operations behind the per-channel API routes: mint a
// link (pending + code), report status, update notify prefs, revoke, and confirm
// a code → bind a chat id. Keeps each channel route thin; the channel-specific
// bits (how the code reaches us, how we deliver) live in the channel clients.

import { connectDB } from '@/lib/mongodb'
import { MessagingLink, type IMessagingLink } from '@/lib/models'
import { mintLinkCode, isCodeValid } from './link-code'

export type Channel = 'telegram' | 'whatsapp' | 'email' | 'discord'

const ACTIVE = ['pending', 'linked'] as const

export type LinkView = {
  status: 'none' | 'pending' | 'linked'
  handle: string | null
  code: string | null
  notify: { proposals: boolean; runs: boolean; support: boolean }
  linkedAt: string | null
}

function view(link: IMessagingLink | null): LinkView {
  if (!link) return { status: 'none', handle: null, code: null, notify: defaultNotify(), linkedAt: null }
  return {
    status: link.status === 'linked' ? 'linked' : 'pending',
    handle: link.handle ?? null,
    code: link.status === 'pending' ? link.linkCode : null,
    notify: link.notify ?? defaultNotify(),
    linkedAt: link.linkedAt ? new Date(link.linkedAt).toISOString() : null,
  }
}

function defaultNotify() {
  return { proposals: true, runs: false, support: true }
}

/** Current active link view for a user+channel. */
export async function getLink(userId: string, channel: Channel): Promise<LinkView> {
  await connectDB()
  const link = await MessagingLink.findOne({ userId, channel, status: { $in: ACTIVE } })
  return view(link)
}

/** Mint a fresh code + enter pending (no-op clobber when already linked). */
export async function startLink(userId: string, channel: Channel): Promise<LinkView> {
  await connectDB()
  const existing = await MessagingLink.findOne({ userId, channel, status: { $in: ACTIVE } })
  if (existing && existing.status === 'linked') return view(existing)

  const { code, expiresAt } = mintLinkCode()
  if (existing) {
    existing.status = 'pending'
    existing.linkCode = code
    existing.linkCodeExpiresAt = new Date(expiresAt)
    await existing.save()
    return view(existing)
  }
  const created = await MessagingLink.create({
    userId, channel, status: 'pending', linkCode: code, linkCodeExpiresAt: new Date(expiresAt),
  })
  return view(created)
}

/** Update notify preferences on the linked record. Returns the new prefs or null. */
export async function updateNotify(
  userId: string,
  channel: Channel,
  notify: { proposals: boolean; runs: boolean; support: boolean },
): Promise<{ proposals: boolean; runs: boolean; support: boolean } | null> {
  await connectDB()
  const link = await MessagingLink.findOne({ userId, channel, status: 'linked' })
  if (!link) return null
  link.notify = { proposals: !!notify.proposals, runs: !!notify.runs, support: !!notify.support }
  await link.save()
  return link.notify
}

/** Revoke the active link for a user+channel. */
export async function revokeLink(userId: string, channel: Channel): Promise<void> {
  await connectDB()
  await MessagingLink.updateMany(
    { userId, channel, status: { $in: ACTIVE } },
    { $set: { status: 'revoked', chatId: null, linkCode: null, linkCodeExpiresAt: null } },
  )
}

/**
 * Confirm a presented code and bind the channel-native chat id. Used by inbound
 * webhooks (Telegram/Discord/WhatsApp) and the email confirm endpoint. Returns
 * true when a pending link matched + was activated. Scoped by channel; if a
 * `userId` is given (email confirm), it is also matched.
 */
export async function confirmCode(
  channel: Channel,
  code: string,
  chatId: string,
  handle: string | null,
  opts: { userId?: string } = {},
): Promise<boolean> {
  await connectDB()
  const filter: Record<string, unknown> = { channel, status: 'pending', linkCode: code }
  if (opts.userId) filter.userId = opts.userId
  const link = await MessagingLink.findOne(filter)
  if (!link || !isCodeValid(code, link.linkCode, link.linkCodeExpiresAt)) return false
  link.status = 'linked'
  link.chatId = chatId
  link.handle = handle
  link.linkCode = null
  link.linkCodeExpiresAt = null
  link.linkedAt = new Date()
  link.lastMessageAt = new Date()
  await link.save()
  return true
}
