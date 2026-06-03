import mongoose, { Schema, Document, Model } from 'mongoose'
import { INITIAL_TRUST_SCORE } from '@/lib/agents/trust'

// ── User Vault ──────────────────────────────────────────────
export interface IVault extends Document {
  userId: string
  name: string
  description: string
  pageCount: number
  sourceCount: number
  lastLintAt: Date | null
  createdAt: Date
}

const VaultSchema = new Schema<IVault>({
  userId:      { type: String, required: true, index: true },
  name:        { type: String, required: true, default: 'My Second Brain' },
  description: { type: String, default: '' },
  pageCount:   { type: Number, default: 0 },
  sourceCount: { type: Number, default: 0 },
  lastLintAt:  { type: Date, default: null },
}, { timestamps: true })

// ── Source ──────────────────────────────────────────────────
export interface ISource extends Document {
  userId: string
  vaultId: mongoose.Types.ObjectId
  type: 'url' | 'text' | 'file'
  title: string
  url: string | null
  rawContent: string
  wordCount: number
  createdAt: Date
}

const SourceSchema = new Schema<ISource>({
  userId:     { type: String, required: true, index: true },
  vaultId:    { type: Schema.Types.ObjectId, ref: 'Vault', required: true },
  type:       { type: String, enum: ['url', 'text', 'file'], required: true },
  title:      { type: String, required: true },
  url:        { type: String, default: null },
  rawContent: { type: String, required: true },
  wordCount:  { type: Number, default: 0 },
}, { timestamps: true })

// ── Wiki Page ───────────────────────────────────────────────
// Uses GBrain "Compiled Truth + Timeline" pattern:
//   content field contains both zones separated by ---TIMELINE---
//   Zone 1 (above separator): Current synthesized understanding
//   Zone 2 (below separator): Append-only evidence trail
export interface IPage extends Document {
  userId: string
  vaultId: mongoose.Types.ObjectId
  slug: string
  title: string
  type: 'source-summary' | 'concept' | 'entity' | 'synthesis' | 'pattern' | 'query-answer'
  entityType?: 'person' | 'organization' | 'product' | 'place'
  content: string
  summary: string
  sources: mongoose.Types.ObjectId[]
  relatedSlugs: string[]
  tags: string[]
  confidence: 'high' | 'medium' | 'low'
  pinned: boolean
  timelineEntries: number
  createdAt: Date
  updatedAt: Date
}

