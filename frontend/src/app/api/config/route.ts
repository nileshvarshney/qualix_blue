import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const url = category
    ? `${BACKEND}/config?category=${encodeURIComponent(category)}`
    : `${BACKEND}/config`
  try {
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ config: {}, categories: [] }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ config: {}, categories: [] }, { status: 502 })
  }
}
