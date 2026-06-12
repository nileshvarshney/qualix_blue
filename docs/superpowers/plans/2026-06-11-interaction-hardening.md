# Interaction Hardening Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every static/non-functional button, form, and CTA across the app into real, wired interactions — no redesign, only minimal additive fixes.

**Architecture:** All fixes are in-place edits to existing page TSX files. Each page is self-contained (`'use client'` with `useState`/`useEffect`). Modals are defined inline in the same file following the existing pattern (no separate modal components). Backend API routes already exist for all required operations — no new API routes needed for Tasks 1–8. Tasks are fully independent — each modifies a single file.

**Tech Stack:** Next.js 14 App Router, React (`useState`/`useEffect`), inline styles with CSS vars (`var(--accent)`, `var(--surface)`, `var(--border)`, etc.), fetch() to Next.js API routes which proxy to a FastAPI backend.

---

## Inline modal pattern (reference for all tasks)

All modals in this codebase follow this exact pattern — render at the bottom of the JSX, conditionally shown:

```tsx
{showModal && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Modal Title</div>
      {/* form fields */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowModal(false)} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={handleSubmit} disabled={saving} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  </div>
)}
```

Input field style: `{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }`

Label style: `{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }`

Select style: same as input.

---

## Task 1 — Users page: Invite User + Edit User + Reactivate

**File:** `frontend/src/app/users/page.tsx`

**What to add:**
1. "Invite User" button → opens `showInvite` modal → POST `/api/users` with `{ email, full_name, role }` → prepend new user to list
2. "Edit" button per user → opens `showEdit` modal pre-filled → PUT `/api/users/{user_id}` with `{ full_name, role }` → update in list
3. "Reactivate" button for inactive users → PUT `/api/users/{user_id}` with `{ is_active: true }` → update in list

- [ ] **Step 1: Add state for invite and edit modals**

In `UsersPage()` function, add after existing state:
```tsx
const [showInvite, setShowInvite] = useState(false)
const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'viewer' as UserRole })
const [inviteSaving, setInviteSaving] = useState(false)

const [editUser, setEditUser] = useState<AppUser | null>(null)
const [editForm, setEditForm] = useState({ full_name: '', role: 'viewer' as UserRole })
const [editSaving, setEditSaving] = useState(false)

const [reactivating, setReactivating] = useState<string | null>(null)
```

- [ ] **Step 2: Add invite, edit, and reactivate functions**

After the existing `deactivate()` function:
```tsx
async function inviteUser() {
  if (!inviteForm.email) return
  setInviteSaving(true)
  try {
    const res = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteForm.email, full_name: inviteForm.full_name, role: inviteForm.role, is_active: true }),
    })
    const data = await res.json()
    const newUser: AppUser = {
      user_id: String(data.user_id ?? `u${Date.now()}`),
      email: inviteForm.email, full_name: inviteForm.full_name || inviteForm.email,
      role: inviteForm.role, is_active: true, created_at: new Date().toISOString(),
      last_login: null, domain_id: null,
    }
    setUsers(prev => [newUser, ...prev])
    setShowInvite(false)
    setInviteForm({ email: '', full_name: '', role: 'viewer' })
  } catch { /* silent — user still added optimistically */ } finally { setInviteSaving(false) }
}

async function saveEdit() {
  if (!editUser) return
  setEditSaving(true)
  try {
    await fetch(`/api/users/${editUser.user_id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: editForm.full_name, role: editForm.role }),
    })
    setUsers(prev => prev.map(u => u.user_id === editUser.user_id ? { ...u, ...editForm } : u))
    setEditUser(null)
  } catch { } finally { setEditSaving(false) }
}

