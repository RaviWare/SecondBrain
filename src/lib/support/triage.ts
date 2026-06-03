// ── Support ticket triage (pure core) ─────────────────────────────────────────
// When an Agent run fails, the support system opens (or updates) a ticket and a
// worker "works on it" — exactly like a support workforce: diagnose, attempt a
// safe remedy, document every step, resolve or escalate.
//
// This file is the PURE brain of that workflow: given a failed run's signals it
// classifies the failure, decides severity, and decides the NEXT action (retry vs
// escalate vs resolve). No I/O, no clock, no randomness — same input ⇒ same
// output, so it is the direct unit/property-test target. The async orchestration
// (DB writes, re-running the agent) lives in `tickets.ts` + the worker route.
//
// HONEST SCOPE: the only automated remedy is a BOUNDED RETRY for transient /
// timeout failures (the classes a retry can plausibly clear). Security
// (injection), scope violations, budget caps, and unknown failures are NEVER
// auto-"fixed" — they are escalated to a human with a documented recommendation.

/** Failure class a run failure is bucketed into. */
export type TicketCategory =
  | 'budget' // hit a token/budget cap — needs a human budget decision
  | 'timeout' // run timed out — a retry may clear it
  | 'transient' // generic run failure/error — bounded retry, then escalate
  | 'scope' // attempted to act out of Trust_Scope — needs human review
  | 'injection' // content scanner flagged an injection attempt — security, human
  | 'unknown' // could not classify — escalate

export type TicketSeverity = 'low' | 'medium' | 'high'

/** The lifecycle states a ticket moves through. */
export type TicketStatus =
  | 'open' // just created
  | 'investigating' // worker picked it up
  | 'in-progress' // an automated remedy (retry) is being attempted
  | 'awaiting-admin' // escalated; needs a human
  | 'resolved' // fixed (auto-recovered or admin-closed)
  | 'wont-fix' // admin closed without a fix

/** The next action the worker should take on a ticket. */
export type TicketAction = 'retry' | 'escalate' | 'resolve' | 'wait'

/** Signals extracted from a finished (failed) AgentRun. */
export interface FailureSignals {
  /** AgentRun.status: 'failed' | 'budget-stopped' | 'timeout' | (others ignored). */
  runStatus: string
  /** AgentRun.failureReason (already secret-safe) or null. */
  failureReason: string | null
}

export interface Diagnosis {
  category: TicketCategory
  severity: TicketSeverity
  /** Whether this class has a safe, bounded automated remedy (a retry). */
  autoRemediable: boolean
  /** Plain-language explanation of what went wrong. */
  diagnosis: string
  /** What should happen next (human-facing recommendation). */
  recommendedAction: string
}

/** Default number of automated retry attempts before escalating. */
export const DEFAULT_MAX_RETRIES = 2

function has(reason: string | null, needle: string): boolean {
  return typeof reason === 'string' && reason.toLowerCase().includes(needle)
}

/**
 * Classify a failed run into a category + severity + remediation posture.
 * PURE / TOTAL / DETERMINISTIC.
 *
 * Precedence (most security-relevant first): injection → scope → budget →
 * timeout → generic transient → unknown.
 */
