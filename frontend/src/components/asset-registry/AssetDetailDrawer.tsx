'use client'
import { useState, useEffect } from 'react'

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

type Domain = { domain_id: string; domain_name: string }
type Subdomain = { subdomain_id: string; subdomain_name: string }

type EditForm = {
  is_active: boolean
  criticality: string
  certification_status: string
  domain_id: string
  subdomain_id: string
  owner_name: string
  technical_owner_name: string
  description: string
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
const inputStyle = { fontSize: '11px', padding: '3px 6px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--background)', color: 'var(--foreground)', width: '100%', boxSizing: 'border-box' as const }

function initialForm(asset: Asset): EditForm {
  return {
    is_active: asset.is_active !== false,
    criticality: asset.criticality ?? 'low',
    certification_status: asset.certification_status ?? 'uncertified',
    domain_id: asset.domain_id ?? '',
    subdomain_id: asset.subdomain_id ?? '',
    owner_name: asset.owner_name ?? '',
    technical_owner_name: asset.technical_owner_name ?? '',
    description: asset.table_description ?? '',
  }
}

export default function AssetDetailDrawer({ asset, onClose, onUpdated }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(initialForm(asset))
  const [domains, setDomains] = useState<Domain[]>([])
  const [subdomains, setSubdomains] = useState<Subdomain[]>([])
  const [domainsLoaded, setDomainsLoaded] = useState(false)
  const [selectedDomainName, setSelectedDomainName] = useState(asset.domain_name ?? '')
  const [selectedSubdomainName, setSelectedSubdomainName] = useState(asset.subdomain_name ?? '')

  useEffect(() => {
    setEditing(false)
    setError(null)
    setEditForm(initialForm(asset))
    setSelectedDomainName(asset.domain_name ?? '')
    setSelectedSubdomainName(asset.subdomain_name ?? '')
  }, [asset.asset_id])

  async function loadSubdomains(domainId: string) {
    if (!domainId) { setSubdomains([]); return }
    try {
      const res = await fetch(`/api/subdomains?domain_id=${encodeURIComponent(domainId)}`)
      if (res.ok) setSubdomains(await res.json())
      else setError('Failed to load subdomains')
    } catch {
      setError('Failed to load subdomains')
    }
  }

  async function openEdit() {
    const form = initialForm(asset)
    setEditForm(form)
    setSelectedDomainName(asset.domain_name ?? '')
    setSelectedSubdomainName(asset.subdomain_name ?? '')
    setError(null)
    setEditing(true)
    if (!domainsLoaded) {
      try {
        const res = await fetch('/api/domains-list')
        if (res.ok) {
          setDomains(await res.json())
          setDomainsLoaded(true)
        } else {
          setError('Failed to load domains')
        }
      } catch {
        setError('Failed to load domains')
      }
    }
    if (asset.domain_id) await loadSubdomains(asset.domain_id)
  }

  function handleDomainChange(domainId: string) {
    const domain = domains.find(d => d.domain_id === domainId)
    setEditForm(f => ({ ...f, domain_id: domainId, subdomain_id: '' }))
    setSelectedDomainName(domain?.domain_name ?? '')
    setSelectedSubdomainName('')
    loadSubdomains(domainId).catch(() => setError('Failed to load subdomains'))
  }

  function handleSubdomainChange(subdomainId: string) {
    const sub = subdomains.find(s => s.subdomain_id === subdomainId)
    setEditForm(f => ({ ...f, subdomain_id: subdomainId }))
    setSelectedSubdomainName(sub?.subdomain_name ?? '')
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const orig = initialForm(asset)
      const body: Record<string, unknown> = {}
      if (editForm.is_active !== orig.is_active) body.is_active = editForm.is_active
      if (editForm.criticality !== orig.criticality) body.criticality = editForm.criticality
      if (editForm.certification_status !== orig.certification_status) body.certification_status = editForm.certification_status
      if (editForm.domain_id !== orig.domain_id) body.domain_id = editForm.domain_id
      if (editForm.subdomain_id !== orig.subdomain_id) body.subdomain_id = editForm.subdomain_id
      if (editForm.owner_name !== orig.owner_name) body.owner_name = editForm.owner_name
      if (editForm.technical_owner_name !== orig.technical_owner_name) body.technical_owner_name = editForm.technical_owner_name
      if (editForm.description !== orig.description) body.description = editForm.description

      if (Object.keys(body).length === 0) {
        setEditing(false)
        return
      }

      const res = await fetch(`/api/asset-registry/${asset.asset_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError((err as { detail?: string }).detail ?? 'Save failed')
        return
      }
      const updated: Asset = {
        ...asset,
        is_active: editForm.is_active,
        criticality: editForm.criticality,
        certification_status: editForm.certification_status,
        domain_id: editForm.domain_id,
        subdomain_id: editForm.subdomain_id,
        domain_name: selectedDomainName,
        subdomain_name: selectedSubdomainName,
        owner_name: editForm.owner_name,
        technical_owner_name: editForm.technical_owner_name,
        table_description: editForm.description,
      }
      setEditing(false)
      onUpdated(updated)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setEditing(false)
    setError(null)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px,52vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1, fontFamily: 'monospace' }}>{asset.sf_table_name ?? '—'}</span>
          {!editing && (
            <button onClick={openEdit} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', cursor: 'pointer' }}>
              Edit
            </button>
          )}
          {editing && <>
            <button onClick={cancel} disabled={saving} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
        </div>

        {error && (
          <div style={{ margin: '8px 14px 0', padding: '6px 10px', borderRadius: '4px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: '11px' }}>
            {error}
          </div>
        )}

        {/* Location — always read-only */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          {([['Connection', asset.connection_name], ['Database', asset.sf_database_name], ['Schema', asset.sf_schema_name]] as [string, string | undefined][]).map(([l, v], i) => (
            <div key={l} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
              <div style={labelStyle}>{l}</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px', fontFamily: 'monospace' }}>{v || '—'}</div>
            </div>
          ))}
        </div>

        {/* Status / Criticality / Certification */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Status</div>
            {editing
              ? <select style={inputStyle} value={editForm.is_active ? 'active' : 'inactive'} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.value === 'active' }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              : <Badge label={asset.is_active !== false ? 'Active' : 'Inactive'} bg={asset.is_active !== false ? 'var(--status-ok-bg)' : 'var(--surface-muted)'} color={asset.is_active !== false ? 'var(--status-ok-text)' : 'var(--text-muted)'} />
            }
          </div>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Criticality</div>
            {editing
              ? <select style={inputStyle} value={editForm.criticality} onChange={e => setEditForm(f => ({ ...f, criticality: e.target.value }))}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              : <Badge label={asset.criticality ?? 'low'} bg={critBg(asset.criticality)} color={critColor(asset.criticality)} />
            }
          </div>
          <div style={{ padding: '6px 8px' }}>
            <div style={labelStyle}>Certification</div>
            {editing
              ? <select style={inputStyle} value={editForm.certification_status} onChange={e => setEditForm(f => ({ ...f, certification_status: e.target.value }))}>
                  <option value="certified">Certified</option>
                  <option value="warning">Warning</option>
                  <option value="failed">Failed</option>
                  <option value="uncertified">Uncertified</option>
                </select>
              : <Badge label={asset.certification_status ?? 'uncertified'} bg={certBg(asset.certification_status)} color={certColor(asset.certification_status)} />
            }
          </div>
        </div>

        {/* Domain / Subdomain */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Domain</div>
            {editing
              ? <select style={inputStyle} value={editForm.domain_id} onChange={e => handleDomainChange(e.target.value)}>
                  <option value="">— Select —</option>
                  {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
                </select>
              : <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.domain_name ?? '—'}</div>
            }
          </div>
          <div style={{ padding: '6px 8px' }}>
            <div style={labelStyle}>Subdomain</div>
            {editing
              ? <select style={inputStyle} value={editForm.subdomain_id} onChange={e => handleSubdomainChange(e.target.value)} disabled={!editForm.domain_id}>
                  <option value="">— Select —</option>
                  {subdomains.map(s => <option key={s.subdomain_id} value={s.subdomain_id}>{s.subdomain_name}</option>)}
                </select>
              : <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.subdomain_name ?? '—'}</div>
            }
          </div>
        </div>

        {/* Owners */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Owner</div>
            {editing
              ? <input type="text" style={inputStyle} value={editForm.owner_name} onChange={e => setEditForm(f => ({ ...f, owner_name: e.target.value }))} placeholder="Owner name" />
              : <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.owner_name ?? '—'}</div>
            }
          </div>
          <div style={{ padding: '6px 8px' }}>
            <div style={labelStyle}>Technical Owner</div>
            {editing
              ? <input type="text" style={inputStyle} value={editForm.technical_owner_name} onChange={e => setEditForm(f => ({ ...f, technical_owner_name: e.target.value }))} placeholder="Technical owner name" />
              : <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.technical_owner_name ?? '—'}</div>
            }
          </div>
        </div>

        {/* Description */}
        <div style={{ margin: '6px 14px 0', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px' }}>
          <div style={{ ...labelStyle, marginBottom: '4px' }}>Description</div>
          {editing
            ? <textarea
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Add a table description…"
              />
            : <div style={{ fontSize: '11.5px', color: asset.table_description ? 'var(--foreground)' : 'var(--text-muted)', lineHeight: 1.6 }}>
                {asset.table_description || '—'}
              </div>
          }
        </div>

        <div style={{ height: '12px' }} />
      </div>
    </>
  )
}
