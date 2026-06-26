import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const connectionId = new URL(req.url).searchParams.get('connection_id')
  const url = connectionId
    ? `${BACKEND}/lineage?connection_id=${connectionId}`
    : `${BACKEND}/lineage`
  try {
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ nodes: [], edges: [] })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ nodes: [], edges: [] })
  }
}