async function reactivate(user: AppUser) {
  setReactivating(user.user_id)
  try {
    await fetch(`/api/users/${user.user_id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    })
    setUsers(prev => prev.map(u => u.user_id === user.user_id ? { ...u, is_active: true } : u))
  } catch { } finally { setReactivating(null) }
}
```

- [ ] **Step 3: Wire the "Invite User" button**

Replace (line 114 area):
```tsx
<button style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
  + Invite User
</button>
```
With:
```tsx
<button onClick={() => setShowInvite(true)} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
  + Invite User
</button>
```

- [ ] **Step 4: Add Edit and Reactivate buttons to each user row**

Replace the actions `<div>` (line 203 area):
```tsx
<div style={{ display: 'flex', gap: '4px' }}>
  <button onClick={() => { setEditUser(user); setEditForm({ full_name: user.full_name, role: user.role }) }}
    style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>
    Edit
  </button>
  {user.is_active ? (
    <button onClick={() => deactivate(user)} disabled={deactivating === user.user_id}
      style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--status-error-text)', fontSize: '10px', cursor: 'pointer' }}>
      {deactivating === user.user_id ? '…' : 'Deactivate'}
    </button>
  ) : (
    <button onClick={() => reactivate(user)} disabled={reactivating === user.user_id}
      style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--status-ok-text)', fontSize: '10px', cursor: 'pointer' }}>
      {reactivating === user.user_id ? '…' : 'Reactivate'}
    </button>
  )}
</div>
```

- [ ] **Step 5: Add invite modal JSX at end of return, before closing `</div>`**

```tsx
{showInvite && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '400px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Invite User</div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Email *</label>
        <input type="email" value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
          placeholder="user@company.com"
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Full Name</label>
        <input value={inviteForm.full_name} onChange={e => setInviteForm(p => ({ ...p, full_name: e.target.value }))}
          placeholder="Jane Smith"
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Role</label>
        <select value={inviteForm.role} onChange={e => setInviteForm(p => ({ ...p, role: e.target.value as UserRole }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }}>
          {['admin','data_steward','data_engineer','analyst','viewer'].map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowInvite(false)} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={inviteUser} disabled={inviteSaving || !inviteForm.email} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', opacity: !inviteForm.email ? 0.6 : 1 }}>{inviteSaving ? 'Inviting…' : 'Invite'}</button>
      </div>
    </div>
  </div>
)}

{editUser && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '380px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Edit User</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{editUser.email}</div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Full Name</label>
        <input value={editForm.full_name} onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Role</label>
        <select value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value as UserRole }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }}>
          {['admin','data_steward','data_engineer','analyst','viewer'].map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setEditUser(null)} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={saveEdit} disabled={editSaving} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>{editSaving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Commit**
```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
git add frontend/src/app/users/page.tsx
git commit -m "feat(users): wire Invite User, Edit User, and Reactivate buttons"
```

---

## Task 2 — Teams page: Create + Edit + Add Member + Delete

**File:** `frontend/src/app/teams/page.tsx`

**What to add:**
1. "+ New Team" button → `showCreate` modal → POST `/api/teams` → prepend to list
2. "Edit" button per team → `editTeam` modal pre-filled → PUT `/api/teams/{team_id}` → update in list
3. "+ Add" / "+ Add Member" buttons → `addMemberTeam` modal → POST `/api/teams/{team_id}` with member_user_id → add to members list
4. "Delete" button per team (in actions next to Edit) → DELETE `/api/teams/{team_id}` → remove from list

- [ ] **Step 1: Add state**

After existing state declarations:
```tsx
const [showCreate, setShowCreate] = useState(false)
const [createForm, setCreateForm] = useState({ team_name: '', description: '' })
const [createSaving, setCreateSaving] = useState(false)

const [editTeamData, setEditTeamData] = useState<Team | null>(null)
const [editForm, setEditForm] = useState({ team_name: '', description: '' })
const [editSaving, setEditSaving] = useState(false)

const [addMemberTeam, setAddMemberTeam] = useState<Team | null>(null)
const [memberEmail, setMemberEmail] = useState('')
const [memberRole, setMemberRole] = useState('viewer')
const [addMemberSaving, setAddMemberSaving] = useState(false)

const [deletingId, setDeletingId] = useState<string | null>(null)
```

- [ ] **Step 2: Add create, edit, addMember, deleteTeam functions**

After `toggleExpand()`:
```tsx
async function createTeam() {
  if (!createForm.team_name) return
  setCreateSaving(true)
  try {
    const res = await fetch('/api/teams', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_name: createForm.team_name, description: createForm.description || null }),
    })
    const data = await res.json()
    const newTeam: Team = {
      team_id: String(data.team_id ?? `t${Date.now()}`),
      team_name: createForm.team_name, description: createForm.description || null,
      is_active: true, created_at: new Date().toISOString(),
      member_count: 0, members: [], membersLoaded: true,
    }
    setTeams(prev => [newTeam, ...prev])
    setShowCreate(false)
    setCreateForm({ team_name: '', description: '' })
  } catch { } finally { setCreateSaving(false) }
}

async function saveEdit() {
  if (!editTeamData) return
  setEditSaving(true)
  try {
    await fetch(`/api/teams/${editTeamData.team_id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_name: editForm.team_name, description: editForm.description || null }),
    })
    setTeams(prev => prev.map(t => t.team_id === editTeamData.team_id
      ? { ...t, team_name: editForm.team_name, description: editForm.description || null } : t))
    setEditTeamData(null)
  } catch { } finally { setEditSaving(false) }
}

async function addMember() {
  if (!addMemberTeam || !memberEmail) return
  setAddMemberSaving(true)
  try {
    const res = await fetch(`/api/teams/${addMemberTeam.team_id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ add_member: { email: memberEmail, role: memberRole } }),
    })
    const data = await res.json()
    const newMember: TeamMember = {
      user_id: String(data.user_id ?? `m${Date.now()}`),
      email: memberEmail, full_name: memberEmail, role: memberRole,
    }
    setTeams(prev => prev.map(t => t.team_id === addMemberTeam.team_id
      ? { ...t, members: [...t.members, newMember], member_count: t.member_count + 1 } : t))
    setAddMemberTeam(null)
    setMemberEmail('')
    setMemberRole('viewer')
  } catch { } finally { setAddMemberSaving(false) }
}

async function deleteTeam(team: Team) {
  if (!confirm(`Delete team "${team.team_name}"? This cannot be undone.`)) return
  setDeletingId(team.team_id)
  try {
    await fetch(`/api/teams/${team.team_id}`, { method: 'DELETE' })
    setTeams(prev => prev.filter(t => t.team_id !== team.team_id))
    if (expandedId === team.team_id) setExpandedId(null)
  } catch { } finally { setDeletingId(null) }
}
```

- [ ] **Step 3: Wire the "+ New Team" button**

Replace (line 86 area):
```tsx
<button style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
  + New Team
</button>
```
With:
```tsx
<button onClick={() => setShowCreate(true)} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
  + New Team
</button>
```

- [ ] **Step 4: Wire Edit and add Delete button in row actions**

Replace (line 150–152 area):
```tsx
<div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '4px' }}>
  <button style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>Edit</button>
</div>
```
With:
```tsx
<div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '4px' }}>
  <button onClick={() => { setEditTeamData(team); setEditForm({ team_name: team.team_name, description: team.description ?? '' }) }}
    style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>Edit</button>
  <button onClick={() => deleteTeam(team)} disabled={deletingId === team.team_id}
    style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--status-error-text)', fontSize: '10px', cursor: 'pointer' }}>
    {deletingId === team.team_id ? '…' : 'Delete'}
  </button>
</div>
```

- [ ] **Step 5: Wire "+ Add Member" and "+ Add" buttons in expanded section**

Replace (line 162 area — empty member state):
```tsx
<button style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: 'pointer', color: 'var(--accent)' }}>+ Add Member</button>
```
With:
```tsx
<button onClick={() => setAddMemberTeam(team)} style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: 'pointer', color: 'var(--accent)' }}>+ Add Member</button>
```

Replace (line 181 area — the "+ Add" dashed button in member list):
```tsx
<button style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: '6px', border: '1px dashed var(--border)', background: 'transparent', fontSize: '10px', cursor: 'pointer', color: 'var(--accent)' }}>
  + Add
