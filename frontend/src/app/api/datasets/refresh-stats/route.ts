import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const { asset_id } = await req.json()
    if (!asset_id) return NextResponse.json({ error: 'asset_id required' }, { status: 400 })

    const res = await serverFetch(req, `${BACKEND}/asset-registry/${asset_id}/refresh-stats`, {
      method: 'POST',
      cache: 'no-store',
    })
    const body = await res.json()
    if (!res.ok) return NextResponse.json({ error: body.detail ?? 'Failed to refresh' }, { status: res.status })
    return NextResponse.json(body)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
