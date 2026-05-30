'use client'
import { useState, useEffect } from 'react'
import { Connection, ConnectionType } from '@/lib/types'
import { formatDateTime, connectionIcons } from '@/lib/utils'
import { useRouter } from 'next/navigation'

/* ─── localStorage persistence for edge deployments ─── */
const LS_KEY = 'dataguard_connections'

interface TestStep { label: string; status: 'ok' | 'fail' | 'skip'; detail: string }
interface TestResult {
  success: boolean; status: string; steps: TestStep[]
  errorCode?: string; errorMessage?: string; suggestion?: string; latencyMs?: number
}

function TestResultModal({ result, connName, onClose }: { result: TestResult; connName: string; onClose: () => void }) {
  const stepIcon = { ok: '✓', fail: '✗', skip: '⊘' }
  const stepColor = { ok: '#16a34a', fail: '#dc2626', skip: '#94a3b8' }
  const stepBg   = { ok: '#dcfce7', fail: '#fee2e2', skip: '#f1f5f9' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, backdropFilter:'blur(4px)' }}>
      <div style={{ background:'#fff', borderRadius:'16px', width:'520px', maxHeight:'88vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #ebe8df', display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{
            width:'40px', height:'40px', borderRadius:'12px', flexShrink:0,
            background: result.success ? '#dcfce7' : '#fee2e2',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px'
          }}>{result.success ? '✅' : '❌'}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:'16px', color:'#1a1a1a' }}>
              {result.success ? 'Connection Successful' : 'Connection Failed'}
            </div>
            <div style={{ fontSize:'12.5px', color:'#64748b', marginTop:'2px' }}>{connName}</div>
          </div>
          <button onClick={onClose} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', width:'30px', height:'30px', borderRadius:'8px', cursor:'pointer', color:'#64748b', fontSize:'14px', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:'16px' }}>

          {/* Steps */}
          <div>
            <div style={{ fontSize:'11.5px', color:'#94a3b8', fontWeight:600, letterSpacing:'0.06em', marginBottom:'10px' }}>DIAGNOSTIC STEPS</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {result.steps.map((step, i) => (
                <div key={i} style={{ display:'flex', gap:'10px', alignItems:'flex-start', padding:'10px 12px', borderRadius:'8px', background:'#fafaf9', border:'1px solid #ebe8df' }}>
                  <div style={{ width:'22px', height:'22px', borderRadius:'50%', background:stepBg[step.status], color:stepColor[step.status], display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:700, flexShrink:0, marginTop:'1px' }}>
                    {stepIcon[step.status]}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'13px', fontWeight:600, color:'#1a1a1a', marginBottom:'2px' }}>{step.label}</div>
                    <div style={{ fontSize:'12px', color: step.status === 'fail' ? '#dc2626' : '#64748b' }}>{step.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Error details */}
          {!result.success && result.errorMessage && (
            <div style={{ background:'#fff7ed', border:'1px solid #fdba74', borderRadius:'10px', padding:'14px 16px' }}>
              <div style={{ fontSize:'12px', color:'#92400e', fontWeight:600, marginBottom:'6px', display:'flex', alignItems:'center', gap:'6px' }}>
                <span>⚠</span> Error Details {result.errorCode && <code style={{ background:'#fef3c7', padding:'1px 6px', borderRadius:'4px', fontSize:'11px' }}>{result.errorCode}</code>}
              </div>
              <div style={{ fontSize:'13px', color:'#78350f', lineHeight:'1.5' }}>{result.errorMessage}</div>
            </div>
          )}

          {/* Suggestion */}
          {result.suggestion && (
            <div style={{ background:'#eff6ff', border:'1px solid #93c5fd', borderRadius:'10px', padding:'14px 16px' }}>
              <div style={{ fontSize:'12px', color:'#1d4ed8', fontWeight:600, marginBottom:'6px' }}>💡 How to fix this</div>
              <div style={{ fontSize:'13px', color:'#1e40af', lineHeight:'1.5' }}>{result.suggestion}</div>
            </div>
          )}

          {/* Latency */}
          {result.success && result.latencyMs && (
            <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:'10px', padding:'12px 16px', display:'flex', alignItems:'center', gap:'10px' }}>
              <span style={{ fontSize:'20px' }}>🚀</span>
              <div style={{ fontSize:'13px', color:'#166534' }}>
                Connection verified in <strong>{result.latencyMs}ms</strong>. Status updated to <strong>Active</strong>.
              </div>
            </div>
          )}

          <button onClick={onClose} style={{ width:'100%', padding:'11px', borderRadius:'8px', border:'1px solid #e2e8f0', background: result.success ? '#2563eb' : '#fff', color: result.success ? '#fff' : '#64748b', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
            {result.success ? '✓ Done' : 'Close & Edit Connection'}
          </button>
        </div>
      </div>
    </div>
  )
}

