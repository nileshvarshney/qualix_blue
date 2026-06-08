"""HTTP 308 redirect shim: /assets/* → /asset-registry/*

Preserves backward compatibility for clients still using the old /assets prefix.
"""
from __future__ import annotations
from fastapi import APIRouter
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/assets", tags=["_compat"])


@router.api_route("", methods=["GET", "POST"])
async def redirect_root():
    return RedirectResponse(url="/asset-registry", status_code=308)


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def redirect_to_asset_registry(path: str):
    return RedirectResponse(url=f"/asset-registry/{path}", status_code=308)
