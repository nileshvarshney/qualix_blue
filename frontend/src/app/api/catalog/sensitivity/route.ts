import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const B = process.env.BACKEND_URL || 'http://localhost:8000'

const PRIORITY = ['PHI', 'PII', 'RESTRICTED', 'CONFIDENTIAL', 'SENSITIVE']

export async function POST(req: NextRequest) {
  try {
    const { asset_ids } = await req.json() as { asset_ids: string[] }
    if (!Array.isArray(asset_ids) || asset_ids.length === 0) return NextResponse.json({})

    const results = await Promise.allSettled(
      asset_ids.map(async (id: string) => {
        try {
          const r = await serverFetch(req, `${B}/classifications/assets/${id}/classifications`, {
            headers: { Authorization: req.headers.get('Authorization') ?? '' },
          })
          const data = await r.json().catch(() => [])
          const items: Record<string, string>[] = Array.isArray(data) ? data : []
          let highest: string | null = null
          for (const level of PRIORITY) {
            if (items.some(item => item.classification === level || item.suggested_classification === level)) {
              highest = level
              break
            }
          }
          return { id, classification: highest, count: items.filter(i => i.classification !== 'PUBLIC').length }
        } catch {
          return { id, classification: null, count: 0 }
        }
      })
    )

    const map: Record<string, { classification: string | null; count: number }> = {}
    for (const r of results) {
      if (r.status === 'fulfilled') map[r.value.id] = { classification: r.value.classification, count: r.value.count }
    }
    return NextResponse.json(map)
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 })
  }
}
