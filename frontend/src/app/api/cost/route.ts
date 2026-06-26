import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const endpoint = searchParams.get('endpoint') || 'overview'
    const allowedEndpoints = ['overview', 'summary', 'by-domain', 'by-subdomain', 'by-asset', 'top-tables', 'configs']
    if (!allowedEndpoints.includes(endpoint)) {
      return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 })
    }
    const forwardParams = new URLSearchParams(searchParams)
    forwardParams.delete('endpoint')
    const qs = forwardParams.toString() ? `?${forwardParams.toString()}` : ''
    const res = await serverFetch(req, `${BACKEND}/cost/${endpoint}${qs}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json(null)
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json(null) }
}
