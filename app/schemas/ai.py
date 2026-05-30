from __future__ import annotations

from pydantic import BaseModel
from typing import Optional, Any


class GenerateRulesRequest(BaseModel):
    domain: str
    subdomain: str
    table_name: str
    columns: Optional[list[dict[str, str]]] = None
    context: Optional[str] = None
    provider: Optional[str] = None


class ExplainFailureRequest(BaseModel):
    rule_id: str
    run_id: str
    provider: Optional[str] = None


class GenerateSQLRequest(BaseModel):
    description: str
    table_name: str
    schema_name: str
    database_name: Optional[str] = None
    columns: Optional[list[dict[str, str]]] = None
    provider: Optional[str] = None


class ClassifyTableRequest(BaseModel):
    table_name: str
    columns: list[dict[str, str]]
    provider: Optional[str] = None


class ChatMessage(BaseModel):
    role: str   # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    message: str
    context: Optional[dict[str, Any]] = None
    history: Optional[list[ChatMessage]] = None
    provider: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    provider: str
