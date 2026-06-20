from __future__ import annotations

import ipaddress
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services import config_service
from app.core.security import require_admin, ROLES

logger = logging.getLogger("dq_platform.security_settings")
router = APIRouter(prefix="/security", tags=["Security Settings"])

_SECURITY_KEYS = [
    "security.sso_enabled",
    "security.mfa_required",
    "security.mfa_method",
    "security.min_password_length",
    "security.require_special_chars",
    "security.password_rotation_days",
    "security.session_timeout_minutes",
    "security.max_login_attempts",
    "security.ip_whitelist",
    "security.enforce_rbac",
    "security.audit_logging",
    "security.data_encryption",
    "security.api_rate_limit",
    "security.column_access_pii_min_role",
    "security.column_access_confidential_min_role",
]

_VALID_MFA_METHODS = {"totp", "sms", "email", "webauthn"}
_VALID_ROLES = set(ROLES)

# Ordered role hierarchy for column-level access comparisons
ROLE_RANK: dict[str, int] = {
    "admin": 100,
    "data_owner": 60,
    "data_engineer": 60,
    "data_steward": 60,
    "domain_owner": 50,
    "analyst": 30,
    "auditor": 20,
    "viewer": 10,
}


class SecuritySettings(BaseModel):
    sso_enabled: bool
    mfa_required: bool
    mfa_method: str
    min_password_length: int
    require_special_chars: bool
    password_rotation_days: int
    session_timeout_minutes: int
    max_login_attempts: int
    ip_whitelist: str
    enforce_rbac: bool
    audit_logging: bool
    data_encryption: bool
    api_rate_limit: int
    column_access_pii_min_role: str
    column_access_confidential_min_role: str

    @field_validator("ip_whitelist")
    @classmethod
    def validate_ip_whitelist(cls, v: str) -> str:
        if not v.strip():
            return v
        for entry in v.split(","):
            entry = entry.strip()
            if not entry:
                continue
            try:
                ipaddress.ip_network(entry, strict=False)
            except ValueError:
                raise ValueError(f"Invalid IP address or CIDR block: '{entry}'")
        return v

    @field_validator("mfa_method")
    @classmethod
    def validate_mfa_method(cls, v: str) -> str:
        if v not in _VALID_MFA_METHODS:
            raise ValueError(f"mfa_method must be one of: {sorted(_VALID_MFA_METHODS)}")
        return v

    @field_validator("column_access_pii_min_role", "column_access_confidential_min_role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in _VALID_ROLES:
            raise ValueError(f"Role must be one of: {sorted(_VALID_ROLES)}")
        return v

    @field_validator("min_password_length")
    @classmethod
    def validate_password_length(cls, v: int) -> int:
        if not (8 <= v <= 128):
            raise ValueError("min_password_length must be 8–128")
        return v

    @field_validator("session_timeout_minutes")
    @classmethod
    def validate_session_timeout(cls, v: int) -> int:
        if not (1 <= v <= 10080):
            raise ValueError("session_timeout_minutes must be 1–10080 (1 week max)")
        return v

    @field_validator("max_login_attempts")
    @classmethod
    def validate_max_login_attempts(cls, v: int) -> int:
        if not (1 <= v <= 100):
            raise ValueError("max_login_attempts must be 1–100")
        return v

    @field_validator("api_rate_limit")
    @classmethod
    def validate_api_rate_limit(cls, v: int) -> int:
        if not (1 <= v <= 100000):
            raise ValueError("api_rate_limit must be 1–100000")
        return v

    @field_validator("password_rotation_days")
    @classmethod
    def validate_rotation_days(cls, v: int) -> int:
        if not (0 <= v <= 365):
            raise ValueError("password_rotation_days must be 0–365")
        return v


@router.get("/settings")
async def get_security_settings(
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_admin),
) -> dict:
    """Return all current security settings (admin only)."""
    result: dict = {}
    for full_key in _SECURITY_KEYS:
        value = await config_service.get_value(full_key, db)
        short_key = full_key.replace("security.", "", 1)
        result[short_key] = value if value is not None else ""
    return result


@router.put("/settings")
async def update_security_settings(
    payload: SecuritySettings,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
) -> dict:
    """Persist all security settings (admin only). All values are validated before write."""
    updates = {
        "security.sso_enabled":            str(payload.sso_enabled).lower(),
        "security.mfa_required":           str(payload.mfa_required).lower(),
        "security.mfa_method":             payload.mfa_method,
        "security.min_password_length":    str(payload.min_password_length),
        "security.require_special_chars":  str(payload.require_special_chars).lower(),
        "security.password_rotation_days": str(payload.password_rotation_days),
        "security.session_timeout_minutes": str(payload.session_timeout_minutes),
        "security.max_login_attempts":     str(payload.max_login_attempts),
        "security.ip_whitelist":           payload.ip_whitelist,
        "security.enforce_rbac":           str(payload.enforce_rbac).lower(),
        "security.audit_logging":          str(payload.audit_logging).lower(),
        "security.data_encryption":        str(payload.data_encryption).lower(),
        "security.api_rate_limit":         str(payload.api_rate_limit),
        "security.column_access_pii_min_role":          payload.column_access_pii_min_role,
        "security.column_access_confidential_min_role": payload.column_access_confidential_min_role,
    }
    email = user.get("email", "ui")
    await config_service.bulk_update(updates, email, db)
    logger.info("Security settings updated by %s", email)
    return {"message": "Security settings saved successfully"}
