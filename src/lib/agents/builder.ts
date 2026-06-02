// ── Conversational Builder core ─────────────────────────────────────────────
// Pure, total, deterministic helpers behind the two-pane Agent Builder
// (design.md → "Conversational Builder + lifecycle + dry-run gate"). The builder
// turns a plain-language conversation into a live Agent **preview**; this module
// owns the two judgment calls that must be provably correct (Property 22):
//
//   1. `mergePreview(state, update)` — fold a partial update parsed from the
//      conversation (or a direct preview edit) onto the accumulated preview state.
//      It is FIELD-PRECISE: it changes ONLY the fields explicitly stated in
//      `update` and preserves every other field. For the nested config objects
//      (`schedule`, `signOffPolicy`, `trustScope`) precision is applied DEEP —
//      per leaf — so updating one sub-field never clobbers its siblings
//      (Req 7.3, 7.5).
//
//   2. `nextClarifyingQuestion(state, intent?)` — when a REQUIRED field is
//      genuinely ambiguous, emit EXACTLY ONE clarifying question (the highest
//      priority ambiguous field); emit NONE when nothing required is ambiguous
//      (Req 7.4).
//
// NO I/O. NO model import — the preview shape is declared structurally here (same
// field NAMES as `IAgent` in `src/lib/models.ts`) so this stays DB-free and pure,
// matching the approach in `scope.ts` / `accent.ts`. The route layer (task 4.6)
// composes a concrete persisted `Agent` from a completed preview; the dry-run
// (task 4.4) and the UI (task 4.5) are separate.
//
// Property 22 (design.md): "Builder preview merge is field-precise; ambiguity
// asks exactly one question; …". Task 4.9 property-tests this module.

// ── Structural preview config types (field names mirror `IAgent`) ─────────────

/** The Agent_Role union (mirrors `IAgent['role']`). */
export type AgentRole =
  | 'scout'
  | 'synthesist'
  | 'connector'
  | 'critic'
  | 'librarian'
  | 'researcher'
  | 'custom'

/** All roles, for exhaustive iteration / validation. */
export const AGENT_ROLES: readonly AgentRole[] = [
  'scout',
  'synthesist',
  'connector',
  'critic',
  'librarian',
  'researcher',
  'custom',
] as const

/**
 * A preview Schedule (Req 1.4–1.6). A preview is inherently incomplete, so this
 * is a flat DRAFT carrying any subset of the discriminated-union fields. The
 * route layer (task 4.6) resolves it into a concrete `IAgent['schedule']`
 * (`{kind:'scheduled',cron}` | `{kind:'reactive',event,sourceAgentId}` |
 * `{kind:'manual'}`) at deploy time; here we only accumulate stated fields.
 */
export interface ScheduleDraft {
  kind?: 'scheduled' | 'reactive' | 'manual'
  cron?: string
  event?: string
  sourceAgentId?: string | null
}

/** Per-action Sign_Off_Policy (mirrors `IAgent['signOffPolicy']`). */
export interface SignOffPolicy {
  ingestSource: 'auto' | 'ask'
  createSynthesis: 'auto' | 'ask'
  createConnection: 'auto' | 'ask'
  flagContradiction: 'auto' | 'ask' | 'notify'
}

/** Trust_Scope as edited in the preview (mirrors `IAgent['trustScope']`). */
export interface PreviewTrustScope {
  /** Readable Source ids (string form in the preview). EMPTY = whole vault. */
  readableSourceIds: string[]
  /** Readable collections. EMPTY = not collection-restricted. */
  readableCollections: string[]
  /** May the Agent reach the network. */
  webAccess: boolean
  /** Per-run token ceiling. */
  perRunTokenBudget: number
}

/**
 * The live Agent preview the Conversational Builder accumulates. Every field is
 * optional because the preview fills in over the course of the conversation
 * (and via direct edits). Nested config objects are themselves PARTIAL so the
 * preview can hold "role set, schedule half-stated, scope untouched" mid-build.
 *
 * Field names match `IAgent` exactly (`name`, `role`, `customRoleDescription`,
 * `schedule`, `assignedSkillIds`, `signOffPolicy`, `trustScope`) so the route
 * layer can persist without a translation layer. `objective` is the builder-only
 * free-text goal the runner interpolates into the system prompt (design.md →
 * `ClaudeVaultRunner` flow "interpolating the objective"); it is not a stored
 * `Agent` column and is composed into the run config by the route/runner.
 */