</button>
```
With:
```tsx
<button onClick={() => setAddMemberTeam(team)} style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: '6px', border: '1px dashed var(--border)', background: 'transparent', fontSize: '10px', cursor: 'pointer', color: 'var(--accent)' }}>
  + Add
</button>
```

- [ ] **Step 6: Add modals at bottom of return**

```tsx
{showCreate && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '400px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>New Team</div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Team Name *</label>
        <input value={createForm.team_name} onChange={e => setCreateForm(p => ({ ...p, team_name: e.target.value }))}
          placeholder="e.g. Data Engineering"
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Description</label>
        <input value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
          placeholder="Optional team description"
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowCreate(false)} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={createTeam} disabled={createSaving || !createForm.team_name} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', opacity: !createForm.team_name ? 0.6 : 1 }}>{createSaving ? 'Creating…' : 'Create Team'}</button>
      </div>
    </div>
  </div>
)}

{editTeamData && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '400px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Edit Team</div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Team Name *</label>
        <input value={editForm.team_name} onChange={e => setEditForm(p => ({ ...p, team_name: e.target.value }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Description</label>
        <input value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setEditTeamData(null)} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={saveEdit} disabled={editSaving || !editForm.team_name} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>{editSaving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  </div>
)}

{addMemberTeam && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '380px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Add Member to {addMemberTeam.team_name}</div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>User Email *</label>
        <input type="email" value={memberEmail} onChange={e => setMemberEmail(e.target.value)}
          placeholder="user@company.com"
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Role</label>
        <select value={memberRole} onChange={e => setMemberRole(e.target.value)}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }}>
          {['admin','data_steward','data_engineer','analyst','viewer'].map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setAddMemberTeam(null)} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={addMember} disabled={addMemberSaving || !memberEmail} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', opacity: !memberEmail ? 0.6 : 1 }}>{addMemberSaving ? 'Adding…' : 'Add Member'}</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Commit**
```bash
git add frontend/src/app/teams/page.tsx
git commit -m "feat(teams): wire Create Team, Edit Team, Add Member, Delete Team"
```

---

## Task 3 — Scan Jobs page: New Job modal

**File:** `frontend/src/app/scan-jobs/page.tsx`

**What to add:** "+ New Job" button → `showCreate` modal with job name, type, connection, frequency → POST `/api/scan-jobs` → prepend to list.

- [ ] **Step 1: Add state**

After existing state:
```tsx
const [showCreate, setShowCreate] = useState(false)
const [jobForm, setJobForm] = useState({
  job_name: '', job_type: 'metadata_discovery', connection_id: '',
  schedule_frequency: 'daily', cron_expr: '',
})
const [jobSaving, setJobSaving] = useState(false)
const [connections, setConnections] = useState<{ id: string; name: string }[]>([])
```

- [ ] **Step 2: Fetch connections when modal opens**

Add a `useEffect` after the existing fetch `useEffect`:
```tsx
useEffect(() => {
  fetch('/api/connections')
    .then(r => r.json())
    .then((data: Record<string, unknown>[]) => {
      setConnections((Array.isArray(data) ? data : []).map(c => ({
        id: String(c.connection_id ?? c.id ?? ''),
        name: String(c.connection_name ?? c.name ?? ''),
      })))
    })
    .catch(() => {})
}, [])
```

- [ ] **Step 3: Add createJob function**

After `runNow()`:
```tsx
async function createJob() {
  if (!jobForm.job_name) return
  setJobSaving(true)
  try {
    const payload = {
      job_name: jobForm.job_name, job_type: jobForm.job_type,
      connection_id: jobForm.connection_id || null,
      schedule_frequency: jobForm.schedule_frequency,
      cron_expr: jobForm.schedule_frequency === 'cron' ? jobForm.cron_expr : null,
      is_active: true,
    }
    const res = await fetch('/api/scan-jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    const conn = connections.find(c => c.id === jobForm.connection_id)
    const newJob: ScanJob = {
      job_id: String(data.job_id ?? `j${Date.now()}`),
      job_name: jobForm.job_name, job_type: jobForm.job_type,
      schedule_frequency: jobForm.schedule_frequency,
      cron_expr: jobForm.schedule_frequency === 'cron' ? jobForm.cron_expr : null,
      connection_id: jobForm.connection_id || null,
      connection_name: conn?.name ?? null,
      is_active: true, last_run_status: null, last_run_at: null,
      created_at: new Date().toISOString(),
    }
    setJobs(prev => [newJob, ...prev])
    setShowCreate(false)
    setJobForm({ job_name: '', job_type: 'metadata_discovery', connection_id: '', schedule_frequency: 'daily', cron_expr: '' })
  } catch { } finally { setJobSaving(false) }
}
```

- [ ] **Step 4: Wire the "+ New Job" button**

Replace:
```tsx
<button style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
  + New Job
</button>
```
With:
```tsx
<button onClick={() => setShowCreate(true)} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
  + New Job
</button>
```

- [ ] **Step 5: Add create modal at end of return**

```tsx
{showCreate && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '440px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>New Scan Job</div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Job Name *</label>
        <input value={jobForm.job_name} onChange={e => setJobForm(p => ({ ...p, job_name: e.target.value }))}
          placeholder="e.g. Daily Snowflake Discovery"
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Job Type</label>
        <select value={jobForm.job_type} onChange={e => setJobForm(p => ({ ...p, job_type: e.target.value }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }}>
          {Object.entries(JOB_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Connection</label>
        <select value={jobForm.connection_id} onChange={e => setJobForm(p => ({ ...p, connection_id: e.target.value }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }}>
          <option value="">— None —</option>
          {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Schedule</label>
        <select value={jobForm.schedule_frequency} onChange={e => setJobForm(p => ({ ...p, schedule_frequency: e.target.value }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }}>
          {Object.entries(FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {jobForm.schedule_frequency === 'cron' && (
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Cron Expression</label>
          <input value={jobForm.cron_expr} onChange={e => setJobForm(p => ({ ...p, cron_expr: e.target.value }))}
            placeholder="e.g. 0 2 * * *"
            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowCreate(false)} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={createJob} disabled={jobSaving || !jobForm.job_name} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', opacity: !jobForm.job_name ? 0.6 : 1 }}>{jobSaving ? 'Creating…' : 'Create Job'}</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Commit**
```bash
git add frontend/src/app/scan-jobs/page.tsx
git commit -m "feat(scan-jobs): wire New Job create modal"
```

---

## Task 4 — Schedules page: New Schedule modal

**File:** `frontend/src/app/schedules/page.tsx`

**What to add:** "+ New Schedule" button → modal with name, dataset, cron, connection → POST `/api/schedules` (need to add POST handler to API route) → prepend to list.

**Note:** The `/api/schedules` route currently only has GET, PATCH, and POST (for run-now). We need to add a `create` path. The existing POST uses `{ id }` for run-now — we'll use `{ create: true }` to distinguish.

- [ ] **Step 1: Update `/api/schedules/route.ts` to support creation**

In `frontend/src/app/api/schedules/route.ts`, modify the `POST` handler:
```ts
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // run-now vs create
    if (body.create) {
      const { create: _, ...payload } = body
      const res = await fetch(`${BACKEND}/schedules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }
    // existing run-now path
    const { id } = body
    const res = await fetch(`${BACKEND}/schedules/${id}/run-now`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 2: Add state to SchedulesPage**

After existing state:
```tsx
const [showCreate, setShowCreate] = useState(false)
const [schedForm, setSchedForm] = useState({ name: '', dataset: '', cron: '0 2 * * *', connection: '' })
const [schedSaving, setSchedSaving] = useState(false)
const [connOptions, setConnOptions] = useState<{ id: string; name: string }[]>([])
```

- [ ] **Step 3: Fetch connections on mount**

Add after existing `useEffect`:
```tsx
useEffect(() => {
  fetch('/api/connections')
    .then(r => r.json())
    .then((data: Record<string, unknown>[]) => {
      setConnOptions((Array.isArray(data) ? data : []).map(c => ({
        id: String(c.connection_id ?? c.id ?? ''), name: String(c.connection_name ?? c.name ?? ''),
      })))
    })
    .catch(() => {})
}, [])
```

- [ ] **Step 4: Add createSchedule function**

After `runNow()`:
```tsx
async function createSchedule() {
  if (!schedForm.name || !schedForm.cron) return
  setSchedSaving(true)
  try {
    const res = await fetch('/api/schedules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        create: true,
        schedule_name: schedForm.name, asset_name: schedForm.dataset,
        cron_expression: schedForm.cron, connection_name: schedForm.connection,
        is_active: true,
      }),
    })
    const data = await res.json()
    const newSched: Schedule = {
      id: String(data.schedule_id ?? data.id ?? `s${Date.now()}`),
      name: schedForm.name, dataset: schedForm.dataset,
      cron: schedForm.cron, human: schedForm.cron,
      rules: 0, lastRun: '—', nextRun: '—', status: 'active',
      lastRunStatus: 'passed', lastDuration: '—',
      connection: schedForm.connection || '(no connection)',
      owner: '', failedRules: 0, checkedRows: '0', failedRows: '0', issues: [],
    }
    setScheduleList(prev => [newSched, ...prev])
    setShowCreate(false)
    setSchedForm({ name: '', dataset: '', cron: '0 2 * * *', connection: '' })
  } catch { } finally { setSchedSaving(false) }
}
```

- [ ] **Step 5: Wire the "+ New Schedule" button**

Replace:
```tsx
<button style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
  + New Schedule
