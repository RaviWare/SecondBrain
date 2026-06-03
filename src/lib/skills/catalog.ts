// ── Agent Skill Catalog ───────────────────────────────────────────────────────
// The source of truth for what agent skills exist in SecondBrain OS. Each skill
// is a specialized capability the user can assign an objective to and run. The
// catalog is code (not DB rows) because the set is curated and versioned with
// the app; user-specific data (assignments, runs, reports) lives in MongoDB.
//
// Phase 1: definitions only. The runner (Phase 2) reads `promptTemplate` +
// `tools` to actually execute a skill against Claude + the user's vault.

import { SKILL_LIBRARY_SPECS } from './catalog-library'

export type SkillCategory =
  | 'research'
  | 'sales'
  | 'productivity'
  | 'ops'
  | 'content'
  | 'knowledge'
  | 'planning'
  | 'communication'
  | 'finance'
  | 'engineering'
  | 'marketing'
  | 'people'
  | 'legal'
  | 'personal'
  | 'learning'

/** Tools a skill is allowed to use against the vault (maps to /api/agent/*). */
export type SkillTool = 'search' | 'query' | 'ingest'

export type SkillSchedule = 'manual' | 'daily' | 'weekly'

/**
 * Blast-radius / capability category a skill declares it may touch (Req 9.2, 9.9).
 * This is the security-relevant "touches:" declaration the Security_Scan checks
 * against observed behavior (Property 12) — a mismatch (e.g. `nothing` but
 * exhibits network/credential access) fails the scan. Single source of truth:
 * `security-scan.ts` (task 6.3) imports this union.
 */
export type SkillTouches = 'vault-read' | 'vault-write' | 'network' | 'credentials' | 'nothing'

/** Registry-level scan status for a skill definition (matches InstalledSkill.scanStatus). */
export type ScanStatus = 'passed' | 'failed' | 'pending'

export interface SkillDef {
  /** stable id used in URLs, assignments, runs */
  id: string
  name: string
  /** one-line value prop for the catalog card */
  tagline: string
  /** longer description shown on the skill detail / assign screen */
  description: string
  category: SkillCategory
  /** lucide icon name (resolved in the UI) */
  icon: string
  /** accent hex for the skill's card/visuals */
  accent: string
  /** what the user provides when assigning (the "objective" prompt label + example) */
  objectiveLabel: string
  objectivePlaceholder: string
  /** vault tools this skill may call */
  tools: SkillTool[]
  /** schedules this skill supports (manual always allowed) */
  schedules: SkillSchedule[]
  /** whether this skill writes back into the vault (ingest) */
  writesToVault: boolean
  /** system prompt the runner uses; {{objective}} is interpolated at run time */
  promptTemplate: string
  /** short example outputs shown on the catalog (marketing/preview only) */
  exampleOutcomes: string[]
  // ── Skills Library extensions (additive, Req 9.1, 9.2) ──────────────────────
  /** versioned/installable definition; InstalledSkill records the version at install time (Req 9.1) */
  version: string
  /**
   * declared blast-radius (Req 9.2, 9.9). An array because a skill can touch
   * more than one category; the Security_Scan checks these against observed
   * behavior. Curated skills here only read/write the vault via vault tools, so
   * they never declare `network`/`credentials`.
   */
  touches: SkillTouches[]
  /**
   * curated/registry-level scan status for the Discover card badge (Req 9.2).
   * First-party catalog skills ship pre-vetted (`passed`); per-user install/
   * re-scan state lives separately on the InstalledSkill record (task 6.2).
   */
  scanned: { status: ScanStatus; lastScannedAt: string | null }
}

/**
 * Curated registry scan baseline. First-party catalog skills are pre-vetted as
 * part of shipping the app, so the Discover card shows a `passed` badge. The
 * timestamp is a fixed ISO string (not `new Date()`) so the catalog is a pure,
 * deterministic constant — install-time and periodic re-scans (tasks 6.3+)
 * compute their own status on the per-user InstalledSkill record.
 */
