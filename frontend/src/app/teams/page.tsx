'use client'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface TeamMember {
  user_id: string
  email: string
  full_name: string
  role: string
}

interface Team {
  team_id: string
  team_name: string
  description: string | null
  is_active: boolean
  created_at: string
  member_count: number
  members: TeamMember[]
  membersLoaded: boolean
}

const GRID = '1fr 180px 70px 120px auto'

const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }

function mapTeam(t: Record<string, unknown>, i: number): Team {
  return {
    team_id:      String(t.team_id ?? t.id ?? i),
    team_name:    String(t.team_name ?? t.name ?? ''),
    description:  t.description as string | null ?? null,
    is_active:    t.is_active !== false,
    created_at:   String(t.created_at ?? ''),
    member_count: Number(t.member_count ?? 0),
    members:      [],
    membersLoaded: false,
  }
}

function mapMembers(data: Record<string, unknown>): TeamMember[] {
  const raw = Array.isArray(data.members) ? data.members as Record<string, unknown>[] : []
  return raw.map((m, i) => ({
    user_id:   String(m.user_id ?? m.id ?? i),
    email:     String(m.email ?? ''),
    full_name: String(m.full_name ?? m.name ?? m.email ?? ''),
    role:      String(m.role ?? 'viewer'),
  }))
}

