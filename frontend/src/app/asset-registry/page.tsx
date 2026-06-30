'use client'
import { useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import AssetTreePanel, { AssetTreePanelHandle } from '@/components/asset-registry/AssetTreePanel'
import AssetDetailPanel from '@/components/asset-registry/AssetDetailPanel'
import AdhocDiscoveryModal from '@/components/datasets/AdhocDiscoveryModal'
import { apiFetch } from '@/lib/apiFetch'

interface Asset {
  asset_id: string
  asset_type: string
  display_name?: string
  physical_name?: string
  qualified_name?: string
  description?: string
  status: string
  criticality: string
  sensitivity?: string
  owner_user_id?: string
  owner_team_id?: string
  steward_user_id?: string
  domain?: string
  discovered_at?: string
  last_seen_at?: string
  connection_id?: string
  connection_name?: string
  source_meta?: { sf_table_name?: string; sf_schema_name?: string; sf_database_name?: string; row_count?: number }
}

function AssetRegistryInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialSearch = searchParams.get('q') ?? undefined
  const [selected, setSelected] = useState<Asset | null>(null)
  const [loading, setLoading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const treePanelRef = useRef<AssetTreePanelHandle | null>(null)

  const handleSelect = useCallback(async (assetId: string) => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/asset-registry/${assetId}`)
      if (res.ok) setSelected(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDescriptionSaved = useCallback((desc: string) => {
    setSelected(prev => prev ? { ...prev, description: desc } : prev)
  }, [])

  const handleDiscoveryComplete = useCallback(() => {
    setShowImport(false)
    treePanelRef.current?.refresh()
  }, [])

  const handleSearchChange = useCallback((q: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    const qs = params.toString()
    router.replace(qs ? `/asset-registry?${qs}` : '/asset-registry', { scroll: false })
  }, [router])

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--background)' }}>
      <div style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
        <div style={{ width: panelOpen ? '280px' : '0px', overflow: 'hidden', transition: 'width 0.2s ease', display: 'flex', flexShrink: 0 }}>
          <AssetTreePanel ref={treePanelRef} onSelect={handleSelect} selectedId={selected?.asset_id ?? null} initialSearch={initialSearch} onSearchChange={handleSearchChange} />
        </div>
        <button
          onClick={() => setPanelOpen(p => !p)}
          style={{
            position: 'absolute', right: '-12px', top: '10px', zIndex: 10,
            width: '22px', height: '22px', borderRadius: '50%',
            border: '1px solid var(--border)', background: 'var(--surface)',
            cursor: 'pointer', fontSize: '11px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
          }}
        >
          {panelOpen ? '‹' : '›'}
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, background: 'var(--surface)' }}>
          <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Asset Registry</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', flex: 1 }}>Master inventory of all discovered data assets</span>
          <button
            onClick={() => setShowImport(true)}
            style={{
              padding: '5px 14px', borderRadius: '6px', border: '1px solid var(--border)',
              background: 'var(--accent-bg)', color: 'var(--accent)',
              fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Adhoc Discovery
          </button>
        </div>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading...</div>
        ) : (
          <AssetDetailPanel asset={selected} onDescriptionSaved={handleDescriptionSaved} />
        )}
      </div>
      {showImport && (
        <AdhocDiscoveryModal
          onClose={() => setShowImport(false)}
          onComplete={handleDiscoveryComplete}
        />
      )}
    </div>
  )
}

export default function AssetRegistryPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}>
      <AssetRegistryInner />
    </Suspense>
  )
}
