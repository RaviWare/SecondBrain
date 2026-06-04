// ── runAgentOnce — the single "execute one Run for an Agent" path ─────────────
// The shared core that BOTH the manual run route (`/api/agents/[id]/run`) and the
// protected scheduler tick route (`/api/agents/scheduler/tick`, task 8.2) — plus
// the opportunistic post-run reactive chaining — funnel through, so scheduled,
// reactive, manual, and dry runs all execute through one audited code path.
//
// This is the propose-never-write spine wired end-to-end:
//   1. Budget pre-flight gate (`canStartRun`) over the three Budget levels.
//   2. Create an AgentRun (status 'running').
//   3. Build the READ-ONLY VaultTools + a minimal RunContext from the Agent doc,
//      narrowed to only its invocable (installed + enabled) Skills.
//   4. Invoke getRunner().run(ctx, tools) — the runner is structurally incapable
//      of writing to the vault; it only emits DraftProposals.
//   5. Persist each DraftProposal as a Proposal doc, classifying its stakes.
//   6. Finalize the AgentRun (status, tokens, trace, carryOver, proposalIds).
//   7. Best-effort budget bookkeeping + trust-event persistence.
//   8. For a dry-run, set deploy-eligibility on a clean completion (Req 7.9, 7.10).
//
// REACTIVE CHAINING NOTE (one level deep, by design): this function does NOT
// itself chain — it never emits a follow-on tick. The route layer drives
// chaining AFTER a Run completes (it calls this function again for each matched
// reactive Agent). Keeping the tick OUT of here means a chained reactive Run does
// not recursively chain inside the same request; deeper chains happen on their
// own subsequent Run completions / cron ticks. See `/api/agents/[id]/run`.
//
// Never logs the scoped brain token or any BYO key (AGENTS.md, Req 11.4).
import { AgentRun, Proposal, Page, Vault, InstalledSkill, SquadBudget } from '@/lib/models'
import type { IAgent, IAgentRun } from '@/lib/models'
import { getRunner } from '@/lib/agents/runner'
import { canStartRun, type BudgetInputs, type BudgetBlockReason } from '@/lib/agents/budget'
import { invocableSkillIds } from '@/lib/skills/grant'
import type {
  RunContext,
  RunTrigger,
  VaultTools,
  SearchHit,
  RawSource,
  DraftProposal,
  ScanResult,
  RunOutput,
} from '@/lib/agents/runner/types'
import { classifyStakes } from '@/lib/agents/aegis/classify'
import { scanContent } from '@/lib/agents/scanner'
import { agentLog } from '@/lib/agents/redact'
import { recordTrustEvents, runOutcomeTrustEvents } from '@/lib/agents/trust-events'
import { openOrUpdateTicketForRun, resolveTicketsOnSuccess } from '@/lib/support/tickets'
import { deliverToUser } from '@/lib/messaging/deliver'
import { summarizeDryRun, isCleanDryRunCompletion } from '@/lib/agents/dry-run'
import { runQuery, planIngest, type IngestInput } from '@/lib/vault-ops'
import { fetchAndCleanUrl } from '@/lib/claude'

// Fallback per-run token budget when the Agent's trustScope sets none (0/unset).
export const DEFAULT_PER_RUN_TOKEN_BUDGET = 50_000

/** Narrow an arbitrary value into a well-formed IngestInput (url|text). */
function asIngestInput(value: unknown): IngestInput | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (v.type === 'url' && typeof v.url === 'string') {
    return { type: 'url', url: v.url, ...(typeof v.title === 'string' ? { title: v.title } : {}) }
  }
  if (v.type === 'text' && typeof v.text === 'string') {
    return { type: 'text', text: v.text, ...(typeof v.title === 'string' ? { title: v.title } : {}) }
  }
  return null
}

/**
 * Build the read-only VaultTools bound to this user. Note: there is intentionally
 * NO applyIngestPlan binding — the runner can PLAN a write but never PERFORM one.
 */
