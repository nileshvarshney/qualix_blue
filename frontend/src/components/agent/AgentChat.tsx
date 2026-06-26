'use client'
import { useState, useRef, useEffect, useId } from 'react'
import { AgentMessage } from '@/lib/types'
import { apiFetch } from '@/lib/apiFetch'

function QualixMark({ size }: { size: number }) {
  const id = useId()
  const gradId = `qm-grad-${id}`
  return (
    <svg width={size} height={size * (44 / 38)} viewBox="0 0 38 44" fill="none">
      <defs>
        <linearGradient id={gradId} x1="2" y1="2" x2="36" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF9050" />
          <stop offset="55%" stopColor="#E8541A" />
          <stop offset="100%" stopColor="#A82E06" />
        </linearGradient>
      </defs>
      {/* Qualix Q-mark: ring + tail + quality-compass star, no background */}
      <circle cx="19" cy="19" r="14" stroke={`url(#${gradId})`} strokeWidth="4" fill="none" />
      <circle cx="19" cy="19" r="8.5" stroke={`url(#${gradId})`} strokeWidth="1" fill="none" opacity="0.35" strokeDasharray="2.5 3" />
      <path d="M19 12.5 L20.9 17.1 L25.5 19 L20.9 20.9 L19 25.5 L17.1 20.9 L12.5 19 L17.1 17.1 Z" fill={`url(#${gradId})`} />
      <line x1="28" y1="29" x2="36" y2="42" stroke={`url(#${gradId})`} strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="19" cy="5" r="2.8" fill="#FF9050" />
    </svg>
  )
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines
    .filter(l => !l.match(/^\|[\s-:|]+\|$/))
    .map(l => l.split('|').slice(1, -1).map(c => c.trim()))
  if (rows.length === 0) return null
  const header = rows[0]
  const body = rows.slice(1)
  return (
    <div style={{ overflowX: 'auto', margin: '6px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr>{header.map((h, i) => (
            <th key={i} style={{ padding: '4px 8px', background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', textAlign: 'left', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '3px 8px', borderBottom: '1px solid #f1f5f9', color: '#334155', whiteSpace: 'nowrap' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Detect markdown table (starts with |)
    if (line.trimStart().startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      elements.push(<MarkdownTable key={`tbl-${i}`} lines={tableLines} />)
      continue
    }
    if (line.startsWith('### ')) { elements.push(<div key={i} style={{ fontWeight: 700, fontSize: '13px', margin: '8px 0 3px', color: '#0f172a' }}>{line.slice(4)}</div>); i++; continue }
    if (line.startsWith('## ')) { elements.push(<div key={i} style={{ fontWeight: 700, fontSize: '14px', margin: '8px 0 4px', color: '#0f172a' }}>{line.slice(3)}</div>); i++; continue }
    if (line.startsWith('# ')) { elements.push(<div key={i} style={{ fontWeight: 700, fontSize: '15px', margin: '8px 0 4px', color: '#0f172a' }}>{line.slice(2)}</div>); i++; continue }
    if (line.startsWith('- ') || line.startsWith('* ')) { elements.push(<div key={i} style={{ paddingLeft: '12px', marginBottom: '2px' }}>• {line.slice(2)}</div>); i++; continue }
    if (line.startsWith('**') && line.endsWith('**')) { elements.push(<div key={i} style={{ fontWeight: 700 }}>{line.slice(2, -2)}</div>); i++; continue }
    if (line === '') { elements.push(<div key={i} style={{ height: '6px' }} />); i++; continue }
    // Code block
    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      i++ // skip closing ```
      elements.push(
        <pre key={`code-${i}`} style={{ background: '#1e293b', color: '#e2e8f0', padding: '8px 10px', borderRadius: '8px', fontSize: '11px', overflowX: 'auto', margin: '4px 0' }}>
          {codeLines.join('\n')}
        </pre>
      )
      continue
    }
    // Handle inline bold
    const parts = line.split(/(\*\*[^*]+\*\*)/)
    elements.push(
      <div key={i} style={{ marginBottom: '1px' }}>
        {parts.map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j}>{part.slice(2, -2)}</strong>
            : part
        )}
      </div>
    )
    i++
  }
  return <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#1e293b' }}>{elements}</div>
}

function ToolCallsDisclosure({ tools }: { tools: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: '6px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px', color: '#E8541A', fontSize: '10px', fontWeight: 500 }}
      >
        <span style={{ fontSize: '8px' }}>{open ? '▼' : '▶'}</span>
        {tools.length} tool{tools.length !== 1 ? 's' : ''} used
      </button>
      {open && (
        <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {tools.map((t, j) => (
            <span key={j} style={{ background: 'rgba(232,84,26,0.1)', color: '#E8541A', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 500 }}>
              ⚡ {t.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

const SUGGESTIONS = [
  "Show domain quality scores",
  "What rules do I have?",
  "Show me open alerts",
  "Which domains have the most failures?",
  "List my connections",
  "Show recent rule run results",
]

const INITIAL_MSG: AgentMessage = {
  role: 'assistant',
  content: "Hi! I'm **Qualix AI** — your DataGuard assistant.\n\nI can help you with:\n- **Quality scores & alerts** across all your domains\n- **Rules & rule runs** — status, failures, trends\n- **Assets & connections** registered in the platform\n- **Governance & compliance** — policies, violations, incidents\n\nAsk me anything about your data quality platform.",
  timestamp: '2026-01-01T00:00:00.000Z'   // stable — avoids server/client hydration mismatch
}

const STORAGE_KEY = 'qualix-chat-messages'

export default function AgentChat() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<AgentMessage[]>([INITIAL_MSG])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [hoveredSuggestion, setHoveredSuggestion] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Hydrate from localStorage after mount only — reading it during the
  // initial useState would diverge from the server-rendered HTML.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as AgentMessage[]
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed)
      }
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {
      // ignore storage quota / privacy-mode errors
    }
  }, [messages, hydrated])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function newChat() {
    setMessages([INITIAL_MSG])
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }

  async function send(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')

    const userMsg: AgentMessage = { role: 'user', content: msg, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const res = await apiFetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
        toolsUsed: data.toolsUsed
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString()
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Chat Panel */}
      {open && (
        <div className="slide-up" style={{
          position: 'fixed', bottom: '80px', right: '20px',
          width: expanded ? 'min(900px, calc(100vw - 40px))' : '400px',
          height: expanded ? '85vh' : '580px',
          background: 'var(--surface)', borderRadius: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', zIndex: 1000,
          border: '1px solid rgba(232,84,26,0.15)', overflow: 'hidden',
          transition: 'width 0.2s, height 0.2s'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #7C1A02, #C94015, #E8541A)',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <QualixMark size={38} />
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>Qualix AI</div>
              <div style={{ color: '#FFB347', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#FFB347' }} />
                Online & Ready
              </div>
            </div>
            <button onClick={newChat} title="New chat" style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', border: 'none',
              color: '#fff', width: '28px', height: '28px', borderRadius: '8px',
              cursor: 'pointer', fontSize: '13px'
            }}>＋</button>
            <button onClick={() => setExpanded(e => !e)} title={expanded ? 'Collapse' : 'Expand'} style={{
              background: 'rgba(255,255,255,0.1)', border: 'none',
              color: '#fff', width: '28px', height: '28px', borderRadius: '8px',
              cursor: 'pointer', fontSize: '13px'
            }}>{expanded ? '⤡' : '⤢'}</button>
            <button onClick={() => setOpen(false)} title="Close" style={{
              background: 'rgba(255,255,255,0.1)', border: 'none',
              color: '#fff', width: '28px', height: '28px', borderRadius: '8px',
              cursor: 'pointer', fontSize: '14px'
            }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((msg, i) => (
              <div key={i} className="fade-in" style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: '8px', marginTop: '2px' }}><QualixMark size={28} /></div>
                )}
                <div style={{
                  maxWidth: '85%',
                  background: msg.role === 'user' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--surface-muted)',
                  color: msg.role === 'user' ? '#fff' : 'var(--foreground)',
                  padding: '10px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  fontSize: '13px', lineHeight: '1.5',
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none'
                }}>
                  {msg.role === 'assistant' ? <MarkdownText text={msg.content} /> : msg.content}
                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <ToolCallsDisclosure tools={msg.toolsUsed} />
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><QualixMark size={28} /></div>
                <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {[0, 1, 2].map(j => (
                    <div key={j} style={{
                      width: '6px', height: '6px', borderRadius: '50%', background: '#E8541A',
                      animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite`
                    }} />
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions (only at start) */}
            {messages.length === 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    onMouseEnter={() => setHoveredSuggestion(s)}
                    onMouseLeave={() => setHoveredSuggestion(null)}
                    style={{
                      background: hoveredSuggestion === s ? 'rgba(232,84,26,0.08)' : 'var(--surface)',
                      border: '1px solid rgba(232,84,26,0.25)',
                      borderRadius: '20px',
                      padding: '6px 12px', fontSize: '12px',
                      color: '#E8541A', cursor: 'pointer',
                      fontWeight: 500, transition: 'all 0.2s'
                    }}
                  >{s}</button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Ask me anything about data quality..."
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '12px', fontSize: '13px',
                  border: '1px solid var(--border)', outline: 'none', background: 'var(--surface-muted)',
                  color: 'var(--foreground)'
                }}
              />
              <button onClick={() => send()} disabled={!input.trim() || loading} style={{
                width: '38px', height: '38px', borderRadius: '10px', border: 'none',
                background: input.trim() && !loading ? 'linear-gradient(135deg, #FF9050, #A82E06)' : '#e2e8f0',
                color: input.trim() && !loading ? '#fff' : '#94a3b8',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s', flexShrink: 0
              }}>↑</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button onClick={() => setOpen(!open)} style={{
        position: 'fixed', bottom: '20px', right: '20px',
        width: '62px', height: '62px', borderRadius: '20px', border: 'none',
        background: 'none', cursor: 'pointer', zIndex: 1001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.25s', transform: open ? 'scale(0.9)' : 'scale(1)'
      }}>
        {open
          ? <span style={{ color: '#E8541A', fontSize: '24px', fontWeight: 300, lineHeight: 1 }}>✕</span>
          : <QualixMark size={48} />}
      </button>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  )
}
