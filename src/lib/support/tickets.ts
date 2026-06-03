// ── Support ticket orchestration ──────────────────────────────────────────────
// The async glue between a finished Agent run and the SupportTicket collection.
// Called from the run spine (`runAgentOnce`) as a BEST-EFFORT side effect — it
// must never change the run's result or throw into the run path (mirrors how
// trust-event persistence is wired).
//
//   • openOrUpdateTicketForRun(...) — on a non-clean run, diagnose the failure
//     and open a ticket (or append to the existing open one for the same
//     agent+category). Documents everything on the timeline.
//   • resolveTicketsOnSuccess(...)  — on a clean run, auto-resolve any open
//     tickets for that agent and document the recovery.
//
// The actual remediation (retrying the agent) is driven by the worker route
// (`/api/admin/support/worker`) on a cron, NOT here — keeping the run path fast
// and side-effect-light. This module only records state + timeline.

import { SupportTicket, AdminNotification } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import {
  diagnoseFailure,
  ticketTitle,
  dedupeKey,
  type FailureSignals,
} from './triage'

const ACTIVE_STATUSES = ['open', 'investigating', 'in-progress', 'awaiting-admin'] as const

/**
 * Open (or update) a support ticket for a failed run. Best-effort; never throws.
 *
 * Dedup: one active ticket per (agentId, category). A repeat of the same failure
 * appends a timeline entry + bumps `lastRunId` instead of spawning a new ticket.
 */
export async function openOrUpdateTicketForRun(input: {
  userId: string
  agentId: string
  agentName: string
  runId: string
  runStatus: string
  failureReason: string | null
}): Promise<void> {
  try {
    const signals: FailureSignals = { runStatus: input.runStatus, failureReason: input.failureReason }
    const d = diagnoseFailure(signals)
    const key = dedupeKey(input.agentId, d.category)
    const now = new Date()

    const existing = await SupportTicket.findOne({ dedupeKey: key, status: { $in: ACTIVE_STATUSES } })

    if (existing) {
      existing.lastRunId = input.runId
      existing.timeline.push({
        at: now,
        type: 'recurrence',
        message: `The same failure recurred on a new run (${d.category}).`,
        meta: { runId: input.runId, runStatus: input.runStatus, failureReason: input.failureReason },
      })
      await existing.save()
      return
    }

    const title = ticketTitle(input.agentName, d)
    await SupportTicket.create({
      userId: input.userId,
      agentId: input.agentId,
      agentName: input.agentName,
      category: d.category,
      severity: d.severity,
      status: 'open',
      title,
      diagnosis: d.diagnosis,
      recommendedAction: d.recommendedAction,
      firstRunId: input.runId,
      lastRunId: input.runId,
      retryCount: 0,
      autoRemediable: d.autoRemediable,
      dedupeKey: key,
      timeline: [
        {
          at: now,
          type: 'opened',
          message: `Ticket opened automatically after a ${input.runStatus} run.`,
          meta: { runId: input.runId, runStatus: input.runStatus, failureReason: input.failureReason },
        },
        {
          at: now,
          type: 'diagnosed',
          message: d.diagnosis,
          meta: { category: d.category, severity: d.severity, autoRemediable: d.autoRemediable },
        },
        {
          at: now,
          type: 'plan',
          message: d.autoRemediable
            ? 'Classified as auto-remediable. A worker will attempt a bounded retry.'
            : 'Classified as needing a human. Will escalate to the admin.',
        },
      ],
    })
  } catch (err) {
    // Best-effort: never destabilize the run path.
    agentLog.error('[support] openOrUpdateTicketForRun failed', err)
  }
}

/**
 * Auto-resolve any active tickets for an agent after a clean run, documenting the
 * recovery. Best-effort; never throws. Returns the number of tickets resolved.
 */
export async function resolveTicketsOnSuccess(input: {
  agentId: string
  agentName: string
  runId: string
}): Promise<number> {
  try {
    const open = await SupportTicket.find({ agentId: input.agentId, status: { $in: ACTIVE_STATUSES } })
    if (open.length === 0) return 0
    const now = new Date()
    let count = 0
    for (const t of open) {
      t.status = 'resolved'
      t.resolvedAt = now
      t.resolutionNote = `Auto-resolved: a later run (${input.runId}) for ${input.agentName} completed cleanly.`
      t.timeline.push({
        at: now,
        type: 'resolved',
        message: t.resolutionNote,
        meta: { runId: input.runId },
      })
      await t.save()
      count += 1
    }
    return count
  } catch (err) {
    agentLog.error('[support] resolveTicketsOnSuccess failed', err)
    return 0
  }
}

/**
 * Record an escalation: flip the ticket to awaiting-admin, document it, and raise
 * an AdminNotification so the admin sees it in the Updates feed. Best-effort.
 */
export async function escalateTicket(ticketId: string, reason: string): Promise<void> {
  try {
    const t = await SupportTicket.findById(ticketId)
    if (!t || t.status === 'awaiting-admin' || t.status === 'resolved' || t.status === 'wont-fix') return
    const now = new Date()
    t.status = 'awaiting-admin'
    t.timeline.push({ at: now, type: 'escalated', message: reason })
    await t.save()

    // Surface in the admin feed (deduped per ticket).
    await AdminNotification.updateOne(
      { dedupeKey: `support:${t._id}` },
      {
        $setOnInsert: {
          kind: 'support-escalation',
          source: t.agentName,
          title: `Support: ${t.title}`,
          body: `${t.diagnosis}\n\nRecommended: ${t.recommendedAction}`,
          url: null,
          severity: t.severity === 'high' ? 'warning' : 'info',
          acknowledged: false,
          acknowledgedAt: null,
          dedupeKey: `support:${t._id}`,
        },
      },
      { upsert: true },
    ).catch(() => { /* dup escalation notification is fine */ })
  } catch (err) {
    agentLog.error('[support] escalateTicket failed', err)
  }
}
