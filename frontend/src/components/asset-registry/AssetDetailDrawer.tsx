'use client'

export type Asset = {
  asset_id: string
  sf_table_name?: string
  sf_schema_name?: string
  sf_database_name?: string
  table_description?: string
  table_type?: string
  connection_name?: string
  criticality?: string
  owner_name?: string
  technical_owner_name?: string
  certification_status?: string
  certified_by?: string
  is_active?: boolean
  domain_name?: string
  subdomain_name?: string
  domain_id?: string
  subdomain_id?: string
  created_at?: string
}

interface Props {
  asset: Asset
  onClose: () => void
  onUpdated: (updated: Asset) => void
}

const critColor = (c?: string) =>
  c === 'high' ? 'var(--status-error-text)' : c === 'medium' ? 'var(--status-warn-text)' : 'var(--text-muted)'
const critBg = (c?: string) =>
  c === 'high' ? 'var(--status-error-bg)' : c === 'medium' ? 'var(--status-warn-bg)' : 'var(--surface-muted)'
const certColor = (s?: string) =>
  s === 'certified' ? 'var(--status-ok-text)' : s === 'deprecated' ? 'var(--status-error-text)' : 'var(--text-muted)'
const certBg = (s?: string) =>
  s === 'certified' ? 'var(--status-ok-bg)' : s === 'deprecated' ? 'var(--status-error-bg)' : 'var(--surface-muted)'

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ background: bg, color, padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 600, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
      {label}
    </span>
  )
}

const labelStyle = { fontSize: '8.5px', textTransform: 'uppercase' as const, letterSpacing: '.05em', color: 'var(--text-muted)' }

export default function AssetDetailDrawer({ asset, onClose }: Props) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px,52vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1, fontFamily: 'monospace' }}>{asset.sf_table_name ?? '—'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Location — always read-only */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
          {([['Connection', asset.connection_name], ['Database', asset.sf_database_name], ['Schema', asset.sf_schema_name]] as [string, string | undefined][]).map(([l, v], i) => (
            <div key={l} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
              <div style={labelStyle}>{l}</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px', fontFamily: 'monospace' }}>{v || '—'}</div>
            </div>
          ))}
        </div>

        {/* Governance badges */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Status</div>
            <Badge label={asset.is_active !== false ? 'Active' : 'Inactive'} bg={asset.is_active !== false ? 'var(--status-ok-bg)' : 'var(--surface-muted)'} color={asset.is_active !== false ? 'var(--status-ok-text)' : 'var(--text-muted)'} />
          </div>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Criticality</div>
            <Badge label={asset.criticality ?? 'low'} bg={critBg(asset.criticality)} color={critColor(asset.criticality)} />
          </div>
          <div style={{ padding: '6px 8px' }}>
            <div style={labelStyle}>Certification</div>
            <Badge label={asset.certification_status ?? 'uncertified'} bg={certBg(asset.certification_status)} color={certColor(asset.certification_status)} />
          </div>
        </div>

        {/* Domain / Subdomain */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Domain</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.domain_name ?? '—'}</div>
          </div>
          <div style={{ padding: '6px 8px' }}>
            <div style={labelStyle}>Subdomain</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.subdomain_name ?? '—'}</div>
          </div>
        </div>

        {/* Owners */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Owner</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.owner_name ?? '—'}</div>
          </div>
          <div style={{ padding: '6px 8px' }}>
            <div style={labelStyle}>Technical Owner</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.technical_owner_name ?? '—'}</div>
          </div>
        </div>

        {/* Description */}
        <div style={{ margin: '6px 14px 0', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px' }}>
          <div style={{ ...labelStyle, marginBottom: '4px' }}>Description</div>
          <div style={{ fontSize: '11.5px', color: asset.table_description ? 'var(--foreground)' : 'var(--text-muted)', lineHeight: 1.6 }}>
            {asset.table_description || '—'}
          </div>
        </div>

        <div style={{ height: '12px' }} />
      </div>
    </>
  )
}
