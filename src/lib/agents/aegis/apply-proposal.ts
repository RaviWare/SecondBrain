// ── Aegis layer · the write choke point ───────────────────────────────────────
// This module is the ONE place in the agent stack that turns an approved
// Proposal into a real vault write. It is the ONLY agent-side caller of
// `applyIngestPlan` (the other, unrelated caller is the unchanged direct
// `runIngest` used by the Clerk UI + `/api/agent/ingest`). The runner is
// structurally incapable of writing — it only ever PLANS — so "propose-never-
// write" (Req 2.10) is an architectural invariant, not a convention.
//
//   applyProposal   — perform the proposed write on approve/auto-apply
//   dismissProposal — reject with no write (negative trust input wired in Phase 2)
//   refineProposal  — record the user's reply and spawn a revised child Proposal
//   undoProposal    — reverse a reversible write within its undo window
//
// See design.md → "Components and Interfaces · 2. Aegis layer", the
// "propose-never-write data flow", and the Error Handling rows on partial-write
// atomicity. Requirements: 2.6, 2.7, 2.8, 2.9, 2.10, 3.6, 3.7, 3.8, 3.11.

import { connectDB } from '@/lib/mongodb'
import { Proposal, Page, Vault, type IProposal } from '@/lib/models'
import { applyIngestPlan, type IngestPlan, type IngestResult } from '@/lib/vault-ops'
import { recordTrustEvents } from '@/lib/agents/trust-events'

/** Who is performing the decision. Clerk-authed callers pass their `userId`. */
export type ActorRef = { userId: string }

/**
 * How long after an auto-apply / approval a reversible action can still be
 * undone from its Undo_Toast (Req 3.7, 3.8). Kept short and deliberate — this is
 * a "wait, undo that" affordance, not a long-lived trash can.
 */
const UNDO_WINDOW_MS = 6_000

/**
 * "Heavy refinement" heuristic (Req 4.6, trust event `proposal-heavily-refined`).
 *
 * The design does not pin an exact definition of "heavy", so we use a simple,
 * documented signal that needs no extra query: the REFINEMENT-COUNT (lineage
 * depth). The FIRST refine of an original Proposal is ordinary collaboration and
 * costs no trust; refining a Proposal that is ITSELF already a refinement child
 * (`parentProposalId != null`) means the Agent needed a 2nd+ round of steering —
 * that is "heavily refined" and decreases trust. This is the lightest defensible
 * rule that still satisfies Req 4.6 ("dismissed OR heavily refined → decrease").
 */
