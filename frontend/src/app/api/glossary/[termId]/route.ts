import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

function authHeader(req: NextRequest): Record<string, string> {
  const auth = req.headers.get('Authorization')
  return auth ? { Authorization: auth } : {}
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ termId: string }> },
) {
  try {
    const { termId } = await params
    const res = await serverFetch(req, `${BACKEND}/glossary/terms/${termId}`, {
      headers: { ...authHeader(req) },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ termId: string }> },
) {
  try {
    const { termId } = await params
    const action = req.nextUrl.searchParams.get('action')

    if (action === 'link-asset') {
      const body = await req.json()
      const res = await serverFetch(req, `${BACKEND}/glossary/terms/${termId}/link-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(req) },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }

    // Existing workflow actions: submit, approve, reject
    if (!action || !['submit', 'approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    const body = action === 'reject' ? await req.json() : {}
    const res = await serverFetch(req, `${BACKEND}/glossary/terms/${termId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(req) },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ termId: string }> },
) {
  try {
    const { termId } = await params
    const linkId = req.nextUrl.searchParams.get('link_id')
    if (!linkId) {
      return NextResponse.json({ error: 'link_id is required' }, { status: 400 })
    }
    const res = await serverFetch(req, `${BACKEND}/glossary/terms/${termId}/link-asset/${linkId}`, {
      method: 'DELETE',
      headers: { ...authHeader(req) },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
