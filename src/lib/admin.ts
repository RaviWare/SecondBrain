// ── Admin allow-list ──────────────────────────────────────────────────────────
// There is no role system yet, so "admin" is an explicit allow-list of Clerk user
// ids in the `ADMIN_USER_IDS` env var (comma/space separated). This gates the
// admin-only surfaces (the Updates/notifications page + its API). Keeping it in
// env means no schema change and no way for a normal user to self-promote.
//
// Example: ADMIN_USER_IDS="user_2abc...,user_2def..."

/** Parsed set of admin Clerk user ids (empty when unset ⇒ nobody is admin). */
export function adminUserIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS ?? ''
  const ids = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return new Set(ids)
}

/** True when `userId` is a configured admin. Null/empty userId is never admin. */
export function isAdminUser(userId: string | null | undefined): boolean {
  if (!userId) return false
  return adminUserIds().has(userId)
}