export interface PreviewState {
  name?: string
  role?: AgentRole
  /** Free-text role description; required (non-empty) only when role==='custom'. */
  customRoleDescription?: string | null
  schedule?: ScheduleDraft
  /** Assigned InstalledSkill ids (Authority_Grants). Replaced wholesale on update. */
  assignedSkillIds?: string[]
  signOffPolicy?: Partial<SignOffPolicy>
  trustScope?: Partial<PreviewTrustScope>
  /** Plain-language goal interpolated into the runner prompt. */
  objective?: string
}

/**
 * A partial update folded onto a `PreviewState` — the SAME shape as the preview
 * itself (deeply partial). A field present with a defined value CHANGES that
 * field; a field that is absent or `undefined` means "not stated" and is
 * PRESERVED. An explicit `null` (e.g. clearing `customRoleDescription`) is a
 * stated value and DOES change the field.
 */
export type PreviewUpdate = PreviewState

// ── mergePreview — field-precise (deep for nested config) merge ───────────────

/** A JSON-ish plain object (not an array, not null). */
type PlainObject = Record<string, unknown>

/** True for a non-null, non-array object — the only thing we recurse into. */
function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Deep-clone a JSON-ish value (objects/arrays/primitives) so a merged result
 * never shares a mutable reference with the incoming `update`. Total — anything
 * exotic is returned as-is (our preview data is plain JSON-like).
 */
function clone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => clone(v)) as unknown as T
  }
  if (isPlainObject(value)) {
    const out: PlainObject = {}
    for (const key of Object.keys(value)) {
      out[key] = clone((value as PlainObject)[key])
    }
    return out as unknown as T
  }
  return value
}

/**
 * Fold `patch` onto `base`, changing ONLY the keys explicitly present (and not
 * `undefined`) in `patch` and preserving everything else. Where both sides hold
 * a plain object the merge recurses (DEEP field-precision); arrays, primitives,
 * and explicit `null` are leaf VALUES that replace wholesale. Unchanged subtrees
 * are preserved by reference (structural sharing); changed values are cloned from
 * `patch` so the result shares no mutable reference with the update.
 */
function deepMergePresent(base: PlainObject, patch: PlainObject): PlainObject {
  const out: PlainObject = { ...base }
  for (const key of Object.keys(patch)) {
    const pv = patch[key]
    if (pv === undefined) continue // "not stated" → preserve the base value
    const bv = out[key]
    if (isPlainObject(pv) && isPlainObject(bv)) {
      // Both sides are objects → recurse so sibling sub-fields are preserved.
      out[key] = deepMergePresent(bv, pv)
    } else {
      // Leaf (scalar / array / null) or a new object branch → replace (cloned).
      out[key] = clone(pv)
    }
  }
  return out
}

/**
 * Merge a conversation/edit `update` onto the accumulated preview `state`,
 * returning a NEW `PreviewState` in which ONLY the fields explicitly stated in
 * `update` are changed and all others are preserved (Req 7.3, 7.5; Property 22).
 *
 * Field-precision rules (TOTAL / DETERMINISTIC, never mutates either argument):
 *   - A top-level key absent from `update`, or present as `undefined`, is left
 *     exactly as it was in `state` ("not stated" ⇒ preserve).
 *   - The nested config objects `schedule`, `signOffPolicy`, and `trustScope`
 *     merge DEEP, per leaf: updating one sub-field (e.g. `signOffPolicy.ingestSource`)
 *     preserves its siblings (`createSynthesis`, …). Sub-fields set to `undefined`
 *     are likewise preserved.
 *   - Scalars (`name`, `role`, `objective`, schedule/scope/policy leaves), arrays
 *     (`assignedSkillIds`, `readableSourceIds`, `readableCollections`), and an
 *     explicit `null` (e.g. clearing `customRoleDescription`) are STATED VALUES
 *     that replace the prior value wholesale.
 *
 * Non-object inputs are tolerated (treated as an empty preview) so the function
 * is total and safe to call on freshly-initialized builder state.
 */
export function mergePreview(state: PreviewState, update: PreviewUpdate): PreviewState {
  const base = isPlainObject(state) ? (state as PlainObject) : {}
  const patch = isPlainObject(update) ? (update as PlainObject) : {}
  return deepMergePresent(base, patch) as PreviewState
}

// ── Clarifying-question selection — exactly one, or none ──────────────────────

