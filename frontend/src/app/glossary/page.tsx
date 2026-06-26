'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import EntityComments from '@/components/EntityComments'
import { apiFetch } from '@/lib/apiFetch'

interface GlossaryTerm {
  id: string; name: string; definition: string; domain: string
  synonyms: string[]; owner: string; linkedAssets: number
  status: 'approved' | 'active' | 'draft' | 'deprecated' | 'pending_review'
  reviewedBy: string; reviewNote: string; reviewedAt: string
}

interface LinkedAsset {
  link_id: string
  asset_id: string
  column_name: string | null
  sf_table_name: string | null
  created_at: string | null
}

interface CatalogAsset {
  asset_id: string
  sf_table_name: string | null
  sf_schema_name: string | null
  sf_database_name: string | null
  connection_name: string | null
}

const DOMAINS = ['All', 'Revenue', 'Finance', 'Operations', 'Planning', 'GTM', 'HR', 'Others']
type StatusFilter = 'all' | 'approved' | 'pending_review' | 'draft' | 'deprecated'

function statusBadge(s: string): { bg: string; color: string } {
  if (s === 'approved' || s === 'active') return { bg: 'var(--status-ok-bg)', color: 'var(--status-ok-text)' }
  if (s === 'pending_review') return { bg: 'var(--status-info-bg)', color: 'var(--status-info-text)' }
  if (s === 'draft') return { bg: 'var(--status-warn-bg)', color: 'var(--status-warn-text)' }
  return { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' }
}

function leftBorderColor(s: string): string {
  if (s === 'approved' || s === 'active') return 'var(--status-ok-text)'
  if (s === 'pending_review') return 'var(--status-info-text)'
  if (s === 'draft') return 'var(--status-warn-text)'
  return 'var(--border)'
}

function statusLabel(s: string): string {
  if (s === 'active') return 'approved'
  if (s === 'pending_review') return 'pending review'
  return s
}

function TermParamReader({ onTermId }: { onTermId: (id: string) => void }) {
  const params = useSearchParams()
  const id = params.get('term')
  useEffect(() => { if (id) onTermId(id) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function GlossaryInner() {
  const [domain, setDomain] = useState('All')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [terms, setTerms] = useState<GlossaryTerm[]>([])
  const [loading, setLoading] = useState(true)
  const [autoTermId, setAutoTermId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [popup, setPopup] = useState<GlossaryTerm | null>(null)
  const [termForm, setTermForm] = useState({ name: '', definition: '', domain: 'Revenue', synonyms: '', owner: '', status: 'draft' as 'approved' | 'draft' | 'deprecated' })
  const [editTerm, setEditTerm] = useState<GlossaryTerm | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; definition: string; domain: string; synonyms: string; owner: string; status: 'approved' | 'draft' | 'deprecated' }>({ name: '', definition: '', domain: '', synonyms: '', owner: '', status: 'draft' })
  const [editSaving, setEditSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<{ role: string; domain_id: string | null } | null>(null)
  const [rejectTarget, setRejectTarget] = useState<GlossaryTerm | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [popupLinkedAssets, setPopupLinkedAssets] = useState<LinkedAsset[]>([])
  const [popupLinkedLoading, setPopupLinkedLoading] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [catalogAssets, setCatalogAssets] = useState<CatalogAsset[]>([])
  const [linkAssetId, setLinkAssetId] = useState('')
  const [linkColumnName, setLinkColumnName] = useState('')
  const [linkSearch, setLinkSearch] = useState('')
  const [linking, setLinking] = useState(false)
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/glossary')
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setTerms(items.map((t: Record<string, unknown>, i: number) => ({
          id: String(t.term_id ?? t.id ?? i),
          name: String(t.term_name ?? t.name ?? ''),
          definition: String(t.definition ?? ''),
          domain: String(t.domain_name ?? t.domain ?? ''),
          synonyms: Array.isArray(t.synonyms)
            ? t.synonyms as string[]
            : (typeof t.synonyms === 'string' && t.synonyms
                ? t.synonyms.split(',').map((s: string) => s.trim()).filter(Boolean)
                : []),
          owner: String(t.owner_email ?? t.owner ?? ''),
          linkedAssets: Number(t.linked_asset_count ?? t.linked_assets ?? t.linkedAssets ?? 0),
          status: (['approved', 'active', 'draft', 'deprecated', 'pending_review'] as const).includes(
            t.status as 'approved' | 'active' | 'draft' | 'deprecated' | 'pending_review'
          ) ? (t.status as GlossaryTerm['status']) : 'draft',
          reviewedBy: String(t.reviewed_by ?? ''),
          reviewNote: String(t.review_note ?? ''),
          reviewedAt: String(t.reviewed_at ?? ''),
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Open term from ?term= deep link once terms are loaded
  useEffect(() => {
    if (!autoTermId || loading || terms.length === 0) return
    const target = terms.find(t => t.id === autoTermId)
    if (target) openPopup(target)
  }, [autoTermId, loading, terms]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiFetch('/api/me')
      .then(r => r.json())
      .then(data => setCurrentUser({ role: data.role ?? 'viewer', domain_id: data.domain_id ?? null }))
      .catch(() => setCurrentUser({ role: 'viewer', domain_id: null }))
  }, [])

  const addTerm = async () => {
    if (!termForm.name) return
    try {
      const res = await apiFetch('/api/glossary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term_name: termForm.name, definition: termForm.definition,
          synonyms: termForm.synonyms || null, status: termForm.status,
          owner_email: termForm.owner || null,
        }),
      })
      const created = await res.json()
      const newTerm: GlossaryTerm = {
        id: String(created.term_id ?? `g${Date.now()}`), name: termForm.name,
        definition: termForm.definition, domain: termForm.domain,
        synonyms: termForm.synonyms.split(',').map(s => s.trim()).filter(Boolean),
        owner: termForm.owner || 'Unassigned', linkedAssets: 0, status: termForm.status,
        reviewedBy: '', reviewNote: '', reviewedAt: '',
      }
      setTerms(prev => [newTerm, ...prev])
    } catch {
      const newTerm: GlossaryTerm = {
        id: `g${Date.now()}`, name: termForm.name, definition: termForm.definition,
        domain: termForm.domain,
        synonyms: termForm.synonyms.split(',').map(s => s.trim()).filter(Boolean),
        owner: termForm.owner || 'Unassigned', linkedAssets: 0, status: termForm.status,
        reviewedBy: '', reviewNote: '', reviewedAt: '',
      }
      setTerms(prev => [newTerm, ...prev])
    }
    setShowAdd(false)
    setTermForm({ name: '', definition: '', domain: 'Finance', synonyms: '', owner: '', status: 'draft' })
  }

  const updateTerm = async () => {
    if (!editTerm || !editForm.name) return
    setEditSaving(true)
    try {
      const res = await apiFetch('/api/glossary', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editTerm.id,
          term_name: editForm.name,
          definition: editForm.definition,
          synonyms: editForm.synonyms || null,
          status: editForm.status,
          owner_email: editForm.owner || null,
        }),
      })
      if (!res.ok) throw new Error(`Update failed: ${res.status}`)
      setTerms(prev => prev.map(t => t.id === editTerm.id
        ? { ...t, name: editForm.name, definition: editForm.definition, status: editForm.status, owner: editForm.owner,
            synonyms: editForm.synonyms.split(',').map(s => s.trim()).filter(Boolean) } : t))
      setEditTerm(null)
    } catch (err) {
      console.error(err)
    } finally {
      setEditSaving(false)
    }
  }

  const doAction = async (termId: string, action: string, body: object = {}): Promise<boolean> => {
    setActionLoading(termId)
    setActionError(null)
    try {
      const res = await apiFetch(`/api/glossary/${termId}?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 403) { setActionError("You don't have permission to perform this action"); return false }
      if (res.status === 400) { setActionError('This term is no longer in the expected state — refresh and try again'); return false }
      if (!res.ok) { setActionError('Action failed — please try again'); return false }
      const updated = await res.json()
      setTerms(prev => prev.map(t => t.id === termId ? {
        ...t,
        status: updated.status as GlossaryTerm['status'],
        reviewedBy: String(updated.reviewed_by ?? ''),
        reviewNote: String(updated.review_note ?? ''),
        reviewedAt: String(updated.reviewed_at ?? ''),
      } : t))
      return true
    } catch { setActionError('Action failed — please try again'); return false }
    finally { setActionLoading(null) }
  }

  const deleteTerm = async (term: GlossaryTerm) => {
    if (!confirm(`Delete term "${term.name}"?`)) return
    setDeletingId(term.id)
    try {
      const res = await apiFetch(`/api/glossary?id=${term.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
      setTerms(prev => prev.filter(t => t.id !== term.id))
      if (popup?.id === term.id) setPopup(null)
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingId(null)
    }
  }

  async function openPopup(term: GlossaryTerm) {
    setPopup(term)
    setLinkError(null)
    setPopupLinkedAssets([])
    setPopupLinkedLoading(true)
    try {
      const res = await apiFetch(`/api/glossary/${term.id}`)
      if (res.ok) {
        const data = await res.json()
        setPopupLinkedAssets(data.linked_assets ?? [])
      }
    } catch {
      // linked assets will remain empty
    } finally {
      setPopupLinkedLoading(false)
    }
  }

  async function unlinkAsset(termId: string, linkId: string) {
    setUnlinkingId(linkId)
    try {
      const res = await apiFetch(`/api/glossary/${termId}?link_id=${linkId}`, { method: 'DELETE' })
      if (res.ok) {
        setPopupLinkedAssets(prev => prev.filter(a => a.link_id !== linkId))
        setTerms(prev => prev.map(t =>
          t.id === termId ? { ...t, linkedAssets: Math.max(0, t.linkedAssets - 1) } : t
        ))
      }
    } catch {
      setLinkError('Failed to unlink asset')
    } finally {
      setUnlinkingId(null)
    }
  }

  async function openLinkModal(termId: string) {
    setShowLinkModal(true)
    setLinkAssetId('')
    setLinkColumnName('')
    setLinkSearch('')
    if (catalogAssets.length === 0) {
      try {
        const res = await apiFetch('/api/catalog')
        if (res.ok) {
          const data = await res.json()
          setCatalogAssets(Array.isArray(data) ? data : [])
        }
      } catch {
        // catalog assets remain empty
      }
    }
  }

  async function submitLink(termId: string) {
    if (!linkAssetId) return
    setLinking(true)
    try {
      const res = await apiFetch(`/api/glossary/${termId}?action=link-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: linkAssetId, column_name: linkColumnName || null }),
      })
      if (res.ok) {
        const link = await res.json()
        const asset = catalogAssets.find(a => a.asset_id === linkAssetId)
        setPopupLinkedAssets(prev => [...prev, {
          link_id: link.link_id,
          asset_id: linkAssetId,
          column_name: linkColumnName || null,
          sf_table_name: asset?.sf_table_name ?? null,
          created_at: link.created_at ?? null,
        }])
        setTerms(prev => prev.map(t =>
          t.id === termId ? { ...t, linkedAssets: t.linkedAssets + 1 } : t
        ))
        setShowLinkModal(false)
        setLinkError(null)
      }
    } catch {
      setLinkError('Failed to link asset')
    } finally {
      setLinking(false)
    }
  }

  const filtered = terms.filter(t => {
    if (domain !== 'All' && t.domain !== domain) return false
    if (statusFilter !== 'all') {
      if (statusFilter === 'approved') {
        if (t.status !== 'approved' && t.status !== 'active') return false
      } else {
        if (t.status !== statusFilter) return false
      }
    }
    if (search) {
      const q = search.toLowerCase()
      if (!t.name.toLowerCase().includes(q) && !t.definition.toLowerCase().includes(q)) return false
    }
    return true
  })

  const approved = terms.filter(t => t.status === 'approved' || t.status === 'active').length
  const draft = terms.filter(t => t.status === 'draft').length
  const isReviewer = currentUser?.role === 'admin' || currentUser?.role === 'domain_owner'

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>
      <Suspense fallback={null}>
        <TermParamReader onTermId={setAutoTermId} />
      </Suspense>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Glossary</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{terms.length} terms</span>
        {approved > 0 && <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{approved} approved</span>}
        {draft > 0 && <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{draft} draft</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search terms…"
            style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: '11px', outline: 'none', width: '140px' }} />
          <button onClick={() => setShowAdd(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Term</button>
        </div>
      </div>

      {/* domain tabs + status filter pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '9px', color: 'var(--text-faint, var(--text-muted))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '2px' }}>Domain</span>
        {DOMAINS.map(d => (
          <button key={d} onClick={() => setDomain(d)} style={{
            padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: domain === d ? '#1a1a1a' : 'var(--surface-muted)',
            color: domain === d ? '#fff' : 'var(--text-secondary)',
            fontWeight: domain === d ? 600 : 400, fontSize: '11px',
          }}>{d}</button>
        ))}
        <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 8px' }} />
        <span style={{ fontSize: '9px', color: 'var(--text-faint, var(--text-muted))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '2px' }}>Status</span>
        {([['all', 'All'], ['approved', 'Approved'], ['pending_review', 'Pending Review'], ['draft', 'Draft'], ['deprecated', 'Deprecated']] as [StatusFilter, string][]).map(([f, l]) => (
          <button key={f} onClick={() => setStatusFilter(f)} style={{
            padding: '3px 8px', borderRadius: '5px', border: `1px solid ${statusFilter === f ? 'var(--accent)' : 'var(--border)'}`,
            background: statusFilter === f ? 'var(--accent-bg)' : 'transparent',
            color: statusFilter === f ? 'var(--accent)' : 'var(--text-muted)', fontSize: '10px', cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>

      {actionError && (
        <div style={{ padding: '6px 10px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', borderRadius: '6px', fontSize: '11px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {actionError}
          <button onClick={() => setActionError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '14px', lineHeight: 1 }}>✕</button>
        </div>
      )}

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
            <div key={term.id} onClick={() => openPopup(term)}
              style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 50px', gap: '0 8px', alignItems: 'center', padding: '5px 6px', borderLeft: `2px solid ${leftBorderColor(term.status)}`, borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)' }}>{term.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{term.definition}</div>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', flexShrink: 0 }}>
                  {term.status === 'draft' && (
                    <button
                      onClick={e => { e.stopPropagation(); doAction(term.id, 'submit') }}
                      disabled={actionLoading === term.id}
                      style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--status-info-text)', background: 'var(--status-info-bg)', fontSize: '10px', cursor: actionLoading === term.id ? 'not-allowed' : 'pointer', color: 'var(--status-info-text)', opacity: actionLoading === term.id ? 0.6 : 1 }}>
                      {actionLoading === term.id ? '…' : 'Submit'}
                    </button>
                  )}
                  {term.status === 'pending_review' && isReviewer && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); doAction(term.id, 'approve') }}
                        disabled={actionLoading === term.id}
                        style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'var(--status-ok-bg)', fontSize: '10px', cursor: actionLoading === term.id ? 'not-allowed' : 'pointer', color: 'var(--status-ok-text)', opacity: actionLoading === term.id ? 0.6 : 1 }}>
                        {actionLoading === term.id ? '…' : 'Approve'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setRejectTarget(term); setRejectNote('') }}
                        style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: 'pointer', color: 'var(--status-error-text)' }}>
                        Reject
                      </button>
                    </>
                  )}
                  <button onClick={e => { e.stopPropagation(); setEditTerm(term); setEditForm({ name: term.name, definition: term.definition, domain: term.domain, synonyms: term.synonyms.join(', '), owner: term.owner, status: term.status === 'active' ? 'approved' : term.status === 'pending_review' ? 'draft' : term.status }) }}
                    style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: 'pointer', color: 'var(--text-secondary)' }}>Edit</button>
                  <button onClick={e => { e.stopPropagation(); deleteTerm(term) }} disabled={deletingId === term.id}
                    style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: deletingId === term.id ? 'not-allowed' : 'pointer', color: 'var(--status-error-text)', opacity: deletingId === term.id ? 0.6 : 1 }}>
                    {deletingId === term.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{term.domain}</span>
              <span style={{ background: st.bg, color: st.color, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textTransform: 'capitalize', display: 'inline-block' }}>{statusLabel(term.status)}</span>
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
              {(() => { const st = statusBadge(popup.status); return <span style={{ background: st.bg, color: st.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, textTransform: 'capitalize' }}>{statusLabel(popup.status)}</span> })()}
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1 }}>{popup.name}</span>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
              {[['Domain', popup.domain], ['Owner', popup.owner], ['Assets', String(popup.linkedAssets)]].map(([l, v], i) => (
                <div key={l} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
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
              {popup.status === 'draft' && popup.reviewNote && (
                <div style={{ borderRadius: '6px', border: '1px solid var(--status-warn-text)', background: 'var(--status-warn-bg)', padding: '8px 12px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--status-warn-text)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Returned with feedback</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{popup.reviewNote}</div>
                  {popup.reviewedBy && (
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      — {popup.reviewedBy}{popup.reviewedAt ? ` on ${popup.reviewedAt.slice(0, 10)}` : ''}
                    </div>
                  )}
                </div>
              )}
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

            {/* Linked Assets section */}
            <div style={{ padding: '0 14px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
                  Linked Assets
                </span>
                <button
                  onClick={() => openLinkModal(popup.id)}
                  style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                >
                  + Link Asset
                </button>
              </div>
              {linkError && (
                <div style={{ fontSize: '10px', color: 'var(--status-error-text)', marginBottom: '4px' }}>{linkError}</div>
              )}
              {popupLinkedLoading && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Loading…</div>
              )}
              {!popupLinkedLoading && popupLinkedAssets.length === 0 && (
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>No assets linked yet</div>
              )}
              {!popupLinkedLoading && popupLinkedAssets.map(la => (
                <div key={la.link_id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid var(--surface-muted)' }}>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {la.sf_table_name ?? la.asset_id}
                    {la.column_name && (
                      <span style={{ color: 'var(--text-muted)' }}>.{la.column_name}</span>
                    )}
                  </span>
                  <button
                    onClick={() => unlinkAsset(popup.id, la.link_id)}
                    disabled={unlinkingId === la.link_id}
                    style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--status-error-text)', cursor: unlinkingId === la.link_id ? 'not-allowed' : 'pointer', opacity: unlinkingId === la.link_id ? 0.6 : 1 }}
                  >
                    {unlinkingId === la.link_id ? '…' : 'Unlink'}
                  </button>
                </div>
              ))}
            </div>

            <div style={{ padding: '0 14px 16px' }}>
              <EntityComments entityType="glossary_term" entityId={popup.id} />
            </div>

            {/* Link Asset modal (inline within popup) */}
            {showLinkModal && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                <div style={{ background: 'var(--surface)', borderRadius: '10px', padding: '20px', width: '340px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)' }}>Link Asset to Term</div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Search Assets</label>
                    <input
                      value={linkSearch}
                      onChange={e => setLinkSearch(e.target.value)}
                      placeholder="Filter by table name…"
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '11px', outline: 'none', boxSizing: 'border-box' as const }}
                    />
                    <select
                      value={linkAssetId}
                      onChange={e => setLinkAssetId(e.target.value)}
                      size={5}
                      style={{ width: '100%', marginTop: '4px', padding: '4px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '11px', outline: 'none', fontFamily: 'monospace' }}
                    >
                      {catalogAssets
                        .filter(a => !linkSearch || (a.sf_table_name ?? '').toLowerCase().includes(linkSearch.toLowerCase()))
                        .slice(0, 50)
                        .map(a => (
                          <option key={a.asset_id} value={a.asset_id}>
                            {a.sf_table_name ?? a.asset_id}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Column name (optional)</label>
                    <input
                      value={linkColumnName}
                      onChange={e => setLinkColumnName(e.target.value)}
                      placeholder="e.g. customer_id"
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '11px', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'monospace' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowLinkModal(false); setLinkError(null) }} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
                    <button
                      onClick={() => submitLink(popup.id)}
                      disabled={!linkAssetId || linking}
                      style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: (!linkAssetId || linking) ? 'not-allowed' : 'pointer', opacity: (!linkAssetId || linking) ? 0.6 : 1 }}
                    >
                      {linking ? 'Linking…' : 'Link'}
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                    {DOMAINS.filter(d => d !== 'All').map(d => <option key={d}>{d}</option>)}
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

      {editTerm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '440px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Edit Term</div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Term Name *</label>
              <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Definition</label>
              <textarea value={editForm.definition} onChange={e => setEditForm(p => ({ ...p, definition: e.target.value }))} rows={3}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Status</label>
              <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value as 'approved' | 'draft' | 'deprecated' }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }}>
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Synonyms (comma-separated)</label>
              <input value={editForm.synonyms} onChange={e => setEditForm(p => ({ ...p, synonyms: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditTerm(null)}
                style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={updateTerm} disabled={editSaving || !editForm.name}
                style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (editSaving || !editForm.name) ? 'not-allowed' : 'pointer', opacity: (editSaving || !editForm.name) ? 0.6 : 1 }}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Reject Term</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Returning <strong>{rejectTarget.name}</strong> to draft. Explain what needs to change.
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Feedback (required)</label>
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                rows={3}
                placeholder="Explain what needs to be revised..."
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setRejectTarget(null); setRejectNote('') }}
                style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  const ok = await doAction(rejectTarget.id, 'reject', { review_note: rejectNote })
                  if (ok) { setRejectTarget(null); setRejectNote('') }
                }}
                disabled={!rejectNote.trim() || actionLoading === rejectTarget.id}
                style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--status-error-text)', color: '#fff', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (!rejectNote.trim() || actionLoading === rejectTarget.id) ? 'not-allowed' : 'pointer', opacity: (!rejectNote.trim() || actionLoading === rejectTarget.id) ? 0.6 : 1 }}>
                {actionLoading === rejectTarget.id ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function GlossaryPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}>
      <GlossaryInner />
    </Suspense>
  )
}
