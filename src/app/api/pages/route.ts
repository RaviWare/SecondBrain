import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import { Vault, Page } from '@/lib/models'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await connectDB()
  const vault = await Vault.findOne({ userId })
  if (!vault) return NextResponse.json({ pages: [] })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const search = searchParams.get('search')

  const query: any = { userId, vaultId: vault._id }
  if (type) query.type = type
  if (search) query.$text = { $search: search }

  const pages = await Page.find(query, 'slug title type summary tags confidence createdAt updatedAt')
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean()

  return NextResponse.json({ pages })
}
