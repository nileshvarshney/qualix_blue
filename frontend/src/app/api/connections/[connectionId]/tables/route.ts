import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params
  const sp = new URL(req.url).searchParams
  const database = sp.get('database') ?? ''
  const schema   = sp.get('schema') ?? ''
  try {
    const res = await serverFetch(
      req,
      `${BACKEND}/connections/${connectionId}/tables?database=${encodeURIComponent(database)}&schema=${encodeURIComponent(schema)}`,
      { cache: 'no-store' }
    )
    const data = await res.json()
    if (!res.ok) {
      const msg = (data as Record<string, unknown>)?.detail || (data as Record<string, unknown>)?.error || `HTTP ${res.status}`
      return NextResponse.json({ tables: [], error: msg })
    }
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ tables: [], error: (e as Error).message })
  }
}
