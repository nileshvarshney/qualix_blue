import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('Authorization')
    const res = await serverFetch(req, `${BACKEND}/observability/quality-heatmap`, {
      cache: 'no-store',
      headers: {
        ...(auth ? { Authorization: auth } : {}),
      },
    })
    if (!res.ok) return NextResponse.json({ domains: [], dates: [], matrix: [] })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ domains: [], dates: [], matrix: [] })
  }
}
