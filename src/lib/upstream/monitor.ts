// ── Upstream release monitor (pure core) ──────────────────────────────────────
// Watches an upstream GitHub repository (default: NousResearch/hermes-agent) for
// new releases and new commits on its default branch, so an admin is alerted when
// the upstream project ships an update we may want to track.
//
// IMPORTANT (scope + safety): this module NEVER pulls or applies upstream code. It
// only DETECTS that upstream changed and produces an admin-facing alert. Applying
// any upstream change is a deliberate human action — upstream is a separate
// (Python) project and auto-merging third-party code into production is unsafe.
//
// This file is split into a PURE core (`diffUpstream`, types) and a thin async
// fetcher (`fetchUpstreamState`). The pure core is the property/unit-test target:
// given a previously-seen state and a freshly-fetched state, it decides whether
// there is something new and what the alert should say. No I/O, no clock, no
// randomness — same input ⇒ same output.

/** The repo being watched. Overridable via env for forks/mirrors. */
export const DEFAULT_UPSTREAM_REPO = 'NousResearch/hermes-agent'

/** A snapshot of the upstream repo's latest release + latest default-branch commit. */
export type UpstreamState = {
  /** latest release tag (e.g. "v2026.5.29.2"), or null if the repo has no releases */
  releaseTag: string | null
  /** human release name, if any */
  releaseName: string | null
  /** ISO timestamp the release was published, if any */
  releasePublishedAt: string | null
  /** URL to the release page, if any */
  releaseUrl: string | null
  /** latest commit sha on the default branch, or null if unknown */
  commitSha: string | null
  /** ISO timestamp of that commit, if any */
  commitDate: string | null
  /** first line of the latest commit message, if any */
  commitSummary: string | null
}

/** The persisted "last seen" marker we compare a fresh fetch against. */
export type SeenMarker = {
  releaseTag: string | null
  commitSha: string | null
}

/** What changed between the seen marker and a fresh upstream state. */
export type UpstreamChangeKind = 'release' | 'commit'

export type UpstreamDiff = {
  /** true when ANY tracked field advanced (new release OR new commit) */
  changed: boolean
  /** which kinds advanced (may contain both 'release' and 'commit') */
  kinds: UpstreamChangeKind[]
  /** a short, admin-facing one-line title for the alert (empty when unchanged) */
  title: string
  /** the new marker to persist once the alert is recorded */
  nextMarker: SeenMarker
}

/** An empty marker — nothing seen yet (first ever run). */
export const EMPTY_MARKER: SeenMarker = { releaseTag: null, commitSha: null }

function nonEmpty(v: string | null | undefined): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/**
 * PURE decision: compare what we last saw against a freshly-fetched upstream
 * state and decide whether there is something new to alert on.
 *
 * Rules:
 *   • A new release is signalled when `state.releaseTag` is non-null and differs
 *     from `seen.releaseTag`.
 *   • A new commit is signalled when `state.commitSha` is non-null and differs
 *     from `seen.commitSha`.
 *   • On the VERY FIRST run (seen marker empty), we treat a present release/commit
 *     as the initial baseline WITHOUT alerting — we only alert on genuine
 *     ADVANCES after a baseline exists. This avoids a noisy "update!" the first
 *     time the watcher is enabled.
 *   • `nextMarker` always reflects the freshest known values so the baseline moves
 *     forward even on the first (non-alerting) run.
 *
 * @param seen   the persisted last-seen marker (use EMPTY_MARKER for first run)
 * @param state  the freshly fetched upstream snapshot
 * @param opts   `isFirstRun` — when true, advances the baseline but never reports
 *               `changed: true` (no alert on initial adoption).
 */
export function diffUpstream(
  seen: SeenMarker,
  state: UpstreamState,
  opts: { isFirstRun?: boolean } = {},
): UpstreamDiff {
  const seenTag = nonEmpty(seen?.releaseTag)
  const seenSha = nonEmpty(seen?.commitSha)
  const newTag = nonEmpty(state?.releaseTag)
  const newSha = nonEmpty(state?.commitSha)

  // The baseline we will persist regardless of whether we alert.
  const nextMarker: SeenMarker = {
    releaseTag: newTag ?? seenTag,
    commitSha: newSha ?? seenSha,
  }

  // First run: adopt the baseline silently, never alert.
  if (opts.isFirstRun || (seenTag === null && seenSha === null)) {
    return { changed: false, kinds: [], title: '', nextMarker }
  }

  const kinds: UpstreamChangeKind[] = []
  if (newTag !== null && newTag !== seenTag) kinds.push('release')
  if (newSha !== null && newSha !== seenSha) kinds.push('commit')

  if (kinds.length === 0) {
    return { changed: false, kinds: [], title: '', nextMarker }
  }

  const title = buildTitle(kinds, state, seenTag)
  return { changed: true, kinds, title, nextMarker }
}

/** Build a concise, deterministic alert title from the advanced kinds. */
function buildTitle(
  kinds: UpstreamChangeKind[],
  state: UpstreamState,
  prevTag: string | null,
): string {
  const parts: string[] = []
  if (kinds.includes('release')) {
    const tag = nonEmpty(state.releaseTag) ?? 'a new release'
    parts.push(prevTag ? `New release ${tag} (was ${prevTag})` : `New release ${tag}`)
  }
  if (kinds.includes('commit')) {
    const sha = (nonEmpty(state.commitSha) ?? '').slice(0, 7)
    const summary = nonEmpty(state.commitSummary)
    parts.push(summary ? `New commit ${sha}: ${truncate(summary, 80)}` : `New commit ${sha}`)
  }
  return parts.join(' · ')
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}
