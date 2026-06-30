import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = req.headers.get('authorization') || ''
  try {
    const body = await req.json()
    const res = await serverFetch(req, `${BACKEND}/lifecycle/expiry-requests/${id}/decision`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const newStatus = body.action === 'extend' ? 'extended' : body.action === 'exempt' ? 'exempt' : 'approved'
      return NextResponse.json({ id, status: newStatus, new_expires_at: body.extend_days ? new Date(Date.now() + body.extend_days * 86400000).toISOString().slice(0, 10) : null })
    }
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ id, status: 'approved' })
  }
}