const CONNECTION_TYPES: { value: ConnectionType; label: string; color: string }[] = [
  { value: 'postgresql', label: 'PostgreSQL', color: '#336791' },
  { value: 'mysql', label: 'MySQL', color: '#00758f' },
  { value: 'snowflake', label: 'Snowflake', color: '#29B5E8' },
  { value: 'bigquery', label: 'BigQuery', color: '#4285F4' },
  { value: 'redshift', label: 'Redshift', color: '#8C4FFF' },
  { value: 'mongodb', label: 'MongoDB', color: '#13AA52' },
  { value: 'csv', label: 'CSV / File', color: '#64748b' },
  { value: 'api', label: 'REST API', color: '#f59e0b' },
]

interface FieldDef {
  key: string; label: string; placeholder: string
  required?: boolean; type?: string; full?: boolean; hint?: string
}

const typeFields: Record<ConnectionType, FieldDef[]> = {
  postgresql: [
    { key: 'host', label: 'Host', placeholder: 'db.example.com', required: true },
    { key: 'port', label: 'Port', placeholder: '5432', type: 'number' },
    { key: 'database', label: 'Database', placeholder: 'my_database', required: true },
    { key: 'schema', label: 'Schema', placeholder: 'public' },
    { key: 'username', label: 'Username', placeholder: 'db_user' },
    { key: 'password', label: 'Password', placeholder: '••••••••', type: 'password' },
  ],
  mysql: [
    { key: 'host', label: 'Host', placeholder: 'db.example.com', required: true },
    { key: 'port', label: 'Port', placeholder: '3306', type: 'number' },
    { key: 'database', label: 'Database', placeholder: 'my_database', required: true },
    { key: 'username', label: 'Username', placeholder: 'root' },
    { key: 'password', label: 'Password', placeholder: '••••••••', type: 'password' },
  ],
  snowflake: [
    { key: 'account', label: 'Account Identifier', placeholder: 'abc12345.us-east-1', required: true, full: true, hint: 'Found in your Snowflake URL: <account>.snowflakecomputing.com' },
    { key: 'warehouse', label: 'Warehouse', placeholder: 'COMPUTE_WH', required: true },
    { key: 'role', label: 'Role', placeholder: 'SYSADMIN' },
    { key: 'database', label: 'Database', placeholder: 'MY_DATABASE', required: true },
    { key: 'schema', label: 'Schema', placeholder: 'PUBLIC' },
    { key: 'username', label: 'Username', placeholder: 'SNOWFLAKE_USER', required: true },
    { key: 'password', label: 'Password', placeholder: '••••••••', type: 'password', required: true },
  ],
  bigquery: [
    { key: 'project', label: 'Project ID', placeholder: 'my-gcp-project-123', required: true, full: true },
    { key: 'database', label: 'Dataset', placeholder: 'my_dataset' },
    { key: 'keyFile', label: 'Service Account Key Path', placeholder: '/path/to/service-account.json', full: true, hint: 'Or set GOOGLE_APPLICATION_CREDENTIALS env variable' },
  ],
  redshift: [
    { key: 'host', label: 'Cluster Endpoint', placeholder: 'cluster.abc123.us-east-1.redshift.amazonaws.com', required: true, full: true },
    { key: 'port', label: 'Port', placeholder: '5439', type: 'number' },
    { key: 'database', label: 'Database', placeholder: 'dev', required: true },
    { key: 'schema', label: 'Schema', placeholder: 'public' },
    { key: 'username', label: 'Username', placeholder: 'awsuser' },
    { key: 'password', label: 'Password', placeholder: '••••••••', type: 'password' },
  ],
  mongodb: [
    { key: 'connectionString', label: 'Connection String', placeholder: 'mongodb+srv://user:pass@cluster.mongodb.net/db', required: true, full: true, hint: 'Full MongoDB URI — include username & password directly in the URI, or use the fields below' },
    { key: 'database', label: 'Database Name', placeholder: 'my_database', required: true },
    { key: 'username', label: 'Username (optional)', placeholder: 'mongo_user' },
    { key: 'password', label: 'Password (optional)', placeholder: '••••••••', type: 'password' },
  ],
  csv: [
    { key: 'filePath', label: 'File Path or URL', placeholder: '/data/file.csv  or  https://example.com/data.csv', required: true, full: true },
    { key: 'delimiter', label: 'Delimiter', placeholder: ', (comma)' },
    { key: 'schema', label: 'Sheet / Table Name', placeholder: 'Sheet1' },
    { key: 'username', label: 'Username (if auth required)', placeholder: 'user' },
    { key: 'password', label: 'Password (if auth required)', placeholder: '••••••••', type: 'password' },
  ],
  api: [
    { key: 'host', label: 'Base URL', placeholder: 'https://api.example.com', required: true, full: true },
    { key: 'schema', label: 'Auth Type', placeholder: 'bearer | api-key | basic | none' },
    { key: 'database', label: 'Data Endpoint', placeholder: '/v1/data' },
    { key: 'username', label: 'API Key / Username', placeholder: 'sk-... or api_user' },
    { key: 'password', label: 'API Secret / Password', placeholder: '••••••••', type: 'password' },
  ],
}