const CURATED_SCANNED_AT = '2024-01-01T00:00:00.000Z'

const CORE_SKILLS: SkillDef[] = [
  {
    id: 'research-analyst',
    name: 'Research Analyst',
    tagline: 'Reads across your vault (and the web) and writes you a cited brief.',
    description:
      'Expands your question into multiple angles, pulls the most relevant pages from your vault, synthesizes a structured brief with citations, and flags what the brain does not yet know.',
    category: 'research',
    icon: 'search',
    accent: '#38bdf8',
    objectiveLabel: 'What should I research?',
    objectivePlaceholder: 'e.g. What did we learn about pricing across all customer calls?',
    tools: ['search', 'query'],
    schedules: ['manual', 'weekly'],
    // Read-only: search+query tools only (no `ingest`); briefs are emitted as
    // Proposals through the Aegis gate, never written directly (propose-never-write).
    // So writesToVault is false and the declared blast radius is `vault-read` — which
    // must match observed behavior or the Security_Scan blocks install (Req 9.9).
    writesToVault: false,
    promptTemplate:
      'You are a Research Analyst working from the user\'s private knowledge vault. Objective: "{{objective}}". Search the vault, synthesize a structured, cited brief, and end with an explicit "What the brain does not know yet" section listing gaps and stale areas. Be concise and factual. Cite pages with [[slug]].',
    exampleOutcomes: ['Cited research brief', 'Gap analysis', 'Saved synthesis page'],
    version: '1.0.0',
    // Tools are search+query only (no `ingest`); outputs flow through Proposals,
    // so the declared tool-level blast radius is read-only.
    touches: ['vault-read'],
    scanned: { status: 'passed', lastScannedAt: CURATED_SCANNED_AT },
  },
  {
    id: 'meeting-prep',
    name: 'Meeting Prep',
    tagline: 'Walks you into any meeting fully briefed on the person and history.',
    description:
      'Given a person, company, or meeting topic, it gathers everything in your vault, summarizes the last interactions, surfaces open threads and commitments, and lists smart questions to ask.',
    category: 'sales',
    icon: 'briefcase',
    accent: '#ff7a1f',
    objectiveLabel: 'Who or what is the meeting about?',
    objectivePlaceholder: 'e.g. Prep me for tomorrow\'s renewal call with Northwind',
    tools: ['search', 'query'],
    schedules: ['manual', 'daily'],
    // Read-only: search+query only (no `ingest`); the prep brief is proposed via
    // the Aegis gate, not written directly. writesToVault false ⇒ declared
    // `vault-read` matches observed behavior (Req 9.9).
    writesToVault: false,
    promptTemplate:
      'You are a Meeting Prep agent using the user\'s vault. Objective: "{{objective}}". Pull all related pages, summarize the relationship and last interactions, list open commitments and unanswered items, then propose 3-5 sharp questions to ask. End with a confidence note and what context might be missing.',
    exampleOutcomes: ['Relationship summary', 'Open threads', 'Questions to ask'],
    version: '1.0.0',
    // search+query only; read-only blast radius.
    touches: ['vault-read'],
    scanned: { status: 'passed', lastScannedAt: CURATED_SCANNED_AT },
  },
  {
    id: 'inbox-triage',
    name: 'Inbox Triage',
    tagline: 'Turns a pile of notes and signals into "what needs you" vs "filed".',
    description:
      'Processes a batch of notes, messages, or transcripts you point it at, separates what needs your attention from what can be filed, and logs important items as decisions or follow-ups.',
    category: 'productivity',
    icon: 'inbox',
    accent: '#34d399',
    objectiveLabel: 'What should I triage?',
    objectivePlaceholder: 'e.g. Summarize this week\'s notes and tell me what needs action',
    tools: ['search', 'query', 'ingest'],
    schedules: ['manual', 'daily'],
    writesToVault: true,
    promptTemplate:
      'You are an Inbox Triage agent. Objective: "{{objective}}". Review the relevant vault content, then output two clear lists: "Needs you" (urgent/actionable, with why) and "Filed" (FYI). Flag anything that should become a tracked decision or follow-up.',
    exampleOutcomes: ['Needs-you list', 'Filed summary', 'New follow-ups'],
    version: '1.0.0',
    // Declares the `ingest` tool and writesToVault: true → writes back to the vault.
    touches: ['vault-read', 'vault-write'],
    scanned: { status: 'passed', lastScannedAt: CURATED_SCANNED_AT },
  },
  {
    id: 'ops-monitor',
    name: 'Ops Monitor',
    tagline: 'Watches your decisions and notes, flags risks and contradictions.',
    description:
      'Scans your recent decisions, notes, and synthesis pages for risks, contradictions, and things that have gone stale, then reports what deserves a second look.',
    category: 'ops',
    icon: 'activity',
    accent: '#a78bfa',
    objectiveLabel: 'What should I monitor?',
    objectivePlaceholder: 'e.g. Are there any contradictions or risks in our recent decisions?',
    tools: ['search', 'query'],
    schedules: ['manual', 'weekly'],
    writesToVault: false,
    promptTemplate:
      'You are an Ops Monitor. Objective: "{{objective}}". Review recent decisions and synthesis pages in the vault. Surface contradictions, risks, and stale claims. For each, cite the page and explain the concern with a confidence level. Be honest when there is nothing notable.',
    exampleOutcomes: ['Risk flags', 'Contradiction report', 'Stale-page list'],
    version: '1.0.0',
    // search+query only and writesToVault: false → strictly read-only.
    touches: ['vault-read'],
    scanned: { status: 'passed', lastScannedAt: CURATED_SCANNED_AT },
  },
  {
    id: 'content-engine',
    name: 'Content Engine',
    tagline: 'Drafts in your voice, grounded only in what you actually know.',
    description:
      'Drafts posts, summaries, or documents grounded strictly in your vault, with citations, and refuses to invent facts the brain cannot support.',
    category: 'content',
    icon: 'pen-line',
    accent: '#fb923c',
    objectiveLabel: 'What should I draft?',
    objectivePlaceholder: 'e.g. Draft a LinkedIn post about what we learned from 50 calls',
    tools: ['search', 'query'],
    schedules: ['manual'],
    // Read-only: search+query only (no `ingest`); the draft is proposed for the
    // user to accept, never written directly. writesToVault false ⇒ declared
    // `vault-read` matches observed behavior (Req 9.9).
    writesToVault: false,
    promptTemplate:
      'You are a Content Engine that drafts in the user\'s voice using ONLY their vault. Objective: "{{objective}}". Pull supporting material, draft the piece, and attach source citations. Do not invent statistics or claims the vault cannot support; note where you deliberately held back.',
    exampleOutcomes: ['Grounded draft', 'Source citations', 'Honesty notes'],
    version: '1.0.0',
    // search+query only; drafts are returned, not written directly → read-only.
    touches: ['vault-read'],
    scanned: { status: 'passed', lastScannedAt: CURATED_SCANNED_AT },
  },
]

