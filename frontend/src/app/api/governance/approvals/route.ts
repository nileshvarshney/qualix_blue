import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_GOVERNANCE_APPROVALS } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entity_type')
  const status = searchParams.get('status')
  try {
    const params = new URLSearchParams()
    if (entityType) params.set('entity_type', entityType)
    if (status) params.set('status', status)
    const auth = req.headers.get('authorization') || ''
    const res = await serverFetch(req, `${BACKEND}/governance/approvals?${params}`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    let items = DEMO_GOVERNANCE_APPROVALS
    if (entityType) items = items.filter(a => a.entity_type === entityType)
    if (status) items = items.filter(a => a.status === status)
    return NextResponse.json(items)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = req.headers.get('authorization') || ''
    const res = await serverFetch(req, `${BACKEND}/governance/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
