import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_LINEAGE, DEMO_ASSET_BY_ID } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const params = new URLSearchParams(req.nextUrl.searchParams)
  const assetId = params.get('asset_id')
  try {
    const auth = req.headers.get('Authorization')
    const res = await serverFetch(req, `${BACKEND}/lineage?${params.toString()}`, {
      cache: 'no-store',
      headers: { ...(auth ? { Authorization: auth } : {}) },
    })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    return NextResponse.json(await res.json())
  } catch {
    if (!assetId) return NextResponse.json(DEMO_LINEAGE)
    // Return lineage subgraph relevant to the requested asset
    const connectedIds = new Set<string>([assetId])
    for (const e of DEMO_LINEAGE.edges) {
      if (e.source === assetId) connectedIds.add(e.target)
      if (e.target === assetId) connectedIds.add(e.source)
    }
    const nodes = DEMO_LINEAGE.nodes.filter(n => connectedIds.has(n.id))
    // Supplement with any asset not already in DEMO_LINEAGE.nodes
    if (assetId in DEMO_ASSET_BY_ID && !nodes.find(n => n.id === assetId)) {
      const a = DEMO_ASSET_BY_ID[assetId]
      nodes.push({ id: assetId, label: a.sf_table_name, type: a.asset_type, connection_name: a.connection_name, database: a.sf_database_name, schema: a.sf_schema_name })
    }
    const edges = DEMO_LINEAGE.edges.filter(e => connectedIds.has(e.source) && connectedIds.has(e.target))
    return NextResponse.json({ nodes, edges })
  }
}
