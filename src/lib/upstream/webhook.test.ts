import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { adminWebhookConfigured, notifyAdminWebhook } from './webhook'

let saved: string | undefined
beforeEach(() => { saved = process.env.ADMIN_ALERT_WEBHOOK_URL })
afterEach(() => {
  if (saved === undefined) delete process.env.ADMIN_ALERT_WEBHOOK_URL
  else process.env.ADMIN_ALERT_WEBHOOK_URL = saved
  vi.restoreAllMocks()
})

const alert = { title: 'New release v2', body: 'details', url: 'https://github.com/x/y/releases/tag/v2' }

describe('admin webhook', () => {
  it('is a no-op when unset', async () => {
    delete process.env.ADMIN_ALERT_WEBHOOK_URL
    const fetchSpy = vi.fn()
    const sent = await notifyAdminWebhook(alert, fetchSpy as unknown as typeof fetch)
    expect(sent).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(adminWebhookConfigured()).toBe(false)
  })

  it('rejects a non-https url (no request sent)', async () => {
    process.env.ADMIN_ALERT_WEBHOOK_URL = 'http://insecure.example/hook'
    const fetchSpy = vi.fn()
    const sent = await notifyAdminWebhook(alert, fetchSpy as unknown as typeof fetch)
    expect(sent).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('POSTs to a configured https webhook with both text and content keys', async () => {
    process.env.ADMIN_ALERT_WEBHOOK_URL = 'https://hooks.example/abc'
    const fetchSpy = vi.fn(async () => ({ ok: true }) as Response)
    const sent = await notifyAdminWebhook(alert, fetchSpy as unknown as typeof fetch)
    expect(sent).toBe(true)
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(init.body as string)
    expect(payload.text).toContain('New release v2')
    expect(payload.content).toContain('New release v2')
  })

  it('never throws on fetch failure', async () => {
    process.env.ADMIN_ALERT_WEBHOOK_URL = 'https://hooks.example/abc'
    const fetchSpy = vi.fn(async () => { throw new Error('network down') })
    const sent = await notifyAdminWebhook(alert, fetchSpy as unknown as typeof fetch)
    expect(sent).toBe(false)
  })
})
