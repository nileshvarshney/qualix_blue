from __future__ import annotations

"""
OAuth2 authorization-code flow for SSO providers.

Currently supports Google.  Other providers (GitHub, Azure AD, Okta) follow
the same pattern — add a new provider block and matching config settings.

Flow:
  1. Frontend navigates to GET /auth/oauth/google
  2. This endpoint builds the Google authorization URL and redirects there.
  3. After consent Google redirects to /auth/oauth/google/callback?code=...&state=...
  4. This endpoint exchanges the code for tokens, fetches the user-info, then
     creates or updates the local user and issues a DQ-Platform JWT pair.
  5. The browser is redirected to {FRONTEND_URL}/auth/callback?token=...&refresh=...
  6. The frontend stores the tokens in localStorage exactly as it does after
     a password login.
"""
import hashlib
import hmac
import logging
import secrets
import urllib.parse
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, hash_password
from app.db.database import get_db
from app.db.models import User

logger = logging.getLogger("dq_platform.oauth")
router = APIRouter(prefix="/auth/oauth", tags=["OAuth2 / SSO"])

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


# ── State HMAC helpers ────────────────────────────────────────────────────────

def _sign_state(nonce: str) -> str:
    """Return 'nonce.signature' so the callback can verify the state wasn't tampered."""
    sig = hmac.new(settings.secret_key.encode(), nonce.encode(), hashlib.sha256).hexdigest()
    return f"{nonce}.{sig}"


def _verify_state(state: str) -> bool:
    parts = state.split(".", 1)
    if len(parts) != 2:
        return False
    nonce, sig = parts
    expected = hmac.new(settings.secret_key.encode(), nonce.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


# ── Provider availability ─────────────────────────────────────────────────────

@router.get("/providers")
async def list_providers():
    """Return which OAuth providers are enabled in this deployment."""
    return {
        "providers": [
            {
                "id": "google",
                "name": "Google",
                "enabled": bool(settings.google_client_id and settings.google_client_secret),
                "login_url": "/auth/oauth/google",
            }
        ]
    }


# ── Google ────────────────────────────────────────────────────────────────────

@router.get("/google")
async def google_login():
    """
    Redirect the browser to the Google OAuth consent screen.

    Returns 501 when Google credentials are not configured so the frontend
    can show a helpful error instead of a broken redirect.
    """
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=501,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )

    nonce = secrets.token_urlsafe(24)
    state = _sign_state(nonce)

    params = urllib.parse.urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": settings.oauth_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    })
    return RedirectResponse(f"{_GOOGLE_AUTH_URL}?{params}")


@router.get("/google/callback")
async def google_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Google redirects here after consent.  Exchange the code for tokens,
    fetch user-info, upsert the local user, then redirect to the frontend
    with a DQ-Platform JWT.
    """
    if not _verify_state(state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state — possible CSRF")

    # Exchange authorization code for Google access token
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token_resp = await client.post(
                _GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": settings.oauth_redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            token_resp.raise_for_status()
            token_data = token_resp.json()

            # Fetch Google user-info using the access token
            info_resp = await client.get(
                _GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {token_data['access_token']}"},
            )
            info_resp.raise_for_status()
            info = info_resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"Google OAuth token/userinfo error: {e.response.text}")
        raise HTTPException(status_code=502, detail="Failed to exchange OAuth code with Google")
    except Exception as e:
        logger.error(f"Google OAuth network error: {e}")
        raise HTTPException(status_code=502, detail="OAuth provider unreachable")

    google_id = info.get("sub")
    email = (info.get("email") or "").lower()
    name = info.get("name") or email.split("@")[0]

    if not google_id or not email:
        raise HTTPException(status_code=400, detail="Google did not return email or user ID")

    # Upsert user: look up by oauth_id first, then fall back to email
    result = await db.execute(
        select(User).where(User.oauth_provider == "google", User.oauth_id == google_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user:
        # Link the Google identity to the existing account
        if not user.oauth_id:
            user.oauth_provider = "google"
            user.oauth_id = google_id
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account is disabled")
    else:
        # Create a new user — default role is viewer, an admin can elevate later
        user = User(
            user_id=str(uuid.uuid4()),
            email=email,
            full_name=name,
            hashed_password=hash_password(secrets.token_urlsafe(32)),  # unusable password
            role="viewer",
            oauth_provider="google",
            oauth_id=google_id,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        logger.info(f"Created new user via Google SSO: {email}")

    await db.commit()
    await db.refresh(user)

    token_payload = {
        "sub": user.user_id,
        "email": user.email,
        "role": user.role,
        "full_name": user.full_name,
        "user_id": user.user_id,
        "domain_id": user.domain_id,
    }
    access_token = create_access_token(token_payload)
    refresh_token = create_refresh_token(token_payload)

    # Redirect the browser to the frontend callback page with the tokens
    redirect_url = (
        f"{settings.frontend_url}/auth/callback"
        f"?token={access_token}&refresh={refresh_token}"
    )
    return RedirectResponse(redirect_url)
