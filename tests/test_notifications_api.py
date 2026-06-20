from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock


def _make_notification(is_read=False, type="violation_detected"):
    n = MagicMock()
    n.notification_id = "notif-001"
    n.user_email = "owner@example.com"
    n.type = type
    n.title = "Policy Violated"
    n.body = "Table has no owner"
    n.entity_type = "asset"
    n.entity_id = "asset-001"
    n.is_read = is_read
    n.email_sent = False
    n.created_at = MagicMock()
    n.created_at.isoformat.return_value = "2026-06-19T10:00:00"
    return n


def test_notifications_router_has_expected_routes():
    from app.api.notifications import router
    paths = {r.path for r in router.routes}
    assert "/notifications" in paths
    assert "/notifications/{notification_id}/read" in paths
    assert "/notifications/read-all" in paths


@pytest.mark.asyncio
async def test_list_notifications_filters_by_user_email():
    from app.api.notifications import list_notifications
    db = AsyncMock()
    res = MagicMock()
    res.scalars.return_value.all.return_value = [_make_notification()]
    db.execute.return_value = res

    user = {"email": "owner@example.com", "role": "viewer"}
    result = await list_notifications(db=db, user=user)

    assert len(result) == 1
    assert result[0]["notification_id"] == "notif-001"
    assert result[0]["is_read"] is False


@pytest.mark.asyncio
async def test_mark_notification_read():
    from app.api.notifications import mark_read
    db = AsyncMock()
    notif = _make_notification(is_read=False)
    res = MagicMock()
    res.scalar_one_or_none.return_value = notif
    db.execute.return_value = res
    db.commit = AsyncMock()

    user = {"email": "owner@example.com", "role": "viewer"}
    result = await mark_read(notification_id="notif-001", db=db, user=user)

    assert notif.is_read is True
    assert result["is_read"] is True
