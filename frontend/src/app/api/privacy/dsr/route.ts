import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_PRIVACY_DSR } from '@/lib/demoData'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get('status')
  const url = s ? `${B}/privacy/dsr?status=${s}` : `${B}/privacy/dsr`
  try {
    const r = await serverFetch(req, url, { headers: { Authorization: req.headers.get('Authorization') ?? '' }, cache: 'no-store' })
    if (!r.ok) {
      const filtered = s ? DEMO_PRIVACY_DSR.filter(d => d.status === s) : DEMO_PRIVACY_DSR
      return NextResponse.json(filtered)
    }
    return NextResponse.json(await r.json(), { status: r.status })
  } catch { return NextResponse.json(DEMO_PRIVACY_DSR) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const r = await serverFetch(req, `${B}/privacy/dsr`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}
