import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action') // "approve" or "reject"
    const body = await req.json().catch(() => ({}))
    const auth = req.headers.get('authorization') || ''
    const res = await fetch(`${BACKEND}/governance/approvals/${params.id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
