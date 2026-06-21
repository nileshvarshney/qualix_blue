'use client'
import { useState, useEffect, useRef } from 'react'

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
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{root.body}</div>
          {!resolved && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button onClick={() => onReply(root.comment_id, root.author_email)}
                style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↩ Reply</button>
              {(currentEmail === root.author_email || currentEmail) && (
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
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.body}</div>
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

export default function EntityComments({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; authorEmail: string | null } | null>(null)
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [currentEmail, setCurrentEmail] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => setCurrentEmail(d.email ?? null)).catch(() => {})
  }, [])

  useEffect(() => {
    if (open && !loaded) {
      fetch(`/api/comments?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`)
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
      const res = await fetch('/api/comments', {
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
    const res = await fetch(`/api/comments/${id}/resolve`, { method: 'POST' })
    if (res.ok) setComments(prev => prev.map(c => c.comment_id === id ? { ...c, is_resolved: true } : c))
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

          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            style={{
              width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid var(--border)',
              fontSize: 12, background: 'var(--surface)', color: 'var(--foreground)',
              resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post() }}
          />
          {postError && <div style={{ fontSize: 11, color: 'var(--status-error-text)', marginTop: 3 }}>{postError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button
              onClick={post}
              disabled={posting || !body.trim()}
              style={{
                padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
                background: body.trim() ? 'var(--accent)' : 'var(--border)',
                color: body.trim() ? '#fff' : 'var(--text-muted)',
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
