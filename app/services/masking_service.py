# app/services/masking_service.py
"""Role-aware masking/redaction for failed-record evidence.

Combines explicit `MaskingPolicy` rows with PII-style `DataClassification`
tags to decide which columns of a failed-record sample must be redacted
for the requesting user's role.
"""
from __future__ import annotations

import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DataClassification, MaskingPolicy

# Roles that can always see unmasked evidence, regardless of policy.
DEFAULT_UNMASKED_ROLES = {"admin", "data_steward", "data_owner", "domain_owner"}

# DataClassification values treated as sensitive when no explicit MaskingPolicy exists.
SENSITIVE_CLASSIFICATION_KEYWORDS = ("pii", "confidential", "restricted", "sensitive")


def _is_sensitive_classification(classification: str | None) -> bool:
    c = (classification or "").lower()
    return any(k in c for k in SENSITIVE_CLASSIFICATION_KEYWORDS)


def mask_value(value: object, masking_type: str) -> object:
    """Redact a single value according to masking_type."""
    if value is None:
        return None
    s = str(value)
    if masking_type == "hash":
        return "sha256:" + hashlib.sha256(s.encode("utf-8")).hexdigest()[:12]
    if masking_type == "partial":
        if len(s) <= 4:
            return "*" * len(s)
        return s[:2] + "*" * (len(s) - 4) + s[-2:]
    # "full" / unknown -> full redaction
    return "█" * 8


async def get_masked_columns(db: AsyncSession, asset_id: str, role: str) -> dict[str, str]:
    """Return {column_name: masking_type} that must be redacted for this role."""
    if role in DEFAULT_UNMASKED_ROLES:
        return {}

    masked: dict[str, str] = {}

    policy_rows = (
        await db.execute(select(MaskingPolicy).where(MaskingPolicy.asset_id == asset_id))
    ).scalars().all()
    policy_columns: set[str] = set()
    for policy in policy_rows:
        policy_columns.add(policy.column_name)
        unmasked_roles = {r.strip() for r in (policy.unmasked_roles or "").split(",") if r.strip()}
        if role not in unmasked_roles:
            masked[policy.column_name] = policy.masking_type

    classification_rows = (
        await db.execute(select(DataClassification).where(DataClassification.asset_id == asset_id))
    ).scalars().all()
    for cls in classification_rows:
        if cls.column_name and cls.column_name not in policy_columns and _is_sensitive_classification(cls.classification):
            masked.setdefault(cls.column_name, "full")

    return masked


async def mask_records(
    db: AsyncSession, asset_id: str, user: dict | None, records: list[dict]
) -> tuple[list[dict], list[str]]:
    """Apply role-aware masking to a list of failed-record dicts.

    Returns (masked_records, masked_field_names).
    """
    role = (user or {}).get("role", "viewer")
    masked_columns = await get_masked_columns(db, asset_id, role)
    if not masked_columns:
        return records, []

    masked_records: list[dict] = []
    for record in records:
        new_record = dict(record or {})
        for column, masking_type in masked_columns.items():
            if column in new_record:
                new_record[column] = mask_value(new_record[column], masking_type)
        masked_records.append(new_record)

    return masked_records, sorted(masked_columns.keys())
