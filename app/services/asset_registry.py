"""Stable UUID v5 IDs for Asset Registry hierarchy nodes."""
from __future__ import annotations
import uuid

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
