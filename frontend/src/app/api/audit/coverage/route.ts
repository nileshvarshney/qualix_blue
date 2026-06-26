import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const res = await serverFetch(req, `${BACKEND}/audit/coverage`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ coverage_pct: 0, covered_types: 0, total_governed_types: 0, uncovered_types: [], by_type: [] })
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json({ coverage_pct: 0, covered_types: 0, total_governed_types: 0, uncovered_types: [], by_type: [] }) }
}
