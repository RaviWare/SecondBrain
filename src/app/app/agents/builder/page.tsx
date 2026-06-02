'use client'

// ── Conversational Agent Builder — two-pane create/edit surface (Req 7.1–7.12) ─
// LEFT  = a CONVERSATION pane: a running message list + an input box. Each user
//         message is parsed into a `PreviewUpdate` and folded onto the live
//         preview via `mergePreview`; the assistant's prompts are driven by
//         `nextClarifyingQuestion` (exactly one question for the highest-priority
//         ambiguous required field — Req 7.4).
// RIGHT = a LIVE AGENT PREVIEW: every config field is directly editable (Req 7.3,
//         7.5). Direct edits flow through the SAME `mergePreview`, so conversation
//         and hand edits stay perfectly consistent. The preview also renders the
//         role-defaulted skills/sign-off policy (task 4.2) and the plain-language
//         Trust_Scope_Statement (can / cannot).
//
// The SAME builder edits a deployed Agent (Req 7.12): with `?agentId=` (or
// `?edit=`) we fetch that Agent and seed the preview from it; otherwise it is a
// create flow. `?role=` pre-selects a starter role (the dashboard empty-state
// links pass this).
//
// Actions: a primary Dry_Run CTA (`.dash-accent-grad`) and Save/Create. Dry_Run
// runs the Agent once in propose-only mode against REAL vault data and shows the
// returned summary; a successful dry-run is the gate that lets the Agent deploy
// (Req 7.9, 7.10). The builder/lifecycle/dry-run ROUTE wiring (task 4.6) is
// complete: this page targets POST `/api/agents` (create), PATCH `/api/agents/[id]`
// (config edit + gated lifecycle `action` events), and POST `/api/agents/[id]/run`
// `{dryRun:true}` (propose-only dry-run). Deploy sends `{ action: 'deploy' }`, which
// the server routes through the FSM `transition()` — enforcing the dry-run gate
// server-side (Req 7.10) and activating the Agent per its Schedule (Req 7.11).
//
// Glass recipe is MANDATORY (`.kiro/steering/glass-theme.md`, Req 11.7): the shell
// is `sb-dashboard`; every panel carries `dash-panel dash-grain dash-interactive`
// (the hero preview adds `dash-spotlight` + a `dash-spotlight-glow` child +
// `useSpotlight`); inset wells use `--dash-card-solid` + `--dash-border`; all
// colors come from `--dash-*` tokens. No Radix/portal overlays are used (the role
// / schedule / policy pickers are in-scope button groups), so there is no
// transparent-overlay token hazard.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  Bot,
  CalendarClock,
  Check,
  Coins,
  Globe,
  Loader2,
  Lock,
  MessageSquare,
  Pencil,
  Play,
  Rocket,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  User,
} from 'lucide-react'
import {
  AGENT_ROLES,
  mergePreview,
  nextClarifyingQuestion,
  type AgentRole,
  type PreviewState,
  type PreviewUpdate,
  type ScheduleDraft,
  type SignOffPolicy,
} from '@/lib/agents/builder'
import { roleDefaults, trustScopeStatement } from '@/lib/agents/role-defaults'
import type { TrustScope } from '@/lib/agents/scope'
import { SKILLS } from '@/lib/skills/catalog'
import { useSpotlight } from '@/lib/use-spotlight'
import { cn } from '@/lib/utils'

// ── Conversation message model ────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
}

let messageSeq = 0
function nextMessageId(): string {
  messageSeq += 1
  return `m${messageSeq}`
}

// ── Role display metadata ─────────────────────────────────────────────────────

const ROLE_LABEL: Record<AgentRole, string> = {
  scout: 'Scout',
  synthesist: 'Synthesist',
  connector: 'Connector',
  critic: 'Critic',
  librarian: 'Librarian',
  researcher: 'Researcher',
  custom: 'Custom',
}

const ROLE_BLURB: Record<AgentRole, string> = {
  scout: 'Watches your sources for new material worth ingesting.',
  synthesist: 'Reads across the vault and proposes syntheses.',
  connector: 'Finds links between notes and proposes connections.',
  critic: 'Flags risks, contradictions, and stale claims.',
  librarian: 'Organizes and triages, filing what can be filed.',
  researcher: 'Runs deep research with explicit gap analysis.',
  custom: 'Describe exactly what this agent should do.',
}

// Schedule presets surfaced as in-scope buttons (no portal/select overlay).
const SCHEDULE_PRESETS: Array<{ key: string; label: string; draft: ScheduleDraft }> = [
  { key: 'manual', label: 'Manual', draft: { kind: 'manual' } },
  { key: 'hourly', label: 'Hourly', draft: { kind: 'scheduled', cron: '0 * * * *' } },
  { key: 'daily', label: 'Daily', draft: { kind: 'scheduled', cron: '0 9 * * *' } },
  { key: 'weekly', label: 'Weekly', draft: { kind: 'scheduled', cron: '0 9 * * 1' } },
]

// Per-action sign-off rows (Req 1.1, 7). `flagContradiction` additionally allows
// 'notify' (the model's default), the others are auto/ask only.
const SIGN_OFF_ROWS: Array<{
  key: keyof SignOffPolicy
  label: string
  options: ReadonlyArray<'auto' | 'ask' | 'notify'>
}> = [
  { key: 'ingestSource', label: 'Ingest a source', options: ['auto', 'ask'] },
  { key: 'createSynthesis', label: 'Create a synthesis', options: ['auto', 'ask'] },
  { key: 'createConnection', label: 'Create a connection', options: ['auto', 'ask'] },
  { key: 'flagContradiction', label: 'Flag a contradiction', options: ['auto', 'ask', 'notify'] },
]

