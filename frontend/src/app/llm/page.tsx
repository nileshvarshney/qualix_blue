'use client'
import LLMSettingsTab from '@/components/settings/LLMSettingsTab'
import { apiFetch } from '@/lib/apiFetch'

export default function LLMPage() {
  return (
    <div style={{ padding: '28px 36px', maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: '0 0 20px' }}>LLM / AI Settings</h1>
      <LLMSettingsTab />
    </div>
  )
}