export default function TeamsPage() {
  const [teams, setTeams]             = useState<Team[]>([])
  const [loading, setLoading]         = useState(true)
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null)

  // Create Team
  const [showCreate, setShowCreate]   = useState(false)
  const [createForm, setCreateForm]   = useState({ team_name: '', description: '' })
  const [createSaving, setCreateSaving] = useState(false)

  // Edit Team
  const [editTeamData, setEditTeamData] = useState<Team | null>(null)
  const [editForm, setEditForm]         = useState({ team_name: '', description: '' })
  const [editSaving, setEditSaving]     = useState(false)

  // Add Member
  const [addMemberTeam, setAddMemberTeam]   = useState<Team | null>(null)
  const [memberEmail, setMemberEmail]       = useState('')
  const [memberRole, setMemberRole]         = useState('viewer')
  const [addMemberSaving, setAddMemberSaving] = useState(false)

  // Delete Team
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/teams')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        setTeams((Array.isArray(data) ? data : []).map((t, i) => mapTeam(t, i)))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function toggleExpand(team: Team) {
    if (expandedId === team.team_id) { setExpandedId(null); return }
    setExpandedId(team.team_id)
    if (team.membersLoaded) return

    setLoadingMembers(team.team_id)
    apiFetch(`/api/teams/${team.team_id}`)
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        const members = mapMembers(data)
        setTeams(prev => prev.map(t => t.team_id === team.team_id
          ? { ...t, members, membersLoaded: true, member_count: members.length } : t))
      })
      .catch(() => {})
      .finally(() => setLoadingMembers(null))
  }

  async function createTeam() {
    if (!createForm.team_name) return
    setCreateSaving(true)
    try {
      const res = await apiFetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_name: createForm.team_name, description: createForm.description || null }),
      })
      if (!res.ok) throw new Error(`Failed to create team: ${res.status}`)
      const listRes = await apiFetch('/api/teams')
      if (!listRes.ok) throw new Error('Failed to reload teams')
      const data: Record<string, unknown>[] = await listRes.json()
      setTeams((Array.isArray(data) ? data : []).map((t, i) => mapTeam(t, i)))
      setShowCreate(false)
      setCreateForm({ team_name: '', description: '' })
    } catch (err) {
      console.error(err)
    } finally {
      setCreateSaving(false)
    }
  }

  async function saveEdit() {
    if (!editTeamData || !editForm.team_name) return
    setEditSaving(true)
    try {
      const res = await apiFetch(`/api/teams/${editTeamData.team_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_name: editForm.team_name, description: editForm.description || null }),
      })
      if (!res.ok) throw new Error(`Failed to update team: ${res.status}`)
      setTeams(prev => prev.map(t => t.team_id === editTeamData.team_id
        ? { ...t, team_name: editForm.team_name, description: editForm.description || null } : t))
      setEditTeamData(null)
    } catch (err) {
      console.error(err)
    } finally {
      setEditSaving(false)
    }
  }

  async function addMember() {
    if (!addMemberTeam || !memberEmail) return
    setAddMemberSaving(true)
    try {
      const res = await apiFetch(`/api/teams/${addMemberTeam.team_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add_member: { email: memberEmail, role: memberRole } }),
      })
      if (!res.ok) throw new Error(`Failed to add member: ${res.status}`)
      const memberRes = await apiFetch(`/api/teams/${addMemberTeam.team_id}`)
      if (!memberRes.ok) throw new Error('Failed to reload members')
      const data: Record<string, unknown> = await memberRes.json()
      const members = mapMembers(data)
      setTeams(prev => prev.map(t => t.team_id === addMemberTeam.team_id
        ? { ...t, members, membersLoaded: true, member_count: members.length } : t))
      setAddMemberTeam(null)
      setMemberEmail('')
      setMemberRole('viewer')
    } catch (err) {
      console.error(err)
    } finally {
      setAddMemberSaving(false)
    }
  }

  async function deleteTeam(team: Team) {
    if (!confirm(`Delete team "${team.team_name}"? This cannot be undone.`)) return
    setDeletingId(team.team_id)
    try {
      const res = await apiFetch(`/api/teams/${team.team_id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Failed to delete team: ${res.status}`)
      setTeams(prev => prev.filter(t => t.team_id !== team.team_id))
      if (expandedId === team.team_id) setExpandedId(null)
    } catch (err) {
      console.error(err)
    } finally {
      setDeletingId(null)
    }
  }

  const totalActive = teams.filter(t => t.is_active).length

  return (
    <div style={{ padding: '16px 24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Teams</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {loading ? 'Loading…' : `${teams.length} team${teams.length !== 1 ? 's' : ''} · ${totalActive} active`}
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
          + New Team
        </button>
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px', flexShrink: 0 }}>
        {[
          { label: 'Total Teams', value: teams.length, color: 'var(--accent)' },
          { label: 'Active',      value: totalActive,  color: 'var(--status-ok-text)' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: c.color, lineHeight: 1 }}>{loading ? '…' : c.value}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* column header */}
      {!loading && teams.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', padding: '0 12px', flexShrink: 0, borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
          {['Team', 'Description', 'Members', 'Created', 'Actions'].map((h, i) => (
            <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>}
        {!loading && teams.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>👥</div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>No teams yet</div>
            <div style={{ fontSize: 'var(--text-xs)' }}>Create a team to organize users and assign permissions</div>
          </div>
        )}

        {!loading && teams.map(team => {
          const isExpanded = expandedId === team.team_id
          const isDeleting = deletingId === team.team_id
          return (
            <div key={team.team_id}>
              <div
                onClick={() => toggleExpand(team)}
                style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', alignItems: 'center', padding: '7px 12px', background: isExpanded ? 'var(--surface-muted)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', minHeight: '40px', cursor: 'pointer', opacity: team.is_active ? 1 : 0.6 }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s', lineHeight: 1, flexShrink: 0 }}>▶</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.team_name}</div>
                    {!team.is_active && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>inactive</div>}
                  </div>
                </div>

                <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {team.description ?? '—'}
                </span>

                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--accent)' }}>{team.member_count}</span>

                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  {team.created_at ? new Date(team.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                </span>

                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => { setEditTeamData(team); setEditForm({ team_name: team.team_name, description: team.description ?? '' }) }}
                    disabled={editSaving && editTeamData?.team_id === team.team_id}
                    style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: (editSaving && editTeamData?.team_id === team.team_id) ? 'not-allowed' : 'pointer', opacity: (editSaving && editTeamData?.team_id === team.team_id) ? 0.6 : 1 }}>
                    Edit
                  </button>
                  <button
                    onClick={() => deleteTeam(team)}
                    disabled={isDeleting}
                    style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--status-error-text)', fontSize: '10px', cursor: isDeleting ? 'not-allowed' : 'pointer', opacity: isDeleting ? 0.6 : 1 }}>
                    Delete
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', padding: '10px 16px 10px 28px' }}>
                  {loadingMembers === team.team_id ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Loading members…</div>
                  ) : team.members.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>No members yet</span>
                      <button onClick={() => setAddMemberTeam(team)} style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: 'pointer', color: 'var(--accent)' }}>+ Add Member</button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {team.members.length} member{team.members.length !== 1 ? 's' : ''}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {team.members.map(m => (
                          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px' }}>
                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: 'var(--accent)' }}>
                              {m.full_name.split(' ').map((p: string) => p[0] ?? '').slice(0, 2).join('').toUpperCase() || '?'}
                            </div>
                            <div>
                              <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.2 }}>{m.full_name}</div>
                              <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>{m.email}</div>
                            </div>
                          </div>
                        ))}
                        <button onClick={() => setAddMemberTeam(team)} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: '6px', border: '1px dashed var(--border)', background: 'transparent', fontSize: '10px', cursor: 'pointer', color: 'var(--accent)' }}>
                          + Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Create Team Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>New Team</div>
            <div>
              <label style={labelStyle}>Team Name <span style={{ color: 'var(--status-error-text)' }}>*</span></label>
              <input
                style={inputStyle}
                type="text"
                value={createForm.team_name}
                onChange={e => setCreateForm(f => ({ ...f, team_name: e.target.value }))}
                placeholder="e.g. Data Engineering"
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Description <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
              <input
                style={inputStyle}
                type="text"
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short description"
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowCreate(false); setCreateForm({ team_name: '', description: '' }) }} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createTeam} disabled={createSaving || !createForm.team_name} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (createSaving || !createForm.team_name) ? 'not-allowed' : 'pointer', opacity: (createSaving || !createForm.team_name) ? 0.6 : 1 }}>{createSaving ? 'Saving…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Team Modal */}
      {editTeamData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Edit Team</div>
            <div>
              <label style={labelStyle}>Team Name <span style={{ color: 'var(--status-error-text)' }}>*</span></label>
              <input
                style={inputStyle}
                type="text"
                value={editForm.team_name}
                onChange={e => setEditForm(f => ({ ...f, team_name: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Description <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
              <input
                style={inputStyle}
                type="text"
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short description"
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setEditTeamData(null); setEditForm({ team_name: '', description: '' }) }} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveEdit} disabled={editSaving || !editForm.team_name} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (editSaving || !editForm.team_name) ? 'not-allowed' : 'pointer', opacity: (editSaving || !editForm.team_name) ? 0.6 : 1 }}>{editSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {addMemberTeam && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Add Member to {addMemberTeam.team_name}</div>
            <div>
              <label style={labelStyle}>User Email <span style={{ color: 'var(--status-error-text)' }}>*</span></label>
              <input
                style={inputStyle}
                type="email"
                value={memberEmail}
                onChange={e => setMemberEmail(e.target.value)}
                placeholder="user@example.com"
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Role</label>
              <select
                value={memberRole}
                onChange={e => setMemberRole(e.target.value)}
                style={{ ...inputStyle }}>
                <option value="admin">Admin</option>
                <option value="data_steward">Data Steward</option>
                <option value="data_engineer">Data Engineer</option>
                <option value="analyst">Analyst</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setAddMemberTeam(null); setMemberEmail(''); setMemberRole('viewer') }} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={addMember} disabled={addMemberSaving || !memberEmail} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (addMemberSaving || !memberEmail) ? 'not-allowed' : 'pointer', opacity: (addMemberSaving || !memberEmail) ? 0.6 : 1 }}>{addMemberSaving ? 'Saving…' : 'Add Member'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
