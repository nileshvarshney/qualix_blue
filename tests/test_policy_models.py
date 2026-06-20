from __future__ import annotations
from unittest.mock import MagicMock


def test_approval_request_model_importable():
    from app.db.models import ApprovalRequest
    assert hasattr(ApprovalRequest, "approval_id")
    assert hasattr(ApprovalRequest, "entity_type")
    assert hasattr(ApprovalRequest, "entity_id")
    assert hasattr(ApprovalRequest, "entity_snapshot")
    assert hasattr(ApprovalRequest, "status")
    assert hasattr(ApprovalRequest, "requested_by")
    assert hasattr(ApprovalRequest, "reviewed_by")
    assert hasattr(ApprovalRequest, "feedback")


def test_governance_policy_version_model_importable():
    from app.db.models import GovernancePolicyVersion
    assert hasattr(GovernancePolicyVersion, "version_id")
    assert hasattr(GovernancePolicyVersion, "policy_id")
    assert hasattr(GovernancePolicyVersion, "version_number")
    assert hasattr(GovernancePolicyVersion, "field_diffs")
    assert hasattr(GovernancePolicyVersion, "snapshot")


def test_notification_model_importable():
    from app.db.models import Notification
    assert hasattr(Notification, "notification_id")
    assert hasattr(Notification, "user_email")
    assert hasattr(Notification, "type")
    assert hasattr(Notification, "is_read")
    assert hasattr(Notification, "email_sent")


def test_governance_policy_has_status_field():
    from app.db.models import GovernancePolicy
    assert hasattr(GovernancePolicy, "status")
