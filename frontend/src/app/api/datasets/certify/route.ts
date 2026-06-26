import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const { asset_id, certification_status } = await req.json()
    if (!asset_id) return NextResponse.json({ error: 'asset_id required' }, { status: 400 })

    const res = await serverFetch(req, `${BACKEND}/asset-registry/${asset_id}/certify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certification_status: certification_status ?? 'certified' }),
      cache: 'no-store',
    })
    const body = await res.json()
    if (!res.ok) return NextResponse.json({ error: body.detail ?? 'Certify failed' }, { status: res.status })
    return NextResponse.json(body)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
