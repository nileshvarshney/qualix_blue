import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const connectionId = new URL(req.url).searchParams.get('connection_id') ?? await getPrimaryConnectionId()
  if (!connectionId) return NextResponse.json({ edges: [] })
  try {
    const res = await fetch(`${BACKEND}/lineage/columns?connection_id=${connectionId}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ edges: [] })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ edges: [] })
  }
}

async function getPrimaryConnectionId(): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND}/connections`, { cache: 'no-store' })
    if (!res.ok) return null
    const conns: Record<string, unknown>[] = await res.json()
    if (!Array.isArray(conns) || conns.length === 0) return null
    const primary = conns.find(c => c.is_primary_target) ?? conns[0]
    return primary?.connection_id as string ?? null
  } catch { return null }
}
