from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

ROLES = ["admin", "domain_owner", "data_owner", "viewer", "auditor"]

# API key format: sa_<8-char-prefix>_<32-char-secret>
_API_KEY_PREFIX = "sa_"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def generate_api_key() -> tuple[str, str, str]:
    """
    Return (full_key, prefix, hash).
    full_key is shown once to the user; only prefix + hash are stored.
    """
    import secrets
    prefix = secrets.token_urlsafe(6)[:8]   # 8-char prefix for fast DB lookup
    secret = secrets.token_urlsafe(32)
    full_key = f"{_API_KEY_PREFIX}{prefix}_{secret}"
    return full_key, prefix, hash_password(full_key)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc).replace(tzinfo=None) + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])


async def _resolve_api_key(api_key: str) -> Optional[dict]:
    """
    Validate an X-API-Key header value against stored service accounts.
    Returns a user-like dict on success, None if not found / invalid.
    """
    if not api_key.startswith(_API_KEY_PREFIX):
        return None
    parts = api_key[len(_API_KEY_PREFIX):].split("_", 1)
    if len(parts) != 2:
        return None
    prefix = parts[0]

    from app.db.database import AsyncSessionLocal
    from app.db.models import ServiceAccount
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ServiceAccount).where(
                ServiceAccount.key_prefix == prefix,
                ServiceAccount.is_active == True,
            )
        )
        sa = result.scalar_one_or_none()
        if sa is None or not verify_password(api_key, sa.key_hash):
            return None
        # Update last_used_at without blocking the request
        sa.last_used_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await db.commit()
        return {
            "email": f"sa:{sa.name}",
            "role": sa.role,
            "user_id": sa.sa_id,
            "full_name": sa.name,
            "domain_id": sa.domain_id,
            "is_service_account": True,
        }


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    # 1. Try X-API-Key header first (service accounts / CI/CD)
    api_key = request.headers.get("X-API-Key")
    if api_key:
        sa_user = await _resolve_api_key(api_key)
        if sa_user:
            return sa_user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
        )

    # 2. Fall back to Bearer JWT
    if not credentials:
        if settings.auth_required:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return {"email": "admin@example.com", "role": "admin", "user_id": "system", "full_name": "System Admin"}
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") == "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Use access token, not refresh token")
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def require_roles(*roles: str):
    """Dependency factory that enforces role membership."""
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {list(roles)}, got: {user.get('role')}",
            )
        return user
    return checker


require_admin = require_roles("admin")
require_write = require_roles("admin", "domain_owner", "data_owner")
require_read = require_roles("admin", "domain_owner", "data_owner", "viewer", "auditor")


def get_domain_filter(user: dict) -> Optional[str]:
    """
    Return the domain_id the user is restricted to, or None for unrestricted access.

    - admin / data_owner / viewer / auditor → None (see all domains)
    - domain_owner → restricted to their assigned domain_id from the JWT

    Apply this to all list endpoints that accept domain_id filters so that
    a domain_owner cannot query another domain's data by changing query params.
    """
    if user.get("role") == "domain_owner":
        return user.get("domain_id") or None
    return None


def check_domain_access(user: dict, resource_domain_id: Optional[str]) -> None:
    """
    Raise HTTP 403 if the caller is a domain_owner trying to access a resource
    that belongs to a different domain.

    Call this before returning or mutating any single resource that has a domain_id.

    - admin / viewer / auditor / data_owner: no restriction
    - domain_owner: only their assigned domain_id is allowed
    """
    domain_filter = get_domain_filter(user)
    if domain_filter is None:
        return  # role has unrestricted access
    if resource_domain_id is None or domain_filter != resource_domain_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: you can only access resources in your assigned domain.",
        )


def apply_domain_filter(q, model_field, user: dict):
    """
    Append a WHERE domain_id = <user domain> clause to a SQLAlchemy query when
    the caller is a domain_owner.  For all other roles the query is unchanged.

    Usage:
        q = apply_domain_filter(q, DQRule.domain_id, user)
    """
    domain_filter = get_domain_filter(user)
    if domain_filter:
        q = q.where(model_field == domain_filter)
    return q


async def get_current_user_with_domain_filter(
    user: dict = Depends(get_current_user),
) -> dict:
    """Annotated dependency that injects the domain_filter into the user dict."""
    user["_domain_filter"] = get_domain_filter(user)
    return user
