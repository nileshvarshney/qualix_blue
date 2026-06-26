import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const assetId = req.nextUrl.searchParams.get('asset_id')
  const connectionId = req.nextUrl.searchParams.get('connection_id')
  const params = new URLSearchParams()
  if (assetId) params.set('asset_id', assetId)
  if (connectionId) params.set('connection_id', connectionId)
  const qs = params.toString()
  const url = qs ? `${B}/privacy/masking-policies?${qs}` : `${B}/privacy/masking-policies`
  try {
    const r = await serverFetch(req, url, { headers: { Authorization: req.headers.get('Authorization') ?? '' }, cache: 'no-store' })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch { return NextResponse.json([], { status: 200 }) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const r = await serverFetch(req, `${B}/privacy/masking-policies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}