const PageSchema = new Schema<IPage>({
  userId:         { type: String, required: true, index: true },
  vaultId:        { type: Schema.Types.ObjectId, ref: 'Vault', required: true },
  slug:           { type: String, required: true },
  title:          { type: String, required: true },
  type:           { type: String, enum: ['source-summary', 'concept', 'entity', 'synthesis', 'pattern', 'query-answer'], required: true },
  entityType:     { type: String, enum: ['person', 'organization', 'product', 'place'], default: null },
  content:        { type: String, required: true },
  summary:        { type: String, default: '' },
  sources:        [{ type: Schema.Types.ObjectId, ref: 'Source' }],
  relatedSlugs:   [String],
  tags:           [String],
  confidence:     { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  pinned:         { type: Boolean, default: false },
  timelineEntries:{ type: Number, default: 1 },
}, { timestamps: true })

PageSchema.index({ userId: 1, vaultId: 1, slug: 1 }, { unique: true })
PageSchema.index({ title: 'text', content: 'text', tags: 'text' })

// ── Log ─────────────────────────────────────────────────────
// `operation` is widened additively with 'agent' so agent-attributed activity
// can feed the Activity_Feed; existing 'ingest'|'query'|'lint' rows stay valid.
// Optional `agentId` attributes a log entry to an Agent (set by applyIngestPlan's
// logActor); absent on all existing rows, so nothing breaks.
export interface ILog extends Document {
  userId: string
  vaultId: mongoose.Types.ObjectId
  operation: 'ingest' | 'query' | 'lint' | 'agent'
  summary: string
  pagesAffected: string[]
  tokensUsed: number
  agentId?: mongoose.Types.ObjectId
  createdAt: Date
}

const LogSchema = new Schema<ILog>({
  userId:        { type: String, required: true, index: true },
  vaultId:       { type: Schema.Types.ObjectId, ref: 'Vault', required: true },
  operation:     { type: String, enum: ['ingest', 'query', 'lint', 'agent'], required: true },
  summary:       { type: String, required: true },
  pagesAffected: [String],
  tokensUsed:    { type: Number, default: 0 },
  agentId:       { type: Schema.Types.ObjectId, ref: 'Agent', default: null },
}, { timestamps: true })

// ── User Plan ────────────────────────────────────────────────
export interface IUserPlan extends Document {
  userId: string
  plan: 'free' | 'pro'
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  ingestsThisMonth: number
  queriesThisMonth: number
  periodStart: Date
}

const UserPlanSchema = new Schema<IUserPlan>({
  userId:               { type: String, required: true, unique: true },
  plan:                 { type: String, enum: ['free', 'pro'], default: 'free' },
  stripeCustomerId:     { type: String, default: null },
  stripeSubscriptionId: { type: String, default: null },
  ingestsThisMonth:     { type: Number, default: 0 },
  queriesThisMonth:     { type: Number, default: 0 },
  periodStart:          { type: Date, default: Date.now },
}, { timestamps: true })

// ── Agent Token (Hermes / MCP agent access) ─────────────────
// Lets an external autonomous agent (Hermes, OpenClaw, any MCP client) act on
// a user's vault via bearer auth. We store ONLY a SHA-256 hash of the token —
// the plaintext is shown once at creation and never persisted. Scopes gate
// what the agent may do; lastUsedAt powers an activity indicator.
export interface IAgentToken extends Document {
  userId: string
  name: string
  tokenHash: string
  prefix: string            // first 8 chars (sb_xxxx) for display, non-secret
  scopes: Array<'read' | 'write'>
  lastUsedAt: Date | null
  revoked: boolean
  createdAt: Date
}

const AgentTokenSchema = new Schema<IAgentToken>({
  userId:     { type: String, required: true, index: true },
  name:       { type: String, required: true, default: 'Agent token' },
  tokenHash:  { type: String, required: true, unique: true, index: true },
  prefix:     { type: String, required: true },
  scopes:     { type: [String], default: ['read'] },
  lastUsedAt: { type: Date, default: null },
  revoked:    { type: Boolean, default: false },
}, { timestamps: true })

// ── User Agent (per-user Hermes instance) ───────────────────
// Tracks one Hermes agent container per user. The web app is the control plane;
// this records the container's lifecycle + the scoped brain token it uses.
// BYO LLM key is NEVER stored here — it's injected into the container at start
// and held only in the container's env.
export interface IUserAgent extends Document {
  userId: string
  status: 'none' | 'provisioning' | 'running' | 'stopped' | 'error'
  containerId: string | null
  containerName: string | null
  tokenId: string | null          // ref to the AgentToken minted for this agent
  llmProvider: string | null      // e.g. 'openrouter', 'anthropic' (key NOT stored)
  llmModel: string | null
  runnerDriver?: 'claude' | 'hermes'  // optional; absence = current behavior
  lastActiveAt: Date | null
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}

const UserAgentSchema = new Schema<IUserAgent>({
  userId:        { type: String, required: true, unique: true, index: true },
  status:        { type: String, enum: ['none', 'provisioning', 'running', 'stopped', 'error'], default: 'none' },
  containerId:   { type: String, default: null },
  containerName: { type: String, default: null },
  tokenId:       { type: String, default: null },
  llmProvider:   { type: String, default: null },
  llmModel:      { type: String, default: null },
  runnerDriver:  { type: String, enum: ['claude', 'hermes'] },
  lastActiveAt:  { type: Date, default: null },
  lastError:     { type: String, default: null },
}, { timestamps: true })

// ── Agent (configured worker — multi-agent model) ──────────
// NEW collection that supersedes UserAgent for the multi-agent model. UserAgent
// stays the single container-runtime record (one per user) that an Agent
// references when executed via the Hermes container runner. All vault writes
// flow through approved Proposals — the Agent itself never writes.
export interface IAgent extends Document {
  userId: string
  name: string
  role: 'scout' | 'synthesist' | 'connector' | 'critic' | 'librarian' | 'researcher' | 'custom'
  customRoleDescription: string | null

  // Schedule (Req 1.4–1.6) — discriminated by `kind`, stored as a Mixed subdoc.
  schedule:
    | { kind: 'scheduled'; cron: string }
    | { kind: 'reactive'; event: string; sourceAgentId: string | null }
    | { kind: 'manual' }

  // Skills assigned (Authority_Grants) — refs to InstalledSkill ids
  assignedSkillIds: string[]

  // Sign-off policy (Req 1.1, 7) — per action type: auto vs ask-first
  signOffPolicy: {
    ingestSource: 'auto' | 'ask'
    createSynthesis: 'auto' | 'ask'
    createConnection: 'auto' | 'ask'
    flagContradiction: 'auto' | 'ask' | 'notify'
  }

  // Trust scope (least privilege, Req 1.7, 1.8)
  trustScope: {
    readableSourceIds: mongoose.Types.ObjectId[]
    readableCollections: string[]
    webAccess: boolean
    perRunTokenBudget: number
  }
  trustScopeStatement: string

  // Trust (Req 4) — earned, not a setting; default in the Watch/Proving band
  trustScore: number

  // Budget (Req 10.4) — per-agent cap level
  budget: {
    period: 'weekly' | 'monthly'
    tokenCap: number
    tokensThisPeriod: number
    periodStart: Date
  }

  // Lifecycle (Req 1.9–1.13)
  lifecycle: 'describe' | 'preview' | 'dry-run' | 'deploy' | 'monitor' | 'pause' | 'retire'
  hadSuccessfulDryRun: boolean         // gates deploy (Req 7.10)
  budgetPaused: boolean                // Req 10.6

  // Sub-agent (Req 8.9–8.11)
  parentAgentId: mongoose.Types.ObjectId | null

  // Runtime linkage (reuse, Req 1.14)
  userAgentId: string | null           // → UserAgent (container) when hermes runner
  tokenId: string | null               // → AgentToken scoped to trustScope (Req 11.6)
  createdAt: Date
  updatedAt: Date
}

const AgentSchema = new Schema<IAgent>({
  userId:                { type: String, required: true, index: true },
  name:                  { type: String, required: true },
  role:                  { type: String, enum: ['scout', 'synthesist', 'connector', 'critic', 'librarian', 'researcher', 'custom'], required: true },
  customRoleDescription: { type: String, default: null },

  schedule:              { type: Schema.Types.Mixed, default: { kind: 'manual' } },

  assignedSkillIds:      [String],

  signOffPolicy: {
    ingestSource:        { type: String, enum: ['auto', 'ask'], default: 'ask' },
    createSynthesis:     { type: String, enum: ['auto', 'ask'], default: 'ask' },
    createConnection:    { type: String, enum: ['auto', 'ask'], default: 'ask' },
    flagContradiction:   { type: String, enum: ['auto', 'ask', 'notify'], default: 'notify' },
  },

  trustScope: {
    readableSourceIds:   [{ type: Schema.Types.ObjectId, ref: 'Source' }],
    readableCollections: [String],
    webAccess:           { type: Boolean, default: false },
    perRunTokenBudget:   { type: Number, default: 0 },
  },
  trustScopeStatement:   { type: String, default: '' },

  trustScore:            { type: Number, default: INITIAL_TRUST_SCORE },

  budget: {
    period:              { type: String, enum: ['weekly', 'monthly'], default: 'monthly' },
    tokenCap:            { type: Number, default: 0 },
    tokensThisPeriod:    { type: Number, default: 0 },
    periodStart:         { type: Date, default: Date.now },
  },

  lifecycle:             { type: String, enum: ['describe', 'preview', 'dry-run', 'deploy', 'monitor', 'pause', 'retire'], default: 'describe' },
  hadSuccessfulDryRun:   { type: Boolean, default: false },
  budgetPaused:          { type: Boolean, default: false },

  parentAgentId:         { type: Schema.Types.ObjectId, ref: 'Agent', default: null },

  userAgentId:           { type: String, default: null },
  tokenId:               { type: String, default: null },
}, { timestamps: true })

AgentSchema.index({ userId: 1 })

// ── Proposal (the unit of propose-never-write) ──────────────
// Carries everything the Aegis Queue renders (what · why · decision) plus the
// resolved write plan to apply on approval. A write to the vault happens only
// when a Proposal is approved/auto-applied via applyProposal.
export interface IProposal extends Document {
  userId: string
  // Originating Agent + Run (Req 2.3). Both are non-null for every Proposal a Run
  // emits. They are ADDITIVELY OPTIONAL (default null, Req 11.8) so the system can
  // also surface a SYSTEM-originated item that belongs in the Aegis Queue but is
  // tied to no Agent run — specifically the periodic Skill re-scan auto-disable
  // notice (Req 9.10, 9.11; `src/lib/skills/rescan.ts`). Runner-emitted proposals
  // are unaffected and still always carry both (Property 15).
  agentId: mongoose.Types.ObjectId | null     // originating Agent (Req 2.3); null for system items
  runId: mongoose.Types.ObjectId | null       // originating AgentRun (Req 2.3); null for system items
  parentProposalId: mongoose.Types.ObjectId | null   // refine lineage

  kind: 'ingest' | 'synthesis' | 'connection' | 'flagged-content'
  title: string                        // "what is proposed"
  rationale: string                    // "why" (Req 2.3)
  citations: Array<{ slug?: string; url?: string; quote: string }>

  // The resolved write to perform on approval (null for flagged-content holds):
  plan: unknown                        // IngestPlan | ConnectionPlan | null

  stakes: 'low-reversible' | 'sign-off-required'
  status: 'pending' | 'approved' | 'refined' | 'dismissed' | 'auto-applied' | 'failed'

  scanResult: unknown | null           // present + flagged for kind==='flagged-content'

  affectedPages: string[]              // slugs written on approve (Req 2.7)
  failureReason: string | null         // Req 2.8
  undo: { reversible: boolean; expiresAt: Date | null; undonePages?: string[] } | null
  decidedBy: string | null
  decidedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const ProposalSchema = new Schema<IProposal>({
  userId:           { type: String, required: true, index: true },
  agentId:          { type: Schema.Types.ObjectId, ref: 'Agent', default: null, index: true },
  runId:            { type: Schema.Types.ObjectId, ref: 'AgentRun', default: null },
  parentProposalId: { type: Schema.Types.ObjectId, ref: 'Proposal', default: null },

  kind:             { type: String, enum: ['ingest', 'synthesis', 'connection', 'flagged-content'], required: true },
  title:            { type: String, required: true },
  rationale:        { type: String, default: '' },
  citations:        [{
    _id:   false,
    slug:  { type: String },
    url:   { type: String },
    quote: { type: String, required: true },
  }],

  plan:             { type: Schema.Types.Mixed, default: null },

  stakes:           { type: String, enum: ['low-reversible', 'sign-off-required'], required: true },
  status:           { type: String, enum: ['pending', 'approved', 'refined', 'dismissed', 'auto-applied', 'failed'], default: 'pending' },

  scanResult:       { type: Schema.Types.Mixed, default: null },

  affectedPages:    [String],
  failureReason:    { type: String, default: null },
  undo:             { type: Schema.Types.Mixed, default: null },
  decidedBy:        { type: String, default: null },
  decidedAt:        { type: Date, default: null },
}, { timestamps: true })

ProposalSchema.index({ userId: 1, status: 1 })

// ── AgentRun (one execution) ────────────────────────────────
// Holds the Run_Trace and the cost/outcome that feed trust + budget. Retained
// even for failed/budget-stopped/timeout runs (Req 10.1, 10.11).
export interface IAgentRun extends Document {
  userId: string
  agentId: mongoose.Types.ObjectId
  parentRunId: mongoose.Types.ObjectId | null   // sub-agent run
  trigger: 'manual' | 'dry-run' | 'scheduled' | 'reactive'
  dryRun: boolean

  status: 'running' | 'completed' | 'failed' | 'budget-stopped' | 'timeout'
  outcome: string | null               // human summary
  failureReason: string | null

  // Run_Trace (Req 10.1, 10.11)
  trace: Array<{ at: Date; skillId: string | null; step: string; tokens: number }>
  tokensUsed: number
  perRunBudget: number

  proposalIds: mongoose.Types.ObjectId[]
  scopeViolations: number              // feeds trust (Req 4.7)
  carryOver: { pending: boolean; note: string | null }   // Req 10.5
  startedAt: Date
  finishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const AgentRunSchema = new Schema<IAgentRun>({
  userId:          { type: String, required: true, index: true },
  agentId:         { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
  parentRunId:     { type: Schema.Types.ObjectId, ref: 'AgentRun', default: null },
  trigger:         { type: String, enum: ['manual', 'dry-run', 'scheduled', 'reactive'], required: true },
  dryRun:          { type: Boolean, default: false },

  status:          { type: String, enum: ['running', 'completed', 'failed', 'budget-stopped', 'timeout'], default: 'running' },
  outcome:         { type: String, default: null },
  failureReason:   { type: String, default: null },

  trace:           [{
    _id:     false,
    at:      { type: Date, default: Date.now },
    skillId: { type: String, default: null },
    step:    { type: String, required: true },
    tokens:  { type: Number, default: 0 },
  }],
  tokensUsed:      { type: Number, default: 0 },
  perRunBudget:    { type: Number, default: 0 },

  proposalIds:     [{ type: Schema.Types.ObjectId, ref: 'Proposal' }],
  scopeViolations: { type: Number, default: 0 },
  carryOver: {
    pending:       { type: Boolean, default: false },
    note:          { type: String, default: null },
  },
  startedAt:       { type: Date, default: Date.now },
  finishedAt:      { type: Date, default: null },
}, { timestamps: true })

AgentRunSchema.index({ userId: 1, agentId: 1 })

// ── InstalledSkill (per-user install/scan/enable state) ─────
// Reconciles "catalog is code" with the install lifecycle: `catalog.ts` stays
// the curated Discover registry (SkillDef[]); this NEW collection is the
// per-user Installed state. Installing a Skill is a Capability_Grant (the
// Skill's existence) — it grants NO Agent authority on its own (Req 9.5, 9.6).
// `scanStatus` mirrors the Security_Scan result; a failing periodic re-scan
// auto-disables the Skill (Req 9.11). A user installs a given Skill at most
// once — enforced by the unique { userId, skillId } index.
export interface IInstalledSkill extends Document {
  userId: string
  skillId: string                      // → SKILLS[].id in catalog.ts (Discover registry)
  installedVersion: string             // SkillDef.version at install time
  enabled: boolean                     // Req 9.8, 9.12 — disabled blocks Authority_Grant + invocation
  scanStatus: 'passed' | 'failed' | 'pending'   // Security_Scan result (Req 9.3, 9.10)
  scanReasons: string[]                // failure reasons when scanStatus==='failed'
  lastScannedAt: Date | null
  autoDisabledByScan: boolean          // Req 9.11 — re-scan failure auto-disabled it
  createdAt: Date
  updatedAt: Date
}

const InstalledSkillSchema = new Schema<IInstalledSkill>({
  userId:             { type: String, required: true, index: true },
  skillId:            { type: String, required: true },
  installedVersion:   { type: String, required: true },
  enabled:            { type: Boolean, default: true },
  scanStatus:         { type: String, enum: ['passed', 'failed', 'pending'], default: 'pending' },
  scanReasons:        { type: [String], default: [] },
  lastScannedAt:      { type: Date, default: null },
  autoDisabledByScan: { type: Boolean, default: false },
}, { timestamps: true })

InstalledSkillSchema.index({ userId: 1, skillId: 1 }, { unique: true })

// ── SquadBudget (squad-level / monthly token cap) ───────────
// The THIRD budget level above per-Run (`AgentRun.perRunBudget`) and per-Agent
// (`Agent.budget`): a single squad-wide monthly token cap per user (Req 10.4).
// A dedicated NEW collection keeps `UserPlan` untouched (Req 11.8 — additive
// only). One squad budget per user, enforced by the unique `userId`.
// `tokensThisPeriod` accumulates across all of the user's Agents within the
// current period; `periodStart` anchors the monthly window for reset.
export interface ISquadBudget extends Document {
  userId: string
  monthlyTokenCap: number
  tokensThisPeriod: number
  periodStart: Date
  createdAt: Date
  updatedAt: Date
}

const SquadBudgetSchema = new Schema<ISquadBudget>({
  userId:           { type: String, required: true, unique: true, index: true },
  monthlyTokenCap:  { type: Number, default: 0 },
  tokensThisPeriod: { type: Number, default: 0 },
  periodStart:      { type: Date, default: Date.now },
}, { timestamps: true })

// ── UpstreamWatch (one row per watched repo) ────────────────
// Persists the "last seen" marker for an upstream GitHub repo the admin monitor
// tracks (default: NousResearch/hermes-agent). The pure `diffUpstream` core
// compares a fresh fetch against this marker to decide whether to alert. One row
// per `repo`. No code is ever pulled — this only records what we last saw so the
// scheduled check is stateful and idempotent.
export interface IUpstreamWatch extends Document {
  repo: string                    // "owner/name"
  releaseTag: string | null       // last-seen latest release tag
  commitSha: string | null        // last-seen latest default-branch commit
  lastCheckedAt: Date | null      // when the cron last polled
  lastChangedAt: Date | null      // when an advance was last detected
  lastError: string | null        // last fetch error (secret-safe), if any
  createdAt: Date
  updatedAt: Date
}

const UpstreamWatchSchema = new Schema<IUpstreamWatch>({
  repo:          { type: String, required: true, unique: true, index: true },
  releaseTag:    { type: String, default: null },
  commitSha:     { type: String, default: null },
  lastCheckedAt: { type: Date, default: null },
  lastChangedAt: { type: Date, default: null },
  lastError:     { type: String, default: null },
}, { timestamps: true })

// ── AdminNotification (admin-facing alerts) ─────────────────
// A simple admin alert feed. The upstream monitor writes a row here when it
// detects a new release/commit; the admin reads + acknowledges them in the
// Admin → Updates page. Not tied to a Clerk user (system-generated); visibility
// is gated by the admin allow-list, not ownership.
export interface IAdminNotification extends Document {
  kind: string                    // e.g. 'upstream-update'
  source: string                  // e.g. the repo "owner/name"
  title: string                   // one-line summary
  body: string                    // longer detail (markdown-ish plain text)
  url: string | null              // deep link (release/commit page)
  severity: 'info' | 'warning'    // info by default
  acknowledged: boolean           // admin marked as seen
  acknowledgedAt: Date | null
  dedupeKey: string               // unique per logical event (prevents dupes)
  createdAt: Date
  updatedAt: Date
}

const AdminNotificationSchema = new Schema<IAdminNotification>({
  kind:           { type: String, required: true, index: true },
  source:         { type: String, default: '' },
  title:          { type: String, required: true },
  body:           { type: String, default: '' },
  url:            { type: String, default: null },
  severity:       { type: String, enum: ['info', 'warning'], default: 'info' },
  acknowledged:   { type: Boolean, default: false, index: true },
  acknowledgedAt: { type: Date, default: null },
  dedupeKey:      { type: String, required: true, unique: true, index: true },
}, { timestamps: true })

// ── SupportTicket (agent self-service support workforce) ────
// When an Agent run fails, the support system opens a ticket here, a worker
// diagnoses + (for transient/timeout classes) retries the agent, and every step
// is appended to `timeline` — a documented audit trail like a workforce ticket.
// One OPEN ticket per (agentId, category) via `dedupeKey`; repeated identical
// failures append to the same ticket's timeline rather than spawning new ones.
export interface ITicketEvent {
  at: Date
  /** machine label: 'opened' | 'diagnosed' | 'retry-scheduled' | 'retry-result' | 'escalated' | 'resolved' | 'comment' | 'status-change' */
  type: string
  /** human-facing line describing what happened */
  message: string
  /** optional structured detail (run id, attempt #, outcome, etc.) */
  meta?: Record<string, unknown>
}

export interface ISupportTicket extends Document {
  userId: string
  agentId: string
  agentName: string
  category: 'budget' | 'timeout' | 'transient' | 'scope' | 'injection' | 'unknown'
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'investigating' | 'in-progress' | 'awaiting-admin' | 'resolved' | 'wont-fix'
  title: string
  diagnosis: string
  recommendedAction: string
  /** the run that first opened the ticket + the most recent related run */
  firstRunId: string | null
  lastRunId: string | null
  /** how many automated retries the worker has attempted */
  retryCount: number
  autoRemediable: boolean
  /** documented audit trail — every action captured, workforce-style */
  timeline: ITicketEvent[]
  resolvedAt: Date | null
  resolutionNote: string | null
  dedupeKey: string
  createdAt: Date
  updatedAt: Date
}

const TicketEventSchema = new Schema<ITicketEvent>({
  at:      { type: Date, default: Date.now },
  type:    { type: String, required: true },
  message: { type: String, required: true },
  meta:    { type: Schema.Types.Mixed, default: undefined },
}, { _id: false })

const SupportTicketSchema = new Schema<ISupportTicket>({
  userId:            { type: String, required: true, index: true },
  agentId:           { type: String, required: true, index: true },
  agentName:         { type: String, default: 'Agent' },
  category:          { type: String, enum: ['budget', 'timeout', 'transient', 'scope', 'injection', 'unknown'], required: true },
  severity:          { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status:            { type: String, enum: ['open', 'investigating', 'in-progress', 'awaiting-admin', 'resolved', 'wont-fix'], default: 'open', index: true },
  title:             { type: String, required: true },
  diagnosis:         { type: String, default: '' },
  recommendedAction: { type: String, default: '' },
  firstRunId:        { type: String, default: null },
  lastRunId:         { type: String, default: null },
  retryCount:        { type: Number, default: 0 },
  autoRemediable:    { type: Boolean, default: false },
  timeline:          { type: [TicketEventSchema], default: [] },
  resolvedAt:        { type: Date, default: null },
  resolutionNote:    { type: String, default: null },
  dedupeKey:         { type: String, required: true, index: true },
}, { timestamps: true })

// One ACTIVE ticket per dedupeKey: a partial unique index over only the
// non-terminal statuses lets a NEW ticket open after an old one is resolved,
// while preventing duplicate concurrently-open tickets for the same issue.
SupportTicketSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['open', 'investigating', 'in-progress', 'awaiting-admin'] } } },
)

// ── Model exports (safe re-use in hot-reload) ───────────────
export const Vault:    Model<IVault>    = mongoose.models.Vault    || mongoose.model('Vault',    VaultSchema)
export const Source:   Model<ISource>   = mongoose.models.Source   || mongoose.model('Source',   SourceSchema)
export const Page:     Model<IPage>     = mongoose.models.Page     || mongoose.model('Page',     PageSchema)
export const Log:      Model<ILog>      = mongoose.models.Log      || mongoose.model('Log',      LogSchema)
export const UserPlan: Model<IUserPlan> = mongoose.models.UserPlan || mongoose.model('UserPlan', UserPlanSchema)
export const AgentToken: Model<IAgentToken> = mongoose.models.AgentToken || mongoose.model('AgentToken', AgentTokenSchema)
export const UserAgent: Model<IUserAgent> = mongoose.models.UserAgent || mongoose.model('UserAgent', UserAgentSchema)
export const Agent:    Model<IAgent>    = mongoose.models.Agent    || mongoose.model('Agent',    AgentSchema)
export const Proposal: Model<IProposal> = mongoose.models.Proposal || mongoose.model('Proposal', ProposalSchema)
export const AgentRun: Model<IAgentRun> = mongoose.models.AgentRun || mongoose.model('AgentRun', AgentRunSchema)
export const InstalledSkill: Model<IInstalledSkill> = mongoose.models.InstalledSkill || mongoose.model('InstalledSkill', InstalledSkillSchema)
export const SquadBudget: Model<ISquadBudget> = mongoose.models.SquadBudget || mongoose.model('SquadBudget', SquadBudgetSchema)
export const UpstreamWatch: Model<IUpstreamWatch> = mongoose.models.UpstreamWatch || mongoose.model('UpstreamWatch', UpstreamWatchSchema)
export const AdminNotification: Model<IAdminNotification> = mongoose.models.AdminNotification || mongoose.model('AdminNotification', AdminNotificationSchema)
export const SupportTicket: Model<ISupportTicket> = mongoose.models.SupportTicket || mongoose.model('SupportTicket', SupportTicketSchema)
