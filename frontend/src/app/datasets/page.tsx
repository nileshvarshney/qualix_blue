import { redirect } from 'next/navigation'
import { apiFetch } from '@/lib/apiFetch'

export default function DatasetsRedirect() {
  redirect('/asset-registry')
}