// ── Generated catalog (100+ skills) ───────────────────────────────────────────
// Each entry is a compact spec; `buildSkill` derives the full SkillDef from it.
// CRITICAL: `touches` and `writesToVault` are DERIVED FROM `tools`, never declared
// by hand — read-only tools (search/query) ⇒ ['vault-read']; an `ingest` tool ⇒
// adds 'vault-write'. Prompt templates come from a vetted builder that avoids
// every injection/network/exfiltration/credential pattern the Security_Scan flags.
// This makes a capability-mismatch (the prod bug) structurally impossible: every
// generated skill passes its own scan by construction (guarded by catalog.test).

export type SkillSpec = {
  id: string
  name: string
  category: SkillCategory
  icon: string
  accent: string
  /** true ⇒ skill writes back via the `ingest` tool (adds vault-write radius) */
  writes?: boolean
  tagline: string
  /** what the skill does, plain prose (NO urls / "web" / "send external" / secrets) */
  does: string
  objectiveLabel: string
  objectivePlaceholder: string
  schedules?: SkillSchedule[]
  exampleOutcomes: [string, string, string]
}

const ACCENTS: Record<SkillCategory, string> = {
  research: '#38bdf8',
  sales: '#ff7a1f',
  productivity: '#34d399',
  ops: '#a78bfa',
  content: '#fb923c',
  knowledge: '#22d3ee',
  planning: '#60a5fa',
  communication: '#f472b6',
  finance: '#4ade80',
  engineering: '#818cf8',
  marketing: '#fb7185',
  people: '#c084fc',
  legal: '#94a3b8',
  personal: '#facc15',
  learning: '#2dd4bf',
}

