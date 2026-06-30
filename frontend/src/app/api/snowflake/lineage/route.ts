import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_LINEAGE, DEMO_CONNECTIONS } from '@/lib/demoData'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const connectionId = new URL(req.url).searchParams.get('connection_id')
  const url = connectionId
    ? `${BACKEND}/lineage?connection_id=${connectionId}`
    : `${BACKEND}/lineage`
  try {
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    return NextResponse.json(await res.json())
  } catch {
    if (connectionId) {
      const conn = DEMO_CONNECTIONS.find(c => c.id === connectionId)
      const connNodes = DEMO_LINEAGE.nodes.filter(n =>
        n.database === conn?.database || n.schema === conn?.schema
      )
      const connNodeIds = new Set(connNodes.map(n => n.id))
      const connEdges = DEMO_LINEAGE.edges.filter(e => connNodeIds.has(e.from) || connNodeIds.has(e.to))
      // Include referenced nodes not yet in connNodes
      const referencedIds = new Set([...connEdges.map(e => e.from), ...connEdges.map(e => e.to)])
      const allNodes = DEMO_LINEAGE.nodes.filter(n => referencedIds.has(n.id) || connNodeIds.has(n.id))
      return NextResponse.json({
        nodes: allNodes,
        edges: connEdges,
        connection: conn
          ? { name: conn.name, database: conn.database ?? '', schema: conn.schema ?? '', warehouse: 'COMPUTE_WH', status: conn.status }
          : DEMO_LINEAGE.connection,
        meta: DEMO_LINEAGE.meta,
      })
    }
    return NextResponse.json(DEMO_LINEAGE)
  }
}
