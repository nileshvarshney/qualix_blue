import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const params = new URLSearchParams()
    if (searchParams.get('status')) params.set('status', searchParams.get('status')!)
    if (searchParams.get('policy_id')) params.set('policy_id', searchParams.get('policy_id')!)
    if (searchParams.get('entity_type')) params.set('entity_type', searchParams.get('entity_type')!)
    const limit = Number(searchParams.get('limit') || '200')
    const res = await serverFetch(req, `${BACKEND}/governance/violations?${params}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    const arr = Array.isArray(data) ? data : []
    return NextResponse.json(arr.slice(0, limit))
  } catch { return NextResponse.json([]) }
}
