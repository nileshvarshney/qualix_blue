import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

function stripHtml(str: unknown): string {
  if (typeof str !== 'string') return String(str ?? '')
  return str.replace(/<[^>]*>/g, '').trim()
}

function sanitizeTermBody(body: Record<string, unknown>): Record<string, unknown> {
  return {
    ...body,
    term_name: stripHtml(body.term_name),
    definition: stripHtml(body.definition),
    synonyms: typeof body.synonyms === 'string' ? stripHtml(body.synonyms) : body.synonyms,
  }
}

export async function GET(req: NextRequest) {
  try {
    const res = await serverFetch(req, `${BACKEND}/glossary/terms?limit=100`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : (data.items ?? data.terms ?? []))
  } catch { return NextResponse.json([]) }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json()
    const body = sanitizeTermBody(raw)
    if (!body.term_name) return NextResponse.json({ error: 'term_name is required' }, { status: 400 })
    const res = await serverFetch(req, `${BACKEND}/glossary/terms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}

export async function PUT(req: NextRequest) {
  try {
    const raw = await req.json()
    const { id, ...rest } = raw
    const sanitized = sanitizeTermBody(rest)
    const res = await serverFetch(req, `${BACKEND}/glossary/terms/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitized),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    const res = await serverFetch(req, `${BACKEND}/glossary/terms/${id}`, { method: 'DELETE' })
    return NextResponse.json({ success: res.ok }, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
