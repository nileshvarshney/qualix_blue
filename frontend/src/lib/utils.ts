import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

export function formatDateTime(date: string) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export function formatNumber(num: number) {
  return new Intl.NumberFormat('en-US').format(num)
}

export const categoryColors: Record<string, string> = {
  completeness: '#6366f1',
  accuracy: '#8b5cf6',
  uniqueness: '#06b6d4',
  validity: '#10b981',
  timeliness: '#f59e0b',
  consistency: '#ef4444'
}

export const connectionIcons: Record<string, string> = {
  postgresql: '🐘',
  mysql: '🐬',
  bigquery: '📊',
  snowflake: '❄️',
  csv: '📄',
  api: '🔌',
  mongodb: '🍃',
  redshift: '🔴'
}
