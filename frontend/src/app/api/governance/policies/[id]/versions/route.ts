import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = req.headers.get('authorization') || ''
    const res = await serverFetch(req, `${BACKEND}/governance/policies/${id}/versions`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) return NextResponse.json([], { status: res.status })
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [], { status: res.status })
  } catch { return NextResponse.json([]) }
}
