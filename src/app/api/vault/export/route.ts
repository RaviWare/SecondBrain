import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault, Page, Source, Log } from '@/lib/models'

/**
 * Full vault export — a single portable JSON of everything the user owns
 * (vault metadata, all pages, sources, and logs). Streams as a download.
 * Data ownership / portability: the user can take their brain with them.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const vault = await Vault.findOne({ userId }).lean()
  if (!vault) return NextResponse.json({ error: 'No vault' }, { status: 404 })

  const [pages, sources, logs] = await Promise.all([
    Page.find({ userId, vaultId: vault._id }).lean(),
    Source.find({ userId, vaultId: vault._id }, 'type title url wordCount createdAt').lean(),
    Log.find({ userId, vaultId: vault._id }).sort({ createdAt: -1 }).lean(),
  ])

  const payload = {
    exportedAt: new Date().toISOString(),
    vault: { name: vault.name, description: vault.description, createdAt: vault.createdAt },
    counts: { pages: pages.length, sources: sources.length, logs: logs.length },
    pages,
    sources,
    logs,
  }

  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="secondbrain-export-${stamp}.json"`,
    },
  })
}
