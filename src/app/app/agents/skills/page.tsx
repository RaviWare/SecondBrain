'use client'

// ── Skills Library — Installed / Discover tabs (Req 9.1, 9.2, 11.7) ────────────
// Two tabs:
//   • Discover  = the curated catalog (GET /api/skills) — the GBrain registry.
//   • Installed = the user's per-user install state (the gstack runtime).
//
// Every Skill card shows the four-part anatomy required by Req 9.2:
//   1. what the Skill does       (name + tagline + description)
//   2. its capability category   (SKILL_CATEGORIES label for def.category)
//   3. the `touches:` line        (def.touches rendered as blast-radius chips)
//   4. the scanned-status badge  (def.scanned.status → passed/failed/pending)
//
// Data is REAL and honest-by-construction (no fabrication):
//   • Discover  = the real catalog returned by the API.
//   • Installed = the user's real InstalledSkill records. Until the installed-list
//     endpoint exists (tasks 6.4/6.8 own the install LOGIC + routes), we read it
//     from `GET /api/skills?installed=1` IF the API supplies an `installed` array,
//     and otherwise fall back to the skills the user installs in THIS session
//     (optimistic local state) plus an explicit "your installed skills appear
//     here" empty state. We never invent installed skills.
//
// Install action: POST the skill id to the install endpoint (owned by task 6.4).
// On a blocked/failed scan the route returns `reasons` (from `scanSkill`); we
// surface those specific reasons inline rather than a generic error. On success
// we reflect the Skill as installed. The enable/disable + Authority_Grant
// handlers land in 6.5/6.8 — we leave clean call sites and a clearly-disabled
// "coming soon" affordance, never fabricated behavior.
//
// Glass recipe is MANDATORY (`.kiro/steering/glass-theme.md`, Req 11.7): the
// shell is `sb-dashboard`; every card carries `dash-panel dash-grain
// dash-spotlight dash-interactive` with a `dash-spotlight-glow` child wired to
// `useSpotlight` (feature-card energy, like StatCard/AgentCard); inset wells use
// `--dash-card-solid` + `--dash-border`; all colors come from `--dash-*` tokens.
// No portal overlays are used (the tab switcher is an in-scope button group), so
// there is no transparent-overlay token hazard.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Blocks,
  Briefcase,
  Check,
  CircleSlash,
  Clock,
  Download,
  Inbox as InboxIcon,
  Loader2,
  Lock,
  PenLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type {
  ScanStatus,
  SkillCategory,
  SkillTouches,
} from '@/lib/skills/catalog'
import { useSpotlight } from '@/lib/use-spotlight'
import { cn } from '@/lib/utils'

// ── Install endpoint (owned by task 6.4) ──────────────────────────────────────
// Task 6.4 adds the scan-gated install POST. The agreed call site is POST
// `/api/skills` with `{ skillId }`. If 6.4 lands it on a different path
// (e.g. `/api/skills/install`), this is the ONE line to change.
const INSTALL_ENDPOINT = '/api/skills'

// ── Payload types (mirror the public catalog API + InstalledSkill record) ──────

/** A public catalog skill (the API strips `promptTemplate`). */
interface CatalogSkill {
  id: string
  name: string
  tagline: string
  description: string
  category: SkillCategory
  icon: string
  accent: string
  tools: string[]
  writesToVault: boolean
  exampleOutcomes: string[]
  version: string
  touches: SkillTouches[]
  scanned: { status: ScanStatus; lastScannedAt: string | null }
}

interface CategoryDef {
  id: SkillCategory
  label: string
}

/** Per-user install state (a subset of the InstalledSkill model fields). */
interface InstalledRecord {
  skillId: string
  installedVersion: string
  enabled: boolean
  scanStatus: ScanStatus
  scanReasons: string[]
  lastScannedAt: string | null
  autoDisabledByScan?: boolean
}

