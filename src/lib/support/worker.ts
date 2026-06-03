// ── Support ticket worker (auto-fix aware) ────────────────────────────────────
// The "support workforce" that processes open tickets on a cadence (cron route).
// For each active ticket it consults the PURE auto-fix planner (gated by the
// agent's OPT-IN `autoFix` config) and carries out a BOUNDED, REVERSIBLE remedy
// with no human approval — documenting EVERY step on the timeline:
//
//   • retry                → re-run the agent through the audited spine.
//   • raise-budget         → raise the per-agent cap up to the admin ceiling and
//                            clear budgetPaused, then re-run. Never exceeds ceiling.
//   • propose-scope-change → open a 1-click scope-change proposal (never widens
//                            scope automatically) and escalate for approval.
//   • none                 → escalate to the admin (default for any agent without
//                            auto-fix enabled, and ALWAYS for injection/unknown).
//
// HARD LIMITS: no code edits, no terminal, no credential access, no auto scope
// widening, no cross-user reach. Security/unknown failures always escalate.

import { SupportTicket, Agent, Proposal } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { runAgentOnce } from '@/lib/agents/run-agent'
import { escalateTicket } from './tickets'
import { DEFAULT_MAX_RETRIES, type TicketCategory } from './triage'
import { planAutoFix, type AutoFixConfig, type BudgetSnapshot } from './autofix'

const ACTIVE_STATUSES = ['open', 'investigating', 'in-progress'] as const
const BATCH_LIMIT = 25

export type WorkerSummary = {
  ok: boolean
  processed: number
  retried: string[]
  escalated: string[]
  resolved: string[]
  budgetRaised: string[]
  scopeProposed: string[]
}

function emptySummary(ok = true): WorkerSummary {
  return { ok, processed: 0, retried: [], escalated: [], resolved: [], budgetRaised: [], scopeProposed: [] }
}

/** Read the agent's opt-in auto-fix config defensively (absent ⇒ all off). */
function readAutoFix(agent: { autoFix?: Partial<AutoFixConfig> } | null): AutoFixConfig {
  const a = agent?.autoFix ?? {}
  return {
    enabled: a.enabled === true,
    retryTransient: a.retryTransient !== false, // default on within an enabled config
    autoRaiseBudget: a.autoRaiseBudget === true,
    budgetCeiling: typeof a.budgetCeiling === 'number' ? a.budgetCeiling : 0,
    autoApplyLowStakes: a.autoApplyLowStakes === true,
    proposeScopeChanges: a.proposeScopeChanges === true,
  }
}

/**
 * Process one batch of open tickets. Best-effort and total: one ticket's failure
 * never aborts the batch.
 */
