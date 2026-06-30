import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { detectSuspiciousActivity } from '@/lib/auditPatterns'
import { DEMO_AUDIT_LOGS } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const res = await serverFetch(req, `${BACKEND}/audit?limit=100`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const raw = await res.json()
    const entries = Array.isArray(raw) ? raw : (raw.logs ?? [])
    return NextResponse.json(detectSuspiciousActivity(entries))
  } catch { return NextResponse.json(detectSuspiciousActivity(DEMO_AUDIT_LOGS)) }
}
