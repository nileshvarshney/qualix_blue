import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_PII_EXPOSURE } from '@/lib/demoData'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const r = await serverFetch(req, `${B}/privacy/pii-exposure-report`, { headers: { Authorization: req.headers.get('Authorization') ?? '' }, cache: 'no-store' })
    if (!r.ok) throw new Error(`Backend ${r.status}`)
    return NextResponse.json(await r.json())
  } catch { return NextResponse.json(DEMO_PII_EXPOSURE) }
}
