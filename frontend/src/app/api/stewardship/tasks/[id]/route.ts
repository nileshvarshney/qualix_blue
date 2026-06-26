import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = await req.text()
    const r = await serverFetch(req, `${B}/stewardship/tasks/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: req.headers.get('Authorization') ?? '',
      },
      body,
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.status })
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 })
  }
}
