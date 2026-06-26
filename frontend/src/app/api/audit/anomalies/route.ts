import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const hours = req.nextUrl.searchParams.get('hours') ?? '24'
    const res = await serverFetch(req, `${BACKEND}/audit/anomalies?hours=${hours}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json([]) }
}
