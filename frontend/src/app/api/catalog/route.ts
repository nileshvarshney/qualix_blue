import { NextRequest, NextResponse } from 'next/server';
import { serverFetch } from '@/lib/serverFetch';
import { DEMO_ENRICHED_ASSETS } from '@/lib/demoData';

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get('action');

  if (action === 'tree') {
    const source_id = searchParams.get('source_id') ?? '';
    const depth = searchParams.get('depth') ?? '3';
    const params = new URLSearchParams({ depth });
    if (source_id) params.set('source_id', source_id);
    try {
      const res = await serverFetch(req, `${BACKEND}/asset-registry/tree?${params}`);
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch { return NextResponse.json([]); }
  }

  if (action === 'children') {
    const asset_id = searchParams.get('asset_id') ?? '';
    try {
      const res = await serverFetch(req, `${BACKEND}/asset-registry/${encodeURIComponent(asset_id)}/children`);
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch { return NextResponse.json([]); }
  }

  if (action === 'ancestors') {
    const asset_id = searchParams.get('asset_id') ?? '';
    try {
      const res = await serverFetch(req, `${BACKEND}/asset-registry/${encodeURIComponent(asset_id)}/ancestors`);
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch { return NextResponse.json([]); }
  }

  if (action === 'search') {
    const q = (searchParams.get('q') ?? '').toLowerCase();
    const asset_type = searchParams.get('asset_type') ?? '';
    const status = searchParams.get('status') ?? '';
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (asset_type) params.set('asset_type', asset_type);
    if (status) params.set('status', status);
    try {
      const res = await serverFetch(req, `${BACKEND}/asset-registry/search?${params}`);
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    } catch {
      let results = DEMO_ENRICHED_ASSETS;
      if (q) results = results.filter(a => a.sf_table_name.toLowerCase().includes(q) || a.connection_name.toLowerCase().includes(q));
      if (asset_type) results = results.filter(a => a.asset_type === asset_type);
      if (status) results = results.filter(a => a.status === status);
      return NextResponse.json(results);
    }
  }

  // Default: return enriched assets list
  const connection_id = searchParams.get('connection_id') ?? '';
  try {
    const enrichedUrl = connection_id
      ? `${BACKEND}/asset-registry/enriched?connection_id=${connection_id}`
      : `${BACKEND}/asset-registry/enriched`;
    const res = await serverFetch(req, enrichedUrl);
    if (!res.ok) throw new Error(`Backend ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    const assets = connection_id
      ? DEMO_ENRICHED_ASSETS.filter(a => a.connection_id === connection_id)
      : DEMO_ENRICHED_ASSETS;
    return NextResponse.json(assets);
  }
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const asset_id = searchParams.get('asset_id') ?? '';
  const body = await req.json();
  const res = await serverFetch(req, `${BACKEND}/asset-registry/${encodeURIComponent(asset_id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
