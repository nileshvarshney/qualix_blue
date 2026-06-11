'use client'
import { useState, useEffect } from 'react'

type UserRole   = 'admin' | 'data_steward' | 'data_engineer' | 'analyst' | 'viewer' | string
type UserStatus = 'active' | 'inactive'
type FilterType = 'all' | 'admin' | 'active' | 'inactive'

interface AppUser {
  user_id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: string
  last_login: string | null
  domain_id: string | null
}

const ROLE_STYLE: Record<string, { background: string; color: string }> = {
  admin:           { background: '#fdf4ff', color: '#7e22ce' },
  data_steward:    { background: '#eff6ff', color: '#1d4ed8' },
  data_engineer:   { background: '#f0fdf4', color: '#15803d' },
  analyst:         { background: '#fef3c7', color: '#92400e' },
  viewer:          { background: 'var(--surface-muted)', color: 'var(--text-muted)' },
  domain_owner:    { background: '#fef3c7', color: '#92400e' },
  data_owner:      { background: '#f0fdf4', color: '#15803d' },
  auditor:         { background: 'var(--surface-muted)', color: 'var(--text-muted)' },
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0] ?? '').slice(0, 2).join('').toUpperCase() || '?'
}

const GRID = '36px 1fr 100px 80px 130px auto'

function RoleChip({ role }: { role: string }) {
  const st = ROLE_STYLE[role] ?? { background: 'var(--surface-muted)', color: 'var(--text-muted)' }
  return (
    <span style={{ ...st, padding: '1px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, display: 'inline-block' }}>
      {role.replace('_', ' ')}
    </span>
  )
}

export default function UsersPage() {
  const [users, setUsers]       = useState<AppUser[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<FilterType>('all')
  const [search, setSearch]     = useState('')
  const [deactivating, setDeactivating] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: AppUser[] = (Array.isArray(data) ? data : []).map((u, i) => ({
          user_id:    String(u.user_id ?? u.id ?? i),
          email:      String(u.email ?? ''),
          full_name:  String(u.full_name ?? u.name ?? u.email ?? ''),
          role:       String(u.role ?? 'viewer'),
          is_active:  u.is_active !== false,
          created_at: String(u.created_at ?? ''),
          last_login: u.last_login as string | null ?? null,
          domain_id:  u.domain_id as string | null ?? null,
        }))
        setUsers(items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const totalAdmins   = users.filter(u => u.role === 'admin').length
  const totalActive   = users.filter(u => u.is_active).length
  const totalInactive = users.filter(u => !u.is_active).length

  const filtered = users.filter(u => {
    const matchesFilter =
      filter === 'all'      ? true :
      filter === 'admin'    ? u.role === 'admin' :
      filter === 'active'   ? u.is_active :
      filter === 'inactive' ? !u.is_active : true
    const q = search.toLowerCase()
    const matchesSearch = !q || u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q)
    return matchesFilter && matchesSearch
  })

  function deactivate(user: AppUser) {
    if (!confirm(`Deactivate ${user.email}?`)) return
    setDeactivating(user.user_id)
    fetch(`/api/users/${user.user_id}`, { method: 'DELETE' })
      .then(() => setUsers(prev => prev.map(u => u.user_id === user.user_id ? { ...u, is_active: false } : u)))
      .catch(() => {})
      .finally(() => setDeactivating(null))
  }

  const CARDS = [
    { key: 'all',      label: 'Total',    value: users.length,    color: 'var(--accent)' },
    { key: 'active',   label: 'Active',   value: totalActive,     color: 'var(--status-ok-text)' },
    { key: 'admin',    label: 'Admins',   value: totalAdmins,     color: '#7e22ce' },
    { key: 'inactive', label: 'Inactive', value: totalInactive,   color: 'var(--text-muted)' },
  ] as const

  return (
    <div style={{ padding: '16px 24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Users</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {loading ? 'Loading…' : `${users.length} user${users.length !== 1 ? 's' : ''} · ${totalActive} active · ${totalAdmins} admin${totalAdmins !== 1 ? 's' : ''}`}
          </div>
        </div>
        <button style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
          + Invite User
        </button>
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', flexShrink: 0 }}>
        {CARDS.map(c => {
          const on = filter === c.key
          return (
            <div key={c.key} onClick={() => setFilter(p => p === c.key ? 'all' : c.key as FilterType)}
              style={{ background: on ? c.color : 'var(--surface)', border: `1px solid ${on ? c.color : 'var(--border)'}`, borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: on ? '#fff' : c.color, lineHeight: 1 }}>{loading ? '…' : c.value}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: on ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>{c.label}</div>
            </div>
          )
        })}
      </div>

      {/* search + filter chips */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
        <input
          placeholder="Search by name or email…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none' }}
        />
        {(['all', 'active', 'admin', 'inactive'] as FilterType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 12px', borderRadius: '20px', border: '1px solid', fontSize: 'var(--text-xs)', cursor: 'pointer',
            fontWeight: filter === f ? 600 : 400,
            borderColor: filter === f ? 'var(--foreground)' : 'var(--border)',
            background: filter === f ? 'var(--foreground)' : 'var(--surface)',
            color: filter === f ? 'var(--background)' : 'var(--text-secondary)',
          }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* column header */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', padding: '0 12px', flexShrink: 0, borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
          {['', 'User', 'Role', 'Status', 'Joined', 'Actions'].map((h, i) => (
            <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable user list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>}
        {!loading && users.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>👤</div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>No users yet</div>
            <div style={{ fontSize: 'var(--text-xs)' }}>Invite your first team member to get started</div>
          </div>
        )}
        {!loading && users.length > 0 && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No users match the current filters</div>
        )}

        {!loading && filtered.map(user => {
          const avatarColor = user.role === 'admin' ? '#7e22ce' : user.role === 'data_steward' ? '#1d4ed8' : 'var(--accent)'
          return (
            <div key={user.user_id}
              style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', alignItems: 'center', padding: '7px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', minHeight: '44px', opacity: user.is_active ? 1 : 0.6 }}>

              {/* avatar */}
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: avatarColor + '20', border: `1px solid ${avatarColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: avatarColor, flexShrink: 0 }}>
                {initials(user.full_name)}
              </div>

              {/* name + email */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.full_name}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
              </div>

              <RoleChip role={user.role} />

              <span style={{ fontSize: '10px', fontWeight: 600, color: user.is_active ? 'var(--status-ok-text)' : 'var(--text-muted)' }}>
                {user.is_active ? '● active' : '○ inactive'}
              </span>

              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
              </span>

              <div style={{ display: 'flex', gap: '4px' }}>
                {user.is_active && (
                  <button onClick={() => deactivate(user)} disabled={deactivating === user.user_id}
                    style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--status-error-text)', fontSize: '10px', cursor: 'pointer' }}>
                    {deactivating === user.user_id ? '…' : 'Deactivate'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
