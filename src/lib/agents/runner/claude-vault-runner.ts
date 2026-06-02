// ── ClaudeVaultRunner (execution model B — NOW) ───────────────────────────────
// The in-process runner driver. It executes one Agent Run against the user's
// vault using ONLY the read-only `VaultTools` it is handed and emits
// `DraftProposal[]`. It is structurally incapable of writing to the vault:
//
//   • It never imports `applyIngestPlan` (the single write path lives in the
//     Aegis layer, task 1.7). It can PLAN a write (`tools.planIngest`) but can
//     never PERFORM one.
//   • The only side effects it produces are in-memory: proposals, scan results,
//     a token counter, and a trace.
//
// PHASE-1 SCOPE: this is a single deterministic planning pass, not yet a real
// multi-turn Claude tool-use loop. It builds the system context from the Agent's
// role + assigned skill prompt templates, then for each ingest-class input it
// runs fetchSource → scan → (planIngest | flag) and turns the result into a
// proposal. The richer LLM tool-use loop (Claude deciding which tools to call,
// search/query-driven synthesis proposals, etc.) is a later enhancement that
// slots in behind this same `AgentRunner` contract — the propose-never-write
// invariant and the Proposal shape it emits do not change.
// See design.md → "Components and Interfaces · 1. The runner engine".
import { getSkill, type SkillDef } from '@/lib/skills/catalog'
import type { IngestInput, IngestPlan } from '@/lib/vault-ops'
import type {
  AgentRunner,
  RunContext,
  RunOutput,
  VaultTools,
  DraftProposal,
  RunTraceEntry,
  ScanResult,
} from './types'

// Rough token estimate (~4 chars/token) used to charge the in-memory budget for
// steps whose token cost is not reported back by a tool (system context, fetch).
// planIngest reports its real planning-phase tokens via `IngestPlan.tokensUsed`.
const TOKENS_PER_CHAR = 0.25

function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) * TOKENS_PER_CHAR)
}