/**
 * The REQUIRED preview fields the builder may ask about, in priority order
 * (design.md / Req 7.4). Required because an Agent cannot be persisted/deployed
 * without them; the rest of the config has conservative role defaults (task 4.2):
 *
 *   1. `role` — foundational: it drives the default skill set, sign-off policy,
 *      and scope, so it is resolved first.
 *   2. `customRoleDescription` — required ONLY when `role === 'custom'`; it only
 *      becomes relevant once role is known, hence second.
 *   3. `name` — required to save the Agent but semantically the least ambiguous,
 *      so it is asked last.
 *
 * Schedule, sign-off policy, and trust scope are intentionally NOT here: they are
 * filled by conservative role defaults rather than elicited as blocking questions.
 */
export type RequiredField = 'role' | 'customRoleDescription' | 'name'

/** Required fields in the priority order the selector walks. */
export const REQUIRED_FIELD_ORDER: readonly RequiredField[] = [
  'role',
  'customRoleDescription',
  'name',
] as const

/**
 * Optional parsed-intent signal from the conversation parser. When the parser
 * recognises that a required field was *mentioned* but could not be resolved to a
 * single value (e.g. the description fits two roles), it lists that field here so
 * the selector treats it as ambiguous even though the preview may hold a value.
 */
export interface ParsedIntent {
  /** Required fields the parser saw but could not disambiguate. */
  ambiguousFields?: readonly RequiredField[]
}

/** One clarifying question the builder should ask, scoped to a single field. */
export interface ClarifyingQuestion {
  /** The required field the question resolves. */
  field: RequiredField
  /** The plain-language question to show in the conversation pane. */
  question: string
}

/** The human prompt asked for each required field. */
const QUESTION_TEXT: Record<RequiredField, string> = {
  role:
    'What kind of work should this agent focus on — for example scouting new ' +
    'sources, synthesizing notes, connecting ideas, critiquing, librarian upkeep, ' +
    'research, or something custom?',
  customRoleDescription:
    'You chose a custom role — in a sentence, what exactly should this agent do?',
  name: 'What would you like to name this agent?',
}

/** Non-empty after trimming — used to decide whether a text field is "stated". */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Whether the parser explicitly flagged a field as ambiguous. */
function flaggedAmbiguous(field: RequiredField, intent?: ParsedIntent): boolean {
  return Array.isArray(intent?.ambiguousFields) && intent.ambiguousFields.includes(field)
}

/**
 * Is a single required field genuinely ambiguous for this preview? A field is
 * ambiguous when the parser flagged it OR when it is missing/blank:
 *   - `role`                  — not one of the known Agent_Roles (i.e. unset).
 *   - `customRoleDescription` — ONLY when `role === 'custom'` and the description
 *                               is blank; for any non-custom role it is N/A.
 *   - `name`                  — blank/whitespace.
 */
function isFieldAmbiguous(field: RequiredField, state: PreviewState, intent?: ParsedIntent): boolean {
  const s = isPlainObject(state) ? state : {}
  if (flaggedAmbiguous(field, intent)) return true

  switch (field) {
    case 'role':
      return !(typeof s.role === 'string' && (AGENT_ROLES as readonly string[]).includes(s.role))
    case 'customRoleDescription':
      // Required only once the role is known to be 'custom'.
      return s.role === 'custom' && !isNonEmptyString(s.customRoleDescription)
    case 'name':
      return !isNonEmptyString(s.name)
    default:
      return false
  }
}

/**
 * The required fields that are currently ambiguous, in priority order. Mainly an
 * introspection helper (and the single source of the "exactly one" guarantee:
 * `nextClarifyingQuestion` returns the head of this list).
 */
export function ambiguousRequiredFields(state: PreviewState, intent?: ParsedIntent): RequiredField[] {
  return REQUIRED_FIELD_ORDER.filter((field) => isFieldAmbiguous(field, state, intent))
}

/**
 * Select the SINGLE clarifying question to ask, or `null` when nothing required
 * is ambiguous (Req 7.4, Property 22). Returns the highest-priority ambiguous
 * required field per `REQUIRED_FIELD_ORDER`. By construction this NEVER returns
 * more than one question: even if several required fields are ambiguous, only the
 * top-priority one is asked (the next is asked on the following turn, after the
 * user answers and the preview is re-merged).
 *
 * PURE / TOTAL / DETERMINISTIC — no I/O, never throws.
 */
export function nextClarifyingQuestion(
  state: PreviewState,
  intent?: ParsedIntent,
): ClarifyingQuestion | null {
  const field = ambiguousRequiredFields(state, intent)[0]
  if (field === undefined) return null
  return { field, question: QUESTION_TEXT[field] }
}
