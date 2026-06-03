// ── Upstream check orchestration ──────────────────────────────────────────────
// The async glue the cron route calls: fetch the upstream snapshot, run the PURE
// `diffUpstream` core against the persisted marker, and — only on a genuine
// advance — record a deduped AdminNotification, advance the marker, and fire an
// optional admin webhook. Never pulls or applies upstream code (detection only).
//
// Total/never-throws: any failure is captured onto the watch row's `lastError`
// (secret-safe) and returned as a summary; the cron route stays a clean 200.

import { connectDB } from '@/lib/mongodb'
import { UpstreamWatch, AdminNotification } from '@/lib/models'
import { agentLog } from '@/lib/agents/redact'
import { diffUpstream, EMPTY_MARKER, type SeenMarker, type UpstreamState } from './monitor'
import { fetchUpstreamState, upstreamRepo, type FetchResult } from './github'
import { notifyAdminWebhook } from './webhook'

export type UpstreamCheckResult = {
  ok: boolean
  repo: string
  changed: boolean
  kinds: string[]
  title: string
  /** true when this was the first-ever baseline adoption (no alert) */
  baseline: boolean
  error?: string
}

/**
 * Run one upstream check for `repo`. Injectable `fetcher` keeps this unit-testable
 * without real network.
 */
export async function runUpstreamCheck(
  repo: string = upstreamRepo(),
  fetcher: (r: string) => Promise<FetchResult> = (r) => fetchUpstreamState(r),
): Promise<UpstreamCheckResult> {
  await connectDB()

  const fetched = await fetcher(repo)
  if (!fetched.ok) {
    // Record the error on the watch row (create it if missing) and bail cleanly.
    await UpstreamWatch.updateOne(
      { repo },
      { $set: { lastCheckedAt: new Date(), lastError: fetched.error }, $setOnInsert: { repo } },
      { upsert: true },
    ).catch((e) => agentLog.error('[upstream] watch error-write failed', e))
    return { ok: false, repo, changed: false, kinds: [], title: '', baseline: false, error: fetched.error }
  }

  const state: UpstreamState = fetched.state

  // Load the persisted marker (first run ⇒ none).
  const existing = await UpstreamWatch.findOne({ repo }).lean()
  const isFirstRun = !existing
  const seen: SeenMarker = existing
    ? { releaseTag: existing.releaseTag ?? null, commitSha: existing.commitSha ?? null }
    : EMPTY_MARKER

  const diff = diffUpstream(seen, state, { isFirstRun })
  const now = new Date()

  // Persist the advanced marker + check time regardless of alerting.
  await UpstreamWatch.updateOne(
    { repo },
    {
      $set: {
        releaseTag: diff.nextMarker.releaseTag,
        commitSha: diff.nextMarker.commitSha,
        lastCheckedAt: now,
        lastError: null,
        ...(diff.changed ? { lastChangedAt: now } : {}),
      },
      $setOnInsert: { repo },
    },
    { upsert: true },
  )

  if (!diff.changed) {
    return { ok: true, repo, changed: false, kinds: [], title: '', baseline: isFirstRun }
  }

  // ── Record a deduped admin notification ─────────────────────────────────────
  // dedupeKey ties the alert to the specific new tag+sha so re-running the cron
  // before the admin acts never creates duplicates (unique index enforces it).
  const url = state.releaseUrl ?? (state.commitSha ? `https://github.com/${repo}/commit/${state.commitSha}` : null)
  const dedupeKey = `upstream:${repo}:${diff.nextMarker.releaseTag ?? '-'}:${diff.nextMarker.commitSha ?? '-'}`
  const body = buildBody(repo, state, diff.kinds)

  try {
    await AdminNotification.updateOne(
      { dedupeKey },
      {
        $setOnInsert: {
          kind: 'upstream-update',
          source: repo,
          title: diff.title,
          body,
          url,
          severity: 'info',
          acknowledged: false,
          acknowledgedAt: null,
          dedupeKey,
        },
      },
      { upsert: true },
    )
  } catch (e) {
    // A duplicate-key race just means the alert already exists — fine.
    agentLog.error('[upstream] notification upsert noted', e)
  }

  // ── Optional admin webhook (Slack/Discord/etc.) ─────────────────────────────
  await notifyAdminWebhook({ title: diff.title, body, url }).catch((e) =>
    agentLog.error('[upstream] webhook notify failed', e),
  )

  return { ok: true, repo, changed: true, kinds: diff.kinds, title: diff.title, baseline: false }
}

function buildBody(repo: string, state: UpstreamState, kinds: string[]): string {
  const lines: string[] = [`Upstream ${repo} has a new update.`]
  if (kinds.includes('release')) {
    lines.push(
      `• Release: ${state.releaseName || state.releaseTag || 'new release'}` +
        (state.releasePublishedAt ? ` (published ${state.releasePublishedAt})` : ''),
    )
  }
  if (kinds.includes('commit')) {
    const sha = (state.commitSha ?? '').slice(0, 7)
    lines.push(`• Commit: ${sha}${state.commitSummary ? ` — ${state.commitSummary}` : ''}`)
  }
  lines.push('', 'This is a notification only. No upstream code has been pulled or applied.')
  return lines.join('\n')
}
