// Unit tests for the Authority_Grant flow (task 6.5 · Req 9.7, 9.8, 9.12).
//
// These pin the concrete grant/invocation behaviour behind Property 11 (task
// 6.9, separate/optional — "a disabled skill is never grantable and never
// invokable"):
//   • grant SUCCEEDS for an installed+enabled Skill — adds it to the Agent's
//     `assignedSkillIds`, idempotently (no duplicate on re-grant);
//   • grant is BLOCKED for a disabled Skill, an auto-disabled-by-scan Skill, and
//     a not-installed Skill — and writes NOTHING in each case;
//   • the PURE run-time guard `invocableSkillIds` filters out
//     disabled / auto-disabled / not-installed assigned Skills.
//
// What's real vs injected
// ───────────────────────
//  • REAL logic under test: `grantSkillToAgent` / `revokeSkillFromAgent` and the
//    PURE `invocableSkillIds` / `isSkillInvocable` helpers.
//  • The DB layer (`@/lib/models`, `@/lib/mongodb`) is mocked with in-memory
//    `InstalledSkill` + `Agent` stores, mirroring `install.test.ts`. `$addToSet`
//    / `$pull` are implemented so idempotency runs for real.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Shared, hoisted mutable context (read by the hoisted vi.mock factories) ────
const h = vi.hoisted(() => {
  type Doc = Record<string, unknown>
  const ctx: {
    installed: Map<string, Doc> // key: userId\u0000skillId
    agents: Map<string, Doc> // key: userId\u0000agentId
  } = { installed: new Map(), agents: new Map() }
  const ikey = (userId: string, skillId: string) => `${userId}\u0000${skillId}`
  const akey = (userId: string, agentId: string) => `${userId}\u0000${agentId}`
  return { ctx, ikey, akey }
})

vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn(async () => ({})) }))

// In-memory model layer. `Agent.findOne` returns the stored doc (with the array
// it has); `Agent.updateOne` implements `$addToSet` / `$pull` against the store
// so idempotency is exercised for real. `InstalledSkill.findOne` resolves the
// per-user install state.
vi.mock('@/lib/models', () => {
  return {
    InstalledSkill: {
      findOne: vi.fn(async (filter: { userId: string; skillId: string }) =>
        h.ctx.installed.get(h.ikey(filter.userId, filter.skillId)) ?? null,
      ),
    },
    Agent: {
      findOne: vi.fn(async (filter: { _id: string; userId: string }) =>
        h.ctx.agents.get(h.akey(filter.userId, filter._id)) ?? null,
      ),
      updateOne: vi.fn(
        async (
          filter: { _id: string; userId: string },
          update: { $addToSet?: Record<string, unknown>; $pull?: Record<string, unknown> },
        ) => {
          const k = h.akey(filter.userId, filter._id)
          const doc = h.ctx.agents.get(k)
          if (!doc) return { matchedCount: 0, modifiedCount: 0 }
          const arr = Array.isArray(doc.assignedSkillIds) ? (doc.assignedSkillIds as string[]) : []
          if (update.$addToSet && 'assignedSkillIds' in update.$addToSet) {
            const val = update.$addToSet.assignedSkillIds as string
            if (!arr.includes(val)) arr.push(val)
          }
          if (update.$pull && 'assignedSkillIds' in update.$pull) {
            const val = update.$pull.assignedSkillIds as string
            doc.assignedSkillIds = arr.filter((x) => x !== val)
          } else {
            doc.assignedSkillIds = arr
          }
          h.ctx.agents.set(k, doc)
          return { matchedCount: 1, modifiedCount: 1 }
        },
      ),
    },
  }
})

import {
  grantSkillToAgent,
  revokeSkillFromAgent,
  invocableSkillIds,
  isSkillInvocable,
} from './grant'
import { Agent } from '@/lib/models'

const USER = 'user_grant_1'
const AGENT = 'agent_1'

function seedAgent(assignedSkillIds: string[] = []) {
  h.ctx.agents.set(h.akey(USER, AGENT), { _id: AGENT, userId: USER, assignedSkillIds })
}

function seedInstalled(
  skillId: string,
  state: { enabled: boolean; autoDisabledByScan?: boolean },
) {
  h.ctx.installed.set(h.ikey(USER, skillId), {
    userId: USER,
    skillId,
    enabled: state.enabled,
    autoDisabledByScan: state.autoDisabledByScan ?? false,
  })
}

beforeEach(() => {
  h.ctx.installed = new Map()
  h.ctx.agents = new Map()
  vi.clearAllMocks()
})

// ── grantSkillToAgent — success path (Req 9.7) ────────────────────────────────

describe('grantSkillToAgent — installed + enabled skill', () => {
  it('grants authority by adding the skill to assignedSkillIds', async () => {
    seedAgent([])
    seedInstalled('clean-skill', { enabled: true })

    const result = await grantSkillToAgent(USER, AGENT, 'clean-skill')
    expect(result).toEqual({
      ok: true,
      status: 'granted',
      agentId: AGENT,
      skillId: 'clean-skill',
      added: true,
    })

    const agent = h.ctx.agents.get(h.akey(USER, AGENT))!
    expect(agent.assignedSkillIds).toEqual(['clean-skill'])
  })

  it('is idempotent — re-granting the same skill does not duplicate it', async () => {
    seedAgent(['clean-skill'])
    seedInstalled('clean-skill', { enabled: true })

    const result = await grantSkillToAgent(USER, AGENT, 'clean-skill')
    expect(result).toMatchObject({ ok: true, status: 'granted', added: false })

    const agent = h.ctx.agents.get(h.akey(USER, AGENT))!
    expect(agent.assignedSkillIds).toEqual(['clean-skill'])
    // No write performed when the grant already existed.
    expect(Agent.updateOne).not.toHaveBeenCalled()
  })

  it('reports agent-not-found and writes nothing when the agent does not exist', async () => {
    seedInstalled('clean-skill', { enabled: true })
    // No agent seeded.
    const result = await grantSkillToAgent(USER, AGENT, 'clean-skill')
    expect(result).toEqual({
      ok: false,
      status: 'agent-not-found',
      agentId: AGENT,
      skillId: 'clean-skill',
    })
    expect(Agent.updateOne).not.toHaveBeenCalled()
  })
})

