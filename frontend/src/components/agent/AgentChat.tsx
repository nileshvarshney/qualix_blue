'use client'
import { useState, useRef, useEffect, useId } from 'react'
import { AgentMessage } from '@/lib/types'

function QualixMark({ size }: { size: number }) {
  const id = useId()
  const gradId = `qm-grad-${id}`
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF9050" />
          <stop offset="55%" stopColor="#E8541A" />
          <stop offset="100%" stopColor="#A82E06" />
        </linearGradient>
      </defs>
      {/* Orange gradient background */}
      <rect width="32" height="32" rx="7" fill={`url(#${gradId})`} />
      {/* Q circle ring */}
      <circle cx="14.5" cy="13.5" r="7.5" stroke="white" strokeWidth="2.2" fill="rgba(255,255,255,0.15)" />
      {/* 4-pointed star */}
      <path d="M14.5 8 L15.8 11.8 L19.5 13.5 L15.8 15.2 L14.5 19 L13.2 15.2 L9.5 13.5 L13.2 11.8 Z" fill="white" />
      {/* Crown dot */}
      <circle cx="14.5" cy="6" r="1.8" fill="white" opacity="0.9" />
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

export default function AgentChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AgentMessage[]>([INITIAL_MSG])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')

    const userMsg: AgentMessage = { role: 'user', content: msg, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/agent', {
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
          position: 'fixed', bottom: '80px', right: '20px', width: '400px', height: '580px',
          background: '#fff', borderRadius: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', zIndex: 1000,
          border: '1px solid rgba(99,102,241,0.15)', overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #7C1A02, #C94015, #E8541A)',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(124,26,2,0.4)'
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
            <button onClick={() => setOpen(false)} style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.1)', border: 'none',
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
                  background: msg.role === 'user' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#f8fafc',
                  color: msg.role === 'user' ? '#fff' : '#1e293b',
                  padding: '10px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  fontSize: '13px', lineHeight: '1.5',
                  border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none'
                }}>
                  {msg.role === 'assistant' ? <MarkdownText text={msg.content} /> : msg.content}
                  {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {msg.toolsUsed.map((t, j) => (
                        <span key={j} style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 500 }}>
                          ⚡ {t.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><QualixMark size={28} /></div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px 14px', borderRadius: '16px 16px 16px 4px', display: 'flex', gap: '4px', alignItems: 'center' }}>
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
                  <button key={s} onClick={() => send(s)} style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '20px',
                    padding: '6px 12px', fontSize: '12px', color: '#6366f1', cursor: 'pointer',
                    fontWeight: 500, transition: 'all 0.2s'
                  }}>{s}</button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', background: '#fff' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Ask me anything about data quality..."
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '12px', fontSize: '13px',
                  border: '1px solid #e2e8f0', outline: 'none', background: '#f8fafc',
                  color: '#0f172a'
                }}
              />
              <button onClick={() => send()} disabled={!input.trim() || loading} style={{
                width: '38px', height: '38px', borderRadius: '10px', border: 'none',
                background: input.trim() && !loading ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#e2e8f0',
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
        background: 'linear-gradient(145deg, #FF9050, #A82E06)',
        cursor: 'pointer', zIndex: 1001,
        boxShadow: open
          ? '0 8px 28px rgba(124,26,2,0.5)'
          : '0 8px 32px rgba(232,84,26,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.25s', transform: open ? 'scale(0.9)' : 'scale(1)'
      }}>
        {open
          ? <span style={{ color: '#fff', fontSize: '22px', fontWeight: 300, lineHeight: 1 }}>✕</span>
          : <QualixMark size={42} />}
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
