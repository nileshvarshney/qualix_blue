import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_CONFIG_LLM } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const url = category
    ? `${BACKEND}/config?category=${encodeURIComponent(category)}`
    : `${BACKEND}/config`
  try {
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    return NextResponse.json(await res.json())
  } catch {
    if (category === 'llm' || !category) return NextResponse.json(DEMO_CONFIG_LLM)
    return NextResponse.json({ config: {}, categories: [] })
  }
}