// ── grantSkillToAgent — BLOCKED for disabled / not-installed (Req 9.8) ─────────

describe('grantSkillToAgent — blocked grants write nothing', () => {
  it('BLOCKS a disabled skill with reason "disabled"', async () => {
    seedAgent([])
    seedInstalled('off-skill', { enabled: false })

    const result = await grantSkillToAgent(USER, AGENT, 'off-skill')
    expect(result).toEqual({
      ok: false,
      status: 'blocked',
      agentId: AGENT,
      skillId: 'off-skill',
      reason: 'disabled',
    })

    // Nothing written: the agent still has no assigned skills.
    expect(h.ctx.agents.get(h.akey(USER, AGENT))!.assignedSkillIds).toEqual([])
    expect(Agent.updateOne).not.toHaveBeenCalled()
  })

  it('BLOCKS an auto-disabled-by-scan skill with reason "auto-disabled-by-scan"', async () => {
    seedAgent([])
    seedInstalled('scanned-off-skill', { enabled: false, autoDisabledByScan: true })

    const result = await grantSkillToAgent(USER, AGENT, 'scanned-off-skill')
    expect(result).toEqual({
      ok: false,
      status: 'blocked',
      agentId: AGENT,
      skillId: 'scanned-off-skill',
      reason: 'auto-disabled-by-scan',
    })
    expect(h.ctx.agents.get(h.akey(USER, AGENT))!.assignedSkillIds).toEqual([])
    expect(Agent.updateOne).not.toHaveBeenCalled()
  })

  it('BLOCKS a not-installed skill with reason "not-installed"', async () => {
    seedAgent([])
    // No InstalledSkill row for this id.
    const result = await grantSkillToAgent(USER, AGENT, 'ghost-skill')
    expect(result).toEqual({
      ok: false,
      status: 'blocked',
      agentId: AGENT,
      skillId: 'ghost-skill',
      reason: 'not-installed',
    })
    expect(h.ctx.agents.get(h.akey(USER, AGENT))!.assignedSkillIds).toEqual([])
    expect(Agent.updateOne).not.toHaveBeenCalled()
  })
})

// ── revokeSkillFromAgent — symmetry ───────────────────────────────────────────

describe('revokeSkillFromAgent', () => {
  it('removes an assigned skill (removed=true)', async () => {
    seedAgent(['clean-skill', 'other'])
    const result = await revokeSkillFromAgent(USER, AGENT, 'clean-skill')
    expect(result).toMatchObject({ ok: true, status: 'revoked', removed: true })
    expect(h.ctx.agents.get(h.akey(USER, AGENT))!.assignedSkillIds).toEqual(['other'])
  })

  it('is idempotent when the skill was not assigned (removed=false)', async () => {
    seedAgent(['other'])
    const result = await revokeSkillFromAgent(USER, AGENT, 'clean-skill')
    expect(result).toMatchObject({ ok: true, status: 'revoked', removed: false })
    expect(Agent.updateOne).not.toHaveBeenCalled()
  })
})

// ── invocableSkillIds / isSkillInvocable — PURE run-time guard (Req 9.12) ──────

describe('invocableSkillIds — run-time disabled-skill filter', () => {
  it('keeps only installed + enabled assigned skills, dropping disabled/auto-disabled/not-installed', () => {
    const assigned = ['enabled-1', 'disabled-1', 'autodisabled-1', 'not-installed-1', 'enabled-2']
    const installed = [
      { skillId: 'enabled-1', enabled: true },
      { skillId: 'disabled-1', enabled: false },
      { skillId: 'autodisabled-1', enabled: false },
      { skillId: 'enabled-2', enabled: true },
      // 'not-installed-1' intentionally absent
    ]
    expect(invocableSkillIds(assigned, installed)).toEqual(['enabled-1', 'enabled-2'])
  })

  it('preserves order and collapses duplicate assigned ids', () => {
    const installed = [{ skillId: 'a', enabled: true }, { skillId: 'b', enabled: true }]
    expect(invocableSkillIds(['b', 'a', 'b', 'a'], installed)).toEqual(['b', 'a'])
  })

  it('returns an empty list when nothing is installed (a skill must be installed+enabled to be invoked)', () => {
    expect(invocableSkillIds(['a', 'b'], [])).toEqual([])
  })

  it('tolerates null/undefined assigned lists', () => {
    expect(invocableSkillIds(null, [{ skillId: 'a', enabled: true }])).toEqual([])
    expect(invocableSkillIds(undefined, [{ skillId: 'a', enabled: true }])).toEqual([])
  })

  it('isSkillInvocable is true only for an installed+enabled record', () => {
    const installed = [
      { skillId: 'on', enabled: true },
      { skillId: 'off', enabled: false },
    ]
    expect(isSkillInvocable('on', installed)).toBe(true)
    expect(isSkillInvocable('off', installed)).toBe(false)
    expect(isSkillInvocable('missing', installed)).toBe(false)
    expect(isSkillInvocable('', installed)).toBe(false)
  })
})
