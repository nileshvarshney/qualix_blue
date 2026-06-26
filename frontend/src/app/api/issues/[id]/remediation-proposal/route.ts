import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = req.headers.get('Authorization')
    const res = await serverFetch(req, `${BACKEND}/issues/${id}/remediation-proposal`, {
      cache: 'no-store',
      headers: { ...(auth ? { Authorization: auth } : {}) },
    })
    const data = await res.json().catch(() => null)
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json(null, { status: 500 })
  }
}
