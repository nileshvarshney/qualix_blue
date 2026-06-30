'use client'
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface DomainScore {
  id: string; name: string; icon: string
  quality: number; documentation: number; classification: number
  ownership: number; certification: number; sla: number; overall: number
  tables: string[]; rulesPassed: number; rulesTotal: number
}

interface PolicyItem {
  id: string; name: string; description: string; domain: string
  status: 'active' | 'draft' | 'review'; enforcement: 'enforced' | 'advisory'
  rulesCount: number; lastEval: string; rules: PolicyRule[]
}

interface PolicyRule { name: string; table: string; type: string; status: 'pass' | 'fail' | 'warn' }

interface ApprovalItem {
  approval_id: string
  entity_type: string
  entity_id: string
  entity_snapshot: Record<string, unknown> | null
  status: 'pending' | 'approved' | 'rejected'
  requested_by: string
  reviewed_by: string | null
  feedback: string | null
  created_at: string
  reviewed_at: string | null
}

interface Violation {
  id: string; policyId: string; policyName: string
  entityType: string; entityId: string; detail: string
  severity: string; status: 'open' | 'resolved'
  detectedAt: string; resolvedAt: string | null
  tableName: string | null; schemaName: string | null; databaseName: string | null
  domainName: string | null; subdomainName: string | null
}

interface PolicyVersion {
  version_id: string
  policy_id: string
  version_number: number
  changed_by: string
  changed_at: string
  change_summary: string | null
  field_diffs: Array<{ field: string; old_value: unknown; new_value: unknown }>
  snapshot: Record<string, unknown>
}

interface NotifConfig { slack_webhook: string; email_recipients: string; enabled: boolean }
interface ApprovalHistoryItem {
  id: string; entity_name: string; entity_type: string
  action: 'approved' | 'rejected'; actor: string; reason: string | null; timestamp: string
}

type GovernanceTab = 'scorecards' | 'policies' | 'violations' | 'approvals'
type ScorecardFilter = 'all' | 'healthy' | 'at-risk'
type PolicyFilter = 'all' | 'active' | 'draft' | 'enforced'
type ViolationFilter = 'open' | 'resolved' | 'high' | 'medium' | 'all'

const SCORE_DIMENSIONS = ['quality', 'documentation', 'classification', 'ownership', 'certification', 'sla'] as const
const DIM_LABELS: Record<string, string> = { quality: 'Data Quality', documentation: 'Documentation', classification: 'Classification', ownership: 'Ownership', certification: 'Certification', sla: 'SLA Compliance' }
const DIM_DESCRIPTIONS: Record<string, string> = {
  quality: 'Based on rule pass rate across all tables in this domain',
  documentation: 'Percentage of tables/columns with descriptions and metadata',
  classification: 'Percentage of sensitive columns properly tagged (PII, PHI, etc.)',
  ownership: 'Percentage of tables with assigned business & technical owners',
  certification: 'Percentage of datasets marked as certified/trusted',
  sla: 'Percentage of freshness and delivery SLAs met in last 30 days',
}

const SCORECARD_COLS = '1fr 72px 88px 90px 78px 82px 52px 70px'
const SCORECARD_HEADERS = ['Domain', 'Quality', 'Documentation', 'Classification', 'Ownership', 'Certification', 'SLA', 'Overall']
const POLICY_COLS = '70px 1fr 90px 80px 50px 80px'
const POLICY_HEADERS = ['Status', 'Policy', 'Domain', 'Enforcement', 'Rules', 'Last Eval']
const VIOLATION_COLS = '52px 1fr 1fr 90px 80px 62px'
const VIOLATION_HEADERS = ['Severity', 'Policy', 'Detail / Table', 'Domain', 'Detected', 'Action']

const DOMAIN_ICONS = ['📊', '🛡️', '👥', '💰', '🏥', '📈', '🔧', '📦', '🌐', '🔬']
function domainIcon(name: string): string {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % DOMAIN_ICONS.length
  return DOMAIN_ICONS[Math.abs(h)]
}

function scoreColor(s: number) { return s >= 90 ? 'var(--status-ok-text)' : s >= 75 ? 'var(--status-warn-text)' : 'var(--status-error-text)' }
function scoreBg(s: number) { return s >= 90 ? 'var(--status-ok-bg)' : s >= 75 ? 'var(--status-warn-bg)' : 'var(--status-error-bg)' }
function policyStatusColor(s: string) { return s === 'active' ? 'var(--status-ok-text)' : s === 'review' ? 'var(--status-warn-text)' : 'var(--text-muted)' }
function policyStatusBg(s: string) { return s === 'active' ? 'var(--status-ok-bg)' : s === 'review' ? 'var(--status-warn-bg)' : 'var(--surface-muted)' }
function sevColor(s: string) { return s === 'high' ? 'var(--status-error-text)' : s === 'medium' ? 'var(--status-warn-text)' : 'var(--text-muted)' }
function sevBg(s: string) { return s === 'high' ? 'var(--status-error-bg)' : s === 'medium' ? 'var(--status-warn-bg)' : 'var(--surface-muted)' }

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const emptyForm = { name: '', description: '', domain: 'All', enforcement: 'enforced' as 'enforced' | 'advisory', status: 'draft' as 'active' | 'draft' | 'review' }

