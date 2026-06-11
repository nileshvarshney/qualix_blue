'use client'
import { useState, useEffect } from 'react'

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

export default function TeamsPage() {
  const [teams, setTeams]             = useState<Team[]>([])
  const [loading, setLoading]         = useState(true)
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/teams')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: Team[] = (Array.isArray(data) ? data : []).map((t, i) => ({
          team_id:      String(t.team_id ?? t.id ?? i),
          team_name:    String(t.team_name ?? t.name ?? ''),
          description:  t.description as string | null ?? null,
          is_active:    t.is_active !== false,
          created_at:   String(t.created_at ?? ''),
          member_count: Number(t.member_count ?? 0),
          members:      [],
          membersLoaded: false,
        }))
        setTeams(items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function toggleExpand(team: Team) {
    if (expandedId === team.team_id) { setExpandedId(null); return }
    setExpandedId(team.team_id)
    if (team.membersLoaded) return

    setLoadingMembers(team.team_id)
    fetch(`/api/teams/${team.team_id}`)
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        const raw = Array.isArray(data.members) ? data.members as Record<string, unknown>[] : []
        const members: TeamMember[] = raw.map((m, i) => ({
          user_id:   String(m.user_id ?? m.id ?? i),
          email:     String(m.email ?? ''),
          full_name: String(m.full_name ?? m.name ?? m.email ?? ''),
          role:      String(m.role ?? 'viewer'),
        }))
        setTeams(prev => prev.map(t => t.team_id === team.team_id
          ? { ...t, members, membersLoaded: true, member_count: members.length } : t))
      })
      .catch(() => {})
      .finally(() => setLoadingMembers(null))
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
        <button style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
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
                  <button style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>Edit</button>
                </div>
              </div>

              {isExpanded && (
                <div style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', padding: '10px 16px 10px 28px' }}>
                  {loadingMembers === team.team_id ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Loading members…</div>
                  ) : team.members.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>No members yet</span>
                      <button style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: 'pointer', color: 'var(--accent)' }}>+ Add Member</button>
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
                        <button style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: '6px', border: '1px dashed var(--border)', background: 'transparent', fontSize: '10px', cursor: 'pointer', color: 'var(--accent)' }}>
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
    </div>
  )
}