interface CatalogPayload {
  categories: CategoryDef[]
  skills: CatalogSkill[]
  /** Optional — present once the installed-list endpoint exists (6.4/6.8). */
  installed?: InstalledRecord[]
}

type LoadState = 'loading' | 'error' | 'ready'
type Tab = 'discover' | 'installed'

// ── Display helpers ────────────────────────────────────────────────────────────

// The catalog stores lucide icon names in kebab-case; resolve the curated set to
// real components (with a sensible fallback for any future addition).
const ICONS: Record<string, typeof Search> = {
  search: Search,
  briefcase: Briefcase,
  inbox: InboxIcon,
  activity: Activity,
  'pen-line': PenLine,
}
function iconFor(name: string): typeof Search {
  return ICONS[name] ?? Sparkles
}

// Friendly label for each declared blast-radius value (the `touches:` line).
const TOUCH_LABEL: Record<SkillTouches, string> = {
  'vault-read': 'vault-read',
  'vault-write': 'vault-write',
  network: 'network',
  credentials: 'credentials',
  nothing: 'nothing',
}

// Color language for a touch chip by how much blast radius it implies. Reuses the
// same semantic palette the dashboard/AgentCard already use (emerald / rose) so
// the page stays visually consistent.
function touchTone(t: SkillTouches): { color: string; border: string; bg: string } {
  switch (t) {
    case 'network':
    case 'credentials':
      // highest blast radius — warn in rose
      return { color: '#fb7185', border: 'rgba(251,113,133,0.32)', bg: 'rgba(251,113,133,0.10)' }
    case 'vault-write':
      // writes back — amber caution
      return { color: '#fbbf24', border: 'rgba(251,191,36,0.30)', bg: 'rgba(251,191,36,0.10)' }
    case 'nothing':
      return { color: 'var(--dash-subtle)', border: 'var(--dash-border)', bg: 'var(--dash-soft)' }
    case 'vault-read':
    default:
      return { color: '#38bdf8', border: 'rgba(56,189,248,0.30)', bg: 'rgba(56,189,248,0.10)' }
  }
}

// Scanned-status badge styling (passed=emerald, failed=rose, pending=muted).
function scanBadge(status: ScanStatus): {
  label: string
  color: string
  border: string
  bg: string
  Icon: typeof ShieldCheck
} {
  switch (status) {
    case 'passed':
      return { label: 'Scan passed', color: '#34d399', border: 'rgba(52,211,153,0.32)', bg: 'rgba(52,211,153,0.10)', Icon: ShieldCheck }
    case 'failed':
      return { label: 'Scan failed', color: '#fb7185', border: 'rgba(251,113,133,0.32)', bg: 'rgba(251,113,133,0.10)', Icon: ShieldAlert }
    case 'pending':
    default:
      return { label: 'Scan pending', color: 'var(--dash-subtle)', border: 'var(--dash-border)', bg: 'var(--dash-soft)', Icon: Clock }
  }
}

