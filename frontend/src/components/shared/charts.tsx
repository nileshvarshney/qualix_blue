'use client'
import { useState, useRef } from 'react'
import { TrendPoint } from '@/lib/types'

export function ScorePill({ score }: { score: number }) {
  const color = score >= 90 ? '#16a34a' : score >= 80 ? '#ea8b3a' : '#dc2626'
  const bg = score >= 90 ? '#dcfce7' : score >= 80 ? '#fef3c7' : '#fee2e2'
  return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: bg, color, padding: '3px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, minWidth: '38px' }}>{score}</span>
}

export function TrendChart({ data, onPointClick }: { data: TrendPoint[]; onPointClick?: (date: string) => void }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; score: number; date: string } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const validPts = data.filter(d => d.score !== null) as (TrendPoint & { score: number })[]

  if (validPts.length === 0) {
    return (
      <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        No runs yet — execute rules to see quality trend
      </div>
    )
  }

  const w = 600, h = 180, pad = { top: 20, right: 20, bottom: 30, left: 35 }
  const chartW = w - pad.left - pad.right, chartH = h - pad.top - pad.bottom
  const scores = validPts.map(d => d.score)
  const min = Math.max(0, Math.floor(Math.min(...scores) / 5) * 5 - 5)
  const max = 100

  const pts = validPts.map((d, i) => ({
    x: pad.left + (i / Math.max(validPts.length - 1, 1)) * chartW,
    y: pad.top + chartH - ((d.score - min) / (max - min)) * chartH,
    score: d.score, date: d.date
  }))

  const hasAlerts = validPts.some(d => (d.alert_count ?? 0) > 0)
  const hasAnomalies = validPts.some(d => (d.anomaly_count ?? 0) > 0)
  const xFor = (i: number) => pad.left + (i / Math.max(validPts.length - 1, 1)) * chartW

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${pad.top + chartH} L${pts[0].x},${pad.top + chartH} Z`

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
        style={{ overflow: 'visible', cursor: 'crosshair' }}
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={e => {
          if (!svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          const relX = ((e.clientX - rect.left) / rect.width) * w
          let closest = pts[0], minDist = Infinity
          pts.forEach(p => { const d = Math.abs(p.x - relX); if (d < minDist) { minDist = d; closest = p } })
          if (minDist < 30) setTooltip({ x: (closest.x / w) * 100, y: (closest.y / h) * 100, score: closest.score, date: closest.date })
          else setTooltip(null)
        }}>
        <defs>
          <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[100, 95, 90, 85].map(v => {
          const y = pad.top + chartH - ((v - min) / (max - min)) * chartH
          return <g key={v}><line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3" /><text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{v}</text></g>
        })}
        {validPts.map((d, i) => {
          const barH = Math.max(2, d.failed * 2)
          return <rect key={i} x={pad.left + (i / Math.max(validPts.length - 1, 1)) * chartW - 5} y={pad.top + chartH - barH} width="10" height={barH} fill="#ef4444" opacity="0.75" rx="2" />
        })}
        <path d={areaPath} fill="url(#ag2)" />
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={tooltip?.date === p.date ? 5 : 3}
            fill={tooltip?.date === p.date ? '#fff' : '#3b82f6'}
            stroke="#3b82f6" strokeWidth="2"
            onClick={() => onPointClick?.(p.date)}
            style={{ transition: 'r 0.1s', cursor: onPointClick ? 'pointer' : 'default' }} />
        ))}
        {hasAlerts && validPts.map((d, i) => (d.alert_count ?? 0) > 0 ? (
          <polygon key={`alert-${i}`}
            points={`${xFor(i)},${pad.top - 10} ${xFor(i) - 4},${pad.top - 4} ${xFor(i) + 4},${pad.top - 4}`}
            fill="#8b5cf6"
            onClick={() => onPointClick?.(d.date)}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }} />
        ) : null)}
        {hasAnomalies && validPts.map((d, i) => (d.anomaly_count ?? 0) > 0 ? (
          <rect key={`anomaly-${i}`}
            x={xFor(i) - 3} y={pad.top - 18} width="6" height="6" fill="#f97316"
            transform={`rotate(45 ${xFor(i)} ${pad.top - 15})`}
            onClick={() => onPointClick?.(d.date)}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }} />
        ) : null)}
        {validPts.filter((_, i) => i % Math.ceil(validPts.length / 7) === 0 || i === validPts.length - 1).map((d) => {
          const idx = validPts.indexOf(d)
          return <text key={idx} x={pad.left + (idx / Math.max(validPts.length - 1, 1)) * chartW} y={h - 8} textAnchor="middle" fontSize="10" fill="#9ca3af">{d.date}</text>
        })}
      </svg>
      {tooltip && (
        <div style={{
          position: 'absolute', left: `${tooltip.x}%`, top: `${tooltip.y}%`,
          transform: 'translate(-50%, -130%)', background: '#1e293b', color: '#fff',
          padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
          pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 10
        }}>
          <div>{tooltip.date}</div>
          <div style={{ color: '#60a5fa', fontSize: '16px' }}>{tooltip.score}%</div>
          <div style={{ position: 'absolute', bottom: '-5px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #1e293b' }} />
        </div>
      )}
      {(hasAlerts || hasAnomalies) && (
        <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', justifyContent: 'flex-end' }}>
          {hasAlerts && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#8b5cf6' }}>▲</span> Alerts</span>}
          {hasAnomalies && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#f97316' }}>◆</span> Anomalies</span>}
        </div>
      )}
    </div>
  )
}
