import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { sql } = await req.json()
  if (!sql) return NextResponse.json({ error: 'sql is required' }, { status: 400 })

  // Return a demo response — Snowflake SDK not available on Cloudflare Workers
  return NextResponse.json({
    rows: [{ RESULT: 'Query executed in demo mode — connect a live Snowflake instance for real results', SQL: sql }],
    count: 1,
    demo: true,
  })
}
