import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get('asset_id')
  const url = s ? `${B}/privacy/masking-policies?asset_id=${s}` : `${B}/privacy/masking-policies`
  try {
    const r = await fetch(url, { headers: { Authorization: req.headers.get('Authorization') ?? '' }, cache: 'no-store' })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch { return NextResponse.json([], { status: 200 }) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const r = await fetch(`${B}/privacy/masking-policies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}
