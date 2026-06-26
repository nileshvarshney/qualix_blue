'use client'
import { apiFetch } from '@/lib/apiFetch'

interface FailedRecordsTableProps {
  records: Record<string, unknown>[]
  maskedFields?: string[]
  emptyMessage?: string
}

export default function FailedRecordsTable({ records, maskedFields = [], emptyMessage = 'No failing records' }: FailedRecordsTableProps) {
  if (records.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
        {emptyMessage}
      </div>
    )
  }

  const cols = Object.keys(records[0])

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'monospace' }}>
        <thead>
          <tr style={{ background: 'var(--surface-muted)' }}>
            {cols.map(col => (
              <th key={col} style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                {col}
                {maskedFields.includes(col) && (
                  <span title="Masked for your role" style={{ marginLeft: '4px' }}>🔒</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
              {cols.map(col => (
                <td key={col} style={{ padding: '5px 12px', color: 'var(--foreground)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row[col] == null
                    ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>
                    : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
