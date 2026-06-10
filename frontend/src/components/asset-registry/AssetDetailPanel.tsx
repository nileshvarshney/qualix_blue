'use client'
import AssetDescriptionField from './AssetDescriptionField'
import AssetColumnsSection from './AssetColumnsSection'

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
  discovered_at?: string
  last_seen_at?: string
  connection_id?: string
  connection_name?: string
  source_meta?: AssetMeta
}

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
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ background: typeBg, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {asset.asset_type}
        </span>
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--foreground)' }}>{label}</span>
        <span style={{ ...statusStyle, fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, marginLeft: 'auto' }}>
          {asset.status}
        </span>
      </div>

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

      {isLeaf && (
        <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          <a href={`/rules?asset_id=${asset.asset_id}`}
            style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', border: '1px solid var(--border)', color: 'var(--text-secondary)', textDecoration: 'none', background: 'var(--surface)' }}>
            Run Rules
          </a>
        </div>
      )}
    </div>
  )
}