export function diagnoseFailure(signals: FailureSignals): Diagnosis {
  const status = (signals?.runStatus || '').toLowerCase()
  const reason = signals?.failureReason ?? null

  // 1. Injection — a content scanner flag is a security concern; never auto-fixed.
  if (has(reason, 'injection') || has(reason, 'prompt injection')) {
    return {
      category: 'injection',
      severity: 'high',
      autoRemediable: false,
      diagnosis: 'The content scanner flagged a possible prompt-injection attempt in material the agent read.',
      recommendedAction:
        'Review the flagged source in the Aegis queue. Do not auto-retry — confirm the source is safe before this agent runs again.',
    }
  }

  // 2. Scope violation — the agent tried to act outside its Trust_Scope.
  if (has(reason, 'scope')) {
    return {
      category: 'scope',
      severity: 'medium',
      autoRemediable: false,
      diagnosis: 'The agent attempted an action outside its granted Trust_Scope.',
      recommendedAction:
        'Review the agent\'s Trust_Scope and the attempted action. Widen the scope deliberately or adjust the objective; a retry without changes will fail the same way.',
    }
  }

  // 3. Budget — a token/budget cap stopped the run. Needs a human budget decision.
  if (status === 'budget-stopped' || has(reason, 'budget') || has(reason, 'token cap')) {
    return {
      category: 'budget',
      severity: 'medium',
      autoRemediable: false,
      diagnosis: 'The run stopped because a token/budget cap was reached (per-run, per-agent, or squad).',
      recommendedAction:
        'Raise the relevant budget cap or wait for the next budget period. The agent will resume once headroom is available — no code fix needed.',
    }
  }

  // 4. Timeout — a retry can plausibly clear a transient slow path.
  if (status === 'timeout' || has(reason, 'timeout') || has(reason, 'timed out')) {
    return {
      category: 'timeout',
      severity: 'medium',
      autoRemediable: true,
      diagnosis: 'The run exceeded its time limit before completing.',
      recommendedAction: 'Automatically retry up to the retry limit; if it keeps timing out, escalate for a human to investigate.',
    }
  }

  // 5. Generic failure/error — treat as transient with a bounded retry.
  if (status === 'failed' || status === 'error' || (reason && reason.length > 0)) {
    return {
      category: 'transient',
      severity: 'medium',
      autoRemediable: true,
      diagnosis: reason ? `The run failed: ${reason}` : 'The run failed for an unspecified reason.',
      recommendedAction: 'Automatically retry up to the retry limit; if it keeps failing, escalate with the captured trace for a human to investigate.',
    }
  }

  // 6. Unknown — could not classify; escalate to be safe.
  return {
    category: 'unknown',
    severity: 'medium',
    autoRemediable: false,
    diagnosis: 'The run did not complete cleanly and the cause could not be classified.',
    recommendedAction: 'Escalate for a human to inspect the run trace.',
  }
}

/**
 * Decide the worker's next action for a ticket. PURE / TOTAL.
 *
 *   • auto-remediable (timeout/transient) + retries remaining → 'retry'
 *   • auto-remediable but retries exhausted                   → 'escalate'
 *   • not auto-remediable                                     → 'escalate'
 *   • already terminal (resolved/wont-fix/awaiting-admin)     → 'wait'
 */
export function nextTicketAction(input: {
  category: TicketCategory
  status: TicketStatus
  retryCount: number
  maxRetries?: number
}): TicketAction {
  const max = input.maxRetries ?? DEFAULT_MAX_RETRIES

  // Terminal / already-escalated tickets are not acted on by the worker.
  if (input.status === 'resolved' || input.status === 'wont-fix' || input.status === 'awaiting-admin') {
    return 'wait'
  }

  const autoRemediable = input.category === 'timeout' || input.category === 'transient'
  if (!autoRemediable) return 'escalate'
  return input.retryCount < max ? 'retry' : 'escalate'
}

/** Build the short, human ticket title from an agent name + diagnosis. */
export function ticketTitle(agentName: string, d: Diagnosis): string {
  const name = (agentName || 'Agent').trim()
  switch (d.category) {
    case 'budget':
      return `${name} stopped — budget cap reached`
    case 'timeout':
      return `${name} timed out`
    case 'scope':
      return `${name} attempted an out-of-scope action`
    case 'injection':
      return `${name} read flagged content (possible injection)`
    case 'transient':
      return `${name} run failed`
    case 'unknown':
    default:
      return `${name} run did not complete`
  }
}

/**
 * Stable dedupe key so repeated identical failures append to ONE open ticket
 * rather than spawning a new ticket each run. Keyed by agent + category, so an
 * agent failing the same way repeatedly accumulates a timeline on a single ticket.
 */
export function dedupeKey(agentId: string, category: TicketCategory): string {
  return `ticket:${agentId}:${category}`
}
