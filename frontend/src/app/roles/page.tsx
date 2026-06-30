'use client'
import { apiFetch } from '@/lib/apiFetch'

interface Permission {
  key: string
  label: string
  description: string
}

interface RoleDef {
  role: string
  label: string
  description: string
  color: string
  bg: string
  permissions: string[]
  isLegacy?: boolean
}

const ALL_PERMISSIONS: Permission[] = [
  { key: 'manage_sources', label: 'Manage Sources',    description: 'Create, edit, and delete data source connections' },
  { key: 'run_scans',      label: 'Run Scans',         description: 'Trigger and schedule scan jobs' },
  { key: 'view_results',   label: 'View Results',      description: 'View scan results, reports, and dashboards' },
  { key: 'manage_assets',  label: 'Manage Assets',     description: 'Certify, tag, and manage data assets' },
  { key: 'manage_users',   label: 'Manage Users',      description: 'Create, deactivate, and assign roles to users' },
  { key: 'edit_metadata',  label: 'Edit Metadata',     description: 'Edit descriptions, glossary terms, and lineage' },
]

const ROLES: RoleDef[] = [
  {
    role: 'admin',
    label: 'Admin',
    description: 'Full platform access. Can manage users, sources, and all settings.',
    color: '#7e22ce', bg: '#fdf4ff',
    permissions: ['manage_sources', 'run_scans', 'view_results', 'manage_assets', 'manage_users', 'edit_metadata'],
  },
  {
    role: 'data_steward',
    label: 'Data Steward',
    description: 'Manages data quality rules, assets, and metadata. Cannot manage users or sources.',
    color: '#1d4ed8', bg: '#eff6ff',
    permissions: ['run_scans', 'view_results', 'manage_assets', 'edit_metadata'],
  },
  {
    role: 'data_engineer',
    label: 'Data Engineer',
    description: 'Can connect sources and run scans. Focused on pipeline and infrastructure quality.',
    color: '#15803d', bg: '#f0fdf4',
    permissions: ['manage_sources', 'run_scans', 'view_results', 'manage_assets', 'edit_metadata'],
  },
  {
    role: 'analyst',
    label: 'Analyst',
    description: 'Read-only access to quality results, reports, and dashboards.',
    color: '#92400e', bg: '#fef3c7',
    permissions: ['view_results'],
  },
  {
    role: 'viewer',
    label: 'Viewer',
    description: 'Can view results. Lowest-privilege role, suitable for stakeholders.',
    color: '#6b7280', bg: 'var(--surface-muted)',
    permissions: ['view_results'],
  },
  {
    role: 'domain_owner',
    label: 'Domain Owner',
    description: 'Legacy role. Manages assets and metadata within their domain.',
    color: '#92400e', bg: '#fef3c7',
    permissions: ['run_scans', 'view_results', 'manage_assets', 'edit_metadata'],
    isLegacy: true,
  },
  {
    role: 'data_owner',
    label: 'Data Owner',
    description: 'Legacy role. Similar to Data Engineer — source and scan management.',
    color: '#15803d', bg: '#f0fdf4',
    permissions: ['manage_sources', 'run_scans', 'view_results', 'manage_assets', 'edit_metadata'],
    isLegacy: true,
  },
  {
    role: 'auditor',
    label: 'Auditor',
    description: 'Legacy role. View-only access, intended for compliance audits.',
    color: '#6b7280', bg: 'var(--surface-muted)',
    permissions: ['view_results'],
    isLegacy: true,
  },
]

const primaryRoles  = ROLES.filter(r => !r.isLegacy)
const legacyRoles   = ROLES.filter(r => r.isLegacy)

function PermissionGrid({ role }: { role: RoleDef }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '10px' }}>
      {ALL_PERMISSIONS.map(p => {
        const has = role.permissions.includes(p.key)
        return (
          <div key={p.key} style={{
            display: 'flex', alignItems: 'flex-start', gap: '6px',
            background: has ? role.bg : 'var(--surface-muted)',
            border: `1px solid ${has ? role.color + '30' : 'var(--border)'}`,
            borderRadius: '6px', padding: '6px 8px', opacity: has ? 1 : 0.45,
          }}>
            <span style={{ fontSize: '11px', flexShrink: 0, marginTop: '1px' }}>{has ? '✓' : '✕'}</span>
            <div>
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: has ? role.color : 'var(--text-muted)' }}>{p.label}</div>
              <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', lineHeight: 1.3 }}>{p.description}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RoleCard({ role }: { role: RoleDef }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', borderLeft: `4px solid ${role.color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <span style={{ background: role.bg, color: role.color, padding: '2px 10px', borderRadius: '5px', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
          {role.label}
        </span>
        {role.isLegacy && (
          <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>legacy</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{role.role}</span>
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '2px' }}>{role.description}</div>
      <PermissionGrid role={role} />
    </div>
  )
}

export default function RolesPage() {
  return (
    <div style={{ padding: '16px 24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '16px', background: 'var(--background)', overflowY: 'auto' }}>

      {/* top bar */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Roles &amp; Permissions</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
          {primaryRoles.length} platform roles · roles are assigned per user via the Users page
        </div>
      </div>

      {/* summary row */}
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
        {ROLES.filter(r => !r.isLegacy).map(r => (
          <div key={r.role} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: r.bg, border: `1px solid ${r.color}30`, borderRadius: '6px', padding: '4px 10px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.color, flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: r.color }}>{r.label}</span>
          </div>
        ))}
      </div>

      {/* primary roles */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--foreground)', marginBottom: '10px' }}>Platform Roles</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {primaryRoles.map(r => <RoleCard key={r.role} role={r} />)}
        </div>
      </div>

      {/* legacy roles */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--foreground)', marginBottom: '4px' }}>Legacy Roles</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Kept for backward compatibility with existing tokens. New users should use platform roles.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {legacyRoles.map(r => <RoleCard key={r.role} role={r} />)}
        </div>
      </div>

    </div>
  )
}