function isHeavyRefinement(original: IProposal): boolean {
  return original.parentProposalId != null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Load a Proposal scoped to the acting user. Returns the hydrated Mongoose doc
 * (we mutate + `save()` it) or throws if it does not exist for this user — a
 * caller must never act on another user's Proposal.
 */
async function loadOwnedProposal(proposalId: string, actor: ActorRef): Promise<IProposal> {
  const proposal = await Proposal.findOne({ _id: proposalId, userId: actor.userId })
  if (!proposal) throw new Error('Proposal not found')
  return proposal
}

/**
 * The slugs of pages this plan WOULD newly create (not the ones it merely merges
 * evidence into). These are the only pages it is safe to delete on undo, so this
 * is exactly "the pages created by this proposal" the undo path reverses.
 */
function createdSlugsFromPlan(plan: IngestPlan): string[] {
  const fromPages = plan.pageOps.filter((op) => op.op === 'create').map((op) => op.slug)
  const fromEntities = plan.entityOps.filter((op) => op.op === 'create').map((op) => op.slug)
  return [...fromPages, ...fromEntities]
}

// ── applyProposal — the write choke point ──────────────────────────────────────

/**
 * Perform the write a Proposal describes, on approval or auto-apply.
 *
 * Flow (Req 2.6, 2.7, 2.8, 2.10):
 *  1. Load the Proposal (scoped to `actor.userId`); reject unless it is `pending`
 *     (the only state from which a fresh apply is valid this phase).
 *  2. `flagged-content` approval carries `plan: null` — approving it simply marks
 *     the hold approved with NO write. A later phase re-plans the held content
 *     and emits a real ingest Proposal; we never write from a null plan.
 *  3. Otherwise call `applyIngestPlan(proposal.userId, plan, { logActor })` — the
 *     single ingest write path, which creates nodes and draws graph edges.
 *     - SUCCESS → status `approved`, record `affectedPages`, open an Undo_Toast
 *       window (reversible), stamp `decidedBy`/`decidedAt`.
 *     - FAILURE → status `failed`, record `failureReason`, leave the vault as-is
 *       (`applyIngestPlan` is the atomic boundary; we simply never mark approved).
 *       We persist the failed Proposal and RETURN it so callers can render the
 *       failure rather than rethrowing.
 *
 * NOTE: positive Trust_Score input on a clean approval (Req 4.3) is wired in
 * Phase 2 (task 2.2) — this is the file that emits it.
 */
export async function applyProposal(proposalId: string, actor: ActorRef): Promise<IProposal> {
  await connectDB()
  const proposal = await loadOwnedProposal(proposalId, actor)

  // Only a pending Proposal may be applied. Terminal states (approved, failed,
  // dismissed, refined, auto-applied) are not re-appliable.
  if (proposal.status !== 'pending') {
    throw new Error(`Cannot apply a proposal with status "${proposal.status}"`)
  }

  const now = new Date()

  // Flagged-content holds carry no plan: approving = "I accept this hold", no
  // write happens here. The held content is re-planned in a later phase.
  if (proposal.kind === 'flagged-content' || proposal.plan == null) {
    proposal.status = 'approved'
    proposal.decidedBy = actor.userId
    proposal.decidedAt = now
    await proposal.save()
    return proposal
  }

  const plan = proposal.plan as IngestPlan

  try {
    const result: IngestResult = await applyIngestPlan(proposal.userId, plan, {
      logActor: { agentId: String(proposal.agentId), runId: String(proposal.runId) },
    })

    // The pages the approval actually wrote (Req 2.7).
    const affectedPages = result.pages.map((p) => p.slug)
    // Only newly-created pages are safe to remove on undo (see createdSlugsFromPlan).
    const undonePages = createdSlugsFromPlan(plan)

    proposal.status = 'approved'
    proposal.affectedPages = affectedPages
    proposal.failureReason = null
    // Open the Undo_Toast window (Req 3.8). `undonePages` is the created-only
    // subset so a reversal removes exactly what this apply added.
    proposal.undo = {
      reversible: true,
      expiresAt: new Date(now.getTime() + UNDO_WINDOW_MS),
      undonePages,
    }
    proposal.markModified('undo')
    proposal.decidedBy = actor.userId
    proposal.decidedAt = now
    await proposal.save()

    // Positive Trust_Score input on a clean approval (Req 4.3): a Proposal
    // approved WITHOUT refinement raises the Agent's trust. A Proposal that is
    // itself a refinement child (`parentProposalId != null`) was NOT approved
    // clean — it needed steering first — so it earns no approve-clean credit.
    // Best-effort: never blocks/breaks the (already-completed) write.
    if (proposal.parentProposalId == null) {
      await recordTrustEvents(proposal.agentId, 'proposal-approved-clean', { userId: proposal.userId })
    }
    return proposal
  } catch (err) {
    // Apply failed: retain a non-approved status and record why, WITHOUT any
    // partial vault mutation (Req 2.8). `applyIngestPlan` is the boundary — if it
    // throws we simply never mark the Proposal approved. Persist-and-return so
    // the caller can render the failed state.
    proposal.status = 'failed'
    proposal.failureReason = err instanceof Error ? err.message : String(err)
    proposal.decidedBy = actor.userId
    proposal.decidedAt = now
    await proposal.save()
    return proposal
  }
}

// ── dismissProposal — reject with no write ─────────────────────────────────────

/**
 * Dismiss a Proposal: status `dismissed`, no write performed (Req 2.9). The
 * dismissal is negative feedback for the originating Agent (Req 4.6) — it emits a
 * `proposal-dismissed` TrustEvent and persists the clamped `Agent.trustScore` via
 * `adjustTrust`. The trust write is a best-effort side effect: it never blocks or
 * reverses the dismissal.
 */
export async function dismissProposal(proposalId: string, actor: ActorRef): Promise<IProposal> {
  await connectDB()
  const proposal = await loadOwnedProposal(proposalId, actor)

  proposal.status = 'dismissed'
  proposal.decidedBy = actor.userId
  proposal.decidedAt = new Date()
  await proposal.save()

  // Negative Trust_Score input — a dismissal is negative feedback (Req 4.6).
  await recordTrustEvents(proposal.agentId, 'proposal-dismissed', { userId: proposal.userId })
  return proposal
}

// ── refineProposal — record the reply, spawn a revised child ───────────────────

/**
 * Refine a Proposal (Req 3.6): mark the original `refined` and create a CHILD
 * Proposal (`parentProposalId = original._id`) that captures the user's reply for
 * the Agent to act on.
 *
 * THIS PHASE: the child is a fresh `pending` Proposal carrying the same
 * kind/plan/citations as the original, with a rationale noting the refine reply.
 * The FULL re-run — re-invoking the Agent through the runner to produce a genuinely
 * revised plan — is completed by the runner path wired when the API/runner invokes
 * it (Phase 4). Returning a parented pending child keeps the Aegis Queue coherent
 * (the original leaves the pending set; the child enters it) in the meantime.
 */
export async function refineProposal(
  proposalId: string,
  reply: string,
  actor: ActorRef,
): Promise<IProposal> {
  await connectDB()
  const original = await loadOwnedProposal(proposalId, actor)

  const now = new Date()
  original.status = 'refined'
  original.decidedBy = actor.userId
  original.decidedAt = now
  await original.save()

  const child = await Proposal.create({
    userId: original.userId,
    agentId: original.agentId,
    runId: original.runId,
    parentProposalId: original._id,
    kind: original.kind,
    title: `Refined: ${original.title}`,
    // Surface the user's steering reply so the Agent (and the queue) see the ask.
    rationale: `Refinement requested by user: "${reply}"\n\nOriginal rationale: ${original.rationale}`,
    citations: original.citations,
    plan: original.plan,
    stakes: original.stakes,
    status: 'pending',
    scanResult: original.scanResult,
  })

  // Negative Trust_Score input on HEAVY refinement only (Req 4.6). A first refine
  // is ordinary collaboration (no trust cost); refining a Proposal that is itself
  // already a refinement child means the Agent needed a 2nd+ round of steering —
  // that is "heavily refined" and decreases trust. Best-effort side effect.
  if (isHeavyRefinement(original)) {
    await recordTrustEvents(original.agentId, 'proposal-heavily-refined', { userId: original.userId })
  }
  return child
}

// ── undoProposal — reverse a reversible write within its window ────────────────

/**
 * Undo an applied write within its undo window (Req 3.7). Valid only when:
 *  - the Proposal's `undo.reversible` is true,
 *  - `undo.expiresAt` is still in the future, and
 *  - the Proposal is `approved` or `auto-applied`.
 *
 * Reversal (best-effort, well-commented): delete the pages this apply created
 * (slugs in `undo.undonePages`, scoped to the user's vault) and decrement the
 * Vault `pageCount` by the number actually removed so counts stay consistent
 * with what was reversed. The Proposal is then moved to a reversed/dismissed-
 * equivalent terminal state and its undo handle cleared, which removes it from
 * the pending set and reflects the outcome downstream (Req 3.11).
 *
 * NOTE: the Source doc created during apply is not deleted here (its id is not
 * carried on the Proposal); page removal is the reversal that restores the
 * knowledge surface. A fuller source-level reversal is a later refinement.
 */
export async function undoProposal(proposalId: string, actor: ActorRef): Promise<IProposal> {
  await connectDB()
  const proposal = await loadOwnedProposal(proposalId, actor)

  const undo = proposal.undo
  const withinWindow = !!undo?.expiresAt && undo.expiresAt.getTime() > Date.now()
  const undoableStatus = proposal.status === 'approved' || proposal.status === 'auto-applied'

  if (!undo?.reversible || !withinWindow || !undoableStatus) {
    throw new Error('Proposal is not reversible within its undo window')
  }

  // Reverse the write: remove the pages this apply created.
  const slugs = undo.undonePages ?? []
  if (slugs.length > 0) {
    const vault = await Vault.findOne({ userId: actor.userId })
    if (vault) {
      const res = await Page.deleteMany({
        userId: actor.userId,
        vaultId: vault._id,
        slug: { $in: slugs },
      })
      const deleted = res.deletedCount ?? 0
      if (deleted > 0) {
        // Best-effort count reconciliation for the pages we actually removed.
        await Vault.updateOne({ _id: vault._id }, { $inc: { pageCount: -deleted } })
      }
    }
  }

  // Move to a reversed/dismissed-equivalent terminal state (the Proposal enum has
  // no dedicated "undone" value) and clear the undo handle so it cannot be undone
  // twice and leaves the pending set.
  proposal.status = 'dismissed'
  proposal.undo = null
  proposal.markModified('undo')
  proposal.decidedBy = actor.userId
  proposal.decidedAt = new Date()
  await proposal.save()
  return proposal
}
