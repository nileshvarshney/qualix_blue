from __future__ import annotations
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient


def _make_protected_client():
    """Minimal FastAPI app with one protected endpoint; no DB dependency needed."""
    from app.core.security import get_current_user

    app = FastAPI()

    @app.get("/probe")
    async def _probe(user=Depends(get_current_user)):
        return {"ok": True}

    return TestClient(app, raise_server_exceptions=False)


def test_unauthenticated_request_returns_401():
    client = _make_protected_client()
    response = client.get("/probe")
    assert response.status_code == 401
