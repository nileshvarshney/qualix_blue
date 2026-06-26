import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  try {
    const res = await serverFetch(req, `${BACKEND}/classifications/${path.join('/')}${req.nextUrl.search}`, { cache: 'no-store' })
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 502 }) }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  try {
    const body = await req.text()
    const res = await serverFetch(req, `${BACKEND}/classifications/${path.join('/')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body || '{}',
    })
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 502 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  try {
    const res = await serverFetch(req, `${BACKEND}/classifications/${path.join('/')}`, { method: 'DELETE' })
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 502 }) }
}
