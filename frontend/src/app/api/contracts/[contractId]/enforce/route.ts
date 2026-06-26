import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ contractId: string }> }
) {
  const { contractId } = await params
  try {
    const body = await req.text()
    const r = await serverFetch(req, `${B}/contracts/${contractId}/enforce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body,
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status })
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 })
  }
}
