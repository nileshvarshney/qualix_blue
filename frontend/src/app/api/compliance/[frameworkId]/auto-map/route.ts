import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest, { params }: { params: Promise<{ frameworkId: string }> }) {
  const { frameworkId } = await params
  try {
    const r = await serverFetch(req, `${B}/compliance/frameworks/${frameworkId}/auto-map`, {
      method: 'POST', headers: { Authorization: req.headers.get('Authorization') ?? '' },
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}
