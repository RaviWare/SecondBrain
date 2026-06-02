import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault, Page, Source, Log } from '@/lib/models'

/**
 * Danger zone — erase all knowledge in the user's vault (pages, sources, logs).
 * Requires an explicit `confirm: "DELETE"` in the body so it can't fire by
 * accident. The vault record itself is kept (reset to empty counts) so the
 * account stays usable. Irreversible.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (body.confirm !== 'DELETE') {
    return NextResponse.json({ error: 'Confirmation phrase required' }, { status: 400 })
  }

  await connectDB()
  const vault = await Vault.findOne({ userId })
  if (!vault) return NextResponse.json({ error: 'No vault' }, { status: 404 })

  const [pages, sources, logs] = await Promise.all([
    Page.deleteMany({ userId, vaultId: vault._id }),
    Source.deleteMany({ userId, vaultId: vault._id }),
    Log.deleteMany({ userId, vaultId: vault._id }),
  ])

  vault.pageCount = 0
  vault.sourceCount = 0
  await vault.save()

  return NextResponse.json({
    ok: true,
    deleted: {
      pages: pages.deletedCount ?? 0,
      sources: sources.deletedCount ?? 0,
      logs: logs.deletedCount ?? 0,
    },
  })
}