/**
 * Build a full SkillDef from a compact spec. Read-only by default (search+query);
 * when `writes` is set the skill gains the `ingest` tool and a vault-write radius.
 * The prompt template is assembled from safe, scanner-clean fragments and always
 * contains the required `{{objective}}` placeholder.
 */
function buildSkill(spec: SkillSpec): SkillDef {
  const writes = spec.writes === true
  const tools: SkillTool[] = writes ? ['search', 'query', 'ingest'] : ['search', 'query']
  const touches: SkillTouches[] = writes ? ['vault-read', 'vault-write'] : ['vault-read']
  const closing = writes
    ? 'Propose any new captures for the user to approve; never alter the vault directly. End with a short confidence note and what context may be missing.'
    : 'Return your findings for the user to review; do not change the vault. End with a short confidence note and what context may be missing.'
  const promptTemplate =
    `You are ${spec.name}, working only from the user's private knowledge vault. ` +
    `Objective: "{{objective}}". Pull the most relevant pages from the vault, ${spec.does}. ` +
    `Ground every claim in vault pages and cite them with [[slug]]. Do not invent facts the vault cannot support. ` +
    closing
  return {
    id: spec.id,
    name: spec.name,
    tagline: spec.tagline,
    description: spec.does.charAt(0).toUpperCase() + spec.does.slice(1) + '.',
    category: spec.category,
    icon: spec.icon,
    accent: spec.accent || ACCENTS[spec.category],
    objectiveLabel: spec.objectiveLabel,
    objectivePlaceholder: spec.objectivePlaceholder,
    tools,
    schedules: spec.schedules ?? ['manual'],
    writesToVault: writes,
    promptTemplate,
    exampleOutcomes: spec.exampleOutcomes,
    version: '1.0.0',
    touches,
    scanned: { status: 'passed', lastScannedAt: CURATED_SCANNED_AT },
  }
}

const SKILL_SPECS: SkillSpec[] = SKILL_LIBRARY_SPECS

/** Full catalog: the 5 hand-tuned core skills + the generated library. */
export const SKILLS: SkillDef[] = [...CORE_SKILLS, ...SKILL_SPECS.map(buildSkill)]

export const SKILL_CATEGORIES: { id: SkillCategory; label: string }[] = [
  { id: 'research', label: 'Research' },
  { id: 'sales', label: 'Sales' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'ops', label: 'Operations' },
  { id: 'content', label: 'Content' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'planning', label: 'Planning' },
  { id: 'communication', label: 'Communication' },
  { id: 'finance', label: 'Finance' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'people', label: 'People' },
  { id: 'legal', label: 'Legal' },
  { id: 'personal', label: 'Personal' },
  { id: 'learning', label: 'Learning' },
]

export function getSkill(id: string): SkillDef | undefined {
  return SKILLS.find(s => s.id === id)
}

/** Public-safe view of a skill (no prompt template) for the catalog API/UI. */
export type SkillPublic = Omit<SkillDef, 'promptTemplate'>

export function toPublicSkill(s: SkillDef): SkillPublic {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { promptTemplate, ...rest } = s
  return rest
}
