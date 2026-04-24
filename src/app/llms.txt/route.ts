export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const body = `# SecondBrain Cloud

> SecondBrain Cloud is an AI second brain and personal knowledge base that turns sources into maintained memory pages, graph navigation, and cited answers.

SecondBrain Cloud is designed for knowledge workers, founders, researchers, students, and teams who want more than raw retrieval. The product ingests sources such as URLs, notes, PDFs, DOCX files, markdown, and plain text. It preserves those sources, organizes them into summaries, topics, people, decisions, synthesis pages, and patterns, and then answers questions against that structured vault.

The product language and architecture are centered on these ideas:

- A second brain should compound over time instead of resetting every chat session.
- Answers should cite the memory pages they came from.
- The graph, backlinks, and timeline matter as much as the answer box.
- Source preservation and evidence trails are first-class parts of the system.

## Primary Pages

- [Homepage](${siteUrl}/): Product overview, positioning, product loop, pricing, testimonials, and FAQ.
- [Sign up](${siteUrl}/sign-up): Create an account for SecondBrain Cloud.
- [Sign in](${siteUrl}/sign-in): Access an existing account.

## Product Areas

- [Dashboard](${siteUrl}/app/dashboard): Command center for the knowledge graph, quick actions, node inspector, and activity feed.
- [Ingest](${siteUrl}/app/ingest): Add URLs, text, and supported files to the vault.
- [Wiki](${siteUrl}/app/wiki): Browse memory pages generated and maintained by the system.
- [Query](${siteUrl}/app/query): Ask questions and receive cited answers from the private knowledge base.
- [Activity Log](${siteUrl}/app/log): Review ingest, query, and maintenance activity.
- [Settings](${siteUrl}/app/settings): Manage plan, account, and usage settings.

## Optional

- [Design system](${siteUrl}/design-system): Internal visual reference surface for UI components and styling direction.
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
