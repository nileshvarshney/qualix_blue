import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_PRIVACY_CONSENT } from '@/lib/demoData'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const a = req.nextUrl.searchParams.get('asset_id')
  const url = a ? `${B}/privacy/consent?asset_id=${a}` : `${B}/privacy/consent`
  try {
    const r = await serverFetch(req, url, { headers: { Authorization: req.headers.get('Authorization') ?? '' }, cache: 'no-store' })
    if (!r.ok) {
      const filtered = a ? DEMO_PRIVACY_CONSENT.filter(c => c.asset_id === a) : DEMO_PRIVACY_CONSENT
      return NextResponse.json(filtered)
    }
    return NextResponse.json(await r.json(), { status: r.status })
  } catch { return NextResponse.json(DEMO_PRIVACY_CONSENT) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const r = await serverFetch(req, `${B}/privacy/consent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}
