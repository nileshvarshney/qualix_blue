'use client'
import React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { SensitivityBadge } from '@/components/asset-registry/SensitivityBadge'
import { apiFetch } from '@/lib/apiFetch'

type Tab = 'masking' | 'dsr' | 'consent' | 'residency'

type DomainSummary = {
  name: string
  counts: Record<string, number>
  total: number
}

interface MaskingPolicy {
  policy_id: string; asset_id: string; column_name: string; masking_type: string
  unmasked_roles: string | null; created_by: string | null; created_at: string
}
interface PIIExposure { unprotected_pii_tables: number; assets: { asset_id: string; sf_table_name: string }[] }
interface DSR {
  dsr_id: string; subject_email: string; request_type: string; status: string
  description: string | null; affected_tables: string[]; assigned_to: string | null
  notes: string | null; requested_by: string | null; created_at: string; completed_at: string | null
}
interface ConsentRecord {
  consent_id: string; asset_id: string | null; purpose: string; legal_basis: string
  data_subject_type: string | null; requires_explicit_consent: boolean; opt_in: boolean
  recorded_by: string | null; created_at: string
}
interface ResidencyPolicy {
  residency_id: string; asset_id: string | null; domain_id: string | null
  allowed_regions: string[]; prohibited_regions: string[]
  data_sovereignty_country: string | null; notes: string | null; created_at: string
}

const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: '12px', padding: '18px 20px', border: '1px solid var(--border)' }

const MASKING_TYPES = ['full_mask', 'partial_mask', 'hash', 'tokenize', 'nullify']
const DSR_TYPES = ['erasure', 'access', 'rectification', 'portability', 'opt_out']
const LEGAL_BASES = ['consent', 'legitimate_interest', 'contract', 'legal_obligation', 'vital_interests', 'public_task']
const REGIONS = ['US', 'EU', 'UK', 'APAC', 'CA', 'AU', 'IN', 'JP', 'SG', 'BR']

function statusStyle(s: string): React.CSSProperties {
  if (s === 'completed' || s === 'compliant') return { background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)' }
  if (s === 'pending' || s === 'in_review') return { background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)' }
  return { background: 'var(--status-error-bg)', color: 'var(--status-error-text)' }
}

