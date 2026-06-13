import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res = await fetch(`${BACKEND}/issues/${id}/audit`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({ items: [] }))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ items: [], error: String(e) }, { status: 500 })
  }
}
