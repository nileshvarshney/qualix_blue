import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { detectSuspiciousActivity } from '@/lib/auditPatterns'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const res = await serverFetch(req, `${BACKEND}/audit?limit=100`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const raw = await res.json()
    const entries = Array.isArray(raw) ? raw : (raw.logs ?? [])
    return NextResponse.json(detectSuspiciousActivity(entries))
  } catch { return NextResponse.json([]) }
}