const typeInfo: Record<ConnectionType, { desc: string; docUrl: string }> = {
  postgresql: { desc: 'Open-source relational database', docUrl: '#' },
  mysql: { desc: 'Popular open-source RDBMS', docUrl: '#' },
  snowflake: { desc: 'Cloud data warehouse platform', docUrl: '#' },
  bigquery: { desc: 'Google serverless data warehouse', docUrl: '#' },
  redshift: { desc: 'AWS cloud data warehouse', docUrl: '#' },
  mongodb: { desc: 'Document-oriented NoSQL database', docUrl: '#' },
  csv: { desc: 'Flat file (CSV, TSV, Excel)', docUrl: '#' },
  api: { desc: 'REST API data source', docUrl: '#' },
}

const statusBadge = {
  active: { bg: '#dcfce7', color: '#16a34a', dot: '#16a34a', label: 'Active' },
  inactive: { bg: '#f8fafc', color: '#64748b', dot: '#94a3b8', label: 'Inactive' },
  error: { bg: '#fee2e2', color: '#dc2626', dot: '#dc2626', label: 'Error' }
}

interface Props { initialConnections: Connection[] }

type FormState = Record<string, string> & { name: string; type: ConnectionType }

export default function ConnectionsClient({ initialConnections }: Props) {
  // On mount: merge localStorage with server-provided data
  const [connections, setConnections] = useState<Connection[]>(() => {
    // SSR-safe: only read localStorage on client
    if (typeof window === 'undefined') return initialConnections
    try {
      const raw = localStorage.getItem(LS_KEY)
      const stored: Connection[] = raw ? JSON.parse(raw) : []
      if (stored.length > 0) {
        const storedIds = new Set(stored.map(c => c.id))
        return [...stored, ...initialConnections.filter(c => !storedIds.has(c.id))]
      }
    } catch { /* ignore */ }
    return initialConnections
  })
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>({ name: '', type: 'postgresql' })
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ result: TestResult; connName: string } | null>(null)
  const _router = useRouter()

  // Persist to localStorage whenever connections change + notify sidebar
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(connections))
      // Notify sidebar's connection selector to re-read
      window.dispatchEvent(new Event('dataguard-connections-updated'))
    } catch { /* quota */ }
  }, [connections])

  const fields = typeFields[form.type] || []
  const connInfo = typeInfo[form.type]

  function setField(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function resetForm() {
    setForm({ name: '', type: 'postgresql' })
    setEditingId(null)
    setShowModal(false)
  }

  function openEdit(conn: Connection) {
    // Pre-fill form with all existing connection fields
    const filled: FormState = { name: conn.name, type: conn.type }
    const connRecord = conn as unknown as Record<string, unknown>
    typeFields[conn.type]?.forEach(f => {
      if (connRecord[f.key] !== undefined && connRecord[f.key] !== null) {
        filled[f.key] = String(connRecord[f.key])
      }
    })
    setForm(filled)
    setEditingId(conn.id)
    setShowModal(true)
  }

  async function save() {
    if (!form.name) return
    setSaving(true)
    const payload: Record<string, unknown> = { ...form }
    if (form.port) payload.port = parseInt(form.port)

    if (editingId) {
      // UPDATE existing connection
      const res = await fetch('/api/connections', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...payload })
      })
      const updated = await res.json()
      setConnections(prev => prev.map(c => c.id === editingId ? updated : c))
    } else {
      // CREATE new connection
      const res = await fetch('/api/connections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const newConn = await res.json()
      setConnections(prev => [...prev, newConn])
    }

    resetForm()
    setSaving(false)
    // state is managed locally — no server refresh needed
  }

  async function testConn(id: string, connName: string) {
    setTesting(id)
    try {
      // Send full connection data so the test endpoint doesn't depend on server-side store
      const conn = connections.find(c => c.id === id)
      const res = await fetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: id, connectionData: conn })
      })
      const result: TestResult = await res.json()
      // Update local connection status based on test result
      if (result.status) {
        setConnections(prev => prev.map(c =>
          c.id === id ? { ...c, status: result.status as Connection['status'], lastTested: new Date().toISOString() } : c
        ))
      }
      setTestResult({ result, connName })
    } catch (e: unknown) {
      setTestResult({
        result: {
          success: false, status: 'error',
          steps: [{ label: 'API call', status: 'fail', detail: (e as Error).message }],
          errorCode: 'CLIENT_ERROR',
          errorMessage: 'Could not reach the test endpoint.',
          suggestion: 'Make sure the dev server is running.'
        },
        connName
      })
    } finally {
      setTesting(null)
      // state is managed locally — no server refresh needed
    }
  }

  async function deleteConn(id: string) {
    if (!confirm('Delete this connection?')) return
    await fetch(`/api/connections?id=${id}`, { method: 'DELETE' })
    setConnections(prev => prev.filter(c => c.id !== id))
    // state is managed locally — no server refresh needed
  }

  const inp = (full?: boolean): React.CSSProperties => ({
    width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
    fontSize: '13px', color: '#0f172a', background: '#fafaf9', outline: 'none',
    gridColumn: full ? '1 / -1' : undefined
  })

  const selectedType = CONNECTION_TYPES.find(t => t.value === form.type)

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1200px' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Connections</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            {connections.length} data source{connections.length !== 1 ? 's' : ''} — {connections.filter(c => c.status === 'active').length} active
          </p>
        </div>
        <button onClick={() => setShowModal(true)} style={{
          background: '#dbeafe', border: '1px solid #93c5fd', padding: '8px 16px',
          borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#2563eb', cursor: 'pointer'
        }}>+ Add Connection</button>
      </div>

      {/* Connection Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
        {connections.map(conn => {
          const s = statusBadge[conn.status]
          const icon = connectionIcons[conn.type] || '🔌'
          const typeColor = CONNECTION_TYPES.find(t => t.value === conn.type)?.color || '#64748b'
          const fields = typeFields[conn.type] || []

          return (
            <div key={conn.id} style={{
              background: '#fff', borderRadius: '12px', padding: '20px',
              border: '1px solid #ebe8df', transition: 'box-shadow 0.2s'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '10px',
                    background: `${typeColor}18`, border: `1px solid ${typeColor}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
                  }}>{icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '14px' }}>{conn.name}</div>
                    <div style={{ color: typeColor, fontSize: '11.5px', fontWeight: 600, textTransform: 'capitalize' }}>
                      {CONNECTION_TYPES.find(t => t.value === conn.type)?.label || conn.type}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: s.bg, color: s.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 600 }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.dot }} />{s.label}
                </div>
              </div>

              {/* Type-specific details */}
              <div style={{ background: '#fafaf9', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', border: '1px solid #ebe8df' }}>
                {fields.filter(f => !['username', 'keyFile', 'connectionString'].includes(f.key)).slice(0, 3).map(f => {
                  const val = (conn as unknown as Record<string, unknown>)[f.key] as string | undefined
                  return val ? (
                    <div key={f.key} style={{ display: 'flex', gap: '8px', fontSize: '12px', color: '#475569', marginBottom: '3px' }}>
                      <span style={{ color: '#94a3b8', minWidth: '70px' }}>{f.label}:</span>
                      <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
                    </div>
                  ) : null
                })}
                {conn.host && !fields.find(f => f.key === 'account') && (
                  <div style={{ fontSize: '12px', color: '#475569', marginBottom: '3px' }}>
                    <span style={{ color: '#94a3b8' }}>Host: </span>
                    <span style={{ fontWeight: 500 }}>{conn.host}{conn.port ? `:${conn.port}` : ''}</span>
                  </div>
                )}
                {conn.database && (
                  <div style={{ fontSize: '12px', color: '#475569', marginBottom: '3px' }}>
                    <span style={{ color: '#94a3b8' }}>Database: </span>
                    <span style={{ fontWeight: 500 }}>{conn.database}</span>
                  </div>
                )}
                {conn.lastTested && (
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    Last tested: {formatDateTime(conn.lastTested)}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => testConn(conn.id, conn.name)} disabled={testing === conn.id} style={{
                  flex: 1, padding: '7px', borderRadius: '7px', border: '1px solid #e2e8f0',
                  background: testing === conn.id ? '#f8fafc' : '#fff',
                  color: testing === conn.id ? '#94a3b8' : '#475569',
                  fontSize: '12px', fontWeight: 500, cursor: testing === conn.id ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}>
                  {testing === conn.id
                    ? <><span style={{ display:'inline-block', animation:'spin 1s linear infinite' }}>⟳</span> Testing…</>
                    : '🔗 Test'}
                </button>
                <button onClick={() => openEdit(conn)} style={{
                  padding: '7px 12px', borderRadius: '7px', border: '1px solid #dbeafe',
                  background: '#fff', color: '#2563eb', fontSize: '12px', cursor: 'pointer', fontWeight: 500
                }}>✏️ Edit</button>
                <button onClick={() => deleteConn(conn.id)} style={{
                  padding: '7px 10px', borderRadius: '7px', border: '1px solid #fee2e2',
                  background: '#fff', color: '#ef4444', fontSize: '12px', cursor: 'pointer'
                }}>🗑</button>
              </div>
            </div>
          )
        })}

        {connections.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', background: '#fff', borderRadius: '14px', border: '2px dashed #e2e8f0' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔌</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' }}>No connections yet</div>
            <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>Add your first data source to start monitoring quality</div>
            <button onClick={() => setShowModal(true)} style={{ background: '#dbeafe', border: '1px solid #93c5fd', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}>+ Add Connection</button>
          </div>
        )}
      </div>

      {/* Test Result Modal */}
      {testResult && (
        <TestResultModal
          result={testResult.result}
          connName={testResult.connName}
          onClose={() => setTestResult(null)}
        />
      )}

      {/* Add Connection Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '540px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            {/* Modal Header */}
            <div style={{ padding: '22px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>
                  {editingId ? '✏️ Edit Connection' : 'Add Connection'}
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                  {editingId ? 'Update credentials or settings for this connection' : 'Connect a new data source to DataGuard'}
                </div>
              </div>
              <button onClick={resetForm} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: '#64748b', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Connection name */}
              <div>
                <label style={lbl}>Connection Name *</label>
                <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Production Snowflake" style={inp()} />
              </div>

              {/* Type selector — locked when editing */}
              {editingId ? (
                <div style={{ background: '#fafaf9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>{connectionIcons[form.type]}</span>
                  <div style={{ fontSize: '12.5px', color: '#475569' }}>
                    <strong>{CONNECTION_TYPES.find(t => t.value === form.type)?.label}</strong> — type cannot be changed after creation
                  </div>
                </div>
              ) : (
                <div>
                  <label style={lbl}>Database Type *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {CONNECTION_TYPES.map(t => (
                      <button key={t.value} onClick={() => setField('type', t.value)} style={{
                        padding: '10px 6px', borderRadius: '8px', border: '1px solid',
                        borderColor: form.type === t.value ? t.color : '#e2e8f0',
                        background: form.type === t.value ? `${t.color}12` : '#fafaf9',
                        cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s'
                      }}>
                        <div style={{ fontSize: '20px', marginBottom: '4px' }}>{connectionIcons[t.value]}</div>
                        <div style={{ fontSize: '10.5px', fontWeight: form.type === t.value ? 700 : 500, color: form.type === t.value ? t.color : '#64748b' }}>{t.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Type info banner */}
              {connInfo && (
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>{connectionIcons[form.type]}</span>
                  <div style={{ fontSize: '12.5px', color: '#0369a1' }}>
                    <strong>{selectedType?.label}</strong> — {connInfo.desc}
                  </div>
                </div>
              )}

              {/* Dynamic fields per type */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {fields.map(f => (
                  <div key={f.key} style={{ gridColumn: f.full ? '1 / -1' : undefined }}>
                    <label style={lbl}>
                      {f.label} {f.required && <span style={{ color: '#ef4444' }}>*</span>}
                    </label>
                    <input
                      value={form[f.key] || ''}
                      onChange={e => setField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      type={f.type || 'text'}
                      style={inp(f.full)}
                    />
                    {f.hint && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{f.hint}</div>}
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button onClick={resetForm} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                <button onClick={save} disabled={saving || !form.name} style={{
                  flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                  cursor: form.name ? 'pointer' : 'not-allowed',
                  background: form.name ? '#2563eb' : '#e2e8f0',
                  color: form.name ? '#fff' : '#94a3b8'
                }}>{saving ? '⏳ Saving...' : editingId ? '✓ Save Changes' : '+ Add Connection'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }
