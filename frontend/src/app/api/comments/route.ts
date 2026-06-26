import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const params = new URLSearchParams()
    if (searchParams.get('entity_type')) params.set('entity_type', searchParams.get('entity_type')!)
    if (searchParams.get('entity_id')) params.set('entity_id', searchParams.get('entity_id')!)
    if (searchParams.get('limit')) params.set('limit', searchParams.get('limit')!)
    const auth = req.headers.get('authorization') || ''
    const res = await serverFetch(req, `${BACKEND}/comments?${params}`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) return NextResponse.json({ error: 'Backend error' }, { status: res.status })
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch { return NextResponse.json([]) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = req.headers.get('authorization') || ''
    const res = await serverFetch(req, `${BACKEND}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
