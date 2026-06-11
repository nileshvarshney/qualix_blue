import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const ruleId = searchParams.get('rule_id')
    const assetId = searchParams.get('asset_id')

    let url = `${BACKEND}/runs/enriched?limit=200`
    if (ruleId) url += `&rule_id=${encodeURIComponent(ruleId)}`
    if (assetId) url += `&asset_id=${encodeURIComponent(assetId)}`

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()

    const items = Array.isArray(data) ? data : (data.items ?? [])

    // Normalize response: set job_name from rule_name if missing, and set run_type if missing
    const normalized = items.map((item: Record<string, unknown>) => {
      if (!item.job_name && item.rule_name) {
        item.job_name = item.rule_name
      }
      if (!item.run_type && item.rule_id) {
        item.run_type = 'rule_run'
      }
      return item
    })

    return NextResponse.json(normalized)
  } catch { return NextResponse.json([]) }
}
