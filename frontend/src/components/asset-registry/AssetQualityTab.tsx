'use client'
import { useState, useEffect } from 'react'
import { ScorePill, TrendChart } from '@/components/shared/charts'
import { AssetQualityScore, AssetQualityHistory, QualityDimension, ForecastResponse } from '@/lib/types'
import { apiFetch } from '@/lib/apiFetch'

const DIMENSIONS: QualityDimension[] = [
  'completeness', 'validity', 'uniqueness', 'timeliness', 'consistency', 'integrity',
]

const DIMENSION_LABELS: Record<QualityDimension, string> = {
  completeness: 'Completeness',
  validity: 'Validity',
  uniqueness: 'Uniqueness',
  timeliness: 'Timeliness',
  consistency: 'Consistency',
  integrity: 'Integrity',
}

const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: '12px', padding: '14px 16px', border: '1px solid var(--border)' }

export default function AssetQualityTab({ assetId }: { assetId: string }) {
  const [score, setScore] = useState<AssetQualityScore | null>(null)
  const [history, setHistory] = useState<AssetQualityHistory | null>(null)
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      apiFetch(`/api/quality-scores/assets/${assetId}`).then(r => r.json()),
      apiFetch(`/api/quality-scores/assets/${assetId}/history?days=30`).then(r => r.json()),
    ])
      .then(([s, h]: [AssetQualityScore, AssetQualityHistory]) => {
        setScore(s)
        setHistory(h)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [assetId])

  useEffect(() => {
    apiFetch(`/api/quality-scores/assets/${assetId}/forecast?days=30&horizon=7`)
      .then(r => r.json())
      .then((f: ForecastResponse) => setForecast(f))
      .catch(() => {/* forecast is optional — silently ignore errors */})
  }, [assetId])

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Loading quality score…
      </div>
    )
  }

  if (!score) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Unable to load quality score
      </div>
    )
  }

  const trendData = (history?.history ?? []).map(h => ({ date: h.date, score: h.overall_score, failed: 0 }))
  const hasForecast = forecast && !forecast.insufficient_history && forecast.forecast.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={card}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>Overall quality score</div>
        {score.overall_score !== null ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-1.5px', lineHeight: 1 }}>
              {score.overall_score.toFixed(1)}
            </span>
            <ScorePill score={Math.round(score.overall_score)} />
          </div>
        ) : (
          <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '-1.5px', lineHeight: 1 }}>—</span>
        )}
        {score.score_date && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>As of {score.score_date}</div>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '10px' }}>Quality dimensions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
          {DIMENSIONS.map(dim => {
            const detail = score.dimensions[dim]
            const val = detail?.score ?? null
            const color = val === null ? '#9ca3af' : val >= 90 ? '#16a34a' : val >= 75 ? '#ea8b3a' : '#dc2626'
            return (
              <div key={dim} style={{ background: 'var(--surface-muted)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 500 }}>{DIMENSION_LABELS[dim]}</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color, letterSpacing: '-0.5px', marginBottom: '6px' }}>
                  {val !== null ? <>{val}<span style={{ fontSize: '12px' }}>%</span></> : '—'}
                </div>
                <div style={{ height: '3px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${val ?? 0}%`, background: color, transition: 'width 0.5s' }} />
                </div>
                {detail?.source === 'profiling' && (
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>from profiling</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '10px' }}>
          Score trend · last 30 days{hasForecast ? ' + 7-day forecast' : ''}
        </div>
        {forecast?.insufficient_history && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Not enough history to forecast — run more quality checks to enable predictions.
          </div>
        )}
        <TrendChart
          data={trendData}
          forecastData={hasForecast ? forecast.forecast : undefined}
          upperBand={hasForecast ? forecast.upper_band : undefined}
          lowerBand={hasForecast ? forecast.lower_band : undefined}
        />
      </div>
    </div>
  )
}