export function buildTools(userId: string): VaultTools {
  return {
    // Thin wrapper over Page full-text search, scoped to the user's vault.
    async search(query: string): Promise<SearchHit[]> {
      const vault = await Vault.findOne({ userId })
      if (!vault) return []
      const q = (query || '').trim()
      try {
        const filter: Record<string, unknown> = { userId, vaultId: vault._id }
        if (q) filter.$text = { $search: q }
        const pages = await Page.find(filter, 'slug title summary')
          .sort(q ? { score: { $meta: 'textScore' } } : { updatedAt: -1 })
          .limit(8)
          .lean()
        return pages.map((p) => ({ slug: p.slug, title: p.title, snippet: p.summary }))
      } catch {
        // Text-index/search failure should never crash a run — degrade to empty.
        return []
      }
    },

    // runQuery is read-only knowledge-wise (writes only a Log row + usage counter).
    async query(question: string): Promise<unknown> {
      return runQuery(userId, question)
    },

    // PURE plan — computes what an ingest WOULD write, performs no write.
    async planIngest(input: unknown): Promise<unknown> {
      const ingestInput = asIngestInput(input)
      if (!ingestInput) throw new Error('Invalid ingest input')
      return planIngest(userId, ingestInput)
    },

    // Fetch + clean only. URL inputs go through Firecrawl/cleaner; text passes through.
    async fetchSource(input: unknown): Promise<RawSource> {
      const ingestInput = asIngestInput(input)
      if (!ingestInput) throw new Error('Invalid ingest input')
      if (ingestInput.type === 'url') {
        const fetched = await fetchAndCleanUrl(ingestInput.url)
        return {
          type: 'url',
          title: ingestInput.title || fetched.title,
          url: ingestInput.url,
          rawContent: fetched.content,
        }
      }
      return {
        type: 'text',
        title: ingestInput.title || 'Untitled',
        url: null,
        rawContent: ingestInput.text,
      }
    },

    // Content_Scanner (task 2.3/2.4): screen every fetched source for embedded
    // instructions, credentials, PII, and text addressed to "the AI" BEFORE it can
    // be planned or proposed (Req 5.1, 5.9). PURE/synchronous/deterministic — no
    // I/O. A `flagged` verdict makes the runner hold the source for review (it
    // never plans/ingests flagged content — Req 5.4–5.7) and activates the
    // `injection-detected` trust event downstream from `output.scanResults`.
    scan(source: RawSource): ScanResult {
      return scanContent(source.rawContent)
    },
  }
}

/** The dry-run preview summary the builder renders (Req 7.7). */
export interface RunAgentSummary {
  wouldIngest: number
  filtered: number
  wouldPropose: number
  /** Back-compatible alias of `filtered` for the prior `{ wouldPropose, flagged }` shape. */
  flagged: number
}

/**
 * The structured outcome of `runAgentOnce`. The HTTP/route layer maps it to a
 * response (manual route) or a batch summary (scheduler / chaining):
 *  - `blocked` — the Budget guard refused the Run; NOTHING was created/executed.
 *  - `error`   — the Run threw during execution; the AgentRun is marked failed.
 *  - `ok`      — the Run executed to a terminal state and is fully persisted.
 */
export type RunAgentResult =
  | { status: 'blocked'; reason: BudgetBlockReason }
  | { status: 'error'; run: IAgentRun; message: string }
  | {
      status: 'ok'
      run: IAgentRun
      proposalIds: unknown[]
      output: RunOutput
      /** The Run's terminal status: completed | failed | budget-stopped | timeout. */
      runStatus: string
      dryRun: boolean
      /** Whether the Agent is now deploy-eligible (dry-runs only; false otherwise). */
      deployEligible: boolean
      /** Present only for dry-runs (Req 7.7). */
      summary?: RunAgentSummary
    }

/**
 * Execute exactly ONE Run for an already-loaded, hydrated Agent document.
 *
 * The caller MUST have established the DB connection and fetched the FULL Agent
 * document (not a lean projection — this reads/writes `budget`, `trustScope`,
 * `signOffPolicy`, `assignedSkillIds`, etc.). `trigger` selects the Run kind:
 *   • `{ kind: 'manual' }`               — user-triggered now
 *   • `{ kind: 'dry-run' }`              — propose-only preview (writes nothing)
 *   • `{ kind: 'scheduled'; cron }`      — fired by the cron tick route
 *   • `{ kind: 'reactive'; event; ... }` — fired by post-run reactive chaining
 *
 * Never throws — every failure is captured into a structured {@link RunAgentResult}
 * (and the AgentRun is retained with a failureReason), so batch callers
 * (scheduler / chaining) can isolate one failure without aborting the batch.
 */
