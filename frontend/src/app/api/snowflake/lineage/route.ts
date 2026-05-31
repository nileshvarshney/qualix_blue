import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const connectionId = new URL(req.url).searchParams.get('connection_id')
  if (!connectionId) return NextResponse.json({ nodes: [], edges: [] })
  try {
    const res = await fetch(`${BACKEND}/lineage?connection_id=${connectionId}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ nodes: [], edges: [] })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ nodes: [], edges: [] })
  }
}
