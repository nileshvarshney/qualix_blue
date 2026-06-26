import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const connectionId = new URL(req.url).searchParams.get('connection_id')
  const globalUrl = connectionId
    ? `${BACKEND}/dashboard/global?connection_id=${connectionId}`
    : `${BACKEND}/dashboard/global`
  try {
    const dimUrl = connectionId
      ? `${BACKEND}/dashboard/dimensions?connection_id=${connectionId}`
      : `${BACKEND}/dashboard/dimensions`
    const [globalRes, dimRes, alertsRes] = await Promise.all([
      serverFetch(req, globalUrl, { cache: 'no-store' }),
      serverFetch(req, dimUrl, { cache: 'no-store' }),
      serverFetch(req, `${BACKEND}/alerts/enriched?status=open&limit=10`, { cache: 'no-store' }),
    ])

    if (!globalRes.ok) {
      console.error(`Dashboard: /dashboard/global returned ${globalRes.status}`)
      return NextResponse.json({
        overallScore: null, totalAssets: 0, totalRules: 0, openAlerts: 0,
        criticalAlerts: 0, mediumAlerts: 0, passed: 0, failed: 0,
        trend: [], dimensions: { completeness: null, accuracy: null, uniqueness: null, validity: null, timeliness: null, consistency: null },
        failingRules: [], atRiskTables: [],
      })
    }

    const global = await globalRes.json()
    const dimensions = dimRes.ok ? await dimRes.json() : {}
    const alertsRaw: Record<string, unknown>[] = alertsRes.ok ? await alertsRes.json() : []

    const criticalAlerts = alertsRaw.filter(a => a.severity === 'critical').length
    const mediumAlerts   = alertsRaw.filter(a => a.severity === 'medium' || a.severity === 'high').length

    const failingRules = alertsRaw.slice(0, 5).map(a => ({
      rule_name:  (a.rule_name  as string) ?? 'Unknown rule',
      asset_name: `${a.sf_schema_name ?? ''}.${a.sf_table_name ?? ''}`.replace(/^\./, ''),
      detail:     (a.alert_message as string) ?? '',
      severity:   (a.severity as string) ?? 'medium',
    }))

    const trend = ((global.quality_trend ?? []) as Record<string, unknown>[]).map(t => ({
      date:   t.date as string,
      score:  t.score as number | null,
      failed: t.failed as number,
      alert_count:   t.alert_count as number | undefined,
      anomaly_count: t.anomaly_count as number | undefined,
    }))

    const atRiskTables = ((global.at_risk_tables ?? []) as Record<string, unknown>[]).map(t => ({
      asset_name:  (`${t.schema_name ?? ''}.${t.table_name ?? ''}`).replace(/^\./, '') || String(t.table_name ?? ''),
      domain_name: (t.domain_name as string) ?? '—',
      score:       t.score as number,
      score_delta: (t.score_delta as number | null) ?? null,
    }))

    return NextResponse.json({
      overallScore:  global.overall_quality_score as number | null,
      totalAssets:   (global.total_assets as number) ?? 0,
      totalRules:    (global.total_active_rules as number) ?? 0,
      openAlerts:    (global.open_alerts as number) ?? 0,
      criticalAlerts,
      mediumAlerts,
      passed:        (global.rules_passed_today as number) ?? 0,
      failed:        (global.rules_failed_today as number) ?? 0,
      trend,
      dimensions: {
        completeness: (dimensions.completeness as number | null) ?? null,
        accuracy:     (dimensions.accuracy     as number | null) ?? null,
        uniqueness:   (dimensions.uniqueness   as number | null) ?? null,
        validity:     (dimensions.validity     as number | null) ?? null,
        timeliness:   (dimensions.timeliness   as number | null) ?? null,
        consistency:  (dimensions.consistency  as number | null) ?? null,
      },
      failingRules,
      atRiskTables,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
