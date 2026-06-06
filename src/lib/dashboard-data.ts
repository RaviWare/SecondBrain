// ── Dashboard starter prompts ─────────────────────────────────────────────────
// The ONLY thing left here is the generic "Try asking" starter prompts, used by
// AskKnowledgeCard as a FALLBACK for an empty/new vault. Once the vault has real
// topics, the card seeds its chips from those instead (see AskKnowledgeCard).
//
// These are clearly-generic examples (not presented as the user's own data), so they
// are honest placeholders for a cold start — not fabricated vault content. All the
// former mock exports (fake stats/activity/sources/graph) were removed: every dashboard
// surface now renders REAL data from /api/dashboard.

export const suggestedQuestions = [
  'What did we decide about pricing?',
  'Summarize my GTM strategy',
  'What do my customer calls say about onboarding?',
  'Show research on AI note-taking tools',
]
