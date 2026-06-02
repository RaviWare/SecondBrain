import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault, Page } from '@/lib/models'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const vault = await Vault.findOne({ userId })
  if (!vault) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { slug } = await params
  const page = await Page.findOne({ userId, vaultId: vault._id, slug }).lean()
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const backlinks = await Page.find(
    { userId, vaultId: vault._id, relatedSlugs: slug },
    'slug title type'
  ).lean()

  return NextResponse.json({ page, backlinks })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const vault = await Vault.findOne({ userId })
  if (!vault) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { slug } = await params
  const body = await req.json()

  // Only allow a known set of mutable fields. `content` (page editing) and
  // `pinned` (star/pin toggle) are independent — callers send whichever applies.
  const update: Record<string, unknown> = {}
  if (typeof body.content === 'string') update.content = body.content
  if (typeof body.pinned === 'boolean') update.pinned = body.pinned

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No mutable fields provided' }, { status: 400 })
  }

  const page = await Page.findOneAndUpdate(
    { userId, vaultId: vault._id, slug },
    update,
    { new: true }
  )

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  return NextResponse.json({ page })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const vault = await Vault.findOne({ userId })
  if (!vault) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { slug } = await params
  const deleted = await Page.findOneAndDelete({ userId, vaultId: vault._id, slug })
  if (!deleted) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  // Clean up dangling cross-links so the graph stays consistent.
  await Page.updateMany(
    { userId, vaultId: vault._id, relatedSlugs: slug },
    { $pull: { relatedSlugs: slug } }
  )

  return NextResponse.json({ ok: true })
}
