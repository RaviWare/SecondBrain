'use client'

import type { CSSProperties } from 'react'
import type { IAgent } from '@/lib/models'
import {
  accentForStatus,
  accentTokenForStatus,
  statusColorRole,
  type AgentStatus,
  type StatusColorRole,
} from '@/lib/agents/accent'
import { band, type TrustBand } from '@/lib/agents/trust'
import { getSkill } from '@/lib/skills/catalog'
import { useSpotlight } from '@/lib/use-spotlight'
import { cn } from '@/lib/utils'

// The Agent_Role union, sourced from the real `Agent` model so the labels here
// can never drift from the schema enum (type-only import — no mongoose at runtime).
type AgentRole = IAgent['role']

/**
 * Presentational view-model for one roster Agent card (Req 6.3). The card does NO
 * data fetching — the Squad Dashboard page (task 3.3) wires real Agents into these
 * props. Empty/zero states are real: render whatever is given, never fabricate.
 */
export interface AgentCardProps {
  /** Agent display name. */
  name: string
  /** Agent_Role (drives the role label). */
  role: AgentRole
  /** Free-text role description, shown for the 'custom' role when present. */
  customRoleDescription?: string | null
  /** Lifecycle/status — drives the color language and the review-only accent. */
  status: AgentStatus
  /** Earned Trust_Score (0–100); rendered with its Trust_Band. */
  trustScore: number
  /** Assigned Skill ids (Authority_Grants); unknown ids are skipped gracefully. */
  skillIds: string[]
  /** The "now" line — what the Agent is doing right now. */
  now: string
}

// Human label for each Agent_Role.
const ROLE_LABEL: Record<AgentRole, string> = {
  scout: 'Scout',
  synthesist: 'Synthesist',
  connector: 'Connector',
  critic: 'Critic',
  librarian: 'Librarian',
  researcher: 'Researcher',
  custom: 'Custom',
}

// Human label for each status.
const STATUS_LABEL: Record<AgentStatus, string> = {
  live: 'Live',
  review: 'Awaiting sign-off',
  idle: 'Idle',
  paused: 'Paused',
  error: 'Error',
}

// Concrete dot treatment per semantic color ROLE (from `statusColorRole`). Only the
// reserved 'accent' role binds the warm accent token; every other role is neutral
// or a non-accent semantic color. Keeping this keyed by StatusColorRole means the
// "accent === review only" rule is never re-derived here — it comes from accent.ts.
const STATUS_DOT_CLASS: Record<StatusColorRole, string> = {
  green: 'bg-emerald-400',
  accent: 'bg-[var(--dash-accent)]',
  grey: 'bg-[var(--dash-subtle)]',
  disabled: 'bg-[var(--dash-subtle)] opacity-50',
  red: 'bg-rose-500',
}

// Trust_Band → short label for the trust pill.
const BAND_LABEL: Record<TrustBand, string> = {
  trusted: 'Trusted',
  proving: 'Proving',
  watch: 'Watch',
}

export function AgentCard({
  name,
  role,
  customRoleDescription,
  status,
  trustScore,
  skillIds,
  now,
}: AgentCardProps) {
  const spotlight = useSpotlight<HTMLElement>()

  // Accent decision + token both come from accent.ts — the single source of the
  // "warm accent IFF review" invariant (Req 6.5, 6.6, 6.7; Property 17).
  const isReview = accentForStatus(status)
  const accentToken = accentTokenForStatus(status)
  const colorRole = statusColorRole(status)

  const roleLabel =
    role === 'custom' && customRoleDescription?.trim()
      ? customRoleDescription.trim()
      : ROLE_LABEL[role]

  const trustBand = band(trustScore)

  // Resolve assigned skills; gracefully skip unknown ids (Req 6.3).
  const skills = skillIds
    .map(id => getSkill(id))
    .filter((s): s is NonNullable<ReturnType<typeof getSkill>> => Boolean(s))

  // Warm accent border + glow, applied ONLY while awaiting sign-off. Bound to the
  // accent token returned by accent.ts so the rule lives in exactly one place.
  const accentStyle: CSSProperties =
    isReview && accentToken
      ? {
          borderColor: `var(${accentToken})`,
          boxShadow: `0 0 0 1px var(${accentToken}) inset, 0 0 34px -8px var(--dash-accent-soft)`,
        }
      : {}

  return (
    <article
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      style={accentStyle}
      className={cn(
        'dash-panel dash-grain dash-spotlight dash-interactive group flex flex-col gap-3 p-4',
        isReview && 'ring-1 ring-[var(--dash-accent)]/30'
      )}
      data-status={status}
      data-accent={isReview ? 'review' : undefined}
    >
      <span className="dash-spotlight-glow" aria-hidden />

      {/* Header: status indicator + role, with the trust pill on the right. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'h-2.5 w-2.5 shrink-0 rounded-full',
                STATUS_DOT_CLASS[colorRole],
                status === 'live' && 'dash-live-dot'
              )}
              aria-hidden
            />
            <span
              className={cn(
                'text-[11px] font-medium',
                isReview ? 'text-[var(--dash-accent)]' : 'text-[var(--dash-muted)]'
              )}
            >
              {STATUS_LABEL[status]}
            </span>
          </div>
          <h3 className="dash-metallic-text mt-1.5 truncate text-[15px] font-semibold leading-tight">
            {name}
          </h3>
          <p className="mt-0.5 truncate text-[12px] font-medium text-[var(--dash-subtle)]">
            {roleLabel}
          </p>
        </div>

        {/* Trust_Score + Trust_Band */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xl font-semibold leading-none tracking-tight text-[var(--dash-text-strong)] [font-variant-numeric:tabular-nums]">
            {trustScore}
          </span>
          <span className="rounded-md border border-[var(--dash-border)] bg-[var(--dash-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--dash-muted)]">
            {BAND_LABEL[trustBand]}
          </span>
        </div>
      </div>

      {/* "now" line — what the Agent is doing right now. */}
      <p className="line-clamp-2 text-[12px] leading-relaxed text-[var(--dash-muted)]">
        {now?.trim() ? now : <span className="text-[var(--dash-subtle)]">Nothing in flight</span>}
      </p>

      {/* Assigned Skill chips. */}
      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {skills.map(skill => (
            <span
              key={skill.id}
              className="rounded-full border border-[var(--dash-border)] bg-[var(--dash-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--dash-subtle)]"
            >
              {skill.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[10px] font-medium text-[var(--dash-subtle)]">No skills assigned</p>
      )}
    </article>
  )
}
