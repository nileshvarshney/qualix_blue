import { apiFetch } from '@/lib/apiFetch'
const SENS_STYLE: Record<string, { bg: string; color: string }> = {
  PHI:          { bg: '#fef2f2', color: '#dc2626' },
  PII:          { bg: '#fff7ed', color: '#c2410c' },
  RESTRICTED:   { bg: '#fff1f2', color: '#be123c' },
  CONFIDENTIAL: { bg: '#fefce8', color: '#a16207' },
  SENSITIVE:    { bg: '#eff6ff', color: '#1d4ed8' },
}

export function SensitivityBadge({ classification }: { classification: string | null | undefined }) {
  if (!classification) return null
  const s = SENS_STYLE[classification]
  if (!s) return null
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '1px 5px', borderRadius: '3px',
      fontSize: '9px', fontWeight: 600,
      whiteSpace: 'nowrap', textTransform: 'capitalize',
      flexShrink: 0,
    }}>
      {classification}
    </span>
  )
}
