"""Tests for glossary term approval workflow endpoints."""
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from datetime import datetime


def _make_term(status: str = "draft", domain_id: str | None = None) -> MagicMock:
    term = MagicMock()
    term.term_id = "term-001"
    term.term_name = "Invoice"
    term.definition = "A billing document"
    term.examples = None
    term.synonyms = None
    term.domain_id = domain_id
    term.owner_email = "owner@example.com"
    term.status = status
    term.parent_term_id = None
    term.reviewed_by = None
    term.review_note = None
    term.reviewed_at = None
    term.created_by = "admin@example.com"
    term.created_at = datetime(2024, 1, 1)
    term.updated_at = datetime(2024, 1, 1)
    return term


def _make_db(term: MagicMock) -> AsyncMock:
    db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = term
    db.execute = AsyncMock(return_value=mock_result)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_submit_term_transitions_draft_to_pending():
    from app.api.glossary import submit_term
    term = _make_term(status="draft")
    db = _make_db(term)
    user = {"email": "author@example.com", "role": "viewer"}
    result = await submit_term("term-001", db, user)
    assert term.status == "pending_review"
    assert term.reviewed_by is None
    assert term.review_note is None
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_submit_term_rejects_non_draft():
    from app.api.glossary import submit_term
    term = _make_term(status="pending_review")
    db = _make_db(term)
    user = {"email": "author@example.com", "role": "viewer"}
    with pytest.raises(HTTPException) as exc_info:
        await submit_term("term-001", db, user)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_approve_term_transitions_pending_to_active():
    from app.api.glossary import approve_term
    term = _make_term(status="pending_review", domain_id=None)
    db = _make_db(term)
    user = {"email": "admin@example.com", "role": "admin", "domain_id": None}
    result = await approve_term("term-001", db, user)
    assert term.status == "active"
    assert term.reviewed_by == "admin@example.com"
    assert term.review_note is None
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_approve_term_domain_owner_wrong_domain_raises_403():
    from app.api.glossary import approve_term
    term = _make_term(status="pending_review", domain_id="dom-finance")
    db = _make_db(term)
    user = {"email": "owner@example.com", "role": "domain_owner", "domain_id": "dom-hr"}
    with pytest.raises(HTTPException) as exc_info:
        await approve_term("term-001", db, user)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_approve_term_domain_owner_no_domain_term_allowed():
    from app.api.glossary import approve_term
    term = _make_term(status="pending_review", domain_id=None)
    db = _make_db(term)
    user = {"email": "owner@example.com", "role": "domain_owner", "domain_id": "dom-hr"}
    result = await approve_term("term-001", db, user)
    assert term.status == "active"


@pytest.mark.asyncio
async def test_reject_term_transitions_pending_to_draft():
    from app.api.glossary import reject_term
    term = _make_term(status="pending_review", domain_id=None)
    db = _make_db(term)
    user = {"email": "admin@example.com", "role": "admin", "domain_id": None}
    payload = {"review_note": "Definition is too vague."}
    result = await reject_term("term-001", payload, db, user)
    assert term.status == "draft"
    assert term.reviewed_by == "admin@example.com"
    assert term.review_note == "Definition is too vague."
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_reject_term_empty_note_raises_422():
    from app.api.glossary import reject_term
    term = _make_term(status="pending_review")
    db = _make_db(term)
    user = {"email": "admin@example.com", "role": "admin", "domain_id": None}
    with pytest.raises(HTTPException) as exc_info:
        await reject_term("term-001", {"review_note": "  "}, db, user)
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_approve_term_viewer_raises_403():
    from app.api.glossary import approve_term
    term = _make_term(status="pending_review", domain_id=None)
    db = _make_db(term)
    user = {"email": "viewer@example.com", "role": "viewer", "domain_id": None}
    with pytest.raises(HTTPException) as exc_info:
        await approve_term("term-001", db, user)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_reject_term_viewer_raises_403():
    from app.api.glossary import reject_term
    term = _make_term(status="pending_review", domain_id=None)
    db = _make_db(term)
    user = {"email": "viewer@example.com", "role": "viewer", "domain_id": None}
    with pytest.raises(HTTPException) as exc_info:
        await reject_term("term-001", {"review_note": "Needs work"}, db, user)
    assert exc_info.value.status_code == 403
