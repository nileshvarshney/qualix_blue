from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from datetime import datetime, timezone
from typing import List
import uuid

from app.db.database import get_db
from app.db.models import Tag, AssetTag, CustomAttribute
from app.core.security import get_current_user

router = APIRouter(tags=["Tags"])


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fmt_tag(t: Tag) -> dict:
    return {
        "tag_id": t.tag_id,
        "tag_name": t.tag_name,
        "color": t.color,
        "description": t.description,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _fmt_asset_tag(at: AssetTag) -> dict:
    return {
        "id": at.id,
        "entity_type": at.entity_type,
        "entity_id": at.entity_id,
        "tag_id": at.tag_id,
        "created_at": at.created_at.isoformat() if at.created_at else None,
    }


def _fmt_custom_attr(ca: CustomAttribute) -> dict:
    return {
        "attr_id": ca.attr_id,
        "asset_id": ca.asset_id,
        "attr_key": ca.attr_key,
        "attr_value": ca.attr_value,
        "created_at": ca.created_at.isoformat() if ca.created_at else None,
        "updated_at": ca.updated_at.isoformat() if ca.updated_at else None,
    }


# ── Tag CRUD ──────────────────────────────────────────────────────────────────

@router.get("/tags")
async def list_tags(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List all tags."""
    result = await db.execute(select(Tag).order_by(Tag.tag_name))
    return [_fmt_tag(t) for t in result.scalars().all()]


@router.post("/tags")
async def create_tag(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create a new tag. Admin only."""
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")

    tag_name = payload.get("tag_name")
    if not tag_name:
        raise HTTPException(422, "tag_name is required")

    tag = Tag(
        tag_id=str(uuid.uuid4()),
        tag_name=tag_name,
        color=payload.get("color", "#6B7280"),
        description=payload.get("description"),
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return _fmt_tag(tag)


@router.put("/tags/{tag_id}")
async def update_tag(
    tag_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update tag color or description. Admin only."""
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")

    result = await db.execute(select(Tag).where(Tag.tag_id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(404, "Tag not found")

    for field in ("tag_name", "color", "description"):
        if field in payload:
            setattr(tag, field, payload[field])
    tag.updated_at = _now()
    await db.commit()
    await db.refresh(tag)
    return _fmt_tag(tag)


@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Delete a tag. Admin only."""
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")

    result = await db.execute(select(Tag).where(Tag.tag_id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(404, "Tag not found")
    await db.delete(tag)
    await db.commit()
    return {"message": "Tag deleted"}


# ── Asset Tag operations ──────────────────────────────────────────────────────

@router.post("/assets/{asset_id}/tags")
async def apply_tags_to_asset(
    asset_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Apply a list of tags to an asset. Creates AssetTag records."""
    tag_ids: List[str] = payload.get("tag_ids", [])
    if not tag_ids:
        raise HTTPException(422, "tag_ids list is required and must not be empty")

    # Verify all tag IDs exist
    tags_result = await db.execute(select(Tag).where(Tag.tag_id.in_(tag_ids)))
    found_tags = tags_result.scalars().all()
    found_ids = {t.tag_id for t in found_tags}
    missing = set(tag_ids) - found_ids
    if missing:
        raise HTTPException(404, f"Tags not found: {list(missing)}")

    # Avoid duplicates: fetch existing links
    existing_result = await db.execute(
        select(AssetTag).where(
            AssetTag.entity_type == "asset",
            AssetTag.entity_id == asset_id,
            AssetTag.tag_id.in_(tag_ids),
        )
    )
    existing_tag_ids = {at.tag_id for at in existing_result.scalars().all()}

    created = []
    for tag_id in tag_ids:
        if tag_id in existing_tag_ids:
            continue
        at = AssetTag(
            id=str(uuid.uuid4()),
            entity_type="asset",
            entity_id=asset_id,
            tag_id=tag_id,
            created_at=_now(),
        )
        db.add(at)
        created.append(tag_id)

    await db.commit()
    return {"applied": created, "already_present": list(existing_tag_ids & set(tag_ids))}


@router.delete("/assets/{asset_id}/tags/{tag_id}")
async def remove_tag_from_asset(
    asset_id: str,
    tag_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Remove a tag from an asset."""
    result = await db.execute(
        select(AssetTag).where(
            AssetTag.entity_type == "asset",
            AssetTag.entity_id == asset_id,
            AssetTag.tag_id == tag_id,
        )
    )
    at = result.scalar_one_or_none()
    if not at:
        raise HTTPException(404, "Tag not applied to this asset")
    await db.delete(at)
    await db.commit()
    return {"message": "Tag removed from asset"}


@router.get("/assets/{asset_id}/tags")
async def list_asset_tags(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List all tags applied to an asset."""
    result = await db.execute(
        select(AssetTag).where(
            AssetTag.entity_type == "asset",
            AssetTag.entity_id == asset_id,
        )
    )
    asset_tags = result.scalars().all()

    tag_ids = [at.tag_id for at in asset_tags]
    if not tag_ids:
        return []

    tags_result = await db.execute(select(Tag).where(Tag.tag_id.in_(tag_ids)))
    tags_by_id = {t.tag_id: t for t in tags_result.scalars().all()}

    return [
        {
            **_fmt_asset_tag(at),
            "tag_name": tags_by_id[at.tag_id].tag_name if at.tag_id in tags_by_id else None,
            "color": tags_by_id[at.tag_id].color if at.tag_id in tags_by_id else None,
        }
        for at in asset_tags
    ]


# ── Custom Attributes ─────────────────────────────────────────────────────────

@router.post("/assets/{asset_id}/custom-attributes")
async def set_custom_attribute(
    asset_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Set a custom attribute on an asset (upsert by attr_key)."""
    attr_key = payload.get("attr_key")
    attr_value = payload.get("attr_value")
    if not attr_key:
        raise HTTPException(422, "attr_key is required")

    # Check if exists (upsert)
    result = await db.execute(
        select(CustomAttribute).where(
            CustomAttribute.asset_id == asset_id,
            CustomAttribute.attr_key == attr_key,
        )
    )
    ca = result.scalar_one_or_none()
    if ca:
        ca.attr_value = attr_value
        ca.updated_at = _now()
    else:
        ca = CustomAttribute(
            attr_id=str(uuid.uuid4()),
            asset_id=asset_id,
            attr_key=attr_key,
            attr_value=attr_value,
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(ca)
    await db.commit()
    await db.refresh(ca)
    return _fmt_custom_attr(ca)


@router.get("/assets/{asset_id}/custom-attributes")
async def list_custom_attributes(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """List all custom attributes for an asset."""
    result = await db.execute(
        select(CustomAttribute).where(CustomAttribute.asset_id == asset_id)
    )
    return [_fmt_custom_attr(ca) for ca in result.scalars().all()]


@router.delete("/assets/{asset_id}/custom-attributes/{attr_key}")
async def delete_custom_attribute(
    asset_id: str,
    attr_key: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Delete a custom attribute from an asset."""
    result = await db.execute(
        select(CustomAttribute).where(
            CustomAttribute.asset_id == asset_id,
            CustomAttribute.attr_key == attr_key,
        )
    )
    ca = result.scalar_one_or_none()
    if not ca:
        raise HTTPException(404, "Custom attribute not found")
    await db.delete(ca)
    await db.commit()
    return {"message": "Custom attribute deleted"}
