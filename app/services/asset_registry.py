"""Asset Registry service — stable IDs and description utilities."""
from __future__ import annotations
import inspect
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

_REGISTRY_NS = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')  # RFC 4122 DNS namespace

VALID_ASSET_STATUSES: frozenset[str] = frozenset(
    {'active', 'missing', 'deprecated', 'scan_failed', 'disabled'}
)

# (current_status, new_status) pairs that are explicitly forbidden
_BLOCKED_TRANSITIONS: frozenset[tuple[str, str]] = frozenset({
    ('disabled', 'active'),  # disabled assets require admin re-enable
})


def transition_status(current: str, new: str) -> str:
    """Validate and apply an asset lifecycle status transition.

    Returns new_status on success. Raises ValueError when:
    - new_status is not in VALID_ASSET_STATUSES
    - the (current -> new) pair is explicitly blocked
    """
    if new not in VALID_ASSET_STATUSES:
        raise ValueError(
            f"Invalid status '{new}'. Must be one of: {sorted(VALID_ASSET_STATUSES)}"
        )
    if (current, new) in _BLOCKED_TRANSITIONS:
        raise ValueError(
            f"Transition '{current}' to '{new}' is blocked. "
            "A disabled asset must be re-enabled by an administrator."
        )
    return new


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


async def ensure_hierarchy_assets(
    connection_id: str,
    connection_name: str,
    database_name: str,
    schema_name: str,
    provider: str,
    db: AsyncSession,
) -> tuple[str, str, str]:
    """Ensure source, database, and schema Asset records exist.

    Creates missing nodes and refreshes last_seen_at/status on existing ones.
    Does NOT commit — caller must commit after creating the table asset so all
    nodes land in the same transaction.

    Returns (source_asset_id, database_asset_id, schema_asset_id).
    """
    from app.db.models import Asset, AssetSourceMeta

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db_lower = database_name.lower()
    schema_lower = schema_name.lower()

    source_id    = stable_asset_id(f"source:{connection_id}")
    database_id  = stable_asset_id(f"database:{connection_id}:{db_lower}")
    schema_id    = stable_asset_id(f"schema:{connection_id}:{db_lower}:{schema_lower}")

    nodes = [
        dict(
            asset_id=source_id, parent_asset_id=None,
            asset_type="source",
            physical_name=connection_name, display_name=connection_name,
            qualified_name=connection_name,
            path=f"/sources/{connection_id}",
            connection_id=connection_id,
            generic_database_name=None, generic_schema_name=None,
            generic_object_name=connection_name, generic_object_type="source",
        ),
        dict(
            asset_id=database_id, parent_asset_id=source_id,
            asset_type="database",
            physical_name=database_name, display_name=database_name,
            qualified_name=database_name,
            path=f"/sources/{connection_id}/{database_name}",
            connection_id=connection_id,
            generic_database_name=database_name, generic_schema_name=None,
            generic_object_name=database_name, generic_object_type="database",
        ),
        dict(
            asset_id=schema_id, parent_asset_id=database_id,
            asset_type="schema",
            physical_name=schema_name, display_name=schema_name,
            qualified_name=f"{database_name}.{schema_name}",
            path=f"/sources/{connection_id}/{database_name}/{schema_name}",
            connection_id=connection_id,
            generic_database_name=database_name, generic_schema_name=schema_name,
            generic_object_name=schema_name, generic_object_type="schema",
        ),
    ]

    for node in nodes:
        result = await db.execute(
            select(Asset).where(Asset.asset_id == node["asset_id"])
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            db.add(Asset(
                status="active", discovered_at=now, last_seen_at=now,
                is_active=True,
                asset_id=node["asset_id"],
                parent_asset_id=node["parent_asset_id"],
                asset_type=node["asset_type"],
                physical_name=node["physical_name"],
                display_name=node["display_name"],
                qualified_name=node["qualified_name"],
                path=node["path"],
                connection_id=node["connection_id"],
            ))
            db.add(AssetSourceMeta(
                asset_id=node["asset_id"],
                provider=provider,
                generic_database_name=node["generic_database_name"],
                generic_schema_name=node["generic_schema_name"],
                generic_object_name=node["generic_object_name"],
                generic_object_type=node["generic_object_type"],
            ))
        else:
            existing.last_seen_at = now
            existing.status = "active"

    return source_id, database_id, schema_id


async def register_column_assets(
    table_asset_id: str,
    connection_id: str,
    columns: list,          # list[ColumnMetaIn] from app.schemas.metadata
    db: AsyncSession,
    table_qualified_name: str = "",
) -> list[str]:
    """Create or refresh thin Asset records for each column.

    Uses a single bulk SELECT to find existing column assets, then batch-inserts
    only new ones. Does NOT commit — caller commits.

    Returns column asset_ids in the same order as columns.
    """
    from app.db.models import Asset

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Build all stable IDs up front
    col_ids = [
        stable_asset_id(f"column:{table_asset_id}:{col.column_name.lower()}")
        for col in columns
    ]

    if not col_ids:
        return col_ids  # noqa: early-return

    # Bulk check which already exist
    result = await db.execute(
        select(Asset.asset_id).where(Asset.asset_id.in_(col_ids))
    )
    existing_ids: set[str] = {row[0] for row in result}

    for col, col_asset_id in zip(columns, col_ids):
        if col_asset_id not in existing_ids:
            db.add(Asset(
                asset_id=col_asset_id,
                parent_asset_id=table_asset_id,
                asset_type="column",
                physical_name=col.column_name,
                display_name=col.column_name,
                qualified_name=(
                    f"{table_qualified_name}.{col.column_name}"
                    if table_qualified_name else col.column_name
                ),
                path=None,
                status="active",
                connection_id=connection_id,
                discovered_at=now,
                last_seen_at=now,
                description=col.description,
                is_active=True,
            ))

    return col_ids


async def register_file_asset(
    connection_id: str,
    path: str,
    display_name: str,
    db: AsyncSession,
    size_bytes: Optional[int] = None,
    last_modified_at: Optional[datetime] = None,
    parent_asset_id: Optional[str] = None,
) -> str:
    """Create or upsert an Asset record with asset_type='file'.

    Path is stored as-is; the identity key lowercases path to avoid
    case-sensitivity duplicates. S3 paths are case-sensitive — the stored
    Asset.path retains the original case, but the UUID is derived from
    the lowercased form.
    """
    from app.db.models import Asset, AssetSourceMeta

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # Identity key lowercases path (see comment above)
    asset_id = stable_asset_id(f"file:{connection_id}:{path.lower()}")
    fallback_parent = stable_asset_id(f"source:{connection_id}")

    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    existing = result.scalar_one_or_none()

    if existing is None:
        db.add(Asset(
            asset_id=asset_id,
            parent_asset_id=parent_asset_id or fallback_parent,
            asset_type="file",
            physical_name=path.split("/")[-1],
            display_name=display_name,
            qualified_name=path,
            path=path,
            status="active",
            connection_id=connection_id,
            discovered_at=now,
            last_seen_at=now,
            is_active=True,
        ))
        db.add(AssetSourceMeta(
            asset_id=asset_id,
            provider="s3",
            generic_object_name=path.split("/")[-1],
            generic_object_type="file",
        ))
    else:
        existing.last_seen_at = now
        existing.status = "active"

    await db.commit()
    return asset_id


async def register_logical_dataset(
    slug: str,
    display_name: str,
    db: AsyncSession,
    description: Optional[str] = None,
    owner_user_id: Optional[str] = None,
    domain_id: Optional[str] = None,
    parent_asset_id: Optional[str] = None,
) -> str:
    """Create or upsert a user-defined logical dataset Asset.

    Slug is normalized to lowercase. Has no connection_id (source-agnostic).
    Logical datasets are excluded from mark_missing_assets() since they have
    no backing source scan.
    """
    from app.db.models import Asset

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    slug_lower = slug.lower()
    asset_id = stable_asset_id(f"logical_dataset:{slug_lower}")

    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    existing = result.scalar_one_or_none()

    if existing is None:
        db.add(Asset(
            asset_id=asset_id,
            parent_asset_id=parent_asset_id,
            asset_type="logical_dataset",
            physical_name=slug,
            display_name=display_name,
            qualified_name=slug_lower,
            path=f"/logical/{slug_lower}",
            status="active",
            connection_id=None,
            discovered_at=now,
            last_seen_at=now,
            description=description,
            owner_user_id=owner_user_id,
            domain_id=domain_id,
            is_active=True,
        ))

    await db.commit()
    return asset_id