/** The slice of a configured Agent doc the runner reads (it receives it as `unknown`). */
type RunnerAgentConfig = {
  name: string
  role: string
  roleDescription: string | null
  objective: string
  skillIds: string[]
  ingestInputs: IngestInput[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function pickObjective(a: Record<string, unknown>, roleDescription: string | null): string {
  if (typeof a.objective === 'string' && a.objective.trim()) return a.objective.trim()
  if (roleDescription && roleDescription.trim()) return roleDescription.trim()
  return 'Tend and grow the knowledge vault'
}

function pickSkillIds(a: Record<string, unknown>): string[] {
  const candidates = [a.skillIds, a.skillCatalogIds, a.assignedSkillIds, a.skills]
  for (const c of candidates) {
    if (Array.isArray(c)) return c.filter((x): x is string => typeof x === 'string')
  }
  return []
}

/** Accepts only well-formed IngestInput values (url with a url, or text with text). */
function isIngestInput(value: unknown): value is IngestInput {
  const v = asRecord(value)
  if (v.type === 'url') return typeof v.url === 'string'
  if (v.type === 'text') return typeof v.text === 'string'
  return false
}

function pickIngestInputs(a: Record<string, unknown>): IngestInput[] {
  const lists = [a.ingestInputs, a.inputs, a.pendingInputs]
  for (const list of lists) {
    if (Array.isArray(list)) return list.filter(isIngestInput)
  }
  if (isIngestInput(a.input)) return [a.input]
  return []
}

function readAgentConfig(agent: unknown): RunnerAgentConfig {
  const a = asRecord(agent)
  const role = typeof a.role === 'string' ? a.role : 'researcher'
  const roleDescription = typeof a.customRoleDescription === 'string' ? a.customRoleDescription : null
  const name = typeof a.name === 'string' ? a.name : 'Agent'
  return {
    name,
    role,
    roleDescription,
    objective: pickObjective(a, roleDescription),
    skillIds: pickSkillIds(a),
    ingestInputs: pickIngestInputs(a),
  }
}

function interpolate(template: string, objective: string): string {
  // Replace every {{objective}} occurrence without a regex (safe for any objective text).
  return template.split('{{objective}}').join(objective)
}

/** Lightweight system context: role line + each assigned skill's interpolated prompt. */
function buildSystemContext(cfg: RunnerAgentConfig): string {
  const header = cfg.roleDescription
    ? `You are "${cfg.name}", a ${cfg.role} agent. ${cfg.roleDescription}`
    : `You are "${cfg.name}", a ${cfg.role} agent working from the user's private knowledge vault.`
  const skillPrompts = cfg.skillIds
    .map(id => getSkill(id))
    .filter((s): s is SkillDef => Boolean(s))
    .map(s => interpolate(s.promptTemplate, cfg.objective))
  const body = skillPrompts.length
    ? skillPrompts.join('\n\n')
    : `Objective: "${cfg.objective}". Read the vault, decide what should change, and emit proposals — never write directly.`
  return `${header}\n\n${body}`
}

/** At least one citation for a factual proposal (Req 2.5), derived from the plan's source. */
function buildCitations(plan: IngestPlan): DraftProposal['citations'] {
  const quote = (plan.source.rawContent || plan.source.title || '').slice(0, 160).trim()
  const citation: { slug?: string; url?: string; quote: string } = {
    quote: quote || plan.source.title || 'Source content',
  }
  if (plan.source.url) citation.url = plan.source.url
  return [citation]
}

function buildIngestProposal(plan: IngestPlan): DraftProposal {
  const creates = plan.pageOps.filter(op => op.op === 'create').length
  const updates = plan.pageOps.filter(op => op.op === 'update').length
  const entities = plan.entityOps.length
  return {
    kind: 'ingest',
    title: `Ingest "${plan.source.title}"`,
    rationale:
      `Would create ${creates} and update ${updates} wiki page(s) and enrich ${entities} entity page(s) ` +
      `from this source. Nothing is written until you approve.`,
    citations: buildCitations(plan),
    plan,
  }
}

export class ClaudeVaultRunner implements AgentRunner {
  async run(ctx: RunContext, tools: VaultTools): Promise<RunOutput> {
    const trace: RunTraceEntry[] = []
    const proposals: DraftProposal[] = []
    const scanResults: ScanResult[] = []
    let tokensUsed = 0
    // Undefined/missing budget ⇒ unlimited; a real numeric cap (including 0) is honored.
    const perRunTokens =
      typeof ctx.budget?.perRunTokens === 'number' ? ctx.budget.perRunTokens : Number.POSITIVE_INFINITY
    let outcome: RunOutput['outcome'] = 'completed'

    try {
      const cfg = readAgentConfig(ctx.agent)

      // 1. Build the system context (role + assigned skill prompt templates).
      const systemContext = buildSystemContext(cfg)
      const contextTokens = estimateTokens(systemContext)
      tokensUsed += contextTokens
      trace.push({ at: new Date(), skillId: null, step: 'build-system-context', tokens: contextTokens })

      // 2. Ingest-class work: fetch → scan → (flag | plan), emitting proposals.
      for (const input of cfg.ingestInputs) {
        // Budget guard: stop adding work once we've reached the per-run cap.
        if (tokensUsed >= perRunTokens) {
          outcome = 'budget-stopped'
          break
        }

        const source = await tools.fetchSource(input)
        const fetchTokens = estimateTokens(source.rawContent)
        tokensUsed += fetchTokens
        trace.push({ at: new Date(), skillId: null, step: `fetch-source:${source.title}`, tokens: fetchTokens })

        const scan = tools.scan(source)
        scanResults.push(scan)
        trace.push({ at: new Date(), skillId: null, step: `scan:${scan.status}`, tokens: 0 })

        if (scan.status === 'flagged') {
          // Hold for review — never plan, never ingest silently (Req 5.4–5.7).
          proposals.push({
            kind: 'flagged-content',
            title: `Flagged content: ${source.title}`,
            rationale:
              `Content_Scanner flagged ${scan.findings.length} suspicious passage(s) in this source. ` +
              `Held for your review; it was not ingested.`,
            citations: [],
            plan: null,
            scanResult: scan,
          })
          continue
        }

        // Clean → compute what an ingest WOULD write (no write performed).
        const plan = (await tools.planIngest(input)) as IngestPlan
        const planTokens = typeof plan?.tokensUsed === 'number' ? plan.tokensUsed : 0
        tokensUsed += planTokens
        trace.push({ at: new Date(), skillId: null, step: `plan-ingest:${plan.source.title}`, tokens: planTokens })

        proposals.push(buildIngestProposal(plan))
      }

      return { proposals, scanResults, tokensUsed, trace, outcome }
    } catch (err) {
      return {
        proposals,
        scanResults,
        tokensUsed,
        trace,
        outcome: 'failed',
        failureReason: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
