import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const r = await serverFetch(req, `${B}/settings/retention`, { headers: { Authorization: req.headers.get('Authorization') ?? '' } })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.ok ? r.status : 200 })
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const r = await serverFetch(req, `${B}/settings/retention`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body,
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.ok ? r.status : 200 })
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 })
  }
}
