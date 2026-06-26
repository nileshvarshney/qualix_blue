import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json()
    const r = await serverFetch(req, `${B}/privacy/dsr/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await serverFetch(req, `${B}/privacy/dsr/${id}`, { method: 'DELETE', headers: { Authorization: req.headers.get('Authorization') ?? '' } })
    return new NextResponse(null, { status: r.status })
  } catch { return new NextResponse(null, { status: 500 }) }
}
