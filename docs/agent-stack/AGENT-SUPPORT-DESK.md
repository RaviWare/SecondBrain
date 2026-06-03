# Agent Support Desk (auto support workforce)

When an agent run fails in the dashboard, the app **automatically opens a support
ticket**, a worker **diagnoses it and retries recoverable failures**, and **every
step is documented** on the ticket timeline — like a support workforce. Issues
that need a human are **escalated to the admin**.

## What happens, end to end

```
Agent run finishes (in runAgentOnce — the one audited run path)
        │
   non-clean? (failed / timeout / budget-stopped / exception)
        │ yes
        ▼
open or append a SupportTicket  (deduped per agent + failure category)
   • diagnose the failure → category + severity + plan
   • timeline: opened → diagnosed → plan
        │
        ▼
Support worker (cron: /api/admin/support/worker, every few minutes)
   • transient / timeout  → RETRY the agent (bounded, e.g. 2 attempts)
   • budget / scope / injection / unknown → ESCALATE to admin
   • each attempt + outcome appended to the timeline
        │
   a later clean run for that agent
        ▼
ticket auto-resolves, recovery documented
```

A clean run also resolves any open tickets for that agent directly (the run spine
calls `resolveTicketsOnSuccess`).

## Honest scope (important)

The **only** automated remedy is **re-running the agent** (bounded retries) for
failure classes a retry can plausibly clear (transient errors, timeouts). The
system does **not** edit code or change agent configuration on its own. Anything
that needs a real change — budget caps, scope violations, possible prompt
injection, or unclassifiable failures — is **escalated to you** with a documented
diagnosis and recommended action. This is deliberate: auto-applying fixes to
arbitrary failures would be unsafe.

## Where you see it

**Admin → Support** (sidebar, admins only). Each ticket shows:
- status (Open / Investigating / Retrying / Needs you / Resolved / Won't fix),
  category, severity, and how many retries were attempted;
- the diagnosis + recommended action;
- the **full documented timeline** (every open, diagnosis, retry attempt + result,
  escalation, resolution);
- admin actions: **Resolve**, **Won't fix**, **Reopen** (and recovery notes).

Escalations also raise an alert in **Admin → Updates**.

## Coolify setup

The support worker reuses `SCHEDULER_CRON_SECRET` (no new secret). Add a second
**Scheduled Task** (Coolify → your app → Scheduled Tasks):

- **Name:** `support-worker`
- **Command:** `node scripts/run-support-worker.mjs`
- **Frequency:** `*/5 * * * *`  (every 5 minutes — tune to taste)

That's the whole setup. Tickets open automatically on failures; the worker
processes them on this cadence. `ADMIN_USER_IDS` (already needed for Admin →
Updates) also gates the Support Desk.

## Verifying

Run the worker once locally against prod (safe — it only processes existing
tickets):
```
node scripts/run-support-worker.mjs https://secondbraincloud.com "<SCHEDULER_CRON_SECRET>"
```
Expected on an empty queue: `200 {"ok":true,"processed":0,...}`.

## Security

- Worker endpoint is a system cron: gated by `SCHEDULER_CRON_SECRET` (Bearer),
  per-IP rate limit, 503 when unset — identical posture to the scheduler tick.
- Admin pages/APIs are Clerk-authed **and** `ADMIN_USER_IDS` allow-list gated.
- Retries run through the same propose-never-write spine as every other run —
  no new write path, no elevated privileges.
```