</button>
```
With:
```tsx
<button onClick={() => setShowCreate(true)} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
  + New Schedule
</button>
```

- [ ] **Step 6: Add create modal at end of return**

```tsx
{showCreate && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '440px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>New Schedule</div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Schedule Name *</label>
        <input value={schedForm.name} onChange={e => setSchedForm(p => ({ ...p, name: e.target.value }))}
          placeholder="e.g. Daily Orders Check"
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Dataset / Asset</label>
        <input value={schedForm.dataset} onChange={e => setSchedForm(p => ({ ...p, dataset: e.target.value }))}
          placeholder="e.g. ORDERS table"
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Cron Expression *</label>
        <input value={schedForm.cron} onChange={e => setSchedForm(p => ({ ...p, cron: e.target.value }))}
          placeholder="0 2 * * * (daily at 2am)"
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Connection</label>
        <select value={schedForm.connection} onChange={e => setSchedForm(p => ({ ...p, connection: e.target.value }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }}>
          <option value="">— None —</option>
          {connOptions.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowCreate(false)} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={createSchedule} disabled={schedSaving || !schedForm.name || !schedForm.cron} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', opacity: (!schedForm.name || !schedForm.cron) ? 0.6 : 1 }}>{schedSaving ? 'Creating…' : 'Create Schedule'}</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Commit**
```bash
git add frontend/src/app/schedules/page.tsx frontend/src/app/api/schedules/route.ts
git commit -m "feat(schedules): wire New Schedule create modal"
```

---

## Task 5 — Glossary page: Edit + Delete terms

**File:** `frontend/src/app/glossary/page.tsx`

**API:** `PUT /api/glossary` with `{ id, term_name, definition, synonyms, status, owner_email }` and `DELETE /api/glossary?id={id}` — both already exist.

**What to add:**
1. "Edit" button on each term card → `editTerm` state → pre-fill modal → PUT → update list
2. "Delete" button on each term card → confirm → DELETE → remove from list

- [ ] **Step 1: Add edit and delete state**

After existing state (`showAdd`, `popup`, `termForm`):
```tsx
const [editTerm, setEditTerm] = useState<GlossaryTerm | null>(null)
const [editForm, setEditForm] = useState({ name: '', definition: '', domain: 'Finance', synonyms: '', owner: '', status: 'draft' as 'approved' | 'draft' | 'deprecated' })
const [editSaving, setEditSaving] = useState(false)
const [deletingId, setDeletingId] = useState<string | null>(null)
```

- [ ] **Step 2: Add updateTerm and deleteTerm functions**

After the existing `addTerm()` function:
```tsx
const updateTerm = async () => {
  if (!editTerm || !editForm.name) return
  setEditSaving(true)
  try {
    await fetch('/api/glossary', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editTerm.id, term_name: editForm.name,
        definition: editForm.definition, synonyms: editForm.synonyms || null,
        status: editForm.status, owner_email: editForm.owner || null,
      }),
    })
    setTerms(prev => prev.map(t => t.id === editTerm.id
      ? { ...t, name: editForm.name, definition: editForm.definition, status: editForm.status, owner: editForm.owner,
          synonyms: editForm.synonyms.split(',').map(s => s.trim()).filter(Boolean) } : t))
    setEditTerm(null)
  } catch { } finally { setEditSaving(false) }
}

const deleteTerm = async (term: GlossaryTerm) => {
  if (!confirm(`Delete term "${term.name}"?`)) return
  setDeletingId(term.id)
  try {
    await fetch(`/api/glossary?id=${term.id}`, { method: 'DELETE' })
    setTerms(prev => prev.filter(t => t.id !== term.id))
    if (popup?.id === term.id) setPopup(null)
  } catch { } finally { setDeletingId(null) }
}
```

- [ ] **Step 3: Add Edit/Delete buttons to each term card**

Find the term card JSX in the rendered list (each term is rendered as a `<div>` card). Add action buttons inside each card. Look for the card containing `statusBadge`, and add to its top-right:

After the status badge line and before the definition, add:
```tsx
<div style={{ display: 'flex', gap: '4px', marginLeft: 'auto', flexShrink: 0 }}>
  <button onClick={e => { e.stopPropagation(); setEditTerm(t); setEditForm({ name: t.name, definition: t.definition, domain: t.domain, synonyms: t.synonyms.join(', '), owner: t.owner, status: t.status }) }}
    style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: 'pointer', color: 'var(--text-secondary)' }}>Edit</button>
  <button onClick={e => { e.stopPropagation(); deleteTerm(t) }} disabled={deletingId === t.id}
    style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: 'pointer', color: 'var(--status-error-text)' }}>
    {deletingId === t.id ? '…' : 'Delete'}
  </button>
</div>
```

- [ ] **Step 4: Add edit modal**

After the existing `showAdd` modal:
```tsx
{editTerm && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '440px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Edit Term</div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Term Name *</label>
        <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Definition</label>
        <textarea value={editForm.definition} onChange={e => setEditForm(p => ({ ...p, definition: e.target.value }))} rows={3}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Status</label>
        <select value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value as 'approved' | 'draft' | 'deprecated' }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }}>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="deprecated">Deprecated</option>
        </select>
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Synonyms (comma-separated)</label>
        <input value={editForm.synonyms} onChange={e => setEditForm(p => ({ ...p, synonyms: e.target.value }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setEditTerm(null)} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={updateTerm} disabled={editSaving || !editForm.name} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>{editSaving ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/glossary/page.tsx
git commit -m "feat(glossary): add Edit and Delete for terms"
```

---

## Task 6 — SLAs page: Edit + Delete

**File:** `frontend/src/app/slas/page.tsx`

**API:** `PUT /api/slas` with `{ id, contract_name, sla_description, producer_team }` and `DELETE /api/slas?id={id}` — both already exist (from `/api/slas/route.ts` which maps to `/api/contracts`).

- [ ] **Step 1: Add state**

After existing state:
```tsx
const [editSla, setEditSla] = useState<SLA | null>(null)
const [editForm, setEditForm] = useState({ name: '', dataset: '', type: 'Freshness', target: '', owner: '' })
const [editSaving, setEditSaving] = useState(false)
const [deletingId, setDeletingId] = useState<string | null>(null)
```

- [ ] **Step 2: Add updateSla and deleteSla functions**

After `addSla()`:
```tsx
const updateSla = async () => {
  if (!editSla || !editForm.name) return
  setEditSaving(true)
  try {
    await fetch('/api/slas', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editSla.id, contract_name: editForm.name, sla_description: editForm.target, producer_team: editForm.owner || null }),
    })
    setAllSlas(prev => prev.map(s => s.id === editSla.id
      ? { ...s, name: editForm.name, dataset: editForm.dataset, type: editForm.type, target: editForm.target, owner: editForm.owner || 'Unassigned' } : s))
    setEditSla(null)
    if (selected?.id === editSla.id) setSelected(null)
  } catch { } finally { setEditSaving(false) }
}

const deleteSla = async (sla: SLA) => {
  if (!confirm(`Delete SLA "${sla.name}"?`)) return
  setDeletingId(sla.id)
  try {
    await fetch(`/api/slas?id=${sla.id}`, { method: 'DELETE' })
    setAllSlas(prev => prev.filter(s => s.id !== sla.id))
    if (selected?.id === sla.id) setSelected(null)
  } catch { } finally { setDeletingId(null) }
}
```

- [ ] **Step 3: Add Edit/Delete buttons per SLA row**

In each SLA row (find the `<div>` with hover handling), add action buttons. After the trend sparkline cell, add:
```tsx
<div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
  <button onClick={() => { setEditSla(sla); setEditForm({ name: sla.name, dataset: sla.dataset, type: sla.type, target: sla.target, owner: sla.owner }) }}
    style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: 'pointer', color: 'var(--text-secondary)' }}>Edit</button>
  <button onClick={() => deleteSla(sla)} disabled={deletingId === sla.id}
    style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: 'pointer', color: 'var(--status-error-text)' }}>
    {deletingId === sla.id ? '…' : 'Delete'}
  </button>
</div>
```

Also update the `COLS` grid from `'1fr 110px 72px 88px 62px 68px 40px 78px 80px'` to `'1fr 110px 72px 88px 62px 68px 40px 78px 80px auto'` and add `Actions` to the column header array.

- [ ] **Step 4: Add edit modal at end of return**

```tsx
{editSla && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Edit SLA</div>
      {[
        { label: 'SLA Name *', key: 'name', placeholder: '' },
        { label: 'Dataset', key: 'dataset', placeholder: '' },
        { label: 'Target', key: 'target', placeholder: 'e.g. 99.9% freshness within 2h' },
        { label: 'Owner', key: 'owner', placeholder: '' },
      ].map(({ label, key, placeholder }) => (
        <div key={key}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>{label}</label>
          <input value={(editForm as Record<string, string>)[key]} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder}
            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setEditSla(null)} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={updateSla} disabled={editSaving || !editForm.name} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>{editSaving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/slas/page.tsx
git commit -m "feat(slas): add Edit and Delete SLA"
```

---

## Task 7 — Data Products page: Edit

**File:** `frontend/src/app/data-products/page.tsx`

**API:** `PUT /api/data-products` with `{ id, product_name, description, domain, owner, status, tier, sla }` — already exists.

- [ ] **Step 1: Add edit state**

After existing state:
```tsx
const [editProduct, setEditProduct] = useState<DataProduct | null>(null)
const [editPForm, setEditPForm] = useState({ name: '', description: '', domain: 'Sales', owner: '', status: 'draft' as DataProduct['status'], tier: 'bronze' as DataProduct['tier'], sla: '' })
const [editPSaving, setEditPSaving] = useState(false)
```

- [ ] **Step 2: Add updateProduct function**

After existing `useEffect`:
```tsx
const updateProduct = async () => {
  if (!editProduct || !editPForm.name) return
  setEditPSaving(true)
  try {
    await fetch('/api/data-products', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editProduct.id, product_name: editPForm.name, description: editPForm.description, domain: editPForm.domain, owner: editPForm.owner, status: editPForm.status, tier: editPForm.tier, sla: editPForm.sla }),
    })
    setProducts(prev => prev.map(p => p.id === editProduct.id
      ? { ...p, name: editPForm.name, description: editPForm.description, domain: editPForm.domain, owner: editPForm.owner, status: editPForm.status, tier: editPForm.tier, sla: editPForm.sla } : p))
    if (selected?.id === editProduct.id) setSelected(prev => prev ? { ...prev, name: editPForm.name, description: editPForm.description } : prev)
    setEditProduct(null)
  } catch { } finally { setEditPSaving(false) }
}
```

- [ ] **Step 3: Wire the edit icon in each row**

Find the edit icon hover button (it currently has no onClick). Add:
```tsx
onClick={() => { setEditProduct(product); setEditPForm({ name: product.name, description: product.description, domain: product.domain, owner: product.owner, status: product.status, tier: product.tier, sla: product.sla }) }}
```

- [ ] **Step 4: Add edit modal at end of return**

```tsx
{editProduct && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '460px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Edit Data Product</div>
      {[
        { label: 'Name *', key: 'name' },
        { label: 'Description', key: 'description' },
        { label: 'Owner', key: 'owner' },
        { label: 'SLA Target', key: 'sla' },
      ].map(({ label, key }) => (
        <div key={key}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>{label}</label>
          <input value={(editPForm as Record<string, string>)[key]} onChange={e => setEditPForm(p => ({ ...p, [key]: e.target.value }))}
            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Domain</label>
          <select value={editPForm.domain} onChange={e => setEditPForm(p => ({ ...p, domain: e.target.value }))}
            style={{ width: '100%', padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }}>
            {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Status</label>
          <select value={editPForm.status} onChange={e => setEditPForm(p => ({ ...p, status: e.target.value as DataProduct['status'] }))}
            style={{ width: '100%', padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="certified">Certified</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Tier</label>
          <select value={editPForm.tier} onChange={e => setEditPForm(p => ({ ...p, tier: e.target.value as DataProduct['tier'] }))}
            style={{ width: '100%', padding: '7px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }}>
            <option value="bronze">Bronze</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setEditProduct(null)} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={updateProduct} disabled={editPSaving || !editPForm.name} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>{editPSaving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/data-products/page.tsx
git commit -m "feat(data-products): wire Edit product modal"
```

---

## Task 8 — Audit Logs + Execution Logs: CSV Export

**Files:**
- `frontend/src/app/audit-logs/page.tsx`
- `frontend/src/app/execution-logs/page.tsx`

### Audit Logs

- [ ] **Step 1: Add exportCsv utility function in audit-logs/page.tsx**

After state declarations, add:
```tsx
function exportCsv(rows: typeof filtered) {
  const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Category', 'Status', 'IP']
  const lines = rows.map(r => [
    r.timestamp ?? '', r.user ?? '', r.action ?? '', r.resource ?? '',
    r.category ?? '', r.status ?? '', r.ip ?? '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const csv = [headers.join(','), ...lines].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
```

- [ ] **Step 2: Wire the Export button**

Find the Export button and add `onClick`:
```tsx
onClick={() => exportCsv(filtered)}
```

The filtered variable should already exist since the page has filtering logic — use whatever filtered array the page renders.

### Execution Logs

- [ ] **Step 3: Add exportCsv in execution-logs/page.tsx**

```tsx
function exportCsv(rows: typeof filtered) {
  const headers = ['Date', 'Rule', 'Dataset', 'Status', 'Score', 'Rows Checked', 'Rows Failed', 'Duration']
  const lines = rows.map(r => [
    r.executed_at ?? '', r.rule_name ?? '', r.dataset ?? '', r.status ?? '',
    r.quality_score ?? '', r.rows_checked ?? '', r.rows_failed ?? '', r.duration ?? '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const csv = [headers.join(','), ...lines].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `execution-logs-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
```

- [ ] **Step 4: Wire the Export CSV button**

Find the "Export CSV" button in execution-logs/page.tsx and add `onClick={() => exportCsv(filtered)}`.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/audit-logs/page.tsx frontend/src/app/execution-logs/page.tsx
git commit -m "feat: wire CSV export for audit logs and execution logs"
```

---

## Task 9 — Settings page: localStorage persistence for Profile, Notifications, API Keys

**File:** `frontend/src/app/settings/page.tsx`

**Goal:** Settings currently reset on page reload. Add localStorage read/write so they survive navigation. No backend needed — localStorage is explicitly acceptable for these fields.

- [ ] **Step 1: Load profile and notifications from localStorage on mount**

Add `useEffect` after state declarations:
```tsx
useEffect(() => {
  try {
    const p = localStorage.getItem('dg_settings_profile')
    if (p) setProfile(JSON.parse(p))
    const n = localStorage.getItem('dg_settings_notifs')
    if (n) setNotifs(JSON.parse(n))
    const k = localStorage.getItem('dg_settings_apikeys')
    if (k) setApiKeys(JSON.parse(k))
  } catch { }
}, [])
```

- [ ] **Step 2: Persist on save — update the profile save handler**

Find the tab's Save button for the Profile tab. The existing `save()` function only flips `saved` state. Update the individual tab save calls or create tab-specific savers.

Replace the generic `save()` function:
```tsx
function save(tab?: string) {
  if (tab === 'profile') localStorage.setItem('dg_settings_profile', JSON.stringify(profile))
  if (tab === 'notifications') localStorage.setItem('dg_settings_notifs', JSON.stringify(notifs))
  setSaved(true)
  setTimeout(() => setSaved(false), 2500)
}
```

- [ ] **Step 3: Persist API keys whenever they change**

Add a `useEffect` to sync API keys to localStorage:
```tsx
useEffect(() => {
  if (apiKeys.length > 0 || localStorage.getItem('dg_settings_apikeys')) {
    localStorage.setItem('dg_settings_apikeys', JSON.stringify(apiKeys))
  }
}, [apiKeys])
```

- [ ] **Step 4: Wire tab-aware save calls**

Each tab's Save button currently calls `save()`. Update them to pass the tab identifier:
- Profile tab Save button: `onClick={() => save('profile')}`
- Notifications tab Save button: `onClick={() => save('notifications')}`

- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/settings/page.tsx
git commit -m "feat(settings): persist profile, notifications, and API keys to localStorage"
```

---

## Task 10 — Executive page: real data

**File:** `frontend/src/app/executive/page.tsx`

**Goal:** Replace all hardcoded "No data yet" placeholders with data from `/api/dashboard` (which already returns overall score, open issues, SLA, domain breakdown) and `/api/incidents` (recent incidents).

- [ ] **Step 1: Convert to `'use client'` and add fetching**

Replace the entire file:
```tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface DashStats { overall_score: number; open_issues: number; sla_adherence: number; datasets_monitored: number }
interface Incident { id: string; title: string; severity: string; status: string; asset: string; created_at: string }

export default function ExecutivePage() {
  const [stats, setStats] = useState<DashStats | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])

  useEffect(() => {
    fetch('/api/dashboard', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setStats({
        overall_score: Number(d.overall_score ?? d.quality_score ?? 0),
        open_issues: Number(d.open_issues ?? 0),
        sla_adherence: Number(d.sla_adherence ?? 0),
        datasets_monitored: Number(d.datasets_monitored ?? 0),
      }))
      .catch(() => {})
    fetch('/api/incidents')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        setIncidents((Array.isArray(data) ? data : []).slice(0, 5).map((inc, i) => ({
          id: String(inc.incident_id ?? inc.id ?? i),
          title: String(inc.title ?? inc.description ?? ''),
          severity: String(inc.severity ?? 'medium'),
          status: String(inc.status ?? 'open'),
          asset: String(inc.asset ?? inc.table_name ?? ''),
          created_at: String(inc.created_at ?? ''),
        })))
      })
      .catch(() => {})
  }, [])

  const sevColor = (s: string) => s === 'critical' ? '#dc2626' : s === 'high' ? '#d97706' : '#2563eb'

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Executive Dashboard</span>
        {stats && <>
          <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>Quality {stats.overall_score}%</span>
          <span style={{ background: stats.sla_adherence >= 95 ? 'var(--status-ok-bg)' : 'var(--status-warn-bg)', color: stats.sla_adherence >= 95 ? 'var(--status-ok-text)' : 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>SLA {stats.sla_adherence}%</span>
          <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{stats.open_issues} open issues</span>
          <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{stats.datasets_monitored} datasets</span>
        </>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '10px', flex: 1, minHeight: 0 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', overflow: 'auto' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '8px' }}>Quality Overview</div>
          {stats ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {[
                { label: 'Overall Quality', value: `${stats.overall_score}%`, color: stats.overall_score >= 90 ? 'var(--status-ok-text)' : 'var(--status-warn-text)' },
                { label: 'Open Issues', value: stats.open_issues, color: stats.open_issues > 0 ? 'var(--status-error-text)' : 'var(--status-ok-text)' },
                { label: 'SLA Adherence', value: `${stats.sla_adherence}%`, color: stats.sla_adherence >= 95 ? 'var(--status-ok-text)' : 'var(--status-warn-text)' },
                { label: 'Datasets Monitored', value: stats.datasets_monitored, color: 'var(--accent)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--surface-muted)', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>Loading…</div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)' }}>Active Incidents</div>
              <Link href="/incidents" style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
            </div>
            {incidents.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>No active incidents</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {incidents.map(inc => (
                  <div key={inc.id} style={{ padding: '7px 10px', background: 'var(--surface-muted)', borderRadius: '6px', borderLeft: `3px solid ${sevColor(inc.severity)}` }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '2px' }}>{inc.title}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{inc.asset} · {inc.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/app/executive/page.tsx
git commit -m "feat(executive): wire real dashboard and incident data"
```

---

## Task 11 — Incidents page: Create Incident modal

**File:** `frontend/src/app/incidents/page.tsx`

**API:** `POST /api/incidents` already exists (proxies to backend `/incidents`).

- [ ] **Step 1: Add state**

```tsx
const [showCreate, setShowCreate] = useState(false)
const [incForm, setIncForm] = useState({ title: '', severity: 'medium', asset: '', description: '' })
const [incSaving, setIncSaving] = useState(false)
```

- [ ] **Step 2: Add createIncident function**

```tsx
async function createIncident() {
  if (!incForm.title) return
  setIncSaving(true)
  try {
    const res = await fetch('/api/incidents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: incForm.title, severity: incForm.severity, asset: incForm.asset, description: incForm.description, status: 'open' }),
    })
    const data = await res.json()
    // Refresh incidents list
    const newInc = {
      id: String(data.incident_id ?? data.id ?? `inc${Date.now()}`),
      title: incForm.title, severity: incForm.severity,
      asset: incForm.asset, description: incForm.description,
      status: 'open', created_at: new Date().toISOString(),
    }
    setIncidents((prev: typeof newInc[]) => [newInc, ...prev])
    setShowCreate(false)
    setIncForm({ title: '', severity: 'medium', asset: '', description: '' })
  } catch { } finally { setIncSaving(false) }
}
```

- [ ] **Step 3: Wire the "+ Report" button**

Find the button and add `onClick={() => setShowCreate(true)}`.

- [ ] **Step 4: Add create modal**

```tsx
{showCreate && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Report Incident</div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Title *</label>
        <input value={incForm.title} onChange={e => setIncForm(p => ({ ...p, title: e.target.value }))}
          placeholder="Brief description of the incident"
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Severity</label>
        <select value={incForm.severity} onChange={e => setIncForm(p => ({ ...p, severity: e.target.value }))}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }}>
          {['critical','high','medium','low'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Affected Asset</label>
        <input value={incForm.asset} onChange={e => setIncForm(p => ({ ...p, asset: e.target.value }))}
          placeholder="e.g. ORDERS table or pipeline name"
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Description</label>
        <textarea value={incForm.description} onChange={e => setIncForm(p => ({ ...p, description: e.target.value }))} rows={3}
          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowCreate(false)} style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
        <button onClick={createIncident} disabled={incSaving || !incForm.title} style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', opacity: !incForm.title ? 0.6 : 1 }}>{incSaving ? 'Reporting…' : 'Report Incident'}</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/incidents/page.tsx
git commit -m "feat(incidents): wire Report Incident create modal"
```

---

## Files to Modify

| File | What Changes |
|------|-------------|
| `frontend/src/app/users/page.tsx` | Invite, Edit, Reactivate |
| `frontend/src/app/teams/page.tsx` | Create, Edit, Add Member, Delete |
| `frontend/src/app/scan-jobs/page.tsx` | New Job modal |
| `frontend/src/app/schedules/page.tsx` | New Schedule modal |
| `frontend/src/app/api/schedules/route.ts` | Add create path to POST handler |
| `frontend/src/app/glossary/page.tsx` | Edit + Delete terms |
| `frontend/src/app/slas/page.tsx` | Edit + Delete SLAs |
| `frontend/src/app/data-products/page.tsx` | Edit product modal |
| `frontend/src/app/audit-logs/page.tsx` | CSV export |
| `frontend/src/app/execution-logs/page.tsx` | CSV export |
| `frontend/src/app/settings/page.tsx` | localStorage persistence |
| `frontend/src/app/executive/page.tsx` | Real data fetch |
| `frontend/src/app/incidents/page.tsx` | Create incident modal |

## Files NOT to touch

- All components in `components/asset-registry/` — already functional
- `components/connections/ConnectionsClient.tsx` — already functional
- `components/rules/RulesClient.tsx` — already functional
- All `app/api/` routes except `api/schedules/route.ts`
- `components/dashboard/Dashboard.tsx` — functional enough
- `app/page.tsx` — functional
- `app/rule-runs/[runId]/page.tsx` — functional
- `app/scan-jobs/[jobId]/runs/[runId]/page.tsx` — functional
- All placeholder pages (`architecture`, `ai-assistant`) — intentionally static

---

## Verification Checklist

After all tasks complete, confirm:

- [ ] `/users` — clicking "+ Invite User" opens a modal; submitting adds user to list
- [ ] `/users` — clicking "Edit" on a user opens pre-filled modal; saving updates row
- [ ] `/users` — inactive users show "Reactivate" button; clicking it flips status
- [ ] `/teams` — clicking "+ New Team" opens modal; submitting adds team to list
- [ ] `/teams` — clicking "Edit" on a team opens modal; saving updates row
- [ ] `/teams` — clicking "+ Add" / "+ Add Member" opens modal; submitting adds member
- [ ] `/teams` — clicking "Delete" shows confirm; confirming removes team from list
- [ ] `/scan-jobs` — clicking "+ New Job" opens modal; submitting adds job to list
- [ ] `/schedules` — clicking "+ New Schedule" opens modal; submitting adds schedule to list
- [ ] `/glossary` — each term card has Edit and Delete buttons; both work
- [ ] `/slas` — each SLA row has Edit and Delete buttons; both work
- [ ] `/data-products` — hovering a row shows Edit icon; clicking opens edit modal
- [ ] `/audit-logs` — clicking "Export" downloads a CSV with visible log data
- [ ] `/execution-logs` — clicking "Export CSV" downloads a CSV
- [ ] `/settings` — changing Profile name and saving, then navigating away and back, shows saved name
- [ ] `/executive` — page shows real quality score and incident list (not hardcoded dashes)
- [ ] `/incidents` — clicking "+ Report" opens create incident modal
- [ ] No existing working pages regressed (connections, rules, asset-registry, reports, lineage all still function)