function VersionRow({ version }: { version: { version_number: number; changed_by: string; changed_at: string; change_summary: string | null; field_diffs: Array<{ field: string; old_value: unknown; new_value: unknown }> } }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
          background: 'var(--surface)', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 13 }}>v{version.version_number}</span>
          <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>{version.change_summary ?? 'Updated'} · {fmtDate(version.changed_at)} · {version.changed_by}</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && version.field_diffs.length > 0 && (
        <div style={{ padding: '10px 14px', background: 'var(--surface-muted)', borderTop: '1px solid var(--border)' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '2px 8px', fontWeight: 600 }}>Field</th>
                <th style={{ textAlign: 'left', padding: '2px 8px', fontWeight: 600 }}>Old</th>
                <th style={{ textAlign: 'left', padding: '2px 8px', fontWeight: 600 }}>New</th>
              </tr>
            </thead>
            <tbody>
              {version.field_diffs.map((d, i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 8px', color: 'var(--text-muted)' }}>{d.field}</td>
                  <td style={{ padding: '2px 8px', color: 'var(--status-error-text)' }}>{String(d.old_value ?? '—')}</td>
                  <td style={{ padding: '2px 8px', color: 'var(--status-ok-text)' }}>{String(d.new_value ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface GovernancePolicyQAProps {
  policies: PolicyItem[]
}

function GovernancePolicyQA({ policies }: GovernancePolicyQAProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ q: string; a: string }[]>([])

  const askQuestion = async () => {
    if (!question.trim()) return
    setLoading(true)
    setError(null)
    const policyContext = policies.slice(0, 20).map(p => ({
      name: p.name, domain: p.domain, status: p.status, enforcement: p.enforcement,
      description: p.description,
    }))
    try {
      const res = await apiFetch('/api/ai/governance-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, policies: policyContext }),
        cache: 'no-store',
      })
      const data = await res.json() as Record<string, unknown>
      const ans = String(data.answer ?? data.response ?? data.text ?? JSON.stringify(data))
      setAnswer(ans)
      setHistory(prev => [{ q: question, a: ans }, ...prev].slice(0, 5))
      setQuestion('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI query unavailable')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ margin: '8px 0', background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', border: '1px solid #93c5fd', borderRadius: '8px', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px' }}>🤖</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Policy Q&A</span>
        <span style={{ fontSize: '10px', color: '#3b82f6', marginLeft: '4px' }}>Ask a question about your governance policies</span>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askQuestion() } }}
          placeholder="e.g. Which policies apply to the finance domain? Are any advisory policies enforcement candidates?"
          style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '12px', background: '#fff', color: 'var(--foreground)', outline: 'none' }}
          disabled={loading}
        />
        <button
          onClick={askQuestion}
          disabled={loading || !question.trim()}
          style={{ padding: '7px 14px', borderRadius: '6px', border: 'none', background: loading || !question.trim() ? 'var(--border)' : '#2563eb', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: loading || !question.trim() ? 'default' : 'pointer' }}
        >
          {loading ? '…' : 'Ask'}
        </button>
      </div>
      {error && <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--status-error-text)' }}>{error}</div>}
      {answer && (
        <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Answer</div>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#1e3a5f', lineHeight: '1.65', whiteSpace: 'pre-wrap' }}>{answer}</p>
        </div>
      )}
      {history.length > 1 && (
        <div style={{ marginTop: '10px', borderTop: '1px solid #bfdbfe', paddingTop: '8px' }}>
          <div style={{ fontSize: '9.5px', color: '#3b82f6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Previous questions</div>
          {history.slice(1).map((h, i) => (
            <div key={i} style={{ marginBottom: '6px', opacity: 0.75 }}>
              <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#1e40af' }}>Q: {h.q}</div>
              <div style={{ fontSize: '10.5px', color: '#1e3a5f', marginTop: '2px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>A: {h.a}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GovernancePage() {
  const [tab, setTab] = useState<GovernanceTab>('scorecards')
  const [scorecardFilter, setScorecardFilter] = useState<ScorecardFilter>('all')
  const [policyFilter, setPolicyFilter] = useState<PolicyFilter>('all')
  const [violationFilter, setViolationFilter] = useState<ViolationFilter>('open')
  const [selectedDomain, setSelectedDomain] = useState<DomainScore | null>(null)
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyItem | null>(null)
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<PolicyItem | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [policies, setPolicies] = useState<PolicyItem[]>([])
  const [domains, setDomains] = useState<DomainScore[]>([])
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingViolations, setLoadingViolations] = useState(false)
  const [violationsLoaded, setViolationsLoaded] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [evalResult, setEvalResult] = useState<{ violations_found: number; assets_evaluated: number } | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [policyForm, setPolicyForm] = useState(emptyForm)
  const [currentUser, setCurrentUser] = useState<{ role: string; domain_id: string | null } | null>(null)
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [approvalsLoaded, setApprovalsLoaded] = useState(false)
  const [approvalActionLoading, setApprovalActionLoading] = useState<string | null>(null)
  const [approvalActionError, setApprovalActionError] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ApprovalItem | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'policy' | 'contract' | 'data_product' | 'domain_ownership' | 'glossary_term' | 'rule'>('pending')
  const [pendingRules, setPendingRules] = useState<Array<{ id: string; name: string; createdBy?: string; createdAt: string }>>([])
  const [pendingRulesLoaded, setPendingRulesLoaded] = useState(false)
  const [policyVersions, setPolicyVersions] = useState<PolicyVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [policyPanelTab, setPolicyPanelTab] = useState<'violations' | 'history'>('violations')
  const [notifConfig, setNotifConfig] = useState<NotifConfig>({ slack_webhook: '', email_recipients: '', enabled: false })
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifSaved, setNotifSaved] = useState(false)
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistoryItem[]>([])
  const [historyFilter, setHistoryFilter] = useState<'all' | 'approved' | 'rejected'>('all')
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [policiesRes, scorecardsRes] = await Promise.allSettled([
      apiFetch('/api/governance').then(r => r.json()).catch(() => []),
      apiFetch('/api/governance/scorecards').then(r => r.json()).catch(() => []),
    ])
    const rawPolicies = policiesRes.status === 'fulfilled' ? (Array.isArray(policiesRes.value) ? policiesRes.value : []) : []
    const rawScores = scorecardsRes.status === 'fulfilled' ? (Array.isArray(scorecardsRes.value) ? scorecardsRes.value : []) : []

    setPolicies(rawPolicies.map((p: Record<string, unknown>) => ({
      id: String(p.policy_id ?? p.id ?? ''),
      name: String(p.policy_name ?? p.name ?? ''),
      description: String(p.description ?? ''),
      domain: String(p.domain ?? 'All'),
      status: (['active', 'draft', 'review'] as const).includes(p.status as never)
        ? (p.status as 'active' | 'draft' | 'review')
        : (p.is_active ? 'active' : 'draft'),
      enforcement: (['enforced', 'advisory'] as const).includes(p.enforcement as never)
        ? (p.enforcement as 'enforced' | 'advisory')
        : (p.severity === 'high' ? 'enforced' : 'advisory'),
      rulesCount: Number(p.rules_count ?? p.rulesCount ?? 0),
      lastEval: String(p.last_evaluated ?? p.lastEval ?? 'Never'),
      rules: [],
    })))

    setDomains(rawScores.map((d: Record<string, unknown>) => ({
      id: String(d.domain_id ?? d.id ?? ''),
      name: String(d.domain_name ?? d.name ?? ''),
      icon: domainIcon(String(d.domain_name ?? d.name ?? '')),
      quality: Math.round(Number(d.quality_score ?? d.quality ?? 0)),
      documentation: Math.round(Number(d.documentation_score ?? d.documentation ?? 0)),
      classification: Math.round(Number(d.classification_score ?? d.classification ?? 0)),
      ownership: Math.round(Number(d.ownership_score ?? d.ownership ?? 0)),
      certification: Math.round(Number(d.certification_score ?? d.certification ?? 0)),
      sla: Math.round(Number(d.sla_score ?? d.sla ?? 0)),
      overall: Math.round(Number(d.overall_score ?? d.overall ?? 0)),
      tables: [], rulesPassed: 0, rulesTotal: 0,
    })))
    setLoading(false)
  }, [])

  const loadApprovals = useCallback(async () => {
    const params = new URLSearchParams()
    if (approvalFilter !== 'all' && ['pending', 'approved', 'rejected'].includes(approvalFilter)) {
      params.set('status', approvalFilter)
    } else if (!['all', 'pending'].includes(approvalFilter)) {
      params.set('entity_type', approvalFilter)
    } else if (approvalFilter === 'pending') {
      params.set('status', 'pending')
    }
    const data = await apiFetch(`/api/governance/approvals?${params}`).then(r => r.json()).catch(() => [])
    setApprovals(Array.isArray(data) ? data : [])
    setApprovalsLoaded(true)
  }, [approvalFilter])


  const loadApprovalHistory = useCallback(() => {
    setHistoryLoading(true)
    apiFetch('/api/governance/approval-history?limit=30', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setApprovalHistory(d.items ?? []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  async function saveNotifConfig() {
    setNotifSaving(true)
    try {
      const res = await apiFetch('/api/governance/notification-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(notifConfig),
      })
      if (res.ok) { const d = await res.json(); setNotifConfig(d) }
      setNotifSaved(true); setTimeout(() => setNotifSaved(false), 2500)
    } finally { setNotifSaving(false) }
  }

  const loadViolations = useCallback(async () => {
    setLoadingViolations(true)
    try {
      const res = await apiFetch('/api/governance/violations?limit=500')
      const data = await res.json()
      const arr = Array.isArray(data) ? data : []
      setViolations(arr.map((v: Record<string, unknown>) => ({
        id: String(v.violation_id ?? ''),
        policyId: String(v.policy_id ?? ''),
        policyName: String(v.policy_name ?? ''),
        entityType: String(v.entity_type ?? ''),
        entityId: String(v.entity_id ?? ''),
        detail: String(v.violation_detail ?? ''),
        severity: String(v.severity ?? 'medium'),
        status: v.status === 'resolved' ? 'resolved' : 'open',
        detectedAt: String(v.detected_at ?? ''),
        resolvedAt: v.resolved_at ? String(v.resolved_at) : null,
        tableName: v.sf_table_name ? String(v.sf_table_name) : null,
        schemaName: v.sf_schema_name ? String(v.sf_schema_name) : null,
        databaseName: v.sf_database_name ? String(v.sf_database_name) : null,
        domainName: v.domain_name ? String(v.domain_name) : null,
        subdomainName: v.subdomain_name ? String(v.subdomain_name) : null,
      })))
      setViolationsLoaded(true)
    } finally { setLoadingViolations(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { if (tab === 'violations' && !violationsLoaded) loadViolations() }, [tab, violationsLoaded, loadViolations])
  useEffect(() => {
    if (tab === 'approvals' && !approvalsLoaded) loadApprovals()
  }, [tab, approvalsLoaded, loadApprovals])
  useEffect(() => {
    if (tab !== 'approvals') return
    // load notification config and history once on tab entry
    apiFetch('/api/governance/notification-config').then(r => r.ok ? r.json() : null).then(d => { if (d) setNotifConfig(d) }).catch(() => {})
    loadApprovalHistory()
  }, [tab, loadApprovalHistory])
  useEffect(() => {
    if (approvalFilter !== 'rule') setPendingRulesLoaded(false)
    if (tab === 'approvals') { setApprovalsLoaded(false); loadApprovals() }
  }, [approvalFilter, tab, loadApprovals])
  useEffect(() => {
    if (tab === 'approvals' && approvalFilter === 'rule' && !pendingRulesLoaded) {
      apiFetch('/api/rules')
        .then(r => r.json())
        .then(data => {
          const arr = Array.isArray(data) ? data : []
          setPendingRules(arr.filter((r: Record<string, unknown>) => r.status === 'pending_review').map((r: Record<string, unknown>) => ({
            id: String(r.id ?? ''),
            name: String(r.name ?? ''),
            createdBy: r.createdBy ? String(r.createdBy) : undefined,
            createdAt: String(r.createdAt ?? r.created_at ?? ''),
          })))
          setPendingRulesLoaded(true)
        })
        .catch(() => setPendingRulesLoaded(true))
    }
  }, [tab, approvalFilter, pendingRulesLoaded])
  useEffect(() => {
    apiFetch('/api/me')
      .then(r => r.json())
      .then(data => setCurrentUser({ role: data.role ?? 'viewer', domain_id: data.domain_id ?? null }))
      .catch(() => setCurrentUser({ role: 'viewer', domain_id: null }))
  }, [])
  useEffect(() => {
    if (policyPanelTab === 'history' && selectedPolicy) {
      setVersionsLoading(true)
      apiFetch(`/api/governance/policies/${selectedPolicy.id}/versions`)
        .then(r => r.json())
        .then(data => setPolicyVersions(Array.isArray(data) ? data : []))
        .catch(() => setPolicyVersions([]))
        .finally(() => setVersionsLoading(false))
    }
  }, [policyPanelTab, selectedPolicy])
  useEffect(() => { setPolicyPanelTab('violations') }, [selectedPolicy])

  const runEvaluation = async () => {
    setEvaluating(true); setEvalResult(null)
    try {
      const res = await apiFetch('/api/governance/evaluate', { method: 'POST' })
      if (res.ok) {
        setEvalResult(await res.json())
        setViolationsLoaded(false)
        await loadData()
      }
    } finally { setEvaluating(false) }
  }

  const resolveViolation = async (id: string) => {
    setResolvingId(id)
    try {
      const res = await apiFetch(`/api/governance/violations/${id}/resolve`, { method: 'POST' })
      if (res.ok) {
        setViolations(prev => prev.map(v => v.id === id ? { ...v, status: 'resolved', resolvedAt: new Date().toISOString() } : v))
      }
    } finally { setResolvingId(null) }
  }

  const openCreate = () => { setEditingPolicy(null); setPolicyForm(emptyForm); setShowPolicyModal(true) }
  const openEdit = (p: PolicyItem) => {
    setSelectedPolicy(null)
    setEditingPolicy(p)
    setPolicyForm({ name: p.name, description: p.description, domain: p.domain, enforcement: p.enforcement, status: p.status })
    setShowPolicyModal(true)
  }

  const savePolicy = async () => {
    if (!policyForm.name) return
    try {
      if (editingPolicy) {
        const res = await apiFetch('/api/governance', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingPolicy.id, policy_name: policyForm.name, description: policyForm.description, severity: policyForm.enforcement === 'enforced' ? 'high' : 'medium', is_active: policyForm.status === 'active' }) })
        if (res.ok) await loadData()
      } else {
        const res = await apiFetch('/api/governance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy_name: policyForm.name, description: policyForm.description, policy_type: policyForm.enforcement === 'enforced' ? 'data_quality' : 'advisory', severity: policyForm.enforcement === 'enforced' ? 'high' : 'medium', is_active: policyForm.status === 'active' }) })
        if (res.ok) await loadData()
        else setPolicies(prev => [...prev, { id: `p${Date.now()}`, name: policyForm.name, description: policyForm.description, domain: policyForm.domain, status: policyForm.status, enforcement: policyForm.enforcement, rulesCount: 0, lastEval: 'Never', rules: [] }])
      }
    } catch {
      if (!editingPolicy) setPolicies(prev => [...prev, { id: `p${Date.now()}`, name: policyForm.name, description: policyForm.description, domain: policyForm.domain, status: policyForm.status, enforcement: policyForm.enforcement, rulesCount: 0, lastEval: 'Never', rules: [] }])
    }
    setShowPolicyModal(false); setEditingPolicy(null); setPolicyForm(emptyForm)
  }

  const deactivatePolicy = async (id: string) => {
    const res = await apiFetch(`/api/governance?id=${id}`, { method: 'DELETE' })
    if (res.ok) { setSelectedPolicy(null); setConfirmDeactivate(false); await loadData() }
  }

  const activeCount = policies.filter(p => p.status === 'active').length
  const enforcedCount = policies.filter(p => p.enforcement === 'enforced').length
  const govScore = domains.length > 0 ? Math.round(domains.reduce((s, d) => s + d.overall, 0) / domains.length) : null
  const avgOwnership = domains.length > 0 ? Math.round(domains.reduce((s, d) => s + d.ownership, 0) / domains.length) : null
  const avgClassification = domains.length > 0 ? Math.round(domains.reduce((s, d) => s + d.classification, 0) / domains.length) : null

  const openViolations = violations.filter(v => v.status === 'open')
  const highViolations = violations.filter(v => v.severity === 'high' && v.status === 'open')

  const filteredDomains = domains.filter(d => scorecardFilter === 'healthy' ? d.overall >= 90 : scorecardFilter === 'at-risk' ? d.overall < 75 : true)
  const filteredPolicies = policies.filter(p => policyFilter === 'active' ? p.status === 'active' : policyFilter === 'draft' ? p.status === 'draft' : policyFilter === 'enforced' ? p.enforcement === 'enforced' : true)
  const filteredViolations = violations.filter(v =>
    violationFilter === 'open' ? v.status === 'open' :
    violationFilter === 'resolved' ? v.status === 'resolved' :
    violationFilter === 'high' ? v.severity === 'high' && v.status === 'open' :
    violationFilter === 'medium' ? v.severity === 'medium' && v.status === 'open' :
    true
  )

  const closePopups = () => { setSelectedDomain(null); setSelectedPolicy(null); setConfirmDeactivate(false) }

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Governance</span>
        {govScore !== null
          ? <span style={{ background: scoreBg(govScore), color: scoreColor(govScore), padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>Score: {govScore}</span>
          : <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>Score: —</span>
        }
        {activeCount > 0 && <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{activeCount} active</span>}
        {enforcedCount > 0 && <span style={{ background: 'var(--accent-bg)', color: 'var(--accent)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{enforcedCount} enforced</span>}
        {violationsLoaded && openViolations.length > 0 && <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{openViolations.length} open violations</span>}
        {evalResult && <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{evalResult.violations_found} new · {evalResult.assets_evaluated} assets</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button onClick={runEvaluation} disabled={evaluating} style={{ background: evaluating ? 'var(--surface-muted)' : 'var(--surface)', color: evaluating ? 'var(--text-muted)' : 'var(--text-secondary)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: evaluating ? 'default' : 'pointer' }}>
            {evaluating ? 'Evaluating…' : '▶ Evaluate'}
          </button>
          <button onClick={openCreate} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Policy</button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
        {[
          ['Governance Score', govScore !== null ? String(govScore) : '—'],
          ['Ownership Coverage', avgOwnership !== null ? avgOwnership + '%' : '—'],
          ['Policies Active', String(activeCount)],
          ['Open Violations', violationsLoaded ? String(openViolations.length) : '—'],
          ['High Severity', violationsLoaded ? String(highViolations.length) : '—'],
        ].map(([l, v], i) => (
          <div key={i} style={{ padding: '5px 10px', borderRight: i < 4 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)' }}>{l}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: v === '—' ? 'var(--text-muted)' : (i >= 3 && v !== '0') ? 'var(--status-error-text)' : 'var(--foreground)', marginTop: '1px' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* tabs + filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
        {(['scorecards', 'policies', 'violations', 'approvals'] as GovernanceTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: tab === t ? '#1a1a1a' : 'var(--surface-muted)', color: tab === t ? '#fff' : 'var(--text-secondary)', fontWeight: tab === t ? 600 : 400, fontSize: '11px', textTransform: 'capitalize' }}>
            {t === 'scorecards'
              ? `Scorecards (${filteredDomains.length})`
              : t === 'policies'
              ? `Policies (${filteredPolicies.length})`
              : t === 'violations'
              ? `Violations (${violationsLoaded ? filteredViolations.length : '…'})`
              : `Approvals (${approvalsLoaded ? approvals.length : '…'})`}
          </button>
        ))}
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 4px' }} />
        {tab === 'scorecards' && ([['all', 'All'], ['healthy', 'Healthy'], ['at-risk', 'At-Risk']] as [ScorecardFilter, string][]).map(([f, l]) => (
          <button key={f} onClick={() => setScorecardFilter(f)} style={{ padding: '3px 8px', borderRadius: '5px', border: `1px solid ${scorecardFilter === f ? 'var(--accent)' : 'var(--border)'}`, background: scorecardFilter === f ? 'var(--accent-bg)' : 'transparent', color: scorecardFilter === f ? 'var(--accent)' : 'var(--text-muted)', fontSize: '10px', cursor: 'pointer' }}>{l}</button>
        ))}
        {tab === 'policies' && ([['all', 'All'], ['active', 'Active'], ['draft', 'Draft'], ['enforced', 'Enforced']] as [PolicyFilter, string][]).map(([f, l]) => (
          <button key={f} onClick={() => setPolicyFilter(f)} style={{ padding: '3px 8px', borderRadius: '5px', border: `1px solid ${policyFilter === f ? 'var(--accent)' : 'var(--border)'}`, background: policyFilter === f ? 'var(--accent-bg)' : 'transparent', color: policyFilter === f ? 'var(--accent)' : 'var(--text-muted)', fontSize: '10px', cursor: 'pointer' }}>{l}</button>
        ))}
        {tab === 'violations' && ([['open', 'Open'], ['high', 'High'], ['medium', 'Medium'], ['resolved', 'Resolved'], ['all', 'All']] as [ViolationFilter, string][]).map(([f, l]) => (
          <button key={f} onClick={() => setViolationFilter(f)} style={{ padding: '3px 8px', borderRadius: '5px', border: `1px solid ${violationFilter === f ? 'var(--accent)' : 'var(--border)'}`, background: violationFilter === f ? 'var(--accent-bg)' : 'transparent', color: violationFilter === f ? 'var(--accent)' : 'var(--text-muted)', fontSize: '10px', cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      {/* column headers */}
      {tab === 'scorecards' && !loading && filteredDomains.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: SCORECARD_COLS, gap: '0 6px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {SCORECARD_HEADERS.map(h => <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.3', whiteSpace: 'normal', wordBreak: 'break-word' }}>{h}</span>)}
        </div>
      )}
      {tab === 'policies' && !loading && filteredPolicies.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: POLICY_COLS, gap: '0 6px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {POLICY_HEADERS.map(h => <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>)}
        </div>
      )}
      {tab === 'violations' && !loadingViolations && filteredViolations.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: VIOLATION_COLS, gap: '0 6px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {VIOLATION_HEADERS.map(h => <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>)}
        </div>
      )}

      {/* scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {(loading || (tab === 'violations' && loadingViolations)) && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Loading…</div>
        )}

        {/* scorecards */}
        {tab === 'scorecards' && !loading && filteredDomains.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>No domain scorecard data yet — add domains in Asset Registry first</div>}
        {tab === 'scorecards' && !loading && filteredDomains.map(d => (
          <div key={d.id} onClick={() => setSelectedDomain(d)}
            style={{ display: 'grid', gridTemplateColumns: SCORECARD_COLS, gap: '0 6px', alignItems: 'center', padding: '5px 6px', borderLeft: `2px solid ${scoreColor(d.overall)}`, borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.icon} {d.name}</span>
            {SCORE_DIMENSIONS.map(dim => (
              <span key={dim} style={{ background: scoreBg(d[dim]), color: scoreColor(d[dim]), padding: '1px 4px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textAlign: 'center' }}>{d[dim]}</span>
            ))}
            <span style={{ background: scoreBg(d.overall), color: scoreColor(d.overall), padding: '1px 6px', borderRadius: '3px', fontSize: '11px', fontWeight: 700, textAlign: 'center' }}>{d.overall}</span>
          </div>
        ))}

        {/* AI Policy Q&A */}
        {tab === 'policies' && (
          <GovernancePolicyQA policies={filteredPolicies} />
        )}

        {/* policies */}
        {tab === 'policies' && !loading && filteredPolicies.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>No policies yet</div>}
        {tab === 'policies' && !loading && filteredPolicies.map(p => (
          <div key={p.id} onClick={() => setSelectedPolicy(p)}
            style={{ display: 'grid', gridTemplateColumns: POLICY_COLS, gap: '0 6px', alignItems: 'center', padding: '5px 6px', borderLeft: `2px solid ${policyStatusColor(p.status)}`, borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            <span style={{ background: policyStatusBg(p.status), color: policyStatusColor(p.status), padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textTransform: 'capitalize' }}>{p.status}</span>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.domain}</span>
            <span style={{ background: p.enforcement === 'enforced' ? 'var(--accent-bg)' : 'var(--status-warn-bg)', color: p.enforcement === 'enforced' ? 'var(--accent)' : 'var(--status-warn-text)', padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600 }}>{p.enforcement}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>{p.rulesCount}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.lastEval}</span>
          </div>
        ))}

        {/* violations */}
        {tab === 'violations' && !loadingViolations && violationsLoaded && filteredViolations.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>No violations found — run Evaluate to check policies against assets</div>
        )}
        {tab === 'violations' && !loadingViolations && filteredViolations.map(v => (
          <div key={v.id}
            style={{ display: 'grid', gridTemplateColumns: VIOLATION_COLS, gap: '0 6px', alignItems: 'center', padding: '5px 6px', borderLeft: `2px solid ${v.status === 'resolved' ? 'var(--status-ok-text)' : sevColor(v.severity)}`, borderBottom: '1px solid var(--surface-muted)', opacity: v.status === 'resolved' ? 0.55 : 1 }}
          >
            <span style={{ background: v.status === 'resolved' ? 'var(--status-ok-bg)' : sevBg(v.severity), color: v.status === 'resolved' ? 'var(--status-ok-text)' : sevColor(v.severity), padding: '1px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' }}>
              {v.status === 'resolved' ? 'resolved' : v.severity}
            </span>
            <span style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.policyName}>{v.policyName}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.detail}>{v.detail}</div>
              {v.tableName && <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.tableName}</div>}
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.domainName ?? '—'}</span>
            <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(v.detectedAt)}</span>
            <div>
              {v.status === 'open' && (
                <button
                  onClick={() => resolveViolation(v.id)}
                  disabled={resolvingId === v.id}
                  style={{ padding: '2px 7px', borderRadius: '4px', border: '1px solid var(--status-ok-text)', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', fontSize: '9px', fontWeight: 600, cursor: resolvingId === v.id ? 'default' : 'pointer', opacity: resolvingId === v.id ? 0.5 : 1, whiteSpace: 'nowrap' }}
                >
                  {resolvingId === v.id ? '…' : '✓ Resolve'}
                </button>
              )}
            </div>
          </div>
        ))}
        {tab === 'violations' && violationsLoaded && filteredViolations.length >= 500 && (
          <div style={{ padding: '10px', textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)' }}>Showing first 500 violations — use filters to narrow results</div>
        )}

        {/* approvals */}
        {tab === 'approvals' && (
          <div style={{ padding: '0 24px 24px' }}>
            {/* ── Approval Notification Config ── */}
            <div style={{ margin: '0 0 14px', padding: '14px 16px', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)' }}>Approval Notifications</span>
                <button onClick={() => setNotifConfig(c => ({ ...c, enabled: !c.enabled }))}
                  style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', background: notifConfig.enabled ? '#16a34a' : 'var(--border)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: '2px', left: notifConfig.enabled ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                </button>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Notify via Slack/email when items are submitted for approval</span>
              </div>
              {notifConfig.enabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Slack Webhook URL</label>
                    <input value={notifConfig.slack_webhook} onChange={e => setNotifConfig(c => ({ ...c, slack_webhook: e.target.value }))}
                      placeholder="https://hooks.slack.com/services/…"
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Email Recipients (comma-separated)</label>
                    <input value={notifConfig.email_recipients} onChange={e => setNotifConfig(c => ({ ...c, email_recipients: e.target.value }))}
                      placeholder="alice@company.com, bob@company.com"
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}
              <button onClick={saveNotifConfig} disabled={notifSaving}
                style={{ marginTop: '10px', padding: '5px 14px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                {notifSaving ? 'Saving…' : notifSaved ? 'Saved ✓' : 'Save'}
              </button>
            </div>

            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {(['all', 'pending', 'policy', 'contract', 'data_product', 'domain_ownership', 'glossary_term', 'rule'] as const).map(f => (
                <button key={f} onClick={() => setApprovalFilter(f)}
                  style={{
                    padding: '4px 12px', border: '1px solid var(--border)', borderRadius: 12,
                    fontSize: 12, cursor: 'pointer',
                    background: approvalFilter === f ? 'var(--brand-primary)' : 'transparent',
                    color: approvalFilter === f ? '#fff' : 'var(--text-muted)',
                  }}>
                  {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : f === 'data_product' ? 'Data Products' : f === 'domain_ownership' ? 'Domain Ownership' : f === 'glossary_term' ? 'Glossary Terms' : f === 'rule' ? 'Rules' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
                </button>
              ))}
            </div>

            {approvalActionError && (
              <div style={{ marginBottom: 12, color: 'var(--status-error-text)', fontSize: 13 }}>{approvalActionError}</div>
            )}

            {approvalFilter === 'rule' ? (
              !pendingRulesLoaded ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0' }}>Loading…</div>
              ) : pendingRules.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0' }}>No rules pending review.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pendingRules.map(r => (
                    <div key={r.id} style={{
                      display: 'grid', gridTemplateColumns: '100px 1fr 140px 80px auto',
                      alignItems: 'center', gap: 12, padding: '12px 16px',
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                    }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'var(--surface-muted)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>rule</span>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>by {r.createdBy ?? '—'}</div>
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)' }}>pending review</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</span>
                      <a href="/rules" style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12, background: 'transparent', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>→ Rules</a>
                    </div>
                  ))}
                </div>
              )
            ) : approvals.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0' }}>No approval requests found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {approvals.map(item => (
                  <div key={item.approval_id} style={{
                    display: 'grid', gridTemplateColumns: '100px 1fr 120px 100px 80px auto',
                    alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                  }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'var(--surface-muted)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {item.entity_type.replace('_', ' ')}
                    </span>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>
                        {String(item.entity_snapshot?.policy_name ?? item.entity_snapshot?.contract_name ?? item.entity_snapshot?.name ?? item.entity_id)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>by {item.requested_by}</div>
                    </div>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: item.status === 'pending' ? 'var(--status-warn-bg)' : item.status === 'approved' ? 'var(--status-ok-bg)' : 'var(--status-error-bg)', color: item.status === 'pending' ? 'var(--status-warn-text)' : item.status === 'approved' ? 'var(--status-ok-text)' : 'var(--status-error-text)' }}>
                      {item.status}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(item.created_at)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.reviewed_by ?? '—'}</span>
                    {item.status === 'pending' && currentUser?.role && ['admin', 'domain_owner'].includes(currentUser.role) && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button disabled={approvalActionLoading === item.approval_id} onClick={async () => { setApprovalActionLoading(item.approval_id); setApprovalActionError(null); try { const res = await apiFetch(`/api/governance/approvals/${item.approval_id}?action=approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (!res.ok) throw new Error('Approve failed'); setApprovalsLoaded(false); loadApprovals() } catch { setApprovalActionError('Approve failed') } finally { setApprovalActionLoading(null) } }} style={{ padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', fontWeight: 600 }}>Approve</button>
                        <button disabled={approvalActionLoading === item.approval_id} onClick={() => { setRejectTarget(item); setRejectNote('') }} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, background: 'transparent', color: 'var(--text-muted)' }}>Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Approval History ── */}
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)' }}>Recent Approval Activity</span>
                {(['all', 'approved', 'rejected'] as const).map(f => (
                  <button key={f} onClick={() => setHistoryFilter(f)}
                    style={{ padding: '2px 8px', borderRadius: '5px', border: 'none', fontSize: '10px', cursor: 'pointer', background: historyFilter === f ? 'var(--foreground)' : 'var(--surface-muted)', color: historyFilter === f ? 'var(--background)' : 'var(--text-muted)', fontWeight: historyFilter === f ? 700 : 400, textTransform: 'capitalize' }}>
                    {f}
                  </button>
                ))}
              </div>
              {historyLoading ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px 0' }}>Loading history…</div>
              ) : approvalHistory.filter(h => historyFilter === 'all' || h.action === historyFilter).length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '10px 0' }}>No approval history yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {approvalHistory.filter(h => historyFilter === 'all' || h.action === historyFilter).map(h => (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px', background: 'var(--surface-muted)', borderRadius: '7px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '13px', flexShrink: 0 }}>{h.action === 'approved' ? '✅' : '❌'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>{h.entity_name}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: '4px' }}>{h.entity_type}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {h.action === 'approved' ? 'Approved' : 'Rejected'} by <strong>{h.actor}</strong>
                          {h.reason && <> — <em>{h.reason}</em></>}
                        </div>
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{h.timestamp.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reject modal */}
            {rejectTarget && (
              <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }} onClick={() => setRejectTarget(null)}>
                <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw' }}
                  onClick={e => e.stopPropagation()}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Reject: {String(rejectTarget.entity_snapshot?.policy_name ?? rejectTarget.entity_id)}</h3>
                  <textarea
                    placeholder="Reason for rejection (optional)"
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    style={{ width: '100%', minHeight: 80, padding: 10, borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button onClick={() => setRejectTarget(null)} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent' }}>Cancel</button>
                    <button onClick={async () => {
                      if (!rejectTarget) return
                      setApprovalActionLoading(rejectTarget.approval_id)
                      setApprovalActionError(null)
                      try {
                        const res = await apiFetch(`/api/governance/approvals/${rejectTarget.approval_id}?action=reject`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ feedback: rejectNote }),
                        })
                        if (!res.ok) throw new Error('Reject failed')
                        setRejectTarget(null); setApprovalsLoaded(false); loadApprovals()
                      } catch { setApprovalActionError('Reject failed') }
                      finally { setApprovalActionLoading(null) }
                    }}
                      style={{ padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontWeight: 600 }}>
                      Confirm Reject
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* domain scorecard panel */}
      {selectedDomain && (
        <>
          <div onClick={closePopups} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontSize: '18px' }}>{selectedDomain.icon}</span>
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1 }}>{selectedDomain.name} Domain</span>
              <span style={{ background: scoreBg(selectedDomain.overall), color: scoreColor(selectedDomain.overall), padding: '2px 8px', borderRadius: '4px', fontSize: '14px', fontWeight: 700 }}>{selectedDomain.overall}</span>
              <button onClick={closePopups} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Score Breakdown</div>
              {SCORE_DIMENSIONS.map(dim => {
                const val = selectedDomain[dim]
                return (
                  <div key={dim} style={{ padding: '8px 10px', background: 'var(--surface-muted)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)' }}>{DIM_LABELS[dim]}</span>
                      <span style={{ background: scoreBg(val), color: scoreColor(val), padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>{val}%</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${val}%`, background: scoreColor(val), borderRadius: '2px' }} />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>{DIM_DESCRIPTIONS[dim]}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* policy detail panel */}
      {selectedPolicy && (
        <>
          <div onClick={closePopups} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ background: policyStatusBg(selectedPolicy.status), color: policyStatusColor(selectedPolicy.status), padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, textTransform: 'capitalize' }}>{selectedPolicy.status}</span>
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPolicy.name}</span>
              <button onClick={closePopups} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
                {[['Domain', selectedPolicy.domain], ['Enforcement', selectedPolicy.enforcement], ['Rules', String(selectedPolicy.rulesCount)]].map(([l, v], i) => (
                  <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px', textTransform: 'capitalize' }}>{v || '—'}</div>
                  </div>
                ))}
              </div>
              {selectedPolicy.description && (
                <div style={{ padding: '12px 14px 0' }}>
                  <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #e9d5ff' }}>
                    <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', padding: '7px 12px' }}>
                      <span style={{ color: '#fff', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em' }}>📋 DESCRIPTION</span>
                    </div>
                    <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{selectedPolicy.description}</div>
                  </div>
                </div>
              )}

              {/* Panel tab bar */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8, margin: '12px 14px 0 14px' }}>
                {(['violations', 'history'] as const).map(pt => (
                  <button key={pt} onClick={() => setPolicyPanelTab(pt)}
                    style={{
                      padding: '4px 12px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                      background: policyPanelTab === pt ? 'var(--brand-primary)' : 'transparent',
                      color: policyPanelTab === pt ? '#fff' : 'var(--text-muted)', fontWeight: 500,
                    }}>
                    {pt === 'violations' ? 'Violations' : 'History'}
                  </button>
                ))}
              </div>

              {policyPanelTab === 'violations' && (
                <>
                  {/* violations for this policy */}
                  {violationsLoaded && (() => {
                    const pv = violations.filter(v => v.policyId === selectedPolicy.id && v.status === 'open')
                    if (!pv.length) return null
                    return (
                      <div style={{ padding: '0 14px 0' }}>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Open Violations ({pv.length})</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '200px', overflowY: 'auto' }}>
                          {pv.slice(0, 20).map(viol => (
                            <div key={viol.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', background: sevBg(viol.severity), borderRadius: '5px', border: `1px solid ${sevColor(viol.severity)}` }}>
                              <span style={{ fontSize: '9px', fontWeight: 700, color: sevColor(viol.severity), textTransform: 'uppercase', flexShrink: 0 }}>{viol.severity}</span>
                              <span style={{ fontSize: '10.5px', color: 'var(--foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viol.detail}</span>
                              {viol.tableName && <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>{viol.tableName}</span>}
                            </div>
                          ))}
                          {pv.length > 20 && <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '4px 8px' }}>+{pv.length - 20} more — see Violations tab</div>}
                        </div>
                      </div>
                    )
                  })()}
                </>
              )}

              {policyPanelTab === 'history' && (
                versionsLoading ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '0 14px' }}>Loading…</div>
                ) : policyVersions.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '0 14px' }}>No version history yet — history is recorded each time a policy is approved.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 14px' }}>
                    {policyVersions.map(v => (
                      <VersionRow key={v.version_id} version={v} />
                    ))}
                  </div>
                )
              )}
            </div>
            <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              {!confirmDeactivate ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => openEdit(selectedPolicy)} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>✏️ Edit Policy</button>
                  <button onClick={() => setConfirmDeactivate(true)} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid var(--status-error-text)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>🚫 Deactivate</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>Deactivate <strong>{selectedPolicy.name}</strong>?</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setConfirmDeactivate(false)} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => deactivatePolicy(selectedPolicy.id)} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: 'none', background: 'var(--status-error-text)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Yes, Deactivate</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* create / edit policy modal */}
      {showPolicyModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => { setShowPolicyModal(false); setEditingPolicy(null); setPolicyForm(emptyForm) }} />
          <div style={{ background: 'var(--surface)', borderRadius: '14px', width: '480px', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', position: 'relative', zIndex: 1 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--foreground)' }}>{editingPolicy ? 'Edit Policy' : 'Create Governance Policy'}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{editingPolicy ? 'Update policy details and enforcement settings' : 'Define a new policy to enforce data governance standards'}</div>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Policy Name *</label>
                <input value={policyForm.name} onChange={e => setPolicyForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Data Quality Standards" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', background: 'var(--surface)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Description</label>
                <textarea value={policyForm.description} onChange={e => setPolicyForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Describe the policy requirements..." style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', resize: 'vertical' as const, background: 'var(--surface)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Domain</label>
                  <select value={policyForm.domain} onChange={e => setPolicyForm(f => ({ ...f, domain: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', background: 'var(--surface)', color: 'var(--foreground)' }}>
                    <option value="All">All Domains</option>
                    {domains.map(d => <option key={d.id} value={d.name}>{d.icon} {d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Enforcement</label>
                  <select value={policyForm.enforcement} onChange={e => setPolicyForm(f => ({ ...f, enforcement: e.target.value as 'enforced' | 'advisory' }))} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', outline: 'none', background: 'var(--surface)', color: 'var(--foreground)' }}>
                    <option value="enforced">🔒 Enforced</option>
                    <option value="advisory">💡 Advisory</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Status</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
                  {(['draft', 'review', 'active'] as const).map(s => (
                    <button key={s} type="button" onClick={() => setPolicyForm(f => ({ ...f, status: s }))} style={{ padding: '8px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', border: policyForm.status === s ? `2px solid ${policyStatusColor(s)}` : `1px solid var(--border)`, background: policyForm.status === s ? policyStatusBg(s) : 'var(--surface-muted)', fontSize: '12px', fontWeight: policyForm.status === s ? 700 : 500, color: policyForm.status === s ? policyStatusColor(s) : 'var(--text-secondary)', textTransform: 'capitalize' }}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px' }}>
              <button onClick={() => { setShowPolicyModal(false); setEditingPolicy(null); setPolicyForm(emptyForm) }} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={savePolicy} disabled={!policyForm.name} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: policyForm.name ? 'pointer' : 'not-allowed', background: policyForm.name ? 'var(--accent)' : 'var(--border)', color: policyForm.name ? '#fff' : 'var(--text-muted)' }}>
                {editingPolicy ? 'Save Changes' : 'Create Policy'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
