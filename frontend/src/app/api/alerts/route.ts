import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const qs = searchParams.toString()
    const url = qs ? `${BACKEND}/alerts/enriched?${qs}&limit=100` : `${BACKEND}/alerts/enriched?limit=100`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : (data.items ?? []))
  } catch { return NextResponse.json([]) }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, action } = body
    const endpoint = action === 'resolve' ? 'resolve' : action === 'ignore' ? 'ignore' : 'acknowledge'
    const res = await serverFetch(req, `${BACKEND}/alerts/${id}/${endpoint}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
