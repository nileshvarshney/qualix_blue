import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_CORRELATED_INCIDENTS } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') ?? 'open'
  try {
    const auth = req.headers.get('Authorization')
    const res = await serverFetch(req,
      `${BACKEND}/monitoring/correlated-incidents?status=${encodeURIComponent(status)}`,
      {
        cache: 'no-store',
        headers: { ...(auth ? { Authorization: auth } : {}) },
      }
    )
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    return NextResponse.json(DEMO_CORRELATED_INCIDENTS.filter(c => c.status === status))
  }
}
