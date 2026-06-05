'use client'

// ── useSquadSnapshot — the dashboard's read-only Squad + Missions feed ─────────
// Powers the dashboard's "Squad & Missions" panel (the agent/mission surfacing that
// the vault-centric dashboard otherwise lacks). It composes TWO existing, Clerk-authed
// read endpoints — no new backend:
//   • GET /api/agents/dashboard → { tally, roster, queue, activity }  (the Squad
//     status strip + today's proof-of-work + the pending Aegis sign-off queue)
//   • GET /api/missions         → { missions }                        (the user's
//     Mission roster, lean docs)
//
// Each fetch is resilient on its own: one failing never blanks the other (the panel
// degrades gracefully). NO DUMMY DATA — every number is a real tally; an absent/zero
// value renders as an honest zero or empty state, never a fabricated figure.

import { useEffect, useState } from 'react'

// ── Shapes (subset of each endpoint's payload that the panel reads) ────────────

/** The Squad status-strip + proof-of-work tally (from `getDashboardTally`). */
export interface SquadTally {
  statusStrip: { running: number; scheduled: number; awaitingSignOff: number }
  today: { sourcesIngested: number; connectionsMade: number; synthesesProposed: number }
}

/** One pending Aegis-queue item (we only read its presence for the count + a label). */
export interface QueueItemLite {
  id: string
  title?: string
  agentName?: string
}

/** One mission as `GET /api/missions` serializes it (lean doc; ids → strings). */
export type MissionLifecycle =
  | 'planning'
  | 'awaiting-plan-approval'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'aborted'

export interface MissionLite {
  _id: string
  objective: string
  lifecycle: MissionLifecycle
  leadAutoSelected?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface SquadSnapshot {
  /** Squad tally (status strip + today). Null until the agents feed resolves. */
  tally: SquadTally | null
  /** How many proposals await the user's sign-off (Aegis queue depth). */
  pendingSignOff: number
  /** A few pending queue items for a preview list (bounded). */
  queue: QueueItemLite[]
  /** Total agents in the squad (roster length). */
  agentCount: number
  /** The user's missions, newest-first. */
  missions: MissionLite[]
  loading: boolean
  /** True only when BOTH feeds failed — a partial failure still renders. */
  error: boolean
}

const EMPTY: SquadSnapshot = {
  tally: null,
  pendingSignOff: 0,
  queue: [],
  agentCount: 0,
  missions: [],
  loading: true,
  error: false,
}

export function useSquadSnapshot(): SquadSnapshot {
  const [state, setState] = useState<SquadSnapshot>(EMPTY)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Fire both reads together; settle independently so one failure never blanks
      // the other half of the panel.
      const [agentsRes, missionsRes] = await Promise.allSettled([
        fetch('/api/agents/dashboard', { cache: 'no-store' }).then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
        ),
        fetch('/api/missions', { cache: 'no-store' }).then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
        ),
      ])

      if (cancelled) return

      let tally: SquadTally | null = null
      let queue: QueueItemLite[] = []
      let agentCount = 0
      let agentsOk = false
      if (agentsRes.status === 'fulfilled') {
        agentsOk = true
        const a = agentsRes.value as {
          tally?: SquadTally
          queue?: QueueItemLite[]
          roster?: unknown[]
        }
        tally = a?.tally ?? null
        queue = Array.isArray(a?.queue) ? a.queue.slice(0, 4) : []
        agentCount = Array.isArray(a?.roster) ? a.roster.length : 0
      }

      let missions: MissionLite[] = []
      let missionsOk = false
      if (missionsRes.status === 'fulfilled') {
        missionsOk = true
        const m = missionsRes.value as { missions?: MissionLite[] }
        missions = Array.isArray(m?.missions) ? m.missions : []
      }

      setState({
        tally,
        pendingSignOff: tally?.statusStrip.awaitingSignOff ?? queue.length,
        queue,
        agentCount,
        missions,
        loading: false,
        // Only a TOTAL failure is an error; a partial one still renders what loaded.
        error: !agentsOk && !missionsOk,
      })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
