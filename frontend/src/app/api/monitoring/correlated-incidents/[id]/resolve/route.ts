import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = req.headers.get('Authorization')
    const res = await serverFetch(req, 
      `${BACKEND}/monitoring/correlated-incidents/${id}/resolve`,
      {
        method: 'POST',
        headers: {
          ...(auth ? { Authorization: auth } : {}),
        },
      }
    )
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