export async function runAgentOnce(agent: IAgent, trigger: RunTrigger): Promise<RunAgentResult> {
  const userId = String(agent.userId)
  const dryRun = trigger.kind === 'dry-run'

  // ── Budget pre-flight gate (Req 10.6, 10.7, 10.8) ───────────────────────────
  // BEFORE any Run is created or executed, run the PURE `canStartRun` guard over
  // the three Budget levels. A dry-run consumes tokens too, so BOTH dry-runs and
  // real runs are gated. A blocked Run creates/executes NOTHING.
  const squad = await SquadBudget.findOne({ userId })
  const budgetInputs: BudgetInputs = {
    budgetPaused: agent.budgetPaused === true,
    agentCap: agent.budget?.tokenCap ?? 0,
    agentUsed: agent.budget?.tokensThisPeriod ?? 0,
    squadCap: squad?.monthlyTokenCap ?? 0,
    squadUsed: squad?.tokensThisPeriod ?? 0,
    perRunBudget: agent.trustScope?.perRunTokenBudget ?? 0,
  }
  const gate = canStartRun(budgetInputs)
  if (!gate.allowed) {
    return { status: 'blocked', reason: gate.reason as BudgetBlockReason }
  }

  // Resolve the effective per-run token budget from the guard (Agent scope clamped
  // to the smallest remaining headroom). Fall back to the default when the resolved
  // allowance is unset/unbounded (all caps unlimited and no per-run request).
  let perRunTokens = gate.effective.perRunTokens
  if (!Number.isFinite(perRunTokens) || perRunTokens <= 0) perRunTokens = DEFAULT_PER_RUN_TOKEN_BUDGET

  // 1. Open the run record before any work starts (retained even on failure).
  const run = await AgentRun.create({
    userId,
    agentId: agent._id,
    trigger: trigger.kind,
    dryRun,
    status: 'running',
    perRunBudget: perRunTokens,
    startedAt: new Date(),
  })

  try {
    // 2. Build read-only tools + a minimal run context from the Agent doc.
    const tools = buildTools(userId)

    // 2b. RUN-TIME DISABLED-SKILL GUARD (Req 9.12, Property 11): an Agent may
    //     still list a Skill in `assignedSkillIds` that has since been disabled
    //     (manually or auto-disabled by a failing periodic re-scan). Such a Skill
    //     must NEVER be invoked during a Run. We load the user's InstalledSkill
    //     records and feed the runner ONLY the invocable subset (installed AND
    //     enabled). The persisted `Agent.assignedSkillIds` is left untouched; we
    //     only narrow what the runner sees this Run.
    const installedSkills = await InstalledSkill.find({ userId }, 'skillId enabled').lean()
    const runnableSkillIds = invocableSkillIds(agent.assignedSkillIds, installedSkills)
    const runnerAgent = { ...agent.toObject(), assignedSkillIds: runnableSkillIds }

    const ctx: RunContext = {
      agent: runnerAgent,
      trigger,
      runId: String(run._id),
      // TODO(Phase 2 · task 2.5): mint a brain token scoped to agent.trustScope.
      // Placeholder for now; never logged.
      scopedToken: '',
      budget: {
        perRunTokens,
        // `effective.*Remaining` are `+Infinity` when that level is unlimited, which
        // is not JSON-serializable — fall back to `perRunTokens` (the prior behavior)
        // for any unlimited level so the ctx stays a plain finite shape.
        agentRemaining: Number.isFinite(gate.effective.agentRemaining)
          ? gate.effective.agentRemaining
          : perRunTokens,
        squadRemaining: Number.isFinite(gate.effective.squadRemaining)
          ? gate.effective.squadRemaining
          : perRunTokens,
      },
      dryRun,
    }

    // 3. Execute the run. The runner emits DraftProposals only — no vault writes.
    const output = await getRunner().run(ctx, tools)

    // 4. Persist each emitted DraftProposal as a Proposal doc.
    //    Phase-1 policy: everything is 'pending' regardless of stakes — full
    //    auto-apply wiring is deferred (keep it simple and safe). We still record
    //    the classified stakes so later phases can route on it.
    const proposalIds: unknown[] = []
    for (const draft of output.proposals as DraftProposal[]) {
      const stakes = classifyStakes(draft, {
        trustScore: agent.trustScore,
        signOffPolicy: agent.signOffPolicy,
      })
      const proposal = await Proposal.create({
        userId,
        agentId: agent._id,
        runId: run._id,
        kind: draft.kind,
        title: draft.title,
        rationale: draft.rationale,
        citations: draft.citations,
        plan: draft.plan ?? null,
        scanResult: draft.scanResult ?? null,
        stakes,
        // Phase 1: always pending (auto-apply deferred — nothing writes unattended).
        status: 'pending',
      })
      proposalIds.push(proposal._id)
    }

    // 5. Finalize the run record.
    const status = output.outcome === 'completed' ? 'completed' : output.outcome
    run.status = status
    run.tokensUsed = output.tokensUsed
    run.trace = output.trace
    run.proposalIds = proposalIds as never
    run.outcome = `${output.proposals.length} proposal(s) emitted`
    if (output.failureReason) run.failureReason = output.failureReason
    run.finishedAt = new Date()
    // Carryover + termination reporting (Req 10.5, 10.11): the Run_Trace is already
    // retained above. On ANY non-clean terminal outcome (failed / budget-stopped /
    // timeout) mark the unfinished work to be carried to the Agent's next Run. A
    // clean `completed` Run leaves carryOver at its default ({ pending:false, note:null }).
    if (status !== 'completed') {
      run.carryOver = {
        pending: true,
        note: output.failureReason || `Run ended as ${status}; unfinished work carried to next run.`,
      }
    }
    await run.save()

    // 5·support. Auto support workforce (best-effort, never changes run result).
    //   • A non-clean REAL run opens (or appends to) a support ticket capturing
    //     the failure, diagnosis, and a remediation plan — documented timeline.
    //   • A clean REAL run auto-resolves any open tickets for this agent and
    //     documents the recovery. Dry-runs are excluded (previews, not live work).
    if (!dryRun) {
      if (status !== 'completed') {
        await openOrUpdateTicketForRun({
          userId,
          agentId: String(agent._id),
          agentName: agent.name,
          runId: String(run._id),
          runStatus: status,
          failureReason: run.failureReason ?? output.failureReason ?? null,
        })
      } else {
        await resolveTicketsOnSuccess({
          agentId: String(agent._id),
          agentName: agent.name,
          runId: String(run._id),
        })
      }

      // Best-effort: nudge the owner on their linked chat channels when this run
      // left proposals awaiting their sign-off (Telegram, etc.). Never affects
      // the run result; delivery respects each channel's notify prefs.
      const pendingCount = proposalIds.length
      if (pendingCount > 0) {
        await deliverToUser(
          userId,
          'proposals',
          `📥 <b>${agent.name}</b> has ${pendingCount} proposal${pendingCount === 1 ? '' : 's'} awaiting your sign-off.`,
        ).catch(() => { /* best-effort */ })
      }
    }
    //     enforce the per-Agent cap (Req 10.6, 10.8). BEST-EFFORT: a persistence
    //     error here must NOT change the Run's result. A dry-run consumes tokens
    //     too, so this runs for both dry-runs and real runs.
    try {
      const tokensUsed = output.tokensUsed ?? 0

      // Per-Agent usage (the Agent's weekly/monthly cap window).
      if (agent.budget) {
        agent.budget.tokensThisPeriod = (agent.budget.tokensThisPeriod ?? 0) + tokensUsed
      }

      // Squad-wide usage — atomic upsert so a missing record is created with an
      // unconfigured (0 = unlimited) master cap and the period anchored to now.
      await SquadBudget.updateOne(
        { userId },
        {
          $inc: { tokensThisPeriod: tokensUsed },
          $setOnInsert: { monthlyTokenCap: 0, periodStart: new Date() },
        },
        { upsert: true },
      )

      // If an ACTIVE per-Agent cap is now reached, enter Budget_Paused and surface
      // the state to the Aegis_Queue (Req 10.6).
      const cap = agent.budget?.tokenCap ?? 0
      const used = agent.budget?.tokensThisPeriod ?? 0
      if (cap > 0 && used >= cap && agent.budgetPaused !== true) {
        agent.budgetPaused = true
        await Proposal.create({
          userId,
          agentId: agent._id,
          runId: run._id,
          kind: 'flagged-content',
          stakes: 'sign-off-required',
          status: 'pending',
          title: `${agent.name} paused — budget cap reached`,
          rationale:
            `This agent reached its per-agent token cap (${used} of ${cap} tokens this period) ` +
            `and was paused. Increase its budget or wait for the next period to resume.`,
          citations: [],
          plan: null,
        })
      }

      await agent.save()
    } catch (budgetErr) {
      // Non-breaking: log (secrets scrubbed) and continue — the Run result and
      // emitted proposals are already correct and persisted.
      agentLog.error('[agents/run] failed to accumulate budget usage', budgetErr)
    }

    // 5b. Emit trust events for this Run outcome (Req 4.4, 4.5, 4.7, 4.8) and
    //     persist the clamped Agent.trustScore via adjustTrust.
    //     Best-effort: trust persistence never changes the run's result.
    const injectionDetected = output.scanResults.some(
      (s) => s.status === 'flagged' && s.findings.some((f) => f.category === 'injection'),
    )
    const flaggedContent =
      output.scanResults.some((s) => s.status === 'flagged') ||
      output.proposals.some((p) => p.kind === 'flagged-content')
    // A scope violation this Run gates BOTH the trust side (a scope-violating
    // dry-run grants no positive trust — Req 4.4) AND the deploy-eligibility side
    // (a scope-violating dry-run is not a clean completion — Req 7.9).
    const scopeViolation = (run.scopeViolations ?? 0) > 0
    const completed = status === 'completed'
    const trustEvents = runOutcomeTrustEvents({
      dryRun,
      completed,
      injectionDetected,
      flaggedContent,
      scopeViolation,
    })
    if (trustEvents.length > 0) {
      await recordTrustEvents(agent._id, trustEvents, { userId })
    }

    if (dryRun) {
      // 5c. Clean-completion gate (Req 7.9, 7.10): a Dry_Run that `completed` with
      //     NO scope violation makes the Agent deploy-ELIGIBLE. Best-effort; a
      //     persistence hiccup never changes the dry-run's result.
      if (isCleanDryRunCompletion({ completed, scopeViolation }) && agent.hadSuccessfulDryRun !== true) {
        agent.hadSuccessfulDryRun = true
        try {
          await agent.save()
        } catch (persistErr) {
          agentLog.error('[agents/run] failed to set hadSuccessfulDryRun', persistErr)
        }
      }

      // Dry-run preview summary (Req 7.7) — REAL tallies via the pure
      // `summarizeDryRun` (Property-22 "dry-run counts are accurate").
      const summary = summarizeDryRun(output)
      return {
        status: 'ok',
        run,
        proposalIds,
        output,
        runStatus: status,
        dryRun: true,
        deployEligible: agent.hadSuccessfulDryRun === true,
        summary: { ...summary, flagged: summary.filtered },
      }
    }

    return {
      status: 'ok',
      run,
      proposalIds,
      output,
      runStatus: status,
      dryRun: false,
      deployEligible: false,
    }
  } catch (err) {
    // Defensive: record the failure on the run and return a SAFE message (never
    // include secrets or raw internals). Server-side diagnostics go through the
    // agent logger, which scrubs the scoped brain token + any BYO key from the
    // emitted output (AGENTS.md · Req 11.4, Property 20).
    run.status = 'failed'
    run.failureReason = err instanceof Error ? err.message : String(err)
    run.finishedAt = new Date()
    // Req 10.5: a Run that terminates via an error still carries its unfinished
    // work to the Agent's next Run. The Run_Trace is retained on the run record.
    run.carryOver = {
      pending: true,
      note: run.failureReason || 'Run ended as failed; unfinished work carried to next run.',
    }
    agentLog.error('[agents/run] run failed', err)
    try {
      await run.save()
    } catch {
      // Swallow secondary persistence errors — the primary failure is reported below.
    }
    // Auto support workforce (best-effort): an exception path is a real failure
    // too — open/append a ticket so it is captured + worked on. Dry-runs excluded.
    if (!dryRun) {
      await openOrUpdateTicketForRun({
        userId,
        agentId: String(agent._id),
        agentName: agent.name,
        runId: String(run._id),
        runStatus: 'failed',
        failureReason: run.failureReason,
      })
    }
    return { status: 'error', run, message: 'Agent run failed' }
  }
}
