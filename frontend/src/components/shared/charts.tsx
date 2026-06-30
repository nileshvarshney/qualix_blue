'use client'
import { useState, useRef, useEffect } from 'react'
import { TrendPoint, ForecastPoint } from '@/lib/types'
import { apiFetch } from '@/lib/apiFetch'

export function ScorePill({ score }: { score: number }) {
  const color = score >= 90 ? '#16a34a' : score >= 80 ? '#ea8b3a' : '#dc2626'
  const bg = score >= 90 ? '#dcfce7' : score >= 80 ? '#fef3c7' : '#fee2e2'
  return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: bg, color, padding: '3px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, minWidth: '38px' }}>{score}</span>
}

let _chartInstanceCount = 0

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x},${points[0].y}`
  const n = points.length
  const parts: string[] = [`M${points[0].x},${points[0].y}`]
  for (let i = 1; i < n; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const pp = points[Math.max(0, i - 2)]
    const nx = points[Math.min(n - 1, i + 1)]
    const cp1x = prev.x + (curr.x - pp.x) / 6
    const cp1y = prev.y + (curr.y - pp.y) / 6
    const cp2x = curr.x - (nx.x - prev.x) / 6
    const cp2y = curr.y - (nx.y - prev.y) / 6
    parts.push(`C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${curr.x},${curr.y}`)
  }
  return parts.join(' ')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function formatAxisDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function TrendChart({
  data,
  onPointClick,
  forecastData,
  upperBand,
  lowerBand,
}: {
  data: TrendPoint[]
  onPointClick?: (date: string) => void
  forecastData?: ForecastPoint[]
  upperBand?: ForecastPoint[]
  lowerBand?: ForecastPoint[]
}) {
  const [tooltip, setTooltip] = useState<{
    x: number; y: number
    score: number; date: string
    prevScore: number | null
    failed: number
    alertCount: number
    anomalyCount: number
  } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(600)
  const [instanceId] = useState(() => ++_chartInstanceCount)
  const gradientId = `tg-${instanceId}`
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(entries => {
      setContainerW(Math.round(entries[0].contentRect.width) || 600)
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  const validPts = data.filter(d => d.score !== null) as (TrendPoint & { score: number })[]

  if (validPts.length === 0) {
    return (
      <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        No runs yet — execute rules to see quality trend
      </div>
    )
  }

  const w = containerW
  const h = 240
  const pad = { top: 20, right: 20, bottom: 30, left: 40 }
  const chartW = w - pad.left - pad.right, chartH = h - pad.top - pad.bottom

  const hasForecast = (forecastData?.length ?? 0) > 0
  const totalSlots = validPts.length + (hasForecast ? forecastData!.length : 0)

  const allScores = [
    ...validPts.map(d => d.score),
    ...(hasForecast ? forecastData!.map(d => d.score) : []),
    ...(lowerBand?.map(d => d.score) ?? []),
  ]
  const min = Math.max(0, Math.floor(Math.min(...allScores) / 5) * 5 - 5)
  const max = 100
  const gridLines = Array.from({ length: 5 }, (_, i) => Math.round((min + (max - min) * (i / 4)) * 10) / 10)

  // Use totalSlots for x positioning so historical + forecast share the same axis
  const xForN = (i: number) => pad.left + (i / Math.max(totalSlots - 1, 1)) * chartW

  const pts = validPts.map((d, i) => ({
    x: xForN(i),
    y: pad.top + chartH - ((d.score - min) / (max - min)) * chartH,
    score: d.score, date: d.date
  }))

  const lastScore = pts[pts.length - 1]?.score ?? 0
  const lineColor = lastScore >= 90 ? '#16a34a' : lastScore >= 75 ? '#ea8b3a' : '#dc2626'

  const hasAlerts = validPts.some(d => (d.alert_count ?? 0) > 0)
  const hasAnomalies = validPts.some(d => (d.anomaly_count ?? 0) > 0)

  const linePath = smoothPath(pts)
  const bottomY = pad.top + chartH
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${bottomY} L${pts[0].x},${bottomY} Z`

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg ref={svgRef} width="100%" height={h}
        style={{ overflow: 'visible', cursor: 'crosshair' }}
        onMouseLeave={() => setTooltip(null)}
        onMouseMove={e => {
          if (!svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          const relX = ((e.clientX - rect.left) / rect.width) * w
          let closestIdx = 0, minDist = Infinity
          pts.forEach((p, i) => { const d = Math.abs(p.x - relX); if (d < minDist) { minDist = d; closestIdx = i } })
          if (minDist < 30) {
            const p = pts[closestIdx]
            const orig = validPts[closestIdx]
            setTooltip({
              x: (p.x / w) * 100,
              y: (p.y / h) * 100,
              score: p.score,
              date: p.date,
              prevScore: closestIdx > 0 ? pts[closestIdx - 1].score : null,
              failed: orig.failed ?? 0,
              alertCount: orig.alert_count ?? 0,
              anomalyCount: orig.anomaly_count ?? 0,
            })
          } else {
            setTooltip(null)
          }
        }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Zone bands */}
        {[
          { lo: 90, hi: 100, color: '#16a34a' },
          { lo: 75, hi: 90,  color: '#ea8b3a' },
          { lo: 0,  hi: 75,  color: '#dc2626' },
        ].map(z => {
          const visLo = Math.max(z.lo, min)
          const visHi = Math.min(z.hi, max)
          if (visLo >= visHi) return null
          const zy1 = pad.top + chartH - ((visHi - min) / (max - min)) * chartH
          const zy2 = pad.top + chartH - ((visLo - min) / (max - min)) * chartH
          return (
            <rect key={z.lo} x={pad.left} y={zy1}
              width={w - pad.left - pad.right} height={zy2 - zy1}
              fill={z.color} fillOpacity="0.04" />
          )
        })}
        {/* Baseline */}
        <line x1={pad.left} x2={w - pad.right}
          y1={pad.top + chartH} y2={pad.top + chartH}
          stroke="#e5e7eb" strokeWidth="1" />
        {gridLines.map((v, gi) => {
          const y = pad.top + chartH - ((v - min) / (max - min)) * chartH
          const label = gi === gridLines.length - 1 ? `${Math.round(v)}%` : String(Math.round(v))
          return (
            <g key={v}>
              <line x1={pad.left} x2={w - pad.right} y1={y} y2={y}
                stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3" />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
                {label}
              </text>
            </g>
          )
        })}
        {/* Threshold reference lines at 90 and 75 */}
        {([{ v: 90, color: '#16a34a' }, { v: 75, color: '#ea8b3a' }] as const).map(({ v, color }) => {
          if (v <= min || v >= max) return null
          const ty = pad.top + chartH - ((v - min) / (max - min)) * chartH
          return (
            <g key={v}>
              <line x1={pad.left} x2={w - pad.right} y1={ty} y2={ty}
                stroke={color} strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.45" />
              <circle cx={pad.left - 3} cy={ty} r="3" fill={color} fillOpacity="0.7" />
              <text x={pad.left - 9} y={ty + 4} textAnchor="end" fontSize="10"
                fill={color} fontWeight="600">{v}</text>
            </g>
          )
        })}
        {validPts.map((d, i) => {
          const barH = Math.max(2, d.failed * 2)
          return <rect key={i} x={xForN(i) - 5} y={pad.top + chartH - barH} width="10" height={barH} fill="#ef4444" opacity="0.75" rx="2" />
        })}
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p, i) => {
          const isActive = tooltip?.date === p.date
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={12} fill="transparent"
                onClick={() => onPointClick?.(p.date)}
                style={{ cursor: onPointClick ? 'pointer' : 'default' }} />
              <circle cx={p.x} cy={p.y} r={isActive ? 6 : 3.5}
                fill={isActive ? '#fff' : lineColor}
                stroke={lineColor} strokeWidth={isActive ? 2.5 : 1.5}
                style={{
                  transition: 'r 0.12s ease',
                  filter: isActive ? 'drop-shadow(0 1px 4px rgba(0,0,0,0.18))' : 'none',
                  pointerEvents: 'none',
                }} />
            </g>
          )
        })}
        {/* Min/max annotations */}
        {validPts.length >= 5 && (() => {
          const scores = validPts.map(d => d.score)
          const maxScore = Math.max(...scores)
          const minScore = Math.min(...scores)
          if (maxScore - minScore < 5) return null
          const maxIdx = scores.indexOf(maxScore)
          const minIdx = scores.indexOf(minScore)
          if (maxIdx === minIdx) return null
          const clampX = (x: number) => Math.max(pad.left + 20, Math.min(w - pad.right - 20, x))
          return (
            <>
              <text x={clampX(pts[maxIdx].x)} y={pts[maxIdx].y - 10}
                textAnchor="middle" fontSize="9" fill="#16a34a" fontWeight="600">
                ↑ {maxScore.toFixed(1)}
              </text>
              <text x={clampX(pts[minIdx].x)} y={pts[minIdx].y + 14}
                textAnchor="middle" fontSize="9" fill="#dc2626" fontWeight="600">
                ↓ {minScore.toFixed(1)}
              </text>
            </>
          )
        })()}
        {hasAlerts && validPts.map((d, i) => (d.alert_count ?? 0) > 0 ? (
          <polygon key={`alert-${i}`}
            points={`${xForN(i)},${pad.top - 10} ${xForN(i) - 4},${pad.top - 4} ${xForN(i) + 4},${pad.top - 4}`}
            fill="#8b5cf6"
            onClick={() => onPointClick?.(d.date)}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }} />
        ) : null)}
        {hasAnomalies && validPts.map((d, i) => (d.anomaly_count ?? 0) > 0 ? (
          <rect key={`anomaly-${i}`}
            x={xForN(i) - 3} y={pad.top - 18} width="6" height="6" fill="#f97316"
            transform={`rotate(45 ${xForN(i)} ${pad.top - 15})`}
            onClick={() => onPointClick?.(d.date)}
            style={{ cursor: onPointClick ? 'pointer' : 'default' }} />
        ) : null)}
        {(() => {
          const todayIso = new Date().toISOString().slice(0, 10)
          return validPts
            .filter((_, i) => i % Math.ceil(validPts.length / 7) === 0 || i === validPts.length - 1)
            .map(d => {
              const idx = validPts.indexOf(d)
              const isToday = d.date === todayIso
              return (
                <text key={idx} x={xForN(idx)} y={h - 8} textAnchor="middle" fontSize="10"
                  fill={isToday ? 'var(--accent, #3b82f6)' : '#9ca3af'}
                  fontWeight={isToday ? '600' : '400'}>
                  {isToday ? 'Today' : formatAxisDate(d.date)}
                </text>
              )
            })
        })()}
        {/* Confidence band shaded area */}
        {hasForecast && upperBand?.length && lowerBand?.length && (() => {
          const uPts = upperBand.map((d, i) => ({
            x: xForN(validPts.length + i),
            y: pad.top + chartH - ((Math.min(d.score, 100) - min) / (max - min)) * chartH,
          }))
          const lPts = lowerBand.map((d, i) => ({
            x: xForN(validPts.length + i),
            y: pad.top + chartH - ((Math.max(d.score, min) - min) / (max - min)) * chartH,
          }))
          const topPath = uPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
          const bottomPath = [...lPts].reverse().map((p) => `L${p.x},${p.y}`).join(' ')
          return <path d={`${topPath} ${bottomPath} Z`} fill="#3b82f6" fillOpacity="0.08" />
        })()}

        {/* Forecast dashed line */}
        {hasForecast && (() => {
          const fcPts = forecastData!.map((d, i) => ({
            x: xForN(validPts.length + i),
            y: pad.top + chartH - ((d.score - min) / (max - min)) * chartH,
          }))
          // Connect last historical point to first forecast point
          const connectX = pts.length > 0 ? pts[pts.length - 1].x : xForN(validPts.length)
          const connectY = pts.length > 0 ? pts[pts.length - 1].y : fcPts[0]?.y ?? 0
          const fullPath = [
            `M${connectX},${connectY}`,
            ...fcPts.map(p => `L${p.x},${p.y}`)
          ].join(' ')
          return <path d={fullPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 3" strokeOpacity="0.6" />
        })()}

        {/* Today vertical divider */}
        {hasForecast && pts.length > 0 && (
          <>
            <line
              x1={pts[pts.length - 1].x} x2={pts[pts.length - 1].x}
              y1={pad.top} y2={pad.top + chartH}
              stroke="#9ca3af" strokeWidth="1" strokeDasharray="3 2"
            />
            <text
              x={pts[pts.length - 1].x + 4} y={pad.top + 10}
              fontSize="9" fill="#9ca3af"
            >Today</text>
          </>
        )}
      </svg>
      {tooltip && (() => {
        const delta = tooltip.prevScore !== null ? tooltip.score - tooltip.prevScore : null
        const scoreColor = tooltip.score >= 90 ? '#4ade80' : tooltip.score >= 75 ? '#fbbf24' : '#f87171'
        const clampedX = Math.max(10, Math.min(85, tooltip.x))
        const translateX = clampedX < 15 ? '0%' : clampedX > 85 ? '-100%' : '-50%'
        const arrowLeft = clampedX < 15 ? '20px' : clampedX > 85 ? 'calc(100% - 20px)' : '50%'
        return (
          <div style={{
            position: 'absolute', left: `${clampedX}%`, top: `${tooltip.y}%`,
            transform: `translate(${translateX}, -130%)`,
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)',
            color: '#fff', padding: '10px 14px', borderRadius: '10px',
            fontSize: '12px', fontWeight: 500, pointerEvents: 'none',
            whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            zIndex: 10, minWidth: '160px',
          }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px' }}>
              {formatDate(tooltip.date)}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: (tooltip.failed > 0 || tooltip.alertCount + tooltip.anomalyCount > 0) ? '6px' : 0 }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: scoreColor, letterSpacing: '-0.5px' }}>
                {tooltip.score.toFixed(1)}%
              </span>
              {delta !== null && (
                <span style={{ fontSize: '11px', color: delta >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                  {delta >= 0 ? '↑ +' : '↓ '}{delta.toFixed(1)} vs prev
                </span>
              )}
            </div>
            {tooltip.failed > 0 && (
              <div style={{ fontSize: '11px', color: '#f87171', marginBottom: '2px' }}>
                {tooltip.failed} failed run{tooltip.failed !== 1 ? 's' : ''}
              </div>
            )}
            {(tooltip.alertCount + tooltip.anomalyCount) > 0 && (
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                {tooltip.alertCount > 0 && `${tooltip.alertCount} alert${tooltip.alertCount !== 1 ? 's' : ''}`}
                {tooltip.alertCount > 0 && tooltip.anomalyCount > 0 && ' · '}
                {tooltip.anomalyCount > 0 && `${tooltip.anomalyCount} anomal${tooltip.anomalyCount !== 1 ? 'ies' : 'y'}`}
              </div>
            )}
            <div style={{
              position: 'absolute', bottom: '-5px', left: arrowLeft,
              transform: 'translateX(-50%)', width: 0, height: 0,
              borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
              borderTop: '5px solid #0f172a',
            }} />
          </div>
        )
      })()}
      {(hasAlerts || hasAnomalies || hasForecast) && (
        <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', justifyContent: 'flex-end' }}>
          {hasAlerts && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#8b5cf6' }}>▲</span> Alerts</span>}
          {hasAnomalies && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#f97316' }}>◆</span> Anomalies</span>}
          {hasForecast && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#3b82f6', opacity: 0.6 }}>- -</span> Forecast</span>}
        </div>
      )}
    </div>
  )
}
