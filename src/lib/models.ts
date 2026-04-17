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
export interface IPage extends Document {
  userId: string
  vaultId: mongoose.Types.ObjectId
  slug: string
  title: string
  type: 'source-summary' | 'concept' | 'entity' | 'synthesis' | 'pattern' | 'query-answer'
  content: string
  summary: string
  sources: mongoose.Types.ObjectId[]
  relatedSlugs: string[]
  tags: string[]
  confidence: 'high' | 'medium' | 'low'
  createdAt: Date
  updatedAt: Date
}

const PageSchema = new Schema<IPage>({
  userId:       { type: String, required: true, index: true },
  vaultId:      { type: Schema.Types.ObjectId, ref: 'Vault', required: true },
  slug:         { type: String, required: true },
  title:        { type: String, required: true },
  type:         { type: String, enum: ['source-summary', 'concept', 'entity', 'synthesis', 'pattern', 'query-answer'], required: true },
  content:      { type: String, required: true },
  summary:      { type: String, default: '' },
  sources:      [{ type: Schema.Types.ObjectId, ref: 'Source' }],
  relatedSlugs: [String],
  tags:         [String],
  confidence:   { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
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

// ── Model exports (safe re-use in hot-reload) ───────────────
export const Vault:    Model<IVault>    = mongoose.models.Vault    || mongoose.model('Vault',    VaultSchema)
export const Source:   Model<ISource>   = mongoose.models.Source   || mongoose.model('Source',   SourceSchema)
export const Page:     Model<IPage>     = mongoose.models.Page     || mongoose.model('Page',     PageSchema)
export const Log:      Model<ILog>      = mongoose.models.Log      || mongoose.model('Log',      LogSchema)
export const UserPlan: Model<IUserPlan> = mongoose.models.UserPlan || mongoose.model('UserPlan', UserPlanSchema)
