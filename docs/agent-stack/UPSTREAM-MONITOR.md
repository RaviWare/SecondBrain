# Upstream Update Monitor (admin alerts)

Watches an upstream GitHub repo (default `NousResearch/hermes-agent`) for new
releases / commits and **alerts the admin in-app** so you can decide when to
update. **Detection only** — it never pulls or applies upstream code.

## How it works

```
Coolify Scheduled Task (hourly)
        │  runs:  node scripts/check-upstream.mjs
        ▼
POST /api/admin/upstream/check   (Bearer SCHEDULER_CRON_SECRET)
        │  fetch latest release + default-branch HEAD from GitHub (read-only)
        │  diff against the last-seen marker (UpstreamWatch)
        ▼
new release/commit?  ── no ──▶  update marker, done (silent)
        │ yes
        ▼
record a deduped AdminNotification  (+ optional Slack/Discord webhook)
        ▼
You see it in  Admin → Updates  (sidebar link, admins only)
```

First run sets a **baseline silently** (no false "update!"). You're alerted only
on genuine advances after that. Re-running before you acknowledge never creates
duplicate alerts (deduped by release tag + commit sha).

## One-time setup in Coolify

### 1. Set environment variables
In your app's **Environment Variables** (Coolify → your app → Environment):

| Variable | Value | Notes |
|---|---|---|
| `ADMIN_USER_IDS` | your Clerk user id (`user_...`) | who can see Admin → Updates. Comma-separate for several. |
| `SCHEDULER_CRON_SECRET` | (already set) | reused for auth; no new secret needed. |
| `UPSTREAM_REPO` | `NousResearch/hermes-agent` | optional; this is the default. |
| `GITHUB_TOKEN` | *(optional)* | only raises GitHub's rate limit; never logged. |
| `ADMIN_ALERT_WEBHOOK_URL` | *(optional)* | Slack/Discord incoming webhook to also get pinged. |

Find your Clerk user id: Clerk dashboard → Users → your user → copy the `user_...` id.
Redeploy after adding `ADMIN_USER_IDS` so the Updates page unlocks for you.

### 2. Add the Scheduled Task
Coolify → your app → **Scheduled Tasks** → **+ Add**:

- **Name:** `upstream-monitor`
- **Command:** `node scripts/check-upstream.mjs`
- **Frequency:** `0 * * * *`  (hourly — change to taste, e.g. `0 9 * * *` for 9am daily)
- **Container:** the app container (it has `node` and the env vars).

That's it. The task runs inside the container, hits `localhost:3000`, and the
server does the rest. (The runtime image is `node:20-alpine`, which has `node`
but **not** `curl` — so the task uses the bundled Node script, not a curl call.)

> If your Coolify version runs scheduled tasks in a *fresh* container rather than
> the running app container and `scripts/` isn't present, use the explicit URL
> form instead:
> `node scripts/check-upstream.mjs https://secondbraincloud.com "$SCHEDULER_CRON_SECRET"`

## Verifying it works

- **Manually trigger** the scheduled task once in Coolify, or run locally:
  ```
  node scripts/check-upstream.mjs https://secondbraincloud.com "<your SCHEDULER_CRON_SECRET>"
  ```
  Expected output: `200 {"ok":true,"repo":"NousResearch/hermes-agent","changed":false,...,"baseline":true}`
  on the very first run (baseline adopted), then `changed:false` until upstream advances.
- Open **Admin → Updates** in the app. The baseline run shows no alert; the next
  real upstream release/commit will appear there.

## Security notes

- The endpoint is **not** Clerk-authed (it's a system cron) — it's gated by the
  `SCHEDULER_CRON_SECRET` Bearer token, a per-IP rate limit, and returns 503 if
  the secret is unset (fail-safe).
- The monitor makes **read-only** GitHub GETs and sends **no** project code,
  secrets, or user data anywhere. The optional webhook receives only the
  human-readable alert text.
- Admin pages/APIs are Clerk-authed **and** allow-list gated (`ADMIN_USER_IDS`).
