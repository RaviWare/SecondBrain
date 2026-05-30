import mongoose, { Schema, Document, Model } from 'mongoose'

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
  timelineEntries:{ type: Number, default: 1 },
}, { timestamps: true })

PageSchema.index({ userId: 1, vaultId: 1, slug: 1 }, { unique: true })
PageSchema.index({ title: 'text', content: 'text', tags: 'text' })

// ── Log ─────────────────────────────────────────────────────
export interface ILog extends Document {
  userId: string
  vaultId: mongoose.Types.ObjectId
  operation: 'ingest' | 'query' | 'lint'
  summary: string
  pagesAffected: string[]
  tokensUsed: number
  createdAt: Date
}

const LogSchema = new Schema<ILog>({
  userId:        { type: String, required: true, index: true },
  vaultId:       { type: Schema.Types.ObjectId, ref: 'Vault', required: true },
  operation:     { type: String, enum: ['ingest', 'query', 'lint'], required: true },
  summary:       { type: String, required: true },
  pagesAffected: [String],
  tokensUsed:    { type: Number, default: 0 },
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
  lastActiveAt:  { type: Date, default: null },
  lastError:     { type: String, default: null },
}, { timestamps: true })

// ── Model exports (safe re-use in hot-reload) ───────────────
export const Vault:    Model<IVault>    = mongoose.models.Vault    || mongoose.model('Vault',    VaultSchema)
export const Source:   Model<ISource>   = mongoose.models.Source   || mongoose.model('Source',   SourceSchema)
export const Page:     Model<IPage>     = mongoose.models.Page     || mongoose.model('Page',     PageSchema)
export const Log:      Model<ILog>      = mongoose.models.Log      || mongoose.model('Log',      LogSchema)
export const UserPlan: Model<IUserPlan> = mongoose.models.UserPlan || mongoose.model('UserPlan', UserPlanSchema)
export const AgentToken: Model<IAgentToken> = mongoose.models.AgentToken || mongoose.model('AgentToken', AgentTokenSchema)
export const UserAgent: Model<IUserAgent> = mongoose.models.UserAgent || mongoose.model('UserAgent', UserAgentSchema)
