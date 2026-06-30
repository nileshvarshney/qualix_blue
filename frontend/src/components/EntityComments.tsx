'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface Comment {
  comment_id: string
  entity_type: string
  entity_id: string
  body: string
  parent_id: string | null
  author_email: string | null
  is_resolved: boolean
  created_at: string | null
}

function authorLabel(email: string | null): string {
  if (!email) return 'anonymous'
  return email.includes('@') ? email.split('@')[0] : email
}

function fmtTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

function renderBodyWithMentions(text: string) {
  const parts = text.split(/(@\S+)/g)
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} style={{ color: 'var(--accent)', fontWeight: 600, background: 'var(--accent-bg)', borderRadius: '3px', padding: '0 2px' }}>{part}</span>
    ) : part
  )
}

interface ThreadProps {
  root: Comment
  replies: Comment[]
  currentEmail: string | null
  onResolve: (id: string) => void
  onReply: (parentId: string, authorEmail: string | null) => void
}

function CommentThread({ root, replies, currentEmail, onResolve, onReply }: ThreadProps) {
  const [repliesOpen, setRepliesOpen] = useState(true)
  const resolved = root.is_resolved
  return (
    <div style={{ opacity: resolved ? 0.45 : 1 }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-bg)',
          color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase',
        }}>
          {authorLabel(root.author_email).slice(0, 2)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>{authorLabel(root.author_email)}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtTime(root.created_at)}</span>
            {resolved && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--status-ok-text)', background: 'var(--status-ok-bg)', padding: '1px 5px', borderRadius: 3 }}>✓ resolved</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderBodyWithMentions(root.body)}</div>
          {!resolved && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button onClick={() => onReply(root.comment_id, root.author_email)}
                style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↩ Reply</button>
              {!!currentEmail && (
                <button onClick={() => onResolve(root.comment_id)}
                  style={{ fontSize: 10, color: 'var(--status-ok-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✓ Resolve</button>
              )}
            </div>
          )}
        </div>
      </div>
      {replies.length > 0 && (
        <div style={{ marginLeft: 34, borderLeft: '2px solid var(--border)', paddingLeft: 10, marginTop: 8 }}>
          {repliesOpen && replies.map(r => (
            <div key={r.comment_id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: 'var(--surface-muted)',
                  color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase',
                }}>
                  {authorLabel(r.author_email).slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>{authorLabel(r.author_email)}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtTime(r.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderBodyWithMentions(r.body)}</div>
                </div>
              </div>
            </div>
          ))}
          {replies.length > 1 && (
            <button onClick={() => setRepliesOpen(o => !o)}
              style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
              {repliesOpen ? '▲ collapse' : `▼ ${replies.length} replies`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface MentionUser { email: string; name?: string }

export default function EntityComments({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; authorEmail: string | null } | null>(null)
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [currentEmail, setCurrentEmail] = useState<string | null>(null)
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionAnchor, setMentionAnchor] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    apiFetch('/api/me').then(r => r.json()).then(d => {
      setCurrentEmail(d.email ?? null)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    apiFetch('/api/users').then(r => r.ok ? r.json() : []).then((data: unknown) => {
      const items = Array.isArray(data) ? data : ((data as Record<string, unknown>)?.items ?? [])
      setMentionUsers((items as Record<string, unknown>[]).map(u => ({
        email: String(u.email ?? ''),
        name: u.full_name ? String(u.full_name) : undefined,
      })).filter(u => u.email))
    }).catch(() => {})
  }, [])

  const handleBodyChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setBody(val)
    const cursor = e.target.selectionStart ?? val.length
    const textBefore = val.slice(0, cursor)
    const match = textBefore.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionAnchor(cursor - match[0].length)
    } else {
      setMentionQuery(null)
    }
  }, [])

  const filteredMentions = mentionQuery !== null
    ? mentionUsers.filter(u =>
        u.email.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        (u.name?.toLowerCase().includes(mentionQuery.toLowerCase()))
      ).slice(0, 6)
    : []

  function insertMention(user: MentionUser) {
    const handle = user.email.split('@')[0]
    const before = body.slice(0, mentionAnchor)
    const after = body.slice(mentionAnchor + 1 + (mentionQuery ?? '').length)
    const newBody = `${before}@${handle} ${after}`
    setBody(newBody)
    setMentionQuery(null)
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) {
        const pos = mentionAnchor + handle.length + 2
        ta.focus()
        ta.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  useEffect(() => {
    setLoaded(false)
    setComments([])
    setOpen(false)
  }, [entityType, entityId])

  useEffect(() => {
    if (open && !loaded) {
      apiFetch(`/api/comments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`)
        .then(r => r.json())
        .then(d => { setComments(Array.isArray(d) ? d : []); setLoaded(true) })
        .catch(() => setLoaded(true))
    }
  }, [open, loaded, entityType, entityId])

  const roots = comments.filter(c => !c.parent_id)
  const repliesFor = (id: string) => comments.filter(c => c.parent_id === id)
  const count = comments.length

  async function post() {
    if (!body.trim()) return
    setPosting(true)
    setPostError(null)
    const payload: Record<string, unknown> = {
      entity_type: entityType,
      entity_id: entityId,
      body: body.trim(),
    }
    if (replyTo) payload.parent_id = replyTo.id
    const optimistic: Comment = {
      comment_id: `tmp-${Date.now()}`,
      entity_type: entityType,
      entity_id: entityId,
      body: body.trim(),
      parent_id: replyTo?.id ?? null,
      author_email: currentEmail,
      is_resolved: false,
      created_at: new Date().toISOString(),
    }
    setComments(prev => [...prev, optimistic])
    setBody('')
    setReplyTo(null)
    try {
      const res = await apiFetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Post failed')
      const saved: Comment = await res.json()
      setComments(prev => prev.map(c => c.comment_id === optimistic.comment_id ? saved : c))
    } catch {
      setComments(prev => prev.filter(c => c.comment_id !== optimistic.comment_id))
      setPostError('Failed to post — try again')
    } finally {
      setPosting(false)
    }
  }

  async function resolve(id: string) {
    setResolveError(null)
    try {
      const res = await apiFetch(`/api/comments/${id}/resolve`, { method: 'POST' })
      if (res.ok) {
        setComments(prev => prev.map(c => c.comment_id === id ? { ...c, is_resolved: true } : c))
      } else {
        setResolveError('Failed to resolve — try again')
      }
    } catch {
      setResolveError('Failed to resolve — try again')
    }
  }

  function startReply(parentId: string, authorEmail: string | null) {
    setReplyTo({ id: parentId, authorEmail })
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '10px 0', background: 'none', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
        Discussion {loaded ? `(${count})` : ''}
      </button>

      {open && (
        <div style={{ paddingBottom: 12 }}>
          {!loaded && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>Loading…</div>}

          {loaded && roots.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 0' }}>No comments yet — be the first.</div>
          )}

          {loaded && roots.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
              {roots.map(root => (
                <CommentThread
                  key={root.comment_id}
                  root={root}
                  replies={repliesFor(root.comment_id)}
                  currentEmail={currentEmail}
                  onResolve={resolve}
                  onReply={startReply}
                />
              ))}
            </div>
          )}

          {replyTo && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              Replying to <strong>{authorLabel(replyTo.authorEmail)}</strong>
              <button onClick={() => setReplyTo(null)} style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕ cancel</button>
            </div>
          )}

          {resolveError && <div style={{ fontSize: 11, color: 'var(--status-error-text)', marginBottom: 4 }}>{resolveError}</div>}

          <div style={{ position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={handleBodyChange}
              placeholder="Add a comment… (type @ to mention someone)"
              rows={2}
              style={{
                width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)',
                fontSize: 12, background: 'var(--surface)', color: 'var(--foreground)',
                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') { setMentionQuery(null); return }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { setMentionQuery(null); post() }
              }}
            />
            {filteredMentions.length > 0 && mentionQuery !== null && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, right: 0, background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                zIndex: 50, maxHeight: 180, overflowY: 'auto',
              }}>
                {filteredMentions.map(u => (
                  <div key={u.email} onMouseDown={e => { e.preventDefault(); insertMention(u) }}
                    style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-bg)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                      {(u.name ?? u.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      {u.name && <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{u.name}</div>}
                      <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{u.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {postError && <div style={{ fontSize: 11, color: 'var(--status-error-text)', marginTop: 3 }}>{postError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              onClick={post}
              disabled={posting || !body.trim()}
              style={{
                padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
                background: body.trim() ? 'var(--accent)' : 'var(--border)',
                color: body.trim() ? 'var(--surface)' : 'var(--text-muted)',
                cursor: posting || !body.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
