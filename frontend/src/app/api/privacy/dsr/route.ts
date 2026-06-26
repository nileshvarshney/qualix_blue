import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get('status')
  const url = s ? `${B}/privacy/dsr?status=${s}` : `${B}/privacy/dsr`
  try {
    const r = await serverFetch(req, url, { headers: { Authorization: req.headers.get('Authorization') ?? '' }, cache: 'no-store' })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch { return NextResponse.json([]) }
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
