import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const params = new URLSearchParams(req.nextUrl.searchParams)
    const auth = req.headers.get('Authorization')
    const res = await serverFetch(req, `${BACKEND}/lineage?${params.toString()}`, {
      cache: 'no-store',
      headers: { ...(auth ? { Authorization: auth } : {}) },
    })
    if (!res.ok) return NextResponse.json({ nodes: [], edges: [], error: 'Lineage data unavailable' }, { status: 200 })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ nodes: [], edges: [], error: 'Lineage service unavailable' }, { status: 200 })
  }
}
