from __future__ import annotations

import ipaddress
import uuid
import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("dq_platform.middleware")

# ── IP Whitelist cache ────────────────────────────────────────────────────────
_ip_whitelist_cache: tuple[float, list] = (0.0, [])
_IP_CACHE_TTL = 60.0  # seconds


async def _load_ip_networks() -> list:
    """Return the current list of allowed ip_network objects (cached 60s)."""
    global _ip_whitelist_cache
    now = time.monotonic()
    if now - _ip_whitelist_cache[0] < _IP_CACHE_TTL:
        return _ip_whitelist_cache[1]
    try:
        from app.db.database import AsyncSessionLocal
        from app.services.config_service import get_value
        async with AsyncSessionLocal() as db:
            raw = await get_value("security.ip_whitelist", db) or ""
        networks: list = []
        for entry in raw.split(","):
            entry = entry.strip()
            if not entry:
                continue
            try:
                networks.append(ipaddress.ip_network(entry, strict=False))
            except ValueError:
                logger.warning("IP whitelist: skipping invalid entry %r", entry)
        _ip_whitelist_cache = (now, networks)
        return networks
    except Exception as exc:
        logger.debug("IP whitelist load failed: %s", exc)
        _ip_whitelist_cache = (now, [])
        return []


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique X-Request-ID to every request and response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
        if request.url.path not in ("/health", "/"):
            logger.info(
                "request",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": elapsed_ms,
                    "request_id": request_id,
                },
            )
        return response


class IPWhitelistMiddleware(BaseHTTPMiddleware):
    """Block requests from IPs not in the configured whitelist.

    When the whitelist is empty (default), all IPs are allowed.
    Auth, health, and docs endpoints are always exempt so the login
    flow is never locked out even if the whitelist is misconfigured.
    """

    _EXEMPT = frozenset({
        "/health", "/", "/auth/login", "/auth/refresh",
        "/docs", "/redoc", "/openapi.json",
        "/config/public/display-timezone",
    })

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in self._EXEMPT:
            return await call_next(request)

        networks = await _load_ip_networks()
        if not networks:
            return await call_next(request)

        forwarded = request.headers.get("X-Forwarded-For")
        raw_ip = (
            forwarded.split(",")[0].strip()
            if forwarded
            else (request.client.host if request.client else "127.0.0.1")
        )
        try:
            client_ip = ipaddress.ip_address(raw_ip)
            if any(client_ip in net for net in networks):
                return await call_next(request)
        except ValueError:
            pass

        from starlette.responses import JSONResponse as _JSONResponse
        logger.warning("IP whitelist: blocked request from %s to %s", raw_ip, request.url.path)
        return _JSONResponse(
            status_code=403,
            content={"detail": f"Access denied: {raw_ip} is not in the IP whitelist"},
        )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add enterprise-grade security headers to every response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        # HSTS: only send over HTTPS (safe to include here — browsers ignore it on HTTP)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        # CSP: allow same-origin resources, block inline scripts/styles except those
        # explicitly nonce'd by Next.js. Tighten further when deploying behind a CDN.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "font-src 'self'; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        return response
