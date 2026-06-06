// ── decompose-llm — the injectable model adapter for mission planning ─────────────
// A tiny abstraction over the Lead_Agent's model call used by the OPTIONAL `decompose`
// action of `/api/missions/[id]/plan`. It exists so the route never hard-imports an
// LLM SDK inline: the planner's pure `decomposeObjective(input, { llm })` takes the
// model call as an injected dependency, and this module supplies the production default
// (`defaultDecomposeLlm`) while tests can inject their own stub.
//
// The adapter does ONE thing — turn a prompt string into the model's raw text reply —
// and leaves ALL parsing/normalization to `decomposeObjective` + `buildTaskGraph` +
// `validateTaskGraph` (the route pipeline). The SDK is imported LAZILY so merely
// importing this module pulls in no client, and the Anthropic client is memoized across
// calls. Mirrors the `claude.ts` client-init discipline (lazy, env read at first use).
//
// AGENTS.md: the prompt carries the user's Objective/context for the model but is never
// written to a log here; the API key is read from env and never logged.

/** The shape `decomposeObjective` expects for its injected model dependency. */
export type DecomposeLlm = (prompt: string) => Promise<unknown>

// The Anthropic model used for planning — same model `claude.ts` uses for its small,
// structured JSON calls (query expansion, etc.).
const PLANNER_MODEL = 'claude-haiku-4-5'

// Memoized client. Typed `unknown` because the SDK class type is only available after
// the lazy dynamic import; it is cast to the imported class at the call site.
let cachedClient: unknown = null

/**
 * The production `DecomposeLlm`: ask the Lead_Agent's model to decompose the Objective.
 * Returns the model's raw text (an `unknown` the planner re-parses + re-validates).
 *
 * Lazily imports `@anthropic-ai/sdk` so this module stays SDK-free until first use, and
 * reads `ANTHROPIC_API_KEY` at call time (throwing a clear error when unset). Any model
 * error propagates to `decomposeObjective`, which fails closed to an empty graph — so a
 * failed decomposition becomes a recorded `decomposition-failed`, never a crash.
 */
export const defaultDecomposeLlm: DecomposeLlm = async (prompt: string): Promise<unknown> => {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const client = (cachedClient ??= new Anthropic({ apiKey })) as InstanceType<typeof Anthropic>

  const response = await client.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 2048,
    system:
      'You are the Lead_Agent of a squad decomposing an objective into a dependency-ordered ' +
      'task graph. Return ONLY the requested JSON object — no prose, no code fences.',
    messages: [{ role: 'user', content: prompt }],
  })

  const block = response.content[0]
  return block && block.type === 'text' ? block.text : ''
}
