'use client'
import { useState, useEffect } from 'react'
import EntityComments from '@/components/EntityComments'
import { apiFetch } from '@/lib/apiFetch'
import AssetDescriptionField from './AssetDescriptionField'
import AssetColumnsSection from './AssetColumnsSection'
import AssetProfilingTab from './AssetProfilingTab'
import AssetRulesTab from './AssetRulesTab'
import AssetQualityTab from './AssetQualityTab'
import AssetTrendsTab from './AssetTrendsTab'
import AssetIssuesTab from './AssetIssuesTab'
import AssetSensitivityTab from './AssetSensitivityTab'
import { ScorePill } from '@/components/shared/charts'
import { AssetQualityScore } from '@/lib/types'

interface AssetMeta {
  sf_table_name?: string
  sf_schema_name?: string
  sf_database_name?: string
  row_count?: number
  bytes?: number
}

interface Asset {
  asset_id: string
  asset_type: string
  display_name?: string
  physical_name?: string
  qualified_name?: string
  description?: string
  status: string
  criticality: string
  sensitivity?: string
  owner_user_id?: string
  owner_team_id?: string
  steward_user_id?: string
  domain?: string
  domain_id?: string | null
  discovered_at?: string
  last_seen_at?: string
  connection_id?: string
  connection_name?: string
  source_meta?: AssetMeta
}

type Tab = 'overview' | 'profiling' | 'sensitivity' | 'rules' | 'quality' | 'alerts' | 'trends' | 'issues'

const TYPE_COLOR: Record<string, string> = {
  source: '#7c3aed', database: '#1d4ed8', schema: '#0369a1', table: '#065f46', view: '#0d9488',
  column: '#9a3412', file: '#92400e', dataset: '#374151', logical_dataset: '#4b5563',
}

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  active:      { background: 'var(--status-ok-bg)',      color: 'var(--status-ok-text)' },
  missing:     { background: 'var(--status-warn-bg)',     color: 'var(--status-warn-text)' },
  deprecated:  { background: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
  scan_failed: { background: 'var(--status-error-bg)',   color: 'var(--status-error-text)' },
  disabled:    { background: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-sm)', color: value != null ? 'var(--foreground)' : 'var(--text-muted)' }}>
        {value != null ? String(value) : '—'}
      </div>
    </div>
  )
}

