// ── Support ticket worker ─────────────────────────────────────────────────────
// The "support workforce" that processes open tickets on a cadence (driven by the
// cron route). For each active ticket it asks the PURE `nextTicketAction` what to
// do and carries it out, documenting EVERY step on the ticket timeline:
//
//   • 'retry'    → re-run the agent through the same audited spine (runAgentOnce).
//                  Record the attempt + its outcome. A clean run auto-resolves the
//                  ticket via the run spine's own success hook.
//   • 'escalate' → flip to awaiting-admin + raise an AdminNotification.
//   • 'wait'     → nothing to do (terminal / already escalated).
//
// HONEST SCOPE: the only automated remedy is re-running the agent (bounded by
// retryCount < maxRetries). Nothing here edits code or changes the agent's
// configuration — anything needing a real change escalates to a human.

import { SupportTicket, Agent } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { runAgentOnce } from '@/lib/agents/run-agent'
import { escalateTicket } from './tickets'
import { nextTicketAction, DEFAULT_MAX_RETRIES, type TicketCategory, type TicketStatus } from './triage'

const ACTIVE_STATUSES = ['open', 'investigating', 'in-progress'] as const

export type WorkerSummary = {
  ok: boolean
  processed: number
  retried: string[]
  escalated: string[]
  resolved: string[]
}

/** Max tickets processed per worker invocation (keeps a tick bounded). */
const BATCH_LIMIT = 25

/**
 * Process one batch of open tickets. Best-effort and total: one ticket's failure
 * never aborts the batch. Returns a summary of actions taken.
 */
export async function processOpenTickets(maxRetries = DEFAULT_MAX_RETRIES): Promise<WorkerSummary> {
  const summary: WorkerSummary = { ok: true, processed: 0, retried: [], escalated: [], resolved: [] }

  let tickets: Array<InstanceType<typeof SupportTicket>>
  try {
    tickets = await SupportTicket.find({ status: { $in: ACTIVE_STATUSES } })
      .sort({ createdAt: 1 })
      .limit(BATCH_LIMIT)
  } catch (err) {
    agentLog.error('[support/worker] failed to load tickets', err)
    return { ...summary, ok: false }
  }

  for (const ticket of tickets) {
    summary.processed += 1
    const id = String(ticket._id)
    try {
      const action = nextTicketAction({
        category: ticket.category as TicketCategory,
        status: ticket.status as TicketStatus,
        retryCount: ticket.retryCount,
        maxRetries,
      })

      if (action === 'wait') continue

      if (action === 'escalate') {
        await escalateTicket(
          id,
          ticket.autoRemediable
            ? `Automated retries exhausted (${ticket.retryCount}/${maxRetries}). Needs a human.`
            : `${ticket.recommendedAction}`,
        )
        summary.escalated.push(id)
        continue
      }

      // action === 'retry' — re-run the agent through the audited spine.
      const now = new Date()
      ticket.status = 'in-progress'
      ticket.retryCount += 1
      const attempt = ticket.retryCount
      ticket.timeline.push({
        at: now,
        type: 'retry-scheduled',
        message: `Automated retry attempt ${attempt} of ${maxRetries} starting.`,
        meta: { attempt },
      })
      await ticket.save()

      const agent = await Agent.findOne({ _id: ticket.agentId })
      if (!agent) {
        ticket.timeline.push({ at: new Date(), type: 'retry-result', message: 'Agent no longer exists; cannot retry. Escalating.' })
        await ticket.save()
        await escalateTicket(id, 'Agent no longer exists; manual review needed.')
        summary.escalated.push(id)
        continue
      }

      const result = await runAgentOnce(agent, { kind: 'manual' })
      // The run spine's own success hook resolves the ticket on a clean run; here
      // we just document the attempt outcome from the worker's perspective.
      const fresh = await SupportTicket.findById(id)
      if (!fresh) { summary.retried.push(id); continue }

      if (result.status === 'ok' && result.runStatus === 'completed') {
        // Likely already resolved by resolveTicketsOnSuccess; record + confirm.
        fresh.timeline.push({
          at: new Date(),
          type: 'retry-result',
          message: `Retry attempt ${attempt} completed cleanly. Issue resolved.`,
          meta: { runId: String(result.run._id), attempt },
        })
        if (fresh.status !== 'resolved') {
          fresh.status = 'resolved'
          fresh.resolvedAt = new Date()
          fresh.resolutionNote = `Auto-resolved by retry attempt ${attempt}.`
        }
        await fresh.save()
        summary.resolved.push(id)
      } else {
        const why =
          result.status === 'blocked'
            ? `blocked by budget (${result.reason})`
            : result.status === 'error'
              ? result.message
              : `ended as ${result.status === 'ok' ? result.runStatus : 'failed'}`
        fresh.status = 'investigating'
        fresh.timeline.push({
          at: new Date(),
          type: 'retry-result',
          message: `Retry attempt ${attempt} did not resolve the issue (${why}).`,
          meta: { attempt },
        })
        // If retries are now exhausted, escalate immediately so the admin is looped in.
        if (fresh.retryCount >= maxRetries) {
          await fresh.save()
          await escalateTicket(id, `Automated retries exhausted (${fresh.retryCount}/${maxRetries}). Needs a human.`)
          summary.escalated.push(id)
        } else {
          await fresh.save()
          summary.retried.push(id)
        }
      }
    } catch (oneErr) {
      // One ticket failing never aborts the batch.
      agentLog.error('[support/worker] ticket processing failed', oneErr)
    }
  }

  return summary
}
