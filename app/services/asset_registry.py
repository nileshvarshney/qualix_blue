"""Asset Registry service — stable IDs and description utilities."""
from __future__ import annotations
import inspect
import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

_REGISTRY_NS = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')  # RFC 4122 DNS namespace


def stable_asset_id(qualified_path: str) -> str:
    """Return a deterministic UUID v5 for a given qualified path string.

    Examples:
        stable_asset_id("source:conn-123")
        stable_asset_id("database:conn-123:MY_DB")
        stable_asset_id("schema:conn-123:MY_DB:PUBLIC")
        stable_asset_id("column:table-asset-uuid:COLUMN_NAME")
    """
    return str(uuid.uuid5(_REGISTRY_NS, qualified_path))


async def effective_description(asset_id: str, db: AsyncSession) -> Optional[str]:
    """Return this asset's description, or walk ancestors until one is found."""
    from app.db.models import Asset
    visited: set[str] = set()
    current_id: Optional[str] = asset_id
    while current_id and current_id not in visited:
        visited.add(current_id)
        result = await db.execute(select(Asset).where(Asset.asset_id == current_id))
        _raw = result.scalar_one_or_none()
        asset = await _raw if inspect.isawaitable(_raw) else _raw
        if not asset:
            break
        if asset.description:
            return asset.description
        current_id = asset.parent_asset_id
    return None


async def generate_description(
    asset_id: str,
    db: AsyncSession,
    provider_name: Optional[str] = None,
) -> str:
    """AI-generate a description for the given asset and persist it."""
    from app.services.ai_service import generate_asset_description
    return await generate_asset_description(asset_id, provider_name, db)
