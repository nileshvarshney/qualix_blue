'use client'
import { useState, useEffect } from 'react'

interface GlossaryTerm {
  id: string; name: string; definition: string; domain: string
  synonyms: string[]; owner: string; linkedAssets: number
  status: 'approved' | 'draft' | 'deprecated'
}

const DOMAINS = ['All', 'Finance', 'Sales', 'Marketing', 'Supply Chain', 'Engineering']

function statusStyle(s: string) {
  if (s === 'approved') return { bg: '#dcfce7', color: '#16a34a' }
  if (s === 'draft') return { bg: '#fef3c7', color: '#d97706' }
  return { bg: '#f1f5f9', color: '#94a3b8' }
}

const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #ebe8df' }

export default function GlossaryPage() {
  const [search, setSearch] = useState('')
  const [domain, setDomain] = useState('All')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [terms, setTerms] = useState<GlossaryTerm[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

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
  const [termForm, setTermForm] = useState({ name: '', definition: '', domain: 'Finance', synonyms: '', owner: '', status: 'draft' as 'approved' | 'draft' | 'deprecated' })

  const addTerm = () => {
    if (!termForm.name) return
    const newTerm: GlossaryTerm = {
      id: `g${Date.now()}`, name: termForm.name, definition: termForm.definition,
      domain: termForm.domain, synonyms: termForm.synonyms.split(',').map(s => s.trim()).filter(Boolean),
      owner: termForm.owner || 'Unassigned', linkedAssets: 0, status: termForm.status,
    }
    setTerms(prev => [newTerm, ...prev])
    setShowAdd(false)
    setTermForm({ name: '', definition: '', domain: 'Finance', synonyms: '', owner: '', status: 'draft' })
  }

  const filtered = terms.filter(t => {
    if (domain !== 'All' && t.domain !== domain) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.definition.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Governance</span></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>Business Glossary</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Standardized business terminology across the organization · {terms.length} terms defined</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background: '#E8541A', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>+ Add Term</button>
      </div>

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 300px' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', opacity: 0.5 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search terms, definitions..."
            style={{ width: '100%', padding: '9px 12px 9px 38px', borderRadius: '8px', border: '1px solid #ebe8df', fontSize: '13px', background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {DOMAINS.map(d => (
            <button key={d} onClick={() => setDomain(d)} style={{
              padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 500,
              background: domain === d ? '#1a1a1a' : '#f8fafc', color: domain === d ? '#fff' : '#64748b',
            }}>{d}</button>
          ))}
        </div>
      </div>

      {/* Terms List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>No glossary terms yet</div>
        ) : null}
        {!loading && filtered.map(term => {
          const st = statusStyle(term.status)
          const isOpen = expanded === term.id
          return (
            <div key={term.id} style={{ ...card, padding: '0', overflow: 'hidden' }}>
              <div onClick={() => setExpanded(isOpen ? null : term.id)} style={{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', cursor: 'pointer',
                background: isOpen ? '#fafaf5' : '#fff', transition: 'background 0.15s',
              }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>📖</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#1a1a1a' }}>{term.name}</div>
                  <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isOpen ? 'normal' : 'nowrap' }}>{term.definition}</div>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>{term.domain}</span>
                <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 600, textTransform: 'capitalize', flexShrink: 0 }}>{term.status}</span>
                <span style={{ color: '#94a3b8', fontSize: '14px', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
              </div>
              {isOpen && (
                <div style={{ padding: '0 20px 16px', borderTop: '1px solid #f3f1ea' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginTop: '14px' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '6px' }}>SYNONYMS</div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {term.synonyms.map(s => (
                          <span key={s} style={{ background: '#f0f9ff', color: '#2563eb', padding: '3px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 500, border: '1px solid #bfdbfe' }}>{s}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '6px' }}>OWNER</div>
                      <div style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>{term.owner}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '6px' }}>LINKED ASSETS</div>
                      <div style={{ fontSize: '13px', color: '#2563eb', fontWeight: 600 }}>{term.linkedAssets} datasets</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add Term Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowAdd(false)} />
          <div style={{ background: '#fff', borderRadius: '14px', width: '480px', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', position: 'relative', zIndex: 1 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>Add Glossary Term</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Define a new business term for the organization</div>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Term Name *</label>
                <input value={termForm.name} onChange={e => setTermForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. ARR, Churn Rate" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Definition *</label>
                <textarea value={termForm.definition} onChange={e => setTermForm(f => ({ ...f, definition: e.target.value }))} rows={3} placeholder="Clear, concise definition..." style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Domain</label>
                  <select value={termForm.domain} onChange={e => setTermForm(f => ({ ...f, domain: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none' }}>
                    {DOMAINS.filter(d => d !== 'All').map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Owner</label>
                  <input value={termForm.owner} onChange={e => setTermForm(f => ({ ...f, owner: e.target.value }))} placeholder="Team or person" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Synonyms (comma-separated)</label>
                <input value={termForm.synonyms} onChange={e => setTermForm(f => ({ ...f, synonyms: e.target.value }))} placeholder="e.g. Revenue, Sales" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Status</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {(['draft', 'approved', 'deprecated'] as const).map(s => {
                    const st = statusStyle(s)
                    return (
                      <button key={s} type="button" onClick={() => setTermForm(f => ({ ...f, status: s }))} style={{
                        padding: '8px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', textTransform: 'capitalize',
                        border: termForm.status === s ? `2px solid ${st.color}` : '1px solid #e2e8f0',
                        background: termForm.status === s ? st.bg : '#fafaf9',
                        fontSize: '12px', fontWeight: termForm.status === s ? 700 : 500, color: termForm.status === s ? st.color : '#475569',
                      }}>{s}</button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #ebe8df', display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addTerm} disabled={!termForm.name || !termForm.definition} style={{
                flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: termForm.name && termForm.definition ? 'pointer' : 'not-allowed',
                background: termForm.name && termForm.definition ? '#E8541A' : '#e2e8f0',
                color: termForm.name && termForm.definition ? '#fff' : '#94a3b8'
              }}>Add Term</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
