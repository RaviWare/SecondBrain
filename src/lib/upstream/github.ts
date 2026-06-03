// ── GitHub fetcher for the upstream monitor ───────────────────────────────────
// Thin async adapter that pulls the latest release + latest default-branch commit
// for a repo and maps them into the pure `UpstreamState` the monitor core diffs.
//
// Network discipline:
//   • Read-only, unauthenticated GitHub REST calls (public repo). An optional
//     GITHUB_TOKEN raises the rate limit but is NEVER required and NEVER logged.
//   • Sends NO project code, secrets, or user data upstream — only GETs public
//     metadata. (AGENTS.md: no outbound transmission of project data.)
//   • Total/never-throws at the call site: a network/parse failure returns a
//     `{ ok: false }` result the caller treats as "skip this tick", never a crash.

import { DEFAULT_UPSTREAM_REPO, type UpstreamState } from './monitor'

const GITHUB_API = 'https://api.github.com'

export type FetchResult =
  | { ok: true; state: UpstreamState }
  | { ok: false; error: string; status?: number }

/** The repo to watch, from env or the default. Format: "owner/name". */
export function upstreamRepo(): string {
  const v = process.env.UPSTREAM_REPO
  return v && /^[\w.-]+\/[\w.-]+$/.test(v.trim()) ? v.trim() : DEFAULT_UPSTREAM_REPO
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'secondbrain-upstream-monitor',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  // Optional, never required. Raises rate limit only. Never logged.
  const token = process.env.GITHUB_TOKEN
  if (token && token.trim().length > 0) h.Authorization = `Bearer ${token.trim()}`
  return h
}

type ReleaseJson = {
  tag_name?: string
  name?: string
  published_at?: string
  html_url?: string
}
type CommitJson = {
  sha?: string
  commit?: { message?: string; committer?: { date?: string }; author?: { date?: string } }
}
type RepoJson = { default_branch?: string }

/**
 * Fetch the latest release + latest commit for `repo` and assemble an
 * `UpstreamState`. A repo with no releases still yields a valid state (release
 * fields null, commit fields populated). Returns `{ ok: false }` on any failure
 * so the cron tick can skip cleanly.
 */
export async function fetchUpstreamState(
  repo: string = upstreamRepo(),
  fetchImpl: typeof fetch = fetch,
): Promise<FetchResult> {
  try {
    // 1. latest release (may legitimately 404 when a repo has none)
    let releaseTag: string | null = null
    let releaseName: string | null = null
    let releasePublishedAt: string | null = null
    let releaseUrl: string | null = null
    const relRes = await fetchImpl(`${GITHUB_API}/repos/${repo}/releases/latest`, {
      headers: headers(),
      cache: 'no-store',
    })
    if (relRes.ok) {
      const rel = (await relRes.json()) as ReleaseJson
      releaseTag = rel.tag_name ?? null
      releaseName = rel.name ?? null
      releasePublishedAt = rel.published_at ?? null
      releaseUrl = rel.html_url ?? null
    } else if (relRes.status !== 404) {
      return { ok: false, error: 'release fetch failed', status: relRes.status }
    }

    // 2. default branch (so we read the right HEAD)
    const repoRes = await fetchImpl(`${GITHUB_API}/repos/${repo}`, {
      headers: headers(),
      cache: 'no-store',
    })
    if (!repoRes.ok) return { ok: false, error: 'repo fetch failed', status: repoRes.status }
    const repoJson = (await repoRes.json()) as RepoJson
    const branch = repoJson.default_branch || 'main'

    // 3. latest commit on the default branch
    const commitRes = await fetchImpl(
      `${GITHUB_API}/repos/${repo}/commits/${encodeURIComponent(branch)}`,
      { headers: headers(), cache: 'no-store' },
    )
    if (!commitRes.ok) return { ok: false, error: 'commit fetch failed', status: commitRes.status }
    const commit = (await commitRes.json()) as CommitJson
    const commitSha = commit.sha ?? null
    const rawMsg = commit.commit?.message ?? ''
    const commitSummary = rawMsg.split('\n')[0]?.trim() || null
    const commitDate =
      commit.commit?.committer?.date ?? commit.commit?.author?.date ?? null

    return {
      ok: true,
      state: {
        releaseTag,
        releaseName,
        releasePublishedAt,
        releaseUrl,
        commitSha,
        commitDate,
        commitSummary,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fetch error' }
  }
}