// ── Dry-run summary shape (mirrors POST /api/agents/[id]/run dry-run response) ──
// The current run route returns `{ wouldPropose, flagged }`. Req 7.7 also calls
// for "would ingest / filtered" counts — task 4.4/4.6 will enrich the summary; we
// render whichever fields the API actually returns (no fabricated numbers).
interface DryRunSummary {
  wouldPropose: number
  flagged: number
  wouldIngest?: number
  filtered?: number
}

type SaveState = 'idle' | 'saving' | 'error'
type DryRunState = 'idle' | 'running' | 'done' | 'error'

export default function AgentBuilderPage() {
  return (
    <Suspense fallback={null}>
      <BuilderView />
    </Suspense>
  )
}

function BuilderView() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // The id (when present) selects EDIT mode (Req 7.12). Support both `?agentId=`
  // and `?edit=` so either link style resolves.
  const editId = searchParams.get('agentId') || searchParams.get('edit')

  // The accumulated live preview — the single source of truth shared by the
  // conversation parser AND the direct preview edits (both go through mergePreview).
  const [preview, setPreview] = useState<PreviewState>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')

  // Persisted-agent linkage. Null until the Agent is first created (or in edit
  // mode, seeded from the route). Dry-run/deploy need a real id.
  const [savedAgentId, setSavedAgentId] = useState<string | null>(editId)
  const [hadSuccessfulDryRun, setHadSuccessfulDryRun] = useState(false)

  const [loadingAgent, setLoadingAgent] = useState<boolean>(Boolean(editId))
  const [loadError, setLoadError] = useState('')

  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')

  const [dryRunState, setDryRunState] = useState<DryRunState>('idle')
  const [dryRunError, setDryRunError] = useState('')
  const [dryRunSummary, setDryRunSummary] = useState<DryRunSummary | null>(null)

  const [deployState, setDeployState] = useState<SaveState>('idle')
  const [deployed, setDeployed] = useState(false)

  const previewSpotlight = useSpotlight<HTMLDivElement>()

  // ── mergePreview is the ONE fold point (conversation + direct edits) ─────────
  const applyUpdate = useCallback((update: PreviewUpdate) => {
    setPreview((prev) => mergePreview(prev, update))
  }, [])

  // ── EDIT mode: seed the preview from the deployed Agent (Req 7.12) ───────────
  useEffect(() => {
    if (!editId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/agents/${editId}`, { cache: 'no-store' })
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setLoadError(body?.error || 'Could not load this agent.')
          setLoadingAgent(false)
          return
        }
        const agent = body.agent as Record<string, unknown>
        setPreview(seedPreviewFromAgent(agent))
        setHadSuccessfulDryRun(Boolean(agent.hadSuccessfulDryRun))
        setDeployed(
          agent.lifecycle === 'deploy' ||
            agent.lifecycle === 'monitor',
        )
        setLoadingAgent(false)
      } catch {
        if (cancelled) return
        setLoadError('Network error while loading the agent.')
        setLoadingAgent(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editId])

  // ── CREATE mode: honor `?role=` to pre-select a starter role + its defaults ──
  useEffect(() => {
    if (editId) return
    const roleParam = searchParams.get('role')
    if (roleParam && (AGENT_ROLES as readonly string[]).includes(roleParam)) {
      setPreview((prev) => mergePreview(prev, rolePickUpdate(roleParam as AgentRole)))
    }
    // Only on first mount for the create flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Seed the opening assistant message once the preview is ready ─────────────
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    if (loadingAgent) return
    seededRef.current = true
    const cq = nextClarifyingQuestion(preview)
    const opener = editId
      ? "Let's refine this agent. Tell me what to change, or edit any field on the right."
      : 'Describe the agent you want in plain language — what should it do, how often, and what can it touch? You can also fill in the preview directly.'
    const followUp = cq ? cq.question : 'Your agent looks ready. Tweak the preview, then run a dry run.'
    setMessages([
      { id: nextMessageId(), role: 'assistant', text: opener },
      { id: nextMessageId(), role: 'assistant', text: followUp },
    ])
  }, [loadingAgent, editId, preview])

  // ── Conversation turn: parse → mergePreview → ask next clarifying question ───
  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text) return
    const update = parseIntent(text, preview)
    const next = mergePreview(preview, update)
    setPreview(next)
    const cq = nextClarifyingQuestion(next)
    const assistantText = cq ? cq.question : confirmationFor(update, next)
    setMessages((prev) => [
      ...prev,
      { id: nextMessageId(), role: 'user', text },
      { id: nextMessageId(), role: 'assistant', text: assistantText },
    ])
    setInput('')
    // A material config change invalidates a prior dry-run's deploy eligibility.
    setHadSuccessfulDryRun(false)
    setDryRunSummary(null)
    setDryRunState('idle')
  }, [input, preview])

  // ── Resolve the scope used for the Trust_Scope_Statement (deny-by-name) ──────
  const scopeForStatement: TrustScope = useMemo(
    () => ({
      readableSourceIds: preview.trustScope?.readableSourceIds ?? [],
      readableCollections: preview.trustScope?.readableCollections ?? [],
      webAccess: preview.trustScope?.webAccess ?? false,
      perRunTokenBudget: preview.trustScope?.perRunTokenBudget ?? 0,
    }),
    [preview.trustScope],
  )
  const statement = useMemo(() => trustScopeStatement(scopeForStatement), [scopeForStatement])

  // Save requires the minimum the create route validates: a name + a valid role.
  const canSave = isNonEmpty(preview.name) && isValidRole(preview.role)

  // ── Persist (create or update) and return the agent id ───────────────────────
  const ensureSaved = useCallback(async (): Promise<string | null> => {
    const body = previewToPayload(preview)
    const isUpdate = Boolean(savedAgentId)
    const res = await fetch(isUpdate ? `/api/agents/${savedAgentId}` : '/api/agents', {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSaveError(data?.error || 'Could not save the agent.')
      return null
    }
    const agent = data.agent as { _id?: string } | undefined
    const id = agent?._id ? String(agent._id) : savedAgentId
    if (id && id !== savedAgentId) {
      setSavedAgentId(id)
      // Reflect edit mode in the URL so a refresh resumes the same agent.
      router.replace(`/app/agents/builder?agentId=${id}`)
    }
    return id ?? null
  }, [preview, savedAgentId, router])

  const handleSave = useCallback(async () => {
    if (!canSave || saveState === 'saving') return
    setSaveState('saving')
    setSaveError('')
    const id = await ensureSaved()
    setSaveState(id ? 'idle' : 'error')
    if (id) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          role: 'assistant',
          text: savedAgentId ? 'Saved your changes.' : 'Created the agent. Run a dry run before deploying.',
        },
      ])
    }
  }, [canSave, saveState, ensureSaved, savedAgentId])

  // ── Dry_Run: save first (need an id), then run propose-only (Req 7.6–7.9) ────
  const handleDryRun = useCallback(async () => {
    if (!canSave || dryRunState === 'running') return
    setDryRunState('running')
    setDryRunError('')
    setSaveError('')
    const id = await ensureSaved()
    if (!id) {
      setDryRunState('error')
      setDryRunError(saveError || 'Save the agent before running a dry run.')
      return
    }
    try {
      // Existing run route: propose-only dry-run, writes nothing to the vault.
      const res = await fetch(`/api/agents/${id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDryRunState('error')
        setDryRunError(data?.error || 'The dry run could not be completed.')
        return
      }
      // The route returns { run, proposalIds, deployEligible, summary }.
      // summary = { wouldIngest, filtered, wouldPropose, flagged } (4.4/4.6).
      const summary = (data.summary ?? {}) as DryRunSummary
      setDryRunSummary({
        wouldPropose: Number(summary.wouldPropose ?? 0),
        flagged: Number(summary.flagged ?? 0),
        ...(summary.wouldIngest !== undefined ? { wouldIngest: Number(summary.wouldIngest) } : {}),
        ...(summary.filtered !== undefined ? { filtered: Number(summary.filtered) } : {}),
      })
      // Deploy eligibility is AUTHORITATIVE from the server (Req 7.9/7.10): the run
      // route sets `Agent.hadSuccessfulDryRun` on a clean completion and echoes it
      // back as `deployEligible`. We trust that flag (falling back to the run
      // status only if an older response shape omits it). A clean dry-run unlocks
      // deploy but never auto-deploys.
      const clean =
        data.deployEligible !== undefined
          ? Boolean(data.deployEligible)
          : (data.run?.status ?? 'completed') === 'completed'
      setHadSuccessfulDryRun(clean)
      setDryRunState('done')
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          role: 'assistant',
          text: clean
            ? `Dry run complete — ${summary.wouldPropose ?? 0} proposal(s) it would raise for your review. Nothing was written. Deploy is now unlocked.`
            : 'Dry run finished with issues. Review the summary before deploying.',
        },
      ])
    } catch {
      setDryRunState('error')
      setDryRunError('Network error during the dry run.')
    }
  }, [canSave, dryRunState, ensureSaved, saveError])

  // ── Deploy (gated by a successful dry-run, Req 7.10) ─────────────────────────
  const handleDeploy = useCallback(async () => {
    if (!savedAgentId || !hadSuccessfulDryRun || deployState === 'saving') return
    setDeployState('saving')
    // Deploy is the gated lifecycle 'deploy' transition (Req 7.10/7.11): we send a
    // lifecycle EVENT (`{ action: 'deploy' }`), and the server routes it through
    // the FSM `transition()` — enforcing the dry-run gate and activating the Agent
    // per its Schedule (a scheduled/reactive Agent advances to `monitor`). The
    // client can no longer set `lifecycle` directly, so the gate can't be bypassed.
    try {
      const res = await fetch(`/api/agents/${savedAgentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deploy' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeployState('error')
        setMessages((prev) => [
          ...prev,
          {
            id: nextMessageId(),
            role: 'assistant',
            text: data?.error || 'Could not deploy — a successful dry run is required first.',
          },
        ])
        return
      }
      setDeployed(true)
      setDeployState('idle')
      const lifecycle = (data.agent as { lifecycle?: string } | undefined)?.lifecycle
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          role: 'assistant',
          text:
            lifecycle === 'monitor'
              ? 'Deployed. The agent is now monitoring and will run on its schedule.'
              : 'Deployed. The agent is ready to run on demand.',
        },
      ])
    } catch {
      setDeployState('error')
    }
  }, [savedAgentId, hadSuccessfulDryRun, deployState])

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-[1500px] p-4 sm:p-5 lg:p-6">
        <Header editing={Boolean(editId)} deployed={deployed} />

        {loadError ? (
          <div className="dash-panel dash-grain dash-interactive mt-5 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--dash-accent)' }} />
              <div>
                <p className="mono text-[10px] tracking-widest" style={{ color: 'var(--dash-accent)' }}>
                  COULD NOT LOAD AGENT
                </p>
                <p className="mt-1 text-sm text-[var(--dash-text)]">{loadError}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 min-[1100px]:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] 2xl:gap-5">
            {/* LEFT — conversation pane */}
            <ConversationPane
              messages={messages}
              input={input}
              onInput={setInput}
              onSend={handleSend}
              loading={loadingAgent}
            />

            {/* RIGHT — live, fully-editable preview */}
            <section
              ref={previewSpotlight.ref}
              onMouseMove={previewSpotlight.onMouseMove}
              className="dash-panel dash-grain dash-spotlight dash-interactive relative flex flex-col overflow-hidden rounded-2xl p-5"
            >
              <span className="dash-spotlight-glow" aria-hidden />
              <span
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full blur-3xl"
                style={{ background: 'radial-gradient(circle, var(--dash-accent-soft), transparent 70%)' }}
              />
              <div className="relative space-y-5">
                <PreviewHeader />

                <NameField value={preview.name ?? ''} onChange={(name) => applyUpdate({ name })} />

                <RolePicker
                  role={preview.role}
                  onPick={(role) => applyUpdate(rolePickUpdate(role))}
                />

                {preview.role === 'custom' && (
                  <CustomRoleField
                    value={preview.customRoleDescription ?? ''}
                    onChange={(v) => applyUpdate({ customRoleDescription: v })}
                  />
                )}

                <ObjectiveField
                  value={preview.objective ?? ''}
                  onChange={(objective) => applyUpdate({ objective })}
                />

                <ScheduleField
                  schedule={preview.schedule}
                  onPick={(draft) => applyUpdate({ schedule: draft })}
                  onCron={(cron) => applyUpdate({ schedule: { kind: 'scheduled', cron } })}
                />

                <SkillsField
                  assigned={preview.assignedSkillIds ?? []}
                  onToggle={(id) =>
                    applyUpdate({ assignedSkillIds: toggleId(preview.assignedSkillIds ?? [], id) })
                  }
                />

                <SignOffField
                  policy={preview.signOffPolicy}
                  onSet={(key, value) => applyUpdate({ signOffPolicy: { [key]: value } })}
                />

                <TrustScopeField
                  scope={scopeForStatement}
                  onSet={(partial) => applyUpdate({ trustScope: partial })}
                />

                <TrustScopeStatementCard statement={statement} />

                <ActionBar
                  canSave={canSave}
                  saveState={saveState}
                  saveError={saveError}
                  isUpdate={Boolean(savedAgentId)}
                  onSave={handleSave}
                  dryRunState={dryRunState}
                  dryRunError={dryRunError}
                  dryRunSummary={dryRunSummary}
                  onDryRun={handleDryRun}
                  hadSuccessfulDryRun={hadSuccessfulDryRun}
                  deployState={deployState}
                  deployed={deployed}
                  onDeploy={handleDeploy}
                />
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ editing, deployed }: { editing: boolean; deployed: boolean }) {
  return (
    <header className="dash-rise" style={{ animationDelay: '0s' }}>
      <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
        {editing ? (deployed ? 'Editing · Deployed agent' : 'Editing agent') : 'Agent builder · New hire'}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        <span className="dash-metallic-text">{editing ? 'Refine your agent' : 'Design your agent'}</span>
      </h1>
      <p className="mt-1 text-[13px] text-[var(--dash-muted)]">
        Describe it on the left and watch the preview fill in — or edit any field directly. Dry-run before you deploy.
      </p>
    </header>
  )
}

// ── LEFT pane — conversation ────────────────────────────────────────────────────

function ConversationPane({
  messages,
  input,
  onInput,
  onSend,
  loading,
}: {
  messages: ChatMessage[]
  input: string
  onInput: (v: string) => void
  onSend: () => void
  loading: boolean
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <section className="dash-panel dash-grain dash-interactive flex min-h-[560px] flex-col overflow-hidden rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-soft)] text-[var(--dash-muted)]">
          <MessageSquare className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-[var(--dash-text-strong)]">
          Conversation
        </h2>
      </div>

      <div ref={scrollRef} className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center gap-2 text-[var(--dash-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[12px]">Loading the agent…</span>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
      </div>

      {/* Composer — inset well, no portal overlay */}
      <div className="mt-4">
        <div
          className="flex items-end gap-2 rounded-2xl p-2"
          style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
        >
          <textarea
            value={input}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            rows={2}
            placeholder="e.g. A scout that watches my sources daily and asks before ingesting anything"
            className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-subtle)]"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={input.trim().length === 0}
            aria-label="Send message"
            className={cn(
              'mb-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition',
              input.trim().length === 0 ? 'cursor-not-allowed opacity-50' : 'dash-accent-grad text-white hover:-translate-y-0.5',
            )}
            style={
              input.trim().length === 0
                ? { background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-subtle)' }
                : undefined
            }
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-[var(--dash-subtle)]">
          Every message updates the live preview. Press Enter to send · Shift+Enter for a new line.
        </p>
      </div>
    </section>
  )
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex items-start gap-2.5', isUser && 'flex-row-reverse')}>
      <span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border"
        style={
          isUser
            ? { background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border)', color: 'var(--dash-muted)' }
            : { background: 'var(--dash-accent-soft)', borderColor: 'var(--dash-border-glow)', color: 'var(--dash-accent)' }
        }
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </span>
      <div
        className="max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed"
        style={
          isUser
            ? { background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-text)' }
            : { background: 'var(--dash-soft)', border: '1px solid var(--dash-border)', color: 'var(--dash-text)' }
        }
      >
        {message.text}
      </div>
    </div>
  )
}

// ── RIGHT pane — editable preview field building blocks ─────────────────────────

function PreviewHeader() {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span
          className="grid h-7 w-7 place-items-center rounded-lg border bg-[var(--dash-soft)]"
          style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}
        >
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-[var(--dash-text-strong)]">
          Live preview
        </h2>
      </div>
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--dash-subtle)]">
        <Pencil className="h-3 w-3" />
        Every field is editable
      </span>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mono mb-2 block text-[10px] tracking-widest text-[var(--dash-subtle)]">
      {children}
    </label>
  )
}

const WELL =
  'w-full rounded-xl px-3.5 py-2.5 text-sm bg-[var(--dash-card-solid)] border border-[var(--dash-border)] ' +
  'text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-subtle)] ' +
  'focus:border-[var(--dash-border-glow)] focus:shadow-[0_0_0_3px_var(--dash-accent-soft)]'

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <FieldLabel>NAME</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Name your agent"
        className={WELL}
      />
    </div>
  )
}

function RolePicker({ role, onPick }: { role?: AgentRole; onPick: (r: AgentRole) => void }) {
  return (
    <div>
      <FieldLabel>ROLE</FieldLabel>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {AGENT_ROLES.map((r) => {
          const on = role === r
          return (
            <button
              key={r}
              type="button"
              onClick={() => onPick(r)}
              className="rounded-xl px-3 py-2 text-left transition"
              style={
                on
                  ? { background: 'var(--dash-accent-soft)', border: '1px solid var(--dash-border-glow)' }
                  : { background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }
              }
            >
              <span
                className="block text-[12px] font-semibold"
                style={{ color: on ? 'var(--dash-accent)' : 'var(--dash-text)' }}
              >
                {ROLE_LABEL[r]}
              </span>
              <span className="mt-0.5 block text-[10px] leading-snug text-[var(--dash-subtle)] line-clamp-2">
                {ROLE_BLURB[r]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CustomRoleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <FieldLabel>CUSTOM ROLE · WHAT EXACTLY SHOULD IT DO?</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="Describe the custom behavior in a sentence"
        className={cn(WELL, 'resize-none leading-relaxed')}
      />
    </div>
  )
}

function ObjectiveField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <FieldLabel>
        <span className="inline-flex items-center gap-1.5">
          <Target className="h-3 w-3" /> OBJECTIVE <span className="text-[var(--dash-subtle)]">· OPTIONAL</span>
        </span>
      </FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="What is the agent's standing goal? e.g. Keep my pricing research current"
        className={cn(WELL, 'resize-none leading-relaxed')}
      />
    </div>
  )
}

function ScheduleField({
  schedule,
  onPick,
  onCron,
}: {
  schedule?: ScheduleDraft
  onPick: (draft: ScheduleDraft) => void
  onCron: (cron: string) => void
}) {
  const activeKey = scheduleKey(schedule)
  return (
    <div>
      <FieldLabel>
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3 w-3" /> SCHEDULE
        </span>
      </FieldLabel>
      <div className="flex flex-wrap gap-2">
        {SCHEDULE_PRESETS.map((p) => {
          const on = activeKey === p.key
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onPick(p.draft)}
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
              style={
                on
                  ? { background: 'var(--dash-accent-soft)', border: '1px solid var(--dash-border-glow)', color: 'var(--dash-accent)' }
                  : { background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-muted)' }
              }
            >
              {p.label}
            </button>
          )
        })}
      </div>
      {schedule?.kind === 'scheduled' && (
        <input
          type="text"
          value={schedule.cron ?? ''}
          onChange={(e) => onCron(e.target.value)}
          placeholder="cron expression e.g. 0 9 * * *"
          className={cn(WELL, 'mono mt-2 text-[12px]')}
        />
      )}
    </div>
  )
}

function SkillsField({ assigned, onToggle }: { assigned: string[]; onToggle: (id: string) => void }) {
  return (
    <div>
      <FieldLabel>ASSIGNED SKILLS</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {SKILLS.map((skill) => {
          const on = assigned.includes(skill.id)
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => onToggle(skill.id)}
              title={skill.tagline}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition"
              style={
                on
                  ? { background: 'var(--dash-accent-soft)', border: '1px solid var(--dash-border-glow)', color: 'var(--dash-accent)' }
                  : { background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-muted)' }
              }
            >
              {on && <Check className="h-3 w-3" />}
              {skill.name}
            </button>
          )
        })}
      </div>
      {assigned.length === 0 && (
        <p className="mt-2 text-[11px] text-[var(--dash-subtle)]">
          No skills assigned yet — pick a role to apply its defaults, or choose your own.
        </p>
      )}
    </div>
  )
}

function SignOffField({
  policy,
  onSet,
}: {
  policy?: Partial<SignOffPolicy>
  onSet: (key: keyof SignOffPolicy, value: 'auto' | 'ask' | 'notify') => void
}) {
  return (
    <div>
      <FieldLabel>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3" /> SIGN-OFF POLICY
        </span>
      </FieldLabel>
      <div className="space-y-2">
        {SIGN_OFF_ROWS.map((row) => {
          const current = policy?.[row.key]
          return (
            <div
              key={row.key}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
              style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
            >
              <span className="text-[12px] text-[var(--dash-text)]">{row.label}</span>
              <div className="flex gap-1">
                {row.options.map((opt) => {
                  const on = current === opt
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onSet(row.key, opt)}
                      className="rounded-md px-2 py-1 text-[11px] font-medium capitalize transition"
                      style={
                        on
                          ? { background: 'var(--dash-accent-soft)', border: '1px solid var(--dash-border-glow)', color: 'var(--dash-accent)' }
                          : { background: 'transparent', border: '1px solid var(--dash-border)', color: 'var(--dash-subtle)' }
                      }
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TrustScopeField({
  scope,
  onSet,
}: {
  scope: TrustScope
  onSet: (partial: { webAccess?: boolean; perRunTokenBudget?: number; readableCollections?: string[] }) => void
}) {
  const collections = scope.readableCollections ?? []
  return (
    <div>
      <FieldLabel>
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3 w-3" /> TRUST SCOPE
        </span>
      </FieldLabel>
      <div className="space-y-2">
        {/* Web access toggle */}
        <div
          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
          style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
        >
          <span className="inline-flex items-center gap-2 text-[12px] text-[var(--dash-text)]">
            <Globe className="h-3.5 w-3.5 text-[var(--dash-subtle)]" /> Web access
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={scope.webAccess}
            onClick={() => onSet({ webAccess: !scope.webAccess })}
            className="relative h-5 w-9 rounded-full transition"
            style={{
              background: scope.webAccess ? 'var(--dash-accent)' : 'var(--dash-soft)',
              border: '1px solid var(--dash-border)',
            }}
          >
            <span
              className="absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all"
              style={{ left: scope.webAccess ? 'calc(100% - 18px)' : '2px' }}
            />
          </button>
        </div>

        {/* Per-run token budget */}
        <div
          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
          style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
        >
          <span className="inline-flex items-center gap-2 text-[12px] text-[var(--dash-text)]">
            <Coins className="h-3.5 w-3.5 text-[var(--dash-subtle)]" /> Per-run token budget
          </span>
          <input
            type="number"
            min={0}
            step={1000}
            value={Number.isFinite(scope.perRunTokenBudget) ? scope.perRunTokenBudget : 0}
            onChange={(e) => onSet({ perRunTokenBudget: Math.max(0, Number(e.target.value) || 0) })}
            className="mono w-28 rounded-lg px-2 py-1 text-right text-[12px] text-[var(--dash-text)] outline-none transition focus:border-[var(--dash-border-glow)] focus:shadow-[0_0_0_3px_var(--dash-accent-soft)]"
            style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
          />
        </div>

        {/* Readable collections (comma-separated; empty = whole vault) */}
        <div
          className="rounded-xl px-3 py-2.5"
          style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
        >
          <span className="block text-[12px] text-[var(--dash-text)]">Readable collections</span>
          <input
            type="text"
            value={collections.join(', ')}
            onChange={(e) => onSet({ readableCollections: parseCsv(e.target.value) })}
            placeholder="Leave empty for the whole vault"
            className="mt-1.5 w-full rounded-lg px-2 py-1 text-[12px] text-[var(--dash-text)] outline-none transition placeholder:text-[var(--dash-subtle)] focus:border-[var(--dash-border-glow)] focus:shadow-[0_0_0_3px_var(--dash-accent-soft)]"
            style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
          />
        </div>
      </div>
    </div>
  )
}

function TrustScopeStatementCard({
  statement,
}: {
  statement: { canDo: string[]; cannotDo: string[] }
}) {
  return (
    <div
      className="rounded-xl p-3.5"
      style={{ background: 'var(--dash-soft)', border: '1px solid var(--dash-border)' }}
    >
      <p className="mono text-[10px] tracking-widest text-[var(--dash-subtle)]">TRUST SCOPE STATEMENT</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--dash-accent)' }}>
            Can
          </p>
          <ul className="mt-1.5 space-y-1">
            {statement.canDo.map((c, i) => (
              <li key={`can-${i}`} className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--dash-muted)]">
                <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: 'var(--dash-accent)' }} />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--dash-subtle)]">Cannot</p>
          <ul className="mt-1.5 space-y-1">
            {statement.cannotDo.map((c, i) => (
              <li key={`cannot-${i}`} className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--dash-muted)]">
                <Lock className="mt-0.5 h-3 w-3 shrink-0 text-[var(--dash-subtle)]" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ── Action bar — Save · Dry_Run (primary) · Deploy (gated) ──────────────────────

function ActionBar({
  canSave,
  saveState,
  saveError,
  isUpdate,
  onSave,
  dryRunState,
  dryRunError,
  dryRunSummary,
  onDryRun,
  hadSuccessfulDryRun,
  deployState,
  deployed,
  onDeploy,
}: {
  canSave: boolean
  saveState: SaveState
  saveError: string
  isUpdate: boolean
  onSave: () => void
  dryRunState: DryRunState
  dryRunError: string
  dryRunSummary: DryRunSummary | null
  onDryRun: () => void
  hadSuccessfulDryRun: boolean
  deployState: SaveState
  deployed: boolean
  onDeploy: () => void
}) {
  return (
    <div className="space-y-3 border-t border-[var(--dash-border)] pt-4">
      {/* Dry-run summary (Req 7.7) — real counts from the run API, no fabrication */}
      {dryRunSummary && (
        <div
          className="rounded-xl p-3.5"
          style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border-glow)' }}
        >
          <p className="mono text-[10px] tracking-widest" style={{ color: 'var(--dash-accent)' }}>
            DRY RUN · WHAT IT WOULD DO
          </p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            <SummaryStat label="would propose" value={dryRunSummary.wouldPropose} />
            {dryRunSummary.wouldIngest !== undefined && (
              <SummaryStat label="would ingest" value={dryRunSummary.wouldIngest} />
            )}
            {dryRunSummary.filtered !== undefined && (
              <SummaryStat label="filtered" value={dryRunSummary.filtered} />
            )}
            <SummaryStat label="flagged" value={dryRunSummary.flagged} />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[var(--dash-subtle)]">
            Nothing was written to your vault. Each item routes to the Aegis Queue for your sign-off.
          </p>
        </div>
      )}

      {(saveError || dryRunError) && (
        <p className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--dash-accent)' }}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {saveError || dryRunError}
        </p>
      )}

      {/* Deploy gate notice (Req 7.10) */}
      {!hadSuccessfulDryRun && !deployed && (
        <p className="text-[11px] text-[var(--dash-subtle)]">
          A successful dry run is required before this agent can deploy.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Primary CTA: Dry_Run */}
        <button
          type="button"
          onClick={onDryRun}
          disabled={!canSave || dryRunState === 'running'}
          className={cn(
            'dash-accent-grad inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white transition',
            !canSave || dryRunState === 'running' ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5',
          )}
        >
          {dryRunState === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {dryRunState === 'running' ? 'Running dry run…' : 'Run dry run'}
        </button>

        {/* Save / Create */}
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || saveState === 'saving'}
          className={cn(
            'inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition',
            !canSave || saveState === 'saving' ? 'cursor-not-allowed opacity-60' : 'hover:border-[var(--dash-border-glow)]',
          )}
          style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: 'var(--dash-text)' }}
        >
          {saveState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isUpdate ? 'Save changes' : 'Create agent'}
        </button>

        {/* Deploy — only enabled once a dry run succeeded (Req 7.10) */}
        <button
          type="button"
          onClick={onDeploy}
          disabled={!hadSuccessfulDryRun || deployState === 'saving' || deployed}
          className={cn(
            'inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition',
            !hadSuccessfulDryRun || deployState === 'saving' || deployed
              ? 'cursor-not-allowed opacity-60'
              : 'hover:border-[var(--dash-border-glow)]',
          )}
          style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', color: deployed ? 'var(--dash-accent)' : 'var(--dash-text)' }}
        >
          {deployState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : deployed ? <Check className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
          {deployed ? 'Deployed' : 'Deploy'}
        </button>
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-lg font-semibold leading-none tracking-tight text-[var(--dash-text-strong)] [font-variant-numeric:tabular-nums]">
        {Number.isFinite(value) ? value.toLocaleString() : 0}
      </span>
      <span className="text-[11px] text-[var(--dash-muted)]">{label}</span>
    </div>
  )
}

// ── Pure helpers (no I/O) ───────────────────────────────────────────────────────

/** A non-empty, trimmed string. */
function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Is `value` one of the known Agent_Roles. */
function isValidRole(value: unknown): value is AgentRole {
  return typeof value === 'string' && (AGENT_ROLES as readonly string[]).includes(value)
}

/** Toggle an id in a list (immutable). */
function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

/** Split a comma-separated string into trimmed, non-empty tokens. */
function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Stable key identifying which schedule preset a draft matches (for the UI). */
function scheduleKey(schedule?: ScheduleDraft): string {
  if (!schedule || schedule.kind === undefined) return ''
  if (schedule.kind === 'manual') return 'manual'
  if (schedule.kind === 'reactive') return 'reactive'
  // scheduled → match a known preset cron, else 'custom'
  const match = SCHEDULE_PRESETS.find(
    (p) => p.draft.kind === 'scheduled' && p.draft.cron === schedule.cron,
  )
  return match ? match.key : 'custom'
}

/**
 * Build the PreviewUpdate for picking a role: set the role AND apply its
 * conservative defaults (default skill set + ask-first sign-off policy) from
 * task 4.2's `roleDefaults`. Folded through `mergePreview` like any other update,
 * so a user who already hand-picked other fields keeps them.
 */
function rolePickUpdate(role: AgentRole): PreviewUpdate {
  const defaults = roleDefaults(role)
  return {
    role,
    assignedSkillIds: defaults.skillIds,
    signOffPolicy: defaults.signOffPolicy,
  }
}

/**
 * Parse a plain-language conversation turn into a PreviewUpdate (Req 7.2). This
 * is an intentionally lightweight, deterministic client-side parser — it
 * recognises role keywords, schedule cadence, web access, and a "name it X" /
 * "call it X" pattern. Anything it cannot confidently extract is simply left
 * unstated, so `mergePreview` preserves the existing preview and the
 * clarifying-question selector can still drive the next prompt.
 *
 * NOTE: a heavier server-side / runner-backed intent parser can later replace
 * this, returning the SAME `PreviewUpdate` shape so this contract still holds.
 */
function parseIntent(text: string, current: PreviewState): PreviewUpdate {
  const lower = text.toLowerCase()
  const update: PreviewUpdate = {}

  // Role keywords → role (+ defaults applied by merging rolePickUpdate).
  const roleMatch = detectRole(lower)
  if (roleMatch && current.role !== roleMatch) {
    Object.assign(update, rolePickUpdate(roleMatch))
  }

  // Schedule cadence.
  if (/\bhourly\b|every hour/.test(lower)) {
    update.schedule = { kind: 'scheduled', cron: '0 * * * *' }
  } else if (/\bdaily\b|every day|each day/.test(lower)) {
    update.schedule = { kind: 'scheduled', cron: '0 9 * * *' }
  } else if (/\bweekly\b|every week|each week/.test(lower)) {
    update.schedule = { kind: 'scheduled', cron: '0 9 * * 1' }
  } else if (/\bmanual(ly)?\b|on demand|when i ask/.test(lower)) {
    update.schedule = { kind: 'manual' }
  }

  // Web access.
  if (/\b(web access|search the web|browse the web|use the web|access the internet)\b/.test(lower)) {
    update.trustScope = { ...(update.trustScope ?? {}), webAccess: true }
  } else if (/\b(no web|don'?t use the web|offline|vault only|no internet)\b/.test(lower)) {
    update.trustScope = { ...(update.trustScope ?? {}), webAccess: false }
  }

  // Sign-off intent — "ask before / always ask" vs "auto / on its own".
  if (/\bask (me )?(before|first)|always ask|require sign-?off|approve/.test(lower)) {
    update.signOffPolicy = { ingestSource: 'ask', createSynthesis: 'ask', createConnection: 'ask' }
  } else if (/\bauto(matically)?\b|on its own|without asking/.test(lower)) {
    update.signOffPolicy = { ingestSource: 'auto', createSynthesis: 'auto', createConnection: 'auto' }
  }

  // Name — "name it X" / "call it X" / "named X".
  const nameMatch = text.match(/(?:name(?:d| it| this)?|call(?: it| this)?)\s+["“]?([\w][\w \-]{0,48})["”]?/i)
  if (nameMatch?.[1]) {
    update.name = nameMatch[1].trim()
  }

  return update
}

/** Detect an Agent_Role from free text via keyword heuristics. */
function detectRole(lower: string): AgentRole | null {
  if (/\bscout\b|watch (for|my) (sources|new)|monitor sources|find new sources/.test(lower)) return 'scout'
  if (/\bsynthesi[sz]e?\b|synthesist|tie (ideas|notes) together|summari[sz]e across/.test(lower)) return 'synthesist'
  if (/\bconnect(or|ions)?\b|link (notes|ideas)|find relationships/.test(lower)) return 'connector'
  if (/\bcritic\b|critique|flag (risks|contradictions)|poke holes/.test(lower)) return 'critic'
  if (/\blibrarian\b|organi[sz]e|tidy|triage|file (my )?notes/.test(lower)) return 'librarian'
  if (/\bresearch(er)?\b|deep dive|investigate|gap analysis/.test(lower)) return 'researcher'
  return null
}

/** Friendly confirmation describing what the latest update changed. */
function confirmationFor(update: PreviewUpdate, next: PreviewState): string {
  const parts: string[] = []
  if (update.role) parts.push(`role set to ${ROLE_LABEL[update.role]}`)
  if (update.name) parts.push(`named "${update.name}"`)
  if (update.schedule) parts.push(`schedule updated`)
  if (update.assignedSkillIds) parts.push(`skills updated`)
  if (update.signOffPolicy) parts.push(`sign-off policy updated`)
  if (update.trustScope) parts.push(`trust scope updated`)
  if (update.objective) parts.push(`objective set`)
  if (parts.length === 0) {
    return "Got it. I've left the preview as-is — edit any field directly, or tell me more."
  }
  const ready = isNonEmpty(next.name) && isValidRole(next.role)
  const tail = ready ? ' Looks ready — run a dry run when you are.' : ''
  return `Updated the preview: ${parts.join(', ')}.${tail}`
}

// ── Agent ⇄ preview adapters ────────────────────────────────────────────────────

/** Seed a PreviewState from a persisted Agent doc (EDIT mode, Req 7.12). */
function seedPreviewFromAgent(agent: Record<string, unknown>): PreviewState {
  const trustScope = (agent.trustScope ?? {}) as Record<string, unknown>
  const signOffPolicy = (agent.signOffPolicy ?? {}) as Record<string, unknown>
  const schedule = (agent.schedule ?? { kind: 'manual' }) as ScheduleDraft

  return {
    name: typeof agent.name === 'string' ? agent.name : undefined,
    role: isValidRole(agent.role) ? agent.role : undefined,
    customRoleDescription:
      typeof agent.customRoleDescription === 'string' ? agent.customRoleDescription : null,
    schedule,
    assignedSkillIds: Array.isArray(agent.assignedSkillIds)
      ? (agent.assignedSkillIds as string[])
      : [],
    signOffPolicy: {
      ingestSource: signOffPolicy.ingestSource === 'auto' ? 'auto' : 'ask',
      createSynthesis: signOffPolicy.createSynthesis === 'auto' ? 'auto' : 'ask',
      createConnection: signOffPolicy.createConnection === 'auto' ? 'auto' : 'ask',
      flagContradiction:
        signOffPolicy.flagContradiction === 'auto'
          ? 'auto'
          : signOffPolicy.flagContradiction === 'ask'
            ? 'ask'
            : 'notify',
    },
    trustScope: {
      readableSourceIds: Array.isArray(trustScope.readableSourceIds)
        ? (trustScope.readableSourceIds as unknown[]).map((x) => String(x))
        : [],
      readableCollections: Array.isArray(trustScope.readableCollections)
        ? (trustScope.readableCollections as string[])
        : [],
      webAccess: Boolean(trustScope.webAccess),
      perRunTokenBudget: Number(trustScope.perRunTokenBudget) || 0,
    },
  }
}

/**
 * Convert the live preview into the JSON payload the `/api/agents` create/update
 * routes accept. Only known, caller-settable fields are sent (the routes
 * whitelist these). The `objective` is builder-only and intentionally not a
 * persisted Agent column, so it is not sent. `trustScopeStatement` is generated
 * server-side from the resolved scope (Req 1.8), so we never send it here.
 */
function previewToPayload(preview: PreviewState): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (isNonEmpty(preview.name)) payload.name = preview.name!.trim()
  if (isValidRole(preview.role)) payload.role = preview.role
  if (preview.role === 'custom' && isNonEmpty(preview.customRoleDescription)) {
    payload.customRoleDescription = preview.customRoleDescription
  }
  if (preview.schedule && preview.schedule.kind) payload.schedule = preview.schedule
  if (Array.isArray(preview.assignedSkillIds)) payload.assignedSkillIds = preview.assignedSkillIds
  if (preview.signOffPolicy) payload.signOffPolicy = preview.signOffPolicy
  if (preview.trustScope) payload.trustScope = preview.trustScope
  return payload
}