function Pill({ label }: { label: string }) {
  return <span style={{ ...statusStyle(label), padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{label.replace(/_/g, ' ')}</span>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', borderRadius: '14px', padding: '24px', width: '480px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--foreground)', fontSize: '13px', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }
const submitBtn: React.CSSProperties = { marginTop: '16px', width: '100%', padding: '9px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, fontSize: '13px' }

// ── Masking Tab ──────────────────────────────────────────────────────────────
function MaskingTab({ activeConnectionId }: { activeConnectionId: string }) {
  const [policies, setPolicies] = useState<MaskingPolicy[]>([])
  const [exposure, setExposure] = useState<PIIExposure>({ unprotected_pii_tables: 0, assets: [] })
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ asset_id: '', column_name: '', masking_type: 'full_mask', unmasked_roles: 'admin,data_steward' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    const qs = params.toString() ? `?${params}` : ''
    const [p, e] = await Promise.all([
      apiFetch(`/api/privacy/masking-policies${qs}`).then(r => r.json()).catch(() => []),
      apiFetch(`/api/privacy/pii-exposure${qs}`).then(r => r.json()).catch(() => ({ unprotected_pii_tables: 0, assets: [] })),
    ])
    setPolicies(Array.isArray(p) ? p : [])
    setExposure(e)
  }, [activeConnectionId])

  useEffect(() => { load() }, [load])

  async function handleAdd() {
    setSaving(true)
    try {
      const r = await apiFetch('/api/privacy/masking-policies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, unmasked_roles: form.unmasked_roles || null }),
      })
      if (!r.ok) { alert('Save failed. Please try again.'); return }
      setShowAdd(false)
      setForm({ asset_id: '', column_name: '', masking_type: 'full_mask', unmasked_roles: 'admin,data_steward' })
      load()
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    const r = await apiFetch(`/api/privacy/masking-policies/${id}`, { method: 'DELETE' })
    if (!r.ok) { alert('Delete failed. Please try again.'); return }
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {exposure.unprotected_pii_tables > 0 && (
        <div style={{ ...card, background: 'var(--status-error-bg)', border: '1px solid var(--status-error-text)' }}>
          <div style={{ fontWeight: 700, color: 'var(--status-error-text)', fontSize: '14px' }}>
            ⚠ {exposure.unprotected_pii_tables} PII table{exposure.unprotected_pii_tables > 1 ? 's' : ''} with no masking policy
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {exposure.assets.slice(0, 3).map(a => a.sf_table_name).join(', ')}{exposure.assets.length > 3 ? ` +${exposure.assets.length - 3} more` : ''}
          </div>
        </div>
      )}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '14.5px' }}>Masking Policies</div>
          <button onClick={() => setShowAdd(true)} style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, fontSize: '12px' }}>+ Add Policy</button>
        </div>
        {policies.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '10px' }}>No masking policies configured</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Asset', 'Column', 'Type', 'Unmasked Roles', 'Created By', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {policies.map(p => (
                <tr key={p.policy_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px' }}>{p.asset_id.slice(0, 8)}…</td>
                  <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 600 }}>{p.column_name}</td>
                  <td style={{ padding: '10px' }}><Pill label={p.masking_type} /></td>
                  <td style={{ padding: '10px', fontSize: '11.5px', color: 'var(--text-muted)' }}>{p.unmasked_roles ?? '—'}</td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>{p.created_by ?? '—'}</td>
                  <td style={{ padding: '10px' }}>
                    <button onClick={() => handleDelete(p.policy_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-error-text)', fontSize: '12px' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && (
        <Modal title="Add Masking Policy" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><label style={lbl}>Asset ID</label><input style={inp} value={form.asset_id} onChange={e => setForm(f => ({ ...f, asset_id: e.target.value }))} placeholder="Paste asset UUID" /></div>
            <div><label style={lbl}>Column Name</label><input style={inp} value={form.column_name} onChange={e => setForm(f => ({ ...f, column_name: e.target.value }))} placeholder="e.g. email" /></div>
            <div><label style={lbl}>Masking Type</label>
              <select style={inp} value={form.masking_type} onChange={e => setForm(f => ({ ...f, masking_type: e.target.value }))}>
                {MASKING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Unmasked Roles (comma-separated)</label><input style={inp} value={form.unmasked_roles} onChange={e => setForm(f => ({ ...f, unmasked_roles: e.target.value }))} placeholder="admin,data_steward" /></div>
            <button onClick={handleAdd} disabled={saving || !form.asset_id || !form.column_name} style={{ ...submitBtn, opacity: saving || !form.asset_id || !form.column_name ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Add Policy'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── DSR Tab ──────────────────────────────────────────────────────────────────
function DSRTab({ activeConnectionId }: { activeConnectionId: string }) {
  const [dsrs, setDSRs] = useState<DSR[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ subject_email: '', request_type: 'erasure', description: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    const qs = params.toString() ? `?${params}` : ''
    const data = await apiFetch(`/api/privacy/dsr${qs}`).then(r => r.json()).catch(() => [])
    setDSRs(Array.isArray(data) ? data : [])
  }, [activeConnectionId])

  useEffect(() => { load() }, [load])

  const pending = dsrs.filter(d => d.status === 'pending').length
  const inReview = dsrs.filter(d => d.status === 'in_review').length
  const completed = dsrs.filter(d => d.status === 'completed').length

  async function handleAction(id: string, status: string) {
    const r = await apiFetch(`/api/privacy/dsr/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    if (!r.ok) { alert('Action failed. Please try again.'); return }
    load()
  }

  async function handleAdd() {
    setSaving(true)
    try {
      const r = await apiFetch('/api/privacy/dsr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!r.ok) { alert('Save failed. Please try again.'); return }
      setShowAdd(false)
      setForm({ subject_email: '', request_type: 'erasure', description: '' })
      load()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        {[['Pending', pending, 'var(--status-warn-text)'], ['In Review', inReview, 'var(--brand-primary)'], ['Completed', completed, 'var(--status-ok-text)']].map(([label, count, color]) => (
          <div key={String(label)} style={card}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '8px' }}>{label}</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: String(color) }}>{count}</div>
          </div>
        ))}
      </div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '14.5px' }}>Data Subject Requests</div>
          <button onClick={() => setShowAdd(true)} style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, fontSize: '12px' }}>+ New Request</button>
        </div>
        {dsrs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '10px' }}>No data subject requests</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Subject', 'Type', 'Status', 'Assigned To', 'Created', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {dsrs.map(d => (
                <tr key={d.dsr_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px' }}>{d.subject_email}</td>
                  <td style={{ padding: '10px' }}><Pill label={d.request_type} /></td>
                  <td style={{ padding: '10px' }}><Pill label={d.status} /></td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>{d.assigned_to ?? '—'}</td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.created_at?.slice(0, 10)}</td>
                  <td style={{ padding: '10px', display: 'flex', gap: '6px' }}>
                    {d.status === 'pending' && <button onClick={() => handleAction(d.dsr_id, 'in_review')} style={{ padding: '3px 10px', borderRadius: '5px', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '11px', background: 'transparent', color: 'var(--foreground)' }}>Accept</button>}
                    {d.status === 'in_review' && <>
                      <button onClick={() => handleAction(d.dsr_id, 'completed')} style={{ padding: '3px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '11px', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', fontWeight: 600 }}>Complete</button>
                      <button onClick={() => handleAction(d.dsr_id, 'rejected')} style={{ padding: '3px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '11px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontWeight: 600 }}>Reject</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && (
        <Modal title="New Data Subject Request" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><label style={lbl}>Subject Email</label><input style={inp} value={form.subject_email} onChange={e => setForm(f => ({ ...f, subject_email: e.target.value }))} placeholder="user@example.com" /></div>
            <div><label style={lbl}>Request Type</label>
              <select style={inp} value={form.request_type} onChange={e => setForm(f => ({ ...f, request_type: e.target.value }))}>
                {DSR_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Description</label><textarea style={{ ...inp, height: '80px', resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Details of the request…" /></div>
            <button onClick={handleAdd} disabled={saving || !form.subject_email} style={{ ...submitBtn, opacity: saving || !form.subject_email ? 0.6 : 1 }}>{saving ? 'Submitting…' : 'Submit Request'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Consent Tab ──────────────────────────────────────────────────────────────
function ConsentTab({ activeConnectionId }: { activeConnectionId: string }) {
  const [records, setRecords] = useState<ConsentRecord[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ asset_id: '', purpose: '', legal_basis: 'consent', data_subject_type: '', requires_explicit_consent: false, opt_in: true })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    const qs = params.toString() ? `?${params}` : ''
    const data = await apiFetch(`/api/privacy/consent${qs}`).then(r => r.json()).catch(() => [])
    setRecords(Array.isArray(data) ? data : [])
  }, [activeConnectionId])

  useEffect(() => { load() }, [load])

  const optInRate = records.length > 0 ? Math.round((records.filter(r => r.opt_in).length / records.length) * 100) : null

  async function handleAdd() {
    setSaving(true)
    try {
      const r = await apiFetch('/api/privacy/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!r.ok) { alert('Save failed. Please try again.'); return }
      setShowAdd(false)
      setForm({ asset_id: '', purpose: '', legal_basis: 'consent', data_subject_type: '', requires_explicit_consent: false, opt_in: true })
      load()
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    const r = await apiFetch(`/api/privacy/consent/${id}`, { method: 'DELETE' })
    if (!r.ok) { alert('Delete failed. Please try again.'); return }
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        <div style={card}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '8px' }}>Total Records</div><div style={{ fontSize: '28px', fontWeight: 700, color: records.length > 0 ? 'var(--foreground)' : 'var(--text-muted)' }}>{records.length || '—'}</div></div>
        <div style={card}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '8px' }}>Opt-In Rate</div><div style={{ fontSize: '28px', fontWeight: 700, color: optInRate != null ? 'var(--status-ok-text)' : 'var(--text-muted)' }}>{optInRate != null ? `${optInRate}%` : '—'}</div></div>
        <div style={card}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '8px' }}>Explicit Consent</div><div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--foreground)' }}>{records.filter(r => r.requires_explicit_consent).length}</div></div>
      </div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '14.5px' }}>Consent Records</div>
          <button onClick={() => setShowAdd(true)} style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, fontSize: '12px' }}>+ Add Record</button>
        </div>
        {records.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '10px' }}>No consent records</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Purpose', 'Legal Basis', 'Subject Type', 'Opt-In', 'Explicit', 'Recorded By', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.consent_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.purpose}</td>
                  <td style={{ padding: '10px' }}><Pill label={r.legal_basis.replace(/_/g, ' ')} /></td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>{r.data_subject_type ?? '—'}</td>
                  <td style={{ padding: '10px' }}><span style={{ fontWeight: 600, color: r.opt_in ? 'var(--status-ok-text)' : 'var(--status-error-text)' }}>{r.opt_in ? 'Yes' : 'No'}</span></td>
                  <td style={{ padding: '10px' }}><span style={{ fontWeight: 600, color: r.requires_explicit_consent ? 'var(--brand-primary)' : 'var(--text-muted)' }}>{r.requires_explicit_consent ? 'Yes' : 'No'}</span></td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>{r.recorded_by ?? '—'}</td>
                  <td style={{ padding: '10px' }}><button onClick={() => handleDelete(r.consent_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-error-text)', fontSize: '12px' }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && (
        <Modal title="Add Consent Record" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><label style={lbl}>Asset ID (optional)</label><input style={inp} value={form.asset_id} onChange={e => setForm(f => ({ ...f, asset_id: e.target.value }))} placeholder="Leave blank for global" /></div>
            <div><label style={lbl}>Purpose</label><input style={inp} value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Marketing analytics" /></div>
            <div><label style={lbl}>Legal Basis</label>
              <select style={inp} value={form.legal_basis} onChange={e => setForm(f => ({ ...f, legal_basis: e.target.value }))}>
                {LEGAL_BASES.map(b => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Data Subject Type</label><input style={inp} value={form.data_subject_type} onChange={e => setForm(f => ({ ...f, data_subject_type: e.target.value }))} placeholder="e.g. Customer" /></div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.requires_explicit_consent} onChange={e => setForm(f => ({ ...f, requires_explicit_consent: e.target.checked }))} />
                Requires Explicit Consent
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.opt_in} onChange={e => setForm(f => ({ ...f, opt_in: e.target.checked }))} />
                Opt-In
              </label>
            </div>
            <button onClick={handleAdd} disabled={saving || !form.purpose} style={{ ...submitBtn, opacity: saving || !form.purpose ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Add Record'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Residency Tab ─────────────────────────────────────────────────────────────
function ResidencyTab({ activeConnectionId }: { activeConnectionId: string }) {
  const [policies, setPolicies] = useState<ResidencyPolicy[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ asset_id: '', domain_id: '', allowed_regions: [] as string[], prohibited_regions: [] as string[], data_sovereignty_country: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    const qs = params.toString() ? `?${params}` : ''
    const data = await apiFetch(`/api/privacy/residency${qs}`).then(r => r.json()).catch(() => [])
    setPolicies(Array.isArray(data) ? data : [])
  }, [activeConnectionId])

  useEffect(() => { load() }, [load])

  function toggleRegion(list: 'allowed_regions' | 'prohibited_regions', region: string) {
    setForm(f => {
      const current = f[list]
      return { ...f, [list]: current.includes(region) ? current.filter(r => r !== region) : [...current, region] }
    })
  }

  async function handleAdd() {
    setSaving(true)
    try {
      const r = await apiFetch('/api/privacy/residency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!r.ok) { alert('Save failed. Please try again.'); return }
      setShowAdd(false)
      setForm({ asset_id: '', domain_id: '', allowed_regions: [], prohibited_regions: [], data_sovereignty_country: '', notes: '' })
      load()
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    const r = await apiFetch(`/api/privacy/residency/${id}`, { method: 'DELETE' })
    if (!r.ok) { alert('Delete failed. Please try again.'); return }
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '14.5px' }}>Data Residency Policies</div>
          <button onClick={() => setShowAdd(true)} style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, fontSize: '12px' }}>+ Add Policy</button>
        </div>
        {policies.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '10px' }}>No residency policies configured</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Scope', 'Allowed Regions', 'Prohibited Regions', 'Sovereignty', 'Notes', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {policies.map(p => (
                <tr key={p.residency_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>{p.asset_id ? `asset:${p.asset_id.slice(0, 8)}…` : p.domain_id ? `domain:${p.domain_id.slice(0, 8)}…` : 'Global'}</td>
                  <td style={{ padding: '10px' }}>{p.allowed_regions.length > 0 ? p.allowed_regions.map(r => <span key={r} style={{ display: 'inline-block', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', borderRadius: '4px', padding: '1px 6px', fontSize: '11px', marginRight: '4px' }}>{r}</span>) : '—'}</td>
                  <td style={{ padding: '10px' }}>{p.prohibited_regions.length > 0 ? p.prohibited_regions.map(r => <span key={r} style={{ display: 'inline-block', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', borderRadius: '4px', padding: '1px 6px', fontSize: '11px', marginRight: '4px' }}>{r}</span>) : '—'}</td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>{p.data_sovereignty_country ?? '—'}</td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes ?? '—'}</td>
                  <td style={{ padding: '10px' }}><button onClick={() => handleDelete(p.residency_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-error-text)', fontSize: '12px' }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && (
        <Modal title="Add Residency Policy" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><label style={lbl}>Asset ID (optional)</label><input style={inp} value={form.asset_id} onChange={e => setForm(f => ({ ...f, asset_id: e.target.value }))} placeholder="Leave blank for domain or global scope" /></div>
            <div><label style={lbl}>Domain ID (optional)</label><input style={inp} value={form.domain_id} onChange={e => setForm(f => ({ ...f, domain_id: e.target.value }))} placeholder="Leave blank for global scope" /></div>
            <div><label style={lbl}>Allowed Regions</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {REGIONS.map(r => <button key={r} type="button" onClick={() => toggleRegion('allowed_regions', r)} style={{ padding: '3px 10px', borderRadius: '5px', border: `1px solid ${form.allowed_regions.includes(r) ? 'var(--status-ok-text)' : 'var(--border)'}`, background: form.allowed_regions.includes(r) ? 'var(--status-ok-bg)' : 'transparent', color: form.allowed_regions.includes(r) ? 'var(--status-ok-text)' : 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>{r}</button>)}
              </div>
            </div>
            <div><label style={lbl}>Prohibited Regions</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {REGIONS.map(r => <button key={r} type="button" onClick={() => toggleRegion('prohibited_regions', r)} style={{ padding: '3px 10px', borderRadius: '5px', border: `1px solid ${form.prohibited_regions.includes(r) ? 'var(--status-error-text)' : 'var(--border)'}`, background: form.prohibited_regions.includes(r) ? 'var(--status-error-bg)' : 'transparent', color: form.prohibited_regions.includes(r) ? 'var(--status-error-text)' : 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>{r}</button>)}
              </div>
            </div>
            <div><label style={lbl}>Data Sovereignty Country</label><input style={inp} value={form.data_sovereignty_country} onChange={e => setForm(f => ({ ...f, data_sovereignty_country: e.target.value }))} placeholder="e.g. Germany" /></div>
            <div><label style={lbl}>Notes</label><textarea style={{ ...inp, height: '60px', resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <button onClick={handleAdd} disabled={saving} style={{ ...submitBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Add Policy'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PrivacyPage() {
  const [tab, setTab] = useState<Tab>('masking')
  const [domainSummary, setDomainSummary] = useState<DomainSummary[]>([])
  const [domainSummaryLoading, setDomainSummaryLoading] = useState(true)
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })

  useEffect(() => {
    function onConnChanged(e: Event) {
      setActiveConnectionId((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    const qs = params.toString() ? `?${params}` : ''
    apiFetch(`/api/classifications/summary${qs}`)
      .then(r => r.json())
      .then(data => {
        if (data && Array.isArray(data.domains)) setDomainSummary(data.domains as DomainSummary[])
      })
      .catch(() => {})
      .finally(() => setDomainSummaryLoading(false))
  }, [activeConnectionId])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'masking', label: 'Data Masking' },
    { key: 'dsr', label: 'Subject Requests' },
    { key: 'consent', label: 'Consent' },
    { key: 'residency', label: 'Data Residency' },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>Workspace · <span style={{ color: 'var(--text-secondary)' }}>Privacy</span></div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>Data Protection & Privacy</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>Manage masking policies, data subject requests, consent records, and residency requirements</p>

      {/* Sensitivity by Domain */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '20px' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>Sensitivity by Domain</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>classified assets per domain</span>
        </div>
        {domainSummaryLoading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading…</div>
        ) : domainSummary.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No classified assets found</div>
        ) : (
          <div>
            {domainSummary.map((d, i) => (
              <div key={d.name} style={{ borderBottom: i < domainSummary.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div
                  onClick={() => setExpandedDomains(prev => {
                    const next = new Set(prev)
                    if (next.has(d.name)) { next.delete(d.name) } else { next.add(d.name) }
                    return next
                  })}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '10px' }}>
                    {expandedDomains.has(d.name) ? '▼' : '▶'}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--foreground)', flex: 1 }}>{d.name}</span>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {Object.entries(d.counts).map(([cls, count]) => (
                      <span key={cls} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <SensitivityBadge classification={cls} />
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{count}</span>
                      </span>
                    ))}
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', minWidth: '30px', textAlign: 'right' }}>
                    {d.total}
                  </span>
                </div>
                {expandedDomains.has(d.name) && (
                  <div style={{ padding: '0 20px 10px 40px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {Object.entries(d.counts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cls, count]) => (
                        <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
                          <SensitivityBadge classification={cls} />
                          <span>{count} asset{count > 1 ? 's' : ''}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 18px', border: 'none', cursor: 'pointer', fontWeight: tab === t.key ? 600 : 400,
            fontSize: '13px', background: 'transparent',
            color: tab === t.key ? 'var(--brand-primary)' : 'var(--text-secondary)',
            borderBottom: tab === t.key ? '2px solid var(--brand-primary)' : '2px solid transparent',
            marginBottom: '-1px', transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'masking' && <MaskingTab activeConnectionId={activeConnectionId} />}
      {tab === 'dsr' && <DSRTab activeConnectionId={activeConnectionId} />}
      {tab === 'consent' && <ConsentTab activeConnectionId={activeConnectionId} />}
      {tab === 'residency' && <ResidencyTab activeConnectionId={activeConnectionId} />}
    </div>
  )
}
