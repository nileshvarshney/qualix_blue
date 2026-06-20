from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_create_notification_writes_to_db():
    from app.services.notification_service import create_notification
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()

    with patch("app.services.notification_service.threading.Thread") as mock_thread:
        mock_thread.return_value.start = MagicMock()
        await create_notification(
            user_email="owner@example.com",
            type="violation_detected",
            title="Policy Violated",
            body="Table has no owner",
            entity_type="asset",
            entity_id="asset-001",
            db=db,
        )

    db.add.assert_called_once()
    db.commit.assert_awaited_once()


def test_send_email_skips_when_smtp_not_configured():
    from app.services.notification_service import send_email
    # No SMTP env vars set → should not raise
    send_email("test@example.com", "Subject", "Body")


@pytest.mark.asyncio
async def test_create_notification_sets_fields_correctly():
    from app.services.notification_service import create_notification
    from app.db.models import Notification
    db = AsyncMock()
    captured = {}

    def capture_add(obj):
        captured["obj"] = obj
    db.add = capture_add
    db.commit = AsyncMock()

    with patch("app.services.notification_service.threading.Thread") as mock_thread:
        mock_thread.return_value.start = MagicMock()
        await create_notification(
            user_email="owner@example.com",
            type="approval_decided",
            title="Policy Approved",
            body="Your policy was approved",
            entity_type="policy",
            entity_id="pol-001",
            db=db,
        )

    n = captured["obj"]
    assert n.user_email == "owner@example.com"
    assert n.type == "approval_decided"
    assert n.is_read is False
    assert n.email_sent is False