export default function AssetDetailPanel({
  asset,
  onDescriptionSaved,
}: {
  asset: Asset | null
  onDescriptionSaved: (desc: string) => void
}) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [qualityScore, setQualityScore] = useState<number | null>(null)
  const [openIssueCount, setOpenIssueCount] = useState<number | null>(null)

  useEffect(() => {
    if (!asset) { setQualityScore(null); return }
    const leaf = asset.asset_type === 'table' || asset.asset_type === 'view'
    if (!leaf) { setQualityScore(null); return }
    apiFetch(`/api/quality-scores/assets/${asset.asset_id}`)
      .then(r => r.json())
      .then((d: AssetQualityScore) => setQualityScore(d.overall_score))
      .catch(() => setQualityScore(null))
  }, [asset])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!asset) { setOpenIssueCount(null); return }
    const leaf = asset.asset_type === 'table' || asset.asset_type === 'view'
    if (!leaf) { setOpenIssueCount(null); return }
    apiFetch(`/api/issues?asset_id=${asset.asset_id}&limit=50`)
      .then(r => r.json())
      .then((items: { status: string }[]) => {
        const open = Array.isArray(items) ? items.filter(i => i.status !== 'resolved' && i.status !== 'closed').length : 0
        setOpenIssueCount(open)
      })
      .catch(() => setOpenIssueCount(null))
  }, [asset])

  if (!asset) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Select an asset from the tree
      </div>
    )
  }

  const label = asset.display_name || asset.physical_name || asset.asset_id
  const typeBg = TYPE_COLOR[asset.asset_type] ?? '#64748b'
  const statusStyle = STATUS_STYLE[asset.status] ?? STATUS_STYLE.disabled
  const isLeaf = asset.asset_type === 'table' || asset.asset_type === 'view'

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Asset header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ background: typeBg, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {asset.asset_type}
        </span>
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--foreground)' }}>{label}</span>
        <span style={{ ...statusStyle, fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, marginLeft: 'auto' }}>
          {asset.status}
        </span>
        {isLeaf && qualityScore !== null && <ScorePill score={Math.round(qualityScore)} />}
      </div>

      {/* Tab bar — only for table/view assets */}
      {isLeaf && (
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
          {(['overview', 'profiling', 'sensitivity', 'rules', 'quality', 'alerts', 'trends', 'issues'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? 'var(--foreground)' : 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                cursor: 'pointer',
                textTransform: 'capitalize',
                marginBottom: '-1px',
              }}
            >
              {tab}
              {tab === 'issues' && openIssueCount !== null && openIssueCount > 0 && (
                <span style={{ marginLeft: '4px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', borderRadius: '8px', padding: '0 5px', fontSize: '9px', fontWeight: 700 }}>
                  {openIssueCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Overview tab content — non-leaf always visible; leaf only when activeTab === 'overview' */}
      {(!isLeaf || activeTab === 'overview') && (
        <>
          {isLeaf ? (
            <>
              <AssetDescriptionField
                assetId={asset.asset_id}
                description={asset.description ?? null}
                inheritedFrom={null}
                onSave={onDescriptionSaved}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px' }}>
                <Field label="Criticality" value={asset.criticality} />
                <Field label="Sensitivity" value={asset.sensitivity} />
                <Field label="Domain" value={asset.domain} />
                <Field label="Owner" value={asset.owner_user_id} />
                <Field label="Team" value={asset.owner_team_id} />
                <Field label="Steward" value={asset.steward_user_id} />
                <Field label="Discovered" value={asset.discovered_at ? new Date(asset.discovered_at).toLocaleDateString() : null} />
                <Field label="Last Seen" value={asset.last_seen_at ? new Date(asset.last_seen_at).toLocaleDateString() : null} />
                <Field label="Connection" value={asset.connection_name} />
              </div>
            </>
          ) : null}

          {asset.source_meta && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <Field label="Database" value={asset.source_meta.sf_database_name} />
              <Field label="Schema" value={asset.source_meta.sf_schema_name} />
              <Field label="Table" value={asset.source_meta.sf_table_name} />
              {asset.source_meta.row_count != null && (
                <Field label="Rows" value={asset.source_meta.row_count.toLocaleString()} />
              )}
            </div>
          )}

          {(asset.asset_type === 'table' || asset.asset_type === 'view') && (
            <AssetColumnsSection
              assetId={asset.asset_id}
              connectionId={asset.connection_id}
              sourceMeta={asset.source_meta}
            />
          )}
        </>
      )}

      {/* Profiling tab content */}
      {isLeaf && activeTab === 'profiling' && (
        <AssetProfilingTab
          assetId={asset.asset_id}
          connectionId={asset.connection_id}
        />
      )}

      {/* Sensitivity tab content */}
      {isLeaf && activeTab === 'sensitivity' && (
        <AssetSensitivityTab assetId={asset.asset_id} />
      )}

      {/* Rules tab content */}
      {isLeaf && activeTab === 'rules' && (
        <AssetRulesTab assetId={asset.asset_id} />
      )}

      {/* Quality tab content */}
      {isLeaf && activeTab === 'quality' && (
        <AssetQualityTab assetId={asset.asset_id} />
      )}

      {/* Alerts tab content */}
      {isLeaf && activeTab === 'alerts' && (
        <AssetAlertsTab assetId={asset.asset_id} />
      )}

      {/* Trends tab content */}
      {isLeaf && activeTab === 'trends' && (
        <AssetTrendsTab assetId={asset.asset_id} />
      )}

      {/* Issues tab content */}
      {isLeaf && activeTab === 'issues' && (
        <AssetIssuesTab assetId={asset.asset_id} domainId={asset.domain_id} />
      )}

      {isLeaf && (
        <div style={{ padding: '0 16px' }}>
          <EntityComments entityType="dataset" entityId={asset.asset_id} />
        </div>
      )}
    </div>
  )
}

/* ─── Asset Alerts Tab ─── */
type AlertSev = 'critical' | 'high' | 'medium' | 'info'
const ALERT_SEV: Record<AlertSev, { bg: string; color: string }> = {
  critical: { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)' },
  high:     { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)' },
  medium:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)' },
  info:     { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
}

function AssetAlertsTab({ assetId }: { assetId: string }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(`/api/alerts?asset_id=${assetId}&limit=50`)
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [assetId])

  if (loading) return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading alerts…</div>
  if (items.length === 0) return (
    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
      No alerts for this asset
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {items.map((a, i) => {
        const sev = (String(a.severity || 'info')) as AlertSev
        const ss = ALERT_SEV[sev] || ALERT_SEV.info
        const isAck = a.alert_status === 'acknowledged' || a.alert_status === 'resolved'
        const ts = a.created_at ? (() => { try { return new Date(String(a.created_at)).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) } catch { return String(a.created_at) } })() : '—'
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto auto', gap: '0 8px', alignItems: 'center', padding: '6px 4px', borderLeft: `2px solid ${isAck ? 'var(--border)' : ss.color}`, borderBottom: '1px solid var(--surface-muted)', opacity: isAck ? 0.65 : 1 }}>
            <span style={{ background: ss.bg, color: ss.color, padding: '1px 4px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textAlign: 'center' }}>{sev}</span>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {String(a.rule_name || a.alert_type || 'Alert')}
              </div>
              {Boolean(a.alert_message) && <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(a.alert_message)}</div>}
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{ts}</span>
            {isAck
              ? <span style={{ fontSize: '9px', color: 'var(--status-ok-text)' }}>✓</span>
              : <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: '9px', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>open</span>
            }
          </div>
        )
      })}
    </div>
  )
}
