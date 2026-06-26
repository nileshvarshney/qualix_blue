import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const r = await serverFetch(req, `${B}/privacy/pii-exposure-report`, { headers: { Authorization: req.headers.get('Authorization') ?? '' }, cache: 'no-store' })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch { return NextResponse.json({ unprotected_pii_tables: 0, assets: [] }) }
}
