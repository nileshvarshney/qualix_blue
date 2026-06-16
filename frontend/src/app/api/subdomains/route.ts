import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const domainId = req.nextUrl.searchParams.get('domain_id')
    const url = domainId
      ? `${BACKEND}/subdomains?domain_id=${encodeURIComponent(domainId)}`
      : `${BACKEND}/subdomains`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    return NextResponse.json([])
  }
}
