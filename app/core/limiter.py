from __future__ import annotations

"""Rate limiting via slowapi.

Global default: 120 requests/minute per key.
Key function: authenticated user ID when available, else client IP
(respecting X-Forwarded-For for reverse-proxy deployments).
"""
from slowapi import Limiter
from slowapi.util import get_remote_address


def _rate_limit_key(request):
    user = getattr(request.state, "user", None)
    if user and user.get("user_id") and user.get("user_id") != "system":
        return f"user:{user['user_id']}"
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_rate_limit_key, default_limits=["120/minute"])
