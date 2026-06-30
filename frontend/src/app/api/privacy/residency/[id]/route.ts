import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await serverFetch(req, `${B}/privacy/residency/${id}`, { method: 'DELETE', headers: { Authorization: req.headers.get('Authorization') ?? '' } })
    return new NextResponse(null, { status: r.status })
  } catch { return new NextResponse(null, { status: 500 }) }
}