export async function processOpenTickets(maxRetries = DEFAULT_MAX_RETRIES): Promise<WorkerSummary> {
  const summary = emptySummary()

  let tickets: Array<InstanceType<typeof SupportTicket>>
  try {
    tickets = await SupportTicket.find({ status: { $in: ACTIVE_STATUSES } }).sort({ createdAt: 1 }).limit(BATCH_LIMIT)
  } catch (err) {
    agentLog.error('[support/worker] failed to load tickets', err)
    return emptySummary(false)
  }

  for (const ticket of tickets) {
    summary.processed += 1
    const id = String(ticket._id)
    try {
      const agent = await Agent.findOne({ _id: ticket.agentId })
      if (!agent) {
        ticket.timeline.push({ at: new Date(), type: 'escalated', message: 'Agent no longer exists; manual review needed.' })
        await ticket.save()
        await escalateTicket(id, 'Agent no longer exists; manual review needed.')
        summary.escalated.push(id)
        continue
      }

      const cfg = readAutoFix(agent)
      const budget: BudgetSnapshot = {
        tokenCap: agent.budget?.tokenCap ?? 0,
        tokensThisPeriod: agent.budget?.tokensThisPeriod ?? 0,
      }
      const plan = planAutoFix({
        category: ticket.category as TicketCategory,
        retryCount: ticket.retryCount,
        maxRetries,
        cfg,
        budget,
      })

      // Document the investigation step every tick (workforce-style audit trail).
      ticket.timeline.push({
        at: new Date(),
        type: 'investigated',
        message: `Worker assessed the ticket: ${plan.reason}`,
        meta: { action: plan.kind, autoFixEnabled: cfg.enabled },
      })
      await ticket.save()

      switch (plan.kind) {
        case 'none':
          await escalateTicket(id, plan.reason || ticket.recommendedAction)
          summary.escalated.push(id)
          break

        case 'raise-budget': {
          // Bounded, reversible: raise the cap (≤ ceiling) + clear the pause, then retry.
          if (agent.budget) agent.budget.tokenCap = plan.newCap
          agent.budgetPaused = false
          await agent.save()
          ticket.timeline.push({
            at: new Date(),
            type: 'auto-fix',
            message: `Auto-raised this agent's budget cap to ${plan.newCap} tokens (admin ceiling ${cfg.budgetCeiling}) and cleared the pause.`,
            meta: { newCap: plan.newCap, ceiling: cfg.budgetCeiling },
          })
          await ticket.save()
          summary.budgetRaised.push(id)
          await retryAgent(ticket, agent, maxRetries, summary)
          break
        }

        case 'propose-scope-change': {
          // NEVER widen scope automatically — open a 1-click proposal + escalate.
          await Proposal.create({
            userId: ticket.userId,
            agentId: agent._id,
            runId: ticket.lastRunId ?? ticket.firstRunId ?? null,
            kind: 'flagged-content',
            stakes: 'sign-off-required',
            status: 'pending',
            title: `Scope change proposed for ${agent.name}`,
            rationale:
              `${agent.name} failed with an out-of-scope action. The support worker proposes reviewing ` +
              `its Trust_Scope. Approve to widen deliberately, or dismiss to keep the current scope. ` +
              `The agent never widens its own scope automatically.`,
            citations: [],
            plan: null,
          }).catch((e) => agentLog.error('[support/worker] scope proposal create failed', e))
          ticket.timeline.push({
            at: new Date(),
            type: 'auto-fix',
            message: 'Opened a scope-change proposal for your 1-click approval (scope is never auto-widened).',
          })
          await ticket.save()
          await escalateTicket(id, 'A scope-change proposal is awaiting your approval.')
          summary.scopeProposed.push(id)
          break
        }

        case 'retry':
          await retryAgent(ticket, agent, maxRetries, summary)
          break
      }
    } catch (oneErr) {
      agentLog.error('[support/worker] ticket processing failed', oneErr)
    }
  }

  return summary
}

/**
 * Re-run an agent through the audited spine and document the outcome on the
 * ticket. A clean run is auto-resolved (the run spine's success hook resolves it;
 * we confirm). A failed run escalates once retries are exhausted.
 */
async function retryAgent(
  ticket: InstanceType<typeof SupportTicket>,
  agent: InstanceType<typeof Agent>,
  maxRetries: number,
  summary: WorkerSummary,
): Promise<void> {
  const id = String(ticket._id)
  ticket.status = 'in-progress'
  ticket.retryCount += 1
  const attempt = ticket.retryCount
  ticket.timeline.push({
    at: new Date(),
    type: 'retry-scheduled',
    message: `Automated retry attempt ${attempt} of ${maxRetries} starting.`,
    meta: { attempt },
  })
  await ticket.save()

  const result = await runAgentOnce(agent, { kind: 'manual' })
  const fresh = await SupportTicket.findById(id)
  if (!fresh) { summary.retried.push(id); return }

  if (result.status === 'ok' && result.runStatus === 'completed') {
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
    return
  }

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
  if (fresh.retryCount >= maxRetries) {
    await fresh.save()
    await escalateTicket(id, `Automated retries exhausted (${fresh.retryCount}/${maxRetries}). Needs a human.`)
    summary.escalated.push(id)
  } else {
    await fresh.save()
    summary.retried.push(id)
  }
}
