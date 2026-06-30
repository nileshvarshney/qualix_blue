import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_COMMENTS } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entity_type')
  const entityId = searchParams.get('entity_id')
  try {
    const params = new URLSearchParams()
    if (entityType) params.set('entity_type', entityType)
    if (entityId) params.set('entity_id', entityId)
    if (searchParams.get('limit')) params.set('limit', searchParams.get('limit')!)
    const auth = req.headers.get('authorization') || ''
    const res = await serverFetch(req, `${BACKEND}/comments?${params}`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    let items = DEMO_COMMENTS
    if (entityType) items = items.filter(c => c.entity_type === entityType)
    if (entityId) items = items.filter(c => c.entity_id === entityId)
    return NextResponse.json(items)
  }
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