// Friendly text for each Security_Scan failure reason (from `scanSkill`).
const REASON_LABEL: Record<string, string> = {
  injection: 'Embedded instructions detected in the skill',
  'credential-access': 'Reaches for credentials or secrets',
  exfiltration: 'Attempts to send data to an external destination',
  'capability-mismatch': 'Declared "touches:" does not match its behavior',
}
function reasonText(reason: string): string {
  return REASON_LABEL[reason] ?? reason
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function SkillsLibraryPage() {
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [skills, setSkills] = useState<CatalogSkill[]>([])
  const [categories, setCategories] = useState<CategoryDef[]>([])
  // Per-user install state keyed by skillId. Seeded from the API's `installed`
  // array when present, then kept in sync by successful installs this session.
  const [installed, setInstalled] = useState<Record<string, InstalledRecord>>({})
  const [tab, setTab] = useState<Tab>('discover')

  const load = useCallback(async () => {
    try {
      // Ask for installed state too; the catalog API supplies `skills`+`categories`
      // today and MAY add `installed` once 6.4/6.8 land. Either way the catalog is
      // real and the installed list stays honest.
      const res = await fetch('/api/skills?installed=1', { cache: 'no-store' })
      const body = (await res.json().catch(() => ({}))) as Partial<CatalogPayload> & { error?: string }
      if (!res.ok) {
        setError(body?.error || 'Could not load the skills library.')
        setState('error')
        return
      }
      setSkills(Array.isArray(body.skills) ? body.skills : [])
      setCategories(Array.isArray(body.categories) ? body.categories : [])
      if (Array.isArray(body.installed)) {
        const map: Record<string, InstalledRecord> = {}
        for (const rec of body.installed) {
          if (rec && typeof rec.skillId === 'string') map[rec.skillId] = rec
        }
        setInstalled(map)
      }
      setState('ready')
    } catch {
      setError('Network error. Please try again.')
      setState('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Record a freshly-installed Skill in local state (optimistic, honest).
  const markInstalled = useCallback((rec: InstalledRecord) => {
    setInstalled((prev) => ({ ...prev, [rec.skillId]: rec }))
  }, [])

  const installedList = useMemo(
    () => skills.filter((s) => Boolean(installed[s.id])),
    [skills, installed],
  )

  return (
    <main className="sb-dashboard min-h-full text-[var(--dash-text)]">
      <div className="mx-auto max-w-[1500px] p-4 sm:p-5 lg:p-6 2xl:p-7">
        <Header />

        {state === 'loading' && <LoadingView />}
        {state === 'error' && <ErrorView message={error} onRetry={load} />}
        {state === 'ready' && (
          <>
            <TabSwitcher
              tab={tab}
              onTab={setTab}
              discoverCount={skills.length}
              installedCount={installedList.length}
            />

            <div className="mt-5">
              {tab === 'discover' ? (
                <DiscoverTab
                  skills={skills}
                  categories={categories}
                  installed={installed}
                  onInstalled={markInstalled}
                />
              ) : (
                <InstalledTab
                  installedList={installedList}
                  installed={installed}
                  categories={categories}
                />
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

// ── Header ──────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="dash-rise" style={{ animationDelay: '0s' }}>
      <p className="mono text-[10px] uppercase tracking-widest text-[var(--dash-subtle)] mb-2">
        Skills · Capabilities &amp; blast radius
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        <span className="dash-metallic-text">Skills Library</span>
      </h1>
      <p className="mt-1 max-w-2xl text-[13px] text-[var(--dash-muted)]">
        Browse vetted skills and install the ones you want. Every install runs a security scan
        first — and installing a skill grants its existence only, never authority. You assign a
        skill to an agent in a separate, deliberate step.
      </p>
    </header>
  )
}

// ── Tab switcher (inset well + accent on the active tab) ──────────────────────

function TabSwitcher({
  tab,
  onTab,
  discoverCount,
  installedCount,
}: {
  tab: Tab
  onTab: (t: Tab) => void
  discoverCount: number
  installedCount: number
}) {
  const tabs: Array<{ key: Tab; label: string; count: number; Icon: typeof Search }> = [
    { key: 'discover', label: 'Discover', count: discoverCount, Icon: Search },
    { key: 'installed', label: 'Installed', count: installedCount, Icon: Blocks },
  ]
  return (
    <div
      role="tablist"
      aria-label="Skills library tabs"
      className="dash-rise mt-5 inline-flex items-center gap-1 rounded-2xl p-1"
      style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)', animationDelay: '0.08s' }}
    >
      {tabs.map(({ key, label, count, Icon }) => {
        const on = tab === key
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onTab(key)}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium transition"
            style={
              on
                ? { background: 'var(--dash-accent-soft)', border: '1px solid var(--dash-border-glow)', color: 'var(--dash-accent)' }
                : { background: 'transparent', border: '1px solid transparent', color: 'var(--dash-muted)' }
            }
          >
            <Icon className="h-4 w-4" />
            {label}
            <span
              className="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold [font-variant-numeric:tabular-nums]"
              style={
                on
                  ? { background: 'var(--dash-accent)', color: '#fff' }
                  : { background: 'var(--dash-soft)', color: 'var(--dash-subtle)' }
              }
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Discover tab ────────────────────────────────────────────────────────────────

function DiscoverTab({
  skills,
  categories,
  installed,
  onInstalled,
}: {
  skills: CatalogSkill[]
  categories: CategoryDef[]
  installed: Record<string, InstalledRecord>
  onInstalled: (rec: InstalledRecord) => void
}) {
  if (skills.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No skills in the registry yet"
        body="The Discover registry is empty right now. New vetted skills will appear here as they are published."
      />
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {skills.map((skill, i) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          categories={categories}
          installedRecord={installed[skill.id]}
          variant="discover"
          onInstalled={onInstalled}
          delay={`${0.06 * (i + 1)}s`}
        />
      ))}
    </div>
  )
}

// ── Installed tab ─────────────────────────────────────────────────────────────

function InstalledTab({
  installedList,
  installed,
  categories,
}: {
  installedList: CatalogSkill[]
  installed: Record<string, InstalledRecord>
  categories: CategoryDef[]
}) {
  if (installedList.length === 0) {
    return (
      <EmptyState
        icon={Blocks}
        title="No skills installed yet"
        body="Your installed skills appear here. Head to Discover, run a skill's security scan, and install the ones you want — then you can assign them to an agent."
      />
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {installedList.map((skill, i) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          categories={categories}
          installedRecord={installed[skill.id]}
          variant="installed"
          delay={`${0.06 * (i + 1)}s`}
        />
      ))}
    </div>
  )
}

// ── Skill card (a glass feature card) ─────────────────────────────────────────

type InstallState = 'idle' | 'installing' | 'failed' | 'error'

function SkillCard({
  skill,
  categories,
  installedRecord,
  variant,
  onInstalled,
  delay,
}: {
  skill: CatalogSkill
  categories: CategoryDef[]
  installedRecord?: InstalledRecord
  variant: 'discover' | 'installed'
  onInstalled?: (rec: InstalledRecord) => void
  delay: string
}) {
  const spotlight = useSpotlight<HTMLElement>()
  const [installState, setInstallState] = useState<InstallState>('idle')
  // Scan-failure reasons surfaced inline when an install is blocked by the scan.
  const [scanReasons, setScanReasons] = useState<string[]>(installedRecord?.scanReasons ?? [])
  const [actionError, setActionError] = useState('')

  const Icon = iconFor(skill.icon)
  const categoryLabel =
    categories.find((c) => c.id === skill.category)?.label ?? skill.category
  const isInstalled = Boolean(installedRecord)

  // The badge reflects: the installed record's scanStatus when installed; a fresh
  // 'failed' after a blocked install; otherwise the catalog's curated baseline.
  const badgeStatus: ScanStatus = isInstalled
    ? installedRecord!.scanStatus
    : installState === 'failed'
      ? 'failed'
      : skill.scanned.status
  const badge = scanBadge(badgeStatus)

  async function install() {
    if (installState === 'installing' || isInstalled) return
    setInstallState('installing')
    setActionError('')
    setScanReasons([])
    try {
      const res = await fetch(INSTALL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillId: skill.id }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        reasons?: string[]
        scanReasons?: string[]
        installed?: Partial<InstalledRecord>
        skill?: Partial<InstalledRecord>
        installedSkill?: Partial<InstalledRecord>
      }

      // A blocked scan returns the specific reasons (from `scanSkill`); surface
      // them inline rather than a generic failure (Req 9.3, 9.4).
      const reasons = body.reasons ?? body.scanReasons
      if (!res.ok) {
        if (Array.isArray(reasons) && reasons.length > 0) {
          setScanReasons(reasons)
          setInstallState('failed')
        } else {
          setActionError(body?.error || 'This skill could not be installed.')
          setInstallState('error')
        }
        return
      }

      // Success → reflect it as installed. Accept whatever shape 6.4 returns,
      // falling back to a record derived from the skill def (scan passed).
      const raw = body.installed ?? body.installedSkill ?? body.skill ?? {}
      const rec: InstalledRecord = {
        skillId: skill.id,
        installedVersion: raw.installedVersion ?? skill.version,
        enabled: raw.enabled ?? true,
        scanStatus: (raw.scanStatus as ScanStatus) ?? 'passed',
        scanReasons: Array.isArray(raw.scanReasons) ? raw.scanReasons : [],
        lastScannedAt: raw.lastScannedAt ?? null,
        autoDisabledByScan: raw.autoDisabledByScan ?? false,
      }
      onInstalled?.(rec)
      setInstallState('idle')
    } catch {
      setActionError('Network error during install. Please try again.')
      setInstallState('error')
    }
  }

  const disabled = isInstalled && installedRecord!.enabled === false

  return (
    <article
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      className="dash-panel dash-grain dash-spotlight dash-interactive dash-rise group flex flex-col gap-3.5 p-5"
      style={{ animationDelay: delay }}
      data-skill-id={skill.id}
    >
      <span className="dash-spotlight-glow" aria-hidden />

      {/* Header: icon (accent) + name + scanned-status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border"
            style={{
              color: skill.accent,
              borderColor: 'var(--dash-border-glow)',
              background: `color-mix(in srgb, ${skill.accent} 12%, transparent)`,
            }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="dash-metallic-text truncate text-[15px] font-semibold leading-tight">
              {skill.name}
            </h3>
            {/* capability category (Req 9.2) */}
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-[var(--dash-subtle)]">
              {categoryLabel}
            </p>
          </div>
        </div>

        {/* scanned-status badge (Req 9.2) */}
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
          style={{ color: badge.color, borderColor: badge.border, background: badge.bg }}
          title={badge.label}
        >
          <badge.Icon className="h-3 w-3" />
          {badge.label}
        </span>
      </div>

      {/* what the Skill does (Req 9.2) */}
      <p className="line-clamp-3 text-[12.5px] leading-relaxed text-[var(--dash-muted)]">
        {skill.description || skill.tagline}
      </p>

      {/* `touches:` blast-radius line (Req 9.2) */}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-xl px-3 py-2"
        style={{ background: 'var(--dash-card-solid)', border: '1px solid var(--dash-border)' }}
      >
        <span className="mono text-[10px] font-semibold tracking-wider text-[var(--dash-subtle)]">
          touches:
        </span>
        {skill.touches.length === 0 ? (
          <TouchChip touch="nothing" />
        ) : (
          skill.touches.map((t) => <TouchChip key={t} touch={t} />)
        )}
      </div>

      {/* Inline scan-failure reasons (honest, specific — Req 9.3, 9.4) */}
      {installState === 'failed' && scanReasons.length > 0 && (
        <div
          className="rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.30)' }}
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: '#fb7185' }}>
            <ShieldAlert className="h-3.5 w-3.5" />
            Security scan blocked this install
          </p>
          <ul className="mt-1.5 space-y-1">
            {scanReasons.map((r) => (
              <li key={r} className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--dash-muted)]">
                <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ background: '#fb7185' }} />
                {reasonText(r)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Auto-disabled-by-rescan notice on the Installed tab (Req 9.11) */}
      {variant === 'installed' && installedRecord?.autoDisabledByScan && (
        <p className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: '#fb7185' }}>
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          Auto-disabled by a re-scan. Review it in the Aegis Queue.
        </p>
      )}

      {/* Generic action error (network / unexpected) */}
      {actionError && (
        <p className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--dash-accent)' }}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {actionError}
        </p>
      )}

      {/* Footer: version + action */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="mono text-[10px] text-[var(--dash-subtle)]">v{installedRecord?.installedVersion ?? skill.version}</span>

        {variant === 'discover' ? (
          isInstalled ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold"
              style={{ color: '#34d399', borderColor: 'rgba(52,211,153,0.32)', background: 'rgba(52,211,153,0.10)' }}
            >
              <Check className="h-3.5 w-3.5" />
              Installed
            </span>
          ) : (
            <button
              type="button"
              onClick={install}
              disabled={installState === 'installing'}
              className={cn(
                'dash-accent-grad inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white transition',
                installState === 'installing' ? 'opacity-60' : 'hover:-translate-y-0.5',
              )}
            >
              {installState === 'installing' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : installState === 'failed' ? (
                <ShieldAlert className="h-3.5 w-3.5" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {installState === 'installing'
                ? 'Scanning…'
                : installState === 'failed'
                  ? 'Try again'
                  : 'Install'}
            </button>
          )
        ) : (
          // Installed tab: show enable state + a clean (disabled) Authority_Grant
          // call site. Assigning a skill to an agent is wired in 6.5/6.8.
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
              style={
                disabled
                  ? { color: 'var(--dash-subtle)', borderColor: 'var(--dash-border)', background: 'var(--dash-soft)' }
                  : { color: '#34d399', borderColor: 'rgba(52,211,153,0.32)', background: 'rgba(52,211,153,0.10)' }
              }
            >
              {disabled ? <CircleSlash className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              {disabled ? 'Disabled' : 'Enabled'}
            </span>
            <button
              type="button"
              disabled
              title="Assigning a skill to an agent is coming soon"
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium opacity-60"
              style={{ background: 'var(--dash-card-solid)', borderColor: 'var(--dash-border)', color: 'var(--dash-muted)' }}
            >
              <Lock className="h-3.5 w-3.5" />
              Assign to agent
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

function TouchChip({ touch }: { touch: SkillTouches }) {
  const tone = touchTone(touch)
  return (
    <span
      className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color: tone.color, borderColor: tone.border, background: tone.bg }}
    >
      {TOUCH_LABEL[touch]}
    </span>
  )
}

// ── Shared empty / loading / error views (match the dashboard energy) ──────────

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Search
  title: string
  body: string
}) {
  const spotlight = useSpotlight<HTMLElement>()
  return (
    <section
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      className="dash-panel dash-grain dash-spotlight dash-interactive dash-rise relative overflow-hidden p-8 text-center"
    >
      <span className="dash-spotlight-glow" aria-hidden />
      <span
        className="mx-auto inline-grid h-12 w-12 place-items-center rounded-2xl border bg-[var(--dash-soft)]"
        style={{ color: 'var(--dash-accent)', borderColor: 'var(--dash-border-glow)' }}
      >
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">
        <span className="dash-metallic-text">{title}</span>
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--dash-muted)]">{body}</p>
    </section>
  )
}

function LoadingView() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="dash-panel dash-grain h-[260px] animate-pulse rounded-2xl p-5"
          style={{ animationDelay: `${i * 0.05}s` }}
        >
          <div className="h-10 w-10 rounded-xl" style={{ background: 'var(--dash-soft)' }} />
          <div className="mt-4 h-3 w-2/3 rounded" style={{ background: 'var(--dash-soft)' }} />
          <div className="mt-3 h-3 w-full rounded" style={{ background: 'var(--dash-soft)' }} />
          <div className="mt-2 h-3 w-5/6 rounded" style={{ background: 'var(--dash-soft)' }} />
        </div>
      ))}
    </div>
  )
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="dash-panel dash-grain dash-interactive mt-8 rounded-2xl p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--dash-accent)' }} />
        <div className="min-w-0">
          <p className="mono text-[10px] tracking-widest" style={{ color: 'var(--dash-accent)' }}>
            COULD NOT LOAD SKILLS
          </p>
          <p className="mt-1 text-sm text-[var(--dash-text)]">{message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="dash-accent-grad mt-4 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:-translate-y-0.5"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
