'use client'
import ConnectionsClient from '@/components/connections/ConnectionsClient'
import { apiFetch } from '@/lib/apiFetch'

export default function ConnectionsPage() {
  return <ConnectionsClient initialConnections={[]} />
}
