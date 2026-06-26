import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const auth = req.headers.get('authorization') || ''
    const res = await serverFetch(req, `${BACKEND}/comments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = req.headers.get('authorization') || ''
    const res = await serverFetch(req, `${BACKEND}/comments/${id}`, {
      method: 'DELETE',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) return NextResponse.json({ error: 'Delete failed' }, { status: res.status })
    return NextResponse.json({ message: 'Comment deleted' })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
