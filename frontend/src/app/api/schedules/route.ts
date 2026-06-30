import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_SCHEDULES } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

const CONN_NAMES: Record<string, string> = {
  'demo-conn-001': 'Snowflake Supply Chain',
  'demo-conn-002': 'BigQuery Marketing Analytics',
  'demo-conn-003': 'PostgreSQL Customer 360',
  'demo-conn-004': 'Redshift Enterprise DW',
  'demo-conn-005': 'Oracle Financials',
  'demo-conn-006': 'Oracle Manufacturing',
}

const JOB_RULE_COUNT: Record<string, number> = {
  'job-001': 32, 'job-002': 18, 'job-003': 21,
  'job-004': 12, 'job-005': 28, 'job-006': 14, 'job-007': 80,
}

const JOB_ASSET: Record<string, { asset_name: string; asset_schema: string; asset_database: string }> = {
  'job-001': { asset_name: 'SALES_ORDERS',         asset_schema: 'SUPPLYCHAIN', asset_database: 'SUPPLYCHAIN_DB' },
  'job-002': { asset_name: 'campaigns',            asset_schema: 'marketing',   asset_database: 'marketing_db'   },
  'job-003': { asset_name: 'customers',            asset_schema: 'public',      asset_database: 'customer_360'   },
  'job-004': { asset_name: 'fact_sales',           asset_schema: 'public',      asset_database: 'data_warehouse' },
  'job-005': { asset_name: 'FINANCE_TRANSACTIONS', asset_schema: 'GL',          asset_database: 'FINDB'          },
  'job-006': { asset_name: 'WORK_ORDERS',          asset_schema: 'MFG',         asset_database: 'MFGDB'          },
  'job-007': { asset_name: '(all assets)',         asset_schema: '',            asset_database: ''               },
}

function enrichSchedules(raw: typeof DEMO_SCHEDULES, connectionId: string | null) {
  return raw
    .filter(s => !connectionId || s.connection_id === connectionId)
    .map(s => {
      const asset = JOB_ASSET[s.job_id] ?? { asset_name: '', asset_schema: '', asset_database: '' }
      const lastRunStatus = s.last_run_status === 'success' ? 'passed' : s.last_run_status === 'failed' ? 'failed' : 'passed'
      return {
        ...s,
        is_active: s.enabled,
        connection_name: CONN_NAMES[s.connection_id] ?? '',
        rule_count: JOB_RULE_COUNT[s.job_id] ?? 0,
        asset_name: asset.asset_name,
        asset_schema: asset.asset_schema,
        asset_database: asset.asset_database,
        next_run_at: s.next_run_at ?? null,
        bundled_rules: [{
          rule_id: `${s.schedule_id}-r1`,
          rule_name: `${s.schedule_name} — primary check`,
          rule_description: `Automated quality check for ${asset.asset_name || 'all assets'}`,
          severity: 'medium',
          status: s.enabled ? 'active' : 'disabled',
          last_run_status: lastRunStatus,
          last_run_at: s.last_run_at,
          last_duration_ms: s.last_run_status === 'failed' ? 8000 : (s.job_id === 'job-007' ? 1842000 : s.job_id === 'job-001' ? 187000 : s.job_id === 'job-006' ? 204000 : 120000),
          next_run: s.next_run_at ?? null,
          failed_rows_count: s.last_run_status === 'failed' ? 0 : null,
          total_rows_scanned: s.last_run_status === 'failed' ? 0 : null,
          failure_percentage: null,
          error_message: s.last_run_status === 'failed' ? 'Connection timeout — ORA-12170' : null,
          ai_explanation: null,
        }],
      }
    })
}

export async function GET(req: NextRequest) {
  try {
    const connectionId = req.nextUrl.searchParams.get('connection_id')
    let url = `${BACKEND}/schedules/enriched?limit=200`
    if (connectionId) url += `&connection_id=${encodeURIComponent(connectionId)}`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json(enrichSchedules(DEMO_SCHEDULES, connectionId))
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : (data.items ?? []))
  } catch { return NextResponse.json(enrichSchedules(DEMO_SCHEDULES, req.nextUrl.searchParams.get('connection_id'))) }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, action } = body
    const res = await serverFetch(req, `${BACKEND}/schedules/${id}/${action}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (body.create) {
      const { create: _, ...payload } = body
      const res = await serverFetch(req, `${BACKEND}/schedules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }
    // existing run-now path
    const { id } = body
    const res = await serverFetch(req, `${BACKEND}/schedules/${id}/run-now`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
