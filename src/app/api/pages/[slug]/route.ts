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
  const { content } = await req.json()

  const page = await Page.findOneAndUpdate(
    { userId, vaultId: vault._id, slug },
    { content },
    { new: true }
  )

  return NextResponse.json({ page })
}
