import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_SUBDOMAINS } from '@/lib/demoData'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const domainId = req.nextUrl.searchParams.get('domain_id')
    const url = domainId
      ? `${BACKEND}/subdomains?domain_id=${encodeURIComponent(domainId)}`
      : `${BACKEND}/subdomains`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) {
      const filtered = domainId ? DEMO_SUBDOMAINS.filter(s => s.domain_id === domainId) : DEMO_SUBDOMAINS
      return NextResponse.json(filtered)
    }
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    return NextResponse.json(DEMO_SUBDOMAINS)
  }
}
