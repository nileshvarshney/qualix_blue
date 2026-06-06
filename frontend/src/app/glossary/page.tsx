'use client'
import { useState, useEffect } from 'react'

interface GlossaryTerm {
  id: string; name: string; definition: string; domain: string
  synonyms: string[]; owner: string; linkedAssets: number
  status: 'approved' | 'draft' | 'deprecated'
}

const DOMAINS = ['All', 'Finance', 'Sales', 'Marketing', 'Supply Chain', 'Engineering']
type StatusFilter = 'all' | 'approved' | 'draft' | 'deprecated'

function statusBadge(s: string): { bg: string; color: string } {
  if (s === 'approved') return { bg: 'var(--status-ok-bg)', color: 'var(--status-ok-text)' }
  if (s === 'draft') return { bg: 'var(--status-warn-bg)', color: 'var(--status-warn-text)' }
  return { bg: 'var(--surface-muted)', color: 'var(--text-muted)' }
}

function leftBorderColor(s: string): string {
  if (s === 'approved') return 'var(--status-ok-text)'
  if (s === 'draft') return 'var(--status-warn-text)'
  return 'var(--border)'
}

export default function GlossaryPage() {
  const [search, setSearch] = useState('')
  const [domain, setDomain] = useState('All')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [terms, setTerms] = useState<GlossaryTerm[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [popup, setPopup] = useState<GlossaryTerm | null>(null)
  const [termForm, setTermForm] = useState({ name: '', definition: '', domain: 'Finance', synonyms: '', owner: '', status: 'draft' as 'approved' | 'draft' | 'deprecated' })

  useEffect(() => {
    fetch('/api/glossary')
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setTerms(items.map((t: Record<string, unknown>, i: number) => ({
          id: String(t.term_id ?? t.id ?? i),
          name: String(t.term_name ?? t.name ?? ''),
          definition: String(t.definition ?? ''),
          domain: String(t.domain ?? ''),
          synonyms: Array.isArray(t.synonyms) ? t.synonyms as string[] : [],
          owner: String(t.owner ?? ''),
          linkedAssets: Number(t.linked_assets ?? t.linkedAssets ?? 0),
          status: (t.status as 'approved' | 'draft' | 'deprecated') ?? 'draft',
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const addTerm = () => {
    if (!termForm.name) return
    const newTerm: GlossaryTerm = {
      id: `g${Date.now()}`, name: termForm.name, definition: termForm.definition,
      domain: termForm.domain,
      synonyms: termForm.synonyms.split(',').map(s => s.trim()).filter(Boolean),
      owner: termForm.owner || 'Unassigned', linkedAssets: 0, status: termForm.status,
    }
    setTerms(prev => [newTerm, ...prev])
    setShowAdd(false)
    setTermForm({ name: '', definition: '', domain: 'Finance', synonyms: '', owner: '', status: 'draft' })
  }

  const filtered = terms.filter(t => {
    if (domain !== 'All' && t.domain !== domain) return false
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.definition.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const approved = terms.filter(t => t.status === 'approved').length
  const draft = terms.filter(t => t.status === 'draft').length

  return (
    <div style={{ padding: '10px 16px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Glossary</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{terms.length} terms</span>
        {approved > 0 && <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{approved} approved</span>}
        {draft > 0 && <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{draft} draft</span>}
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => setShowAdd(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Term</button>
        </div>
      </div>

      {/* domain tabs + status filter pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
        {DOMAINS.map(d => (
          <button key={d} onClick={() => setDomain(d)} style={{
            padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: domain === d ? '#1a1a1a' : 'var(--surface-muted)',
            color: domain === d ? '#fff' : 'var(--text-secondary)',
            fontWeight: domain === d ? 600 : 400, fontSize: '11px',
          }}>{d}</button>
        ))}
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 4px' }} />
        {([['all', 'All'], ['approved', 'Approved'], ['draft', 'Draft'], ['deprecated', 'Deprecated']] as [StatusFilter, string][]).map(([f, l]) => (
          <button key={f} onClick={() => setStatusFilter(f)} style={{
            padding: '3px 8px', borderRadius: '5px', border: `1px solid ${statusFilter === f ? 'var(--accent)' : 'var(--border)'}`,
            background: statusFilter === f ? 'var(--accent-bg)' : 'transparent',
            color: statusFilter === f ? 'var(--accent)' : 'var(--text-muted)', fontSize: '10px', cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>

      {/* column headers */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 50px', gap: '0 8px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['Term', 'Domain', 'Status', 'Assets'].map(h => (
            <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            {terms.length === 0 ? 'No glossary terms yet' : 'No terms match filters'}
          </div>
        )}
        {!loading && filtered.map(term => {
          const st = statusBadge(term.status)
          return (
            <div key={term.id} onClick={() => setPopup(term)}
              style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 50px', gap: '0 8px', alignItems: 'center', padding: '5px 6px', borderLeft: `2px solid ${leftBorderColor(term.status)}`, borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)' }}>{term.name}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{term.definition}</div>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{term.domain}</span>
              <span style={{ background: st.bg, color: st.color, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textTransform: 'capitalize', display: 'inline-block' }}>{term.status}</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: term.linkedAssets > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{term.linkedAssets}</span>
            </div>
          )
        })}
      </div>

      {/* slide-in detail panel */}
      {popup && (
        <>
          <div onClick={() => setPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              {(() => { const st = statusBadge(popup.status); return <span style={{ background: st.bg, color: st.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, textTransform: 'capitalize' }}>{popup.status}</span> })()}
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1 }}>{popup.name}</span>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
              {[['Domain', popup.domain], ['Owner', popup.owner], ['Assets', String(popup.linkedAssets)]].map(([l, v], i) => (
                <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v || '—'}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #e9d5ff' }}>
                <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', padding: '7px 12px' }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em' }}>📖 DEFINITION</span>
                </div>
                <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{popup.definition || '—'}</div>
              </div>
              {popup.synonyms.length > 0 && (
                <div>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Synonyms</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {popup.synonyms.map(s => (
                      <span key={s} style={{ background: 'var(--accent-bg)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500 }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Add Term Modal — keep existing logic, update colors to CSS vars */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowAdd(false)} />
          <div style={{ background: 'var(--surface)', borderRadius: '14px', width: '480px', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', position: 'relative', zIndex: 1 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--foreground)' }}>Add Glossary Term</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Define a new business term for the organization</div>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Term Name *</label>
                <input value={termForm.name} onChange={e => setTermForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. ARR, Churn Rate" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--foreground)' }} />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Definition *</label>
                <textarea value={termForm.definition} onChange={e => setTermForm(f => ({ ...f, definition: e.target.value }))} rows={3} placeholder="Clear, concise definition..." style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--foreground)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Domain</label>
                  <select value={termForm.domain} onChange={e => setTermForm(f => ({ ...f, domain: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', background: 'var(--surface)', color: 'var(--foreground)' }}>
                    {DOMAINS.filter(d => d !== 'All').map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Owner</label>
                  <input value={termForm.owner} onChange={e => setTermForm(f => ({ ...f, owner: e.target.value }))} placeholder="Team or person" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--foreground)' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Synonyms (comma-separated)</label>
                <input value={termForm.synonyms} onChange={e => setTermForm(f => ({ ...f, synonyms: e.target.value }))} placeholder="e.g. Revenue, Sales" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--foreground)' }} />
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addTerm} disabled={!termForm.name || !termForm.definition} style={{
                flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: termForm.name && termForm.definition ? 'pointer' : 'not-allowed',
                background: termForm.name && termForm.definition ? 'var(--accent)' : 'var(--border)',
                color: termForm.name && termForm.definition ? '#fff' : 'var(--text-muted)',
              }}>Add Term</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
