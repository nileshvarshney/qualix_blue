import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = req.headers.get('authorization') || ''
    const res = await fetch(`${BACKEND}/governance/policies/${params.id}/versions`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) return NextResponse.json([], { status: res.status })
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [], { status: res.status })
  } catch { return NextResponse.json([]) }
}
