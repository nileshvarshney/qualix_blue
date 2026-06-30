from __future__ import annotations

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class DomainCreate(BaseModel):
    domain_name: str
    description: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    is_active: bool = True


class DomainUpdate(BaseModel):
    domain_name: Optional[str] = None
    description: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    is_active: Optional[bool] = None


class DomainResponse(BaseModel):
    domain_id: str
    domain_name: str
    description: Optional[str]
    owner_name: Optional[str]
    owner_email: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
