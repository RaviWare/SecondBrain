import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { adminUserIds, isAdminUser } from './admin'

let saved: string | undefined
beforeEach(() => { saved = process.env.ADMIN_USER_IDS })
afterEach(() => {
  if (saved === undefined) delete process.env.ADMIN_USER_IDS
  else process.env.ADMIN_USER_IDS = saved
})

describe('admin allow-list', () => {
  it('nobody is admin when unset', () => {
    delete process.env.ADMIN_USER_IDS
    expect(isAdminUser('user_123')).toBe(false)
    expect(adminUserIds().size).toBe(0)
  })

  it('parses comma and whitespace separated ids', () => {
    process.env.ADMIN_USER_IDS = 'user_a, user_b\nuser_c   user_d'
    const ids = adminUserIds()
    expect(ids.has('user_a')).toBe(true)
    expect(ids.has('user_b')).toBe(true)
    expect(ids.has('user_c')).toBe(true)
    expect(ids.has('user_d')).toBe(true)
  })

  it('matches only exact ids', () => {
    process.env.ADMIN_USER_IDS = 'user_admin'
    expect(isAdminUser('user_admin')).toBe(true)
    expect(isAdminUser('user_admin_2')).toBe(false)
    expect(isAdminUser('')).toBe(false)
    expect(isAdminUser(null)).toBe(false)
    expect(isAdminUser(undefined)).toBe(false)
  })
})
