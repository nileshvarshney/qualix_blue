# Glossary Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `draft → pending_review → active` approval workflow to glossary terms, with action buttons on the Glossary page and a Pending tab on the Governance page.

**Architecture:** Three new backend endpoints (`/submit`, `/approve`, `/reject`) mirror the existing DQ Rules pattern, writing to AuditLog on every transition. The frontend fetches `/api/me` on mount to know the current user's role, then conditionally renders Submit / Approve / Reject buttons per row.

**Tech Stack:** Python/FastAPI (backend), Next.js App Router with TypeScript (frontend), SQLAlchemy mapped columns (Snowflake), pytest + AsyncMock (tests).

## Global Constraints

- All Python files use `from __future__ import annotations` at top.
- SQLAlchemy model fields use `Mapped[Optional[str]]` / `Mapped[Optional[datetime]]` syntax, matching the existing `GlossaryTerm` class pattern.
- Next.js route files export `const dynamic = 'force-dynamic'` and use `BACKEND_URL || 'http://localhost:8000'`.
- No shared React components — duplicate inline per page (established codebase pattern).
- All inline styles use CSS custom properties (`var(--status-ok-bg)` etc.), never hardcoded hex except for the new `--status-info-*` values added to globals.css.
- Status `'active'` and `'approved'` are treated identically everywhere in the frontend (both = green / approved display).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `app/db/models.py` | Modify | Add 3 fields to `GlossaryTerm` |
| `app/api/glossary.py` | Modify | Update `_fmt_term`; add `/submit`, `/approve`, `/reject` endpoints |
| `tests/test_glossary_workflow.py` | Create | Backend unit tests for the 3 new endpoints |
| `frontend/src/app/globals.css` | Modify | Add `--status-info-bg` / `--status-info-text` vars |
| `frontend/src/app/api/me/route.ts` | Create | Proxy `GET /auth/me` |
| `frontend/src/app/api/glossary/[termId]/route.ts` | Create | Proxy POST submit/approve/reject |
| `frontend/src/app/glossary/page.tsx` | Modify | Workflow UI: buttons, reject dialog, feedback callout, filter |
| `frontend/src/app/governance/page.tsx` | Modify | Add Pending tab with approve/reject |

---

## Task 1: Extend GlossaryTerm model and `_fmt_term`

**Files:**
- Modify: `app/db/models.py` (around line 571–575, inside `GlossaryTerm`)
- Modify: `app/api/glossary.py` (lines 20–39, `_fmt_term` function)

**Interfaces:**
- Produces: `GlossaryTerm.reviewed_by`, `.review_note`, `.reviewed_at` fields; `_fmt_term` returns `reviewed_by`, `review_note`, `reviewed_at` keys in every response dict.

- [ ] **Step 1: Add 3 fields to `GlossaryTerm` in `app/db/models.py`**

  Locate the `GlossaryTerm` class (around line 561). After the `parent_term_id` line, add:

  ```python
      reviewed_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
      review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
      reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
  ```

  The block should now read:
  ```python
  class GlossaryTerm(Base):
      __tablename__ = "glossary_terms"

      term_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
      term_name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
      definition: Mapped[str] = mapped_column(Text, nullable=False)
      examples: Mapped[Optional[str]] = mapped_column(Text)
      synonyms: Mapped[Optional[str]] = mapped_column(Text)
      domain_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
      owner_email: Mapped[Optional[str]] = mapped_column(String(200))
      status: Mapped[str] = mapped_column(String(20), default="active")
      parent_term_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
      reviewed_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
      review_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
      reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
      created_by: Mapped[Optional[str]] = mapped_column(String(200))
      created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
      updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
  ```

- [ ] **Step 2: Update `_fmt_term` in `app/api/glossary.py` to return the 3 new fields**

  The current `_fmt_term` returns a dict ending with `"updated_at": ...`. Add three lines after `"updated_at"`:

  ```python
  def _fmt_term(
      term: GlossaryTerm,
      domain_name: Optional[str] = None,
      linked_asset_count: int = 0,
  ) -> dict:
      return {
          "term_id": term.term_id,
          "term_name": term.term_name,
          "definition": term.definition,
          "examples": term.examples,
          "synonyms": term.synonyms,
          "domain_id": term.domain_id,
          "domain_name": domain_name,
          "status": term.status,
          "owner_email": term.owner_email,
          "created_by": term.created_by,
          "linked_asset_count": linked_asset_count,
          "created_at": term.created_at.isoformat() if term.created_at else None,
          "updated_at": term.updated_at.isoformat() if term.updated_at else None,
          "reviewed_by": term.reviewed_by,
          "review_note": term.review_note,
          "reviewed_at": term.reviewed_at.isoformat() if term.reviewed_at else None,
      }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add app/db/models.py app/api/glossary.py
  git commit -m "feat(glossary): add reviewed_by/review_note/reviewed_at fields and expose in _fmt_term"
  ```

---

## Task 2: Backend workflow endpoints

**Files:**
- Modify: `app/api/glossary.py`
- Create: `tests/test_glossary_workflow.py`

**Interfaces:**
- Consumes: `GlossaryTerm.reviewed_by`, `.review_note`, `.reviewed_at` (Task 1); `AuditLog` model; `require_roles` and `check_domain_access` from `app.core.security`; `_now()` helper already in `glossary.py`
- Produces: `POST /glossary/terms/{term_id}/submit` → updated term dict; `POST /glossary/terms/{term_id}/approve` → updated term dict; `POST /glossary/terms/{term_id}/reject` → updated term dict

- [ ] **Step 1: Write the failing tests**

  Create `tests/test_glossary_workflow.py`:

  ```python
  """Tests for glossary term approval workflow endpoints."""
  from __future__ import annotations
  import pytest
  from unittest.mock import AsyncMock, MagicMock, patch
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
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd /Users/laxmansrigiri/git_repo/DataGuard
  pytest tests/test_glossary_workflow.py -v 2>&1 | head -40
  ```

  Expected: `ImportError` or `AttributeError` — `submit_term`, `approve_term`, `reject_term` do not exist yet.

- [ ] **Step 3: Update imports in `app/api/glossary.py`**

  Change the security import line from:
  ```python
  from app.core.security import get_current_user
  ```
  to:
  ```python
  from app.core.security import get_current_user, require_roles
  ```

  Then add a module-level constant after the import block (after `router = APIRouter(...)`):
  ```python
  require_reviewer = require_roles("admin", "domain_owner")
  ```

  Also add `AuditLog` to the models import. Find:
  ```python
  from app.db.models import GlossaryTerm, GlossaryTermAsset, Asset, Domain
  ```
  Change to:
  ```python
  from app.db.models import GlossaryTerm, GlossaryTermAsset, Asset, Domain, AuditLog
  ```

- [ ] **Step 4: Add the `_check_glossary_reviewer` helper and the three endpoints to `app/api/glossary.py`**

  Add this helper function just before the `list_terms` endpoint:

  ```python
  def _check_glossary_reviewer(user: dict, term_domain_id: str | None) -> None:
      """Raise 403 if a domain_owner tries to act on a term outside their domain."""
      if user.get("role") == "domain_owner":
          user_domain = user.get("domain_id")
          if term_domain_id is not None and term_domain_id != user_domain:
              raise HTTPException(403, "You can only review terms in your assigned domain")
  ```

  Then add the three endpoints. Place them after the existing `update_term` endpoint and before `delete_term`:

  ```python
  @router.post("/terms/{term_id}/submit")
  async def submit_term(
      term_id: str,
      db: AsyncSession = Depends(get_db),
      user: dict = Depends(get_current_user),
  ):
      """Submit a draft term for review."""
      result = await db.execute(select(GlossaryTerm).where(GlossaryTerm.term_id == term_id))
      term = result.scalar_one_or_none()
      if not term:
          raise HTTPException(404, "Glossary term not found")
      if term.status != "draft":
          raise HTTPException(400, f"Term cannot be submitted from status '{term.status}'")
      term.status = "pending_review"
      term.reviewed_by = None
      term.review_note = None
      term.reviewed_at = None
      term.updated_at = _now()
      db.add(AuditLog(
          audit_id=str(uuid.uuid4()), user_email=user.get("email"),
          action="SUBMIT", entity_type="glossary_term", entity_id=term_id,
          old_value={"status": "draft"},
          new_value={"status": "pending_review"},
      ))
      await db.commit()
      await db.refresh(term)
      return _fmt_term(term)


  @router.post("/terms/{term_id}/approve")
  async def approve_term(
      term_id: str,
      db: AsyncSession = Depends(get_db),
      user: dict = Depends(require_reviewer),
  ):
      """Approve a pending_review term, moving it to active."""
      result = await db.execute(select(GlossaryTerm).where(GlossaryTerm.term_id == term_id))
      term = result.scalar_one_or_none()
      if not term:
          raise HTTPException(404, "Glossary term not found")
      _check_glossary_reviewer(user, term.domain_id)
      if term.status != "pending_review":
          raise HTTPException(400, f"Term cannot be approved from status '{term.status}'")
      term.status = "active"
      term.reviewed_by = user.get("email")
      term.review_note = None
      term.reviewed_at = _now()
      term.updated_at = _now()
      db.add(AuditLog(
          audit_id=str(uuid.uuid4()), user_email=user.get("email"),
          action="APPROVE", entity_type="glossary_term", entity_id=term_id,
          old_value={"status": "pending_review"},
          new_value={"status": "active", "reviewed_by": user.get("email")},
      ))
      await db.commit()
      await db.refresh(term)
      return _fmt_term(term)


  @router.post("/terms/{term_id}/reject")
  async def reject_term(
      term_id: str,
      payload: dict,
      db: AsyncSession = Depends(get_db),
      user: dict = Depends(require_reviewer),
  ):
      """Reject a pending_review term, returning it to draft with a required note."""
      review_note = (payload.get("review_note") or "").strip()
      if not review_note:
          raise HTTPException(422, "review_note is required for rejection")
      result = await db.execute(select(GlossaryTerm).where(GlossaryTerm.term_id == term_id))
      term = result.scalar_one_or_none()
      if not term:
          raise HTTPException(404, "Glossary term not found")
      _check_glossary_reviewer(user, term.domain_id)
      if term.status != "pending_review":
          raise HTTPException(400, f"Term cannot be rejected from status '{term.status}'")
      term.status = "draft"
      term.reviewed_by = user.get("email")
      term.review_note = review_note
      term.reviewed_at = _now()
      term.updated_at = _now()
      db.add(AuditLog(
          audit_id=str(uuid.uuid4()), user_email=user.get("email"),
          action="REJECT", entity_type="glossary_term", entity_id=term_id,
          old_value={"status": "pending_review"},
          new_value={"status": "draft", "reviewed_by": user.get("email"), "review_note": review_note},
      ))
      await db.commit()
      await db.refresh(term)
      return _fmt_term(term)
  ```

- [ ] **Step 5: Run tests — expect all to pass**

  ```bash
  pytest tests/test_glossary_workflow.py -v
  ```

  Expected output:
  ```
  PASSED tests/test_glossary_workflow.py::test_submit_term_transitions_draft_to_pending
  PASSED tests/test_glossary_workflow.py::test_submit_term_rejects_non_draft
  PASSED tests/test_glossary_workflow.py::test_approve_term_transitions_pending_to_active
  PASSED tests/test_glossary_workflow.py::test_approve_term_domain_owner_wrong_domain_raises_403
  PASSED tests/test_glossary_workflow.py::test_approve_term_domain_owner_no_domain_term_allowed
  PASSED tests/test_glossary_workflow.py::test_reject_term_transitions_pending_to_draft
  PASSED tests/test_glossary_workflow.py::test_reject_term_empty_note_raises_422
  7 passed
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add app/api/glossary.py tests/test_glossary_workflow.py
  git commit -m "feat(glossary): add submit/approve/reject workflow endpoints with audit log"
  ```

---

## Task 3: Next.js proxy routes

**Files:**
- Create: `frontend/src/app/api/me/route.ts`
- Create: `frontend/src/app/api/glossary/[termId]/route.ts`

**Interfaces:**
- Produces: `GET /api/me` → `{ role, domain_id, email, full_name }`; `POST /api/glossary/{termId}?action=submit|approve|reject` → proxied backend response

- [ ] **Step 1: Create `frontend/src/app/api/me/route.ts`**

  ```typescript
  import { NextResponse } from 'next/server'

  export const dynamic = 'force-dynamic'
  const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

  export async function GET() {
    try {
      const res = await fetch(`${BACKEND}/auth/me`, { cache: 'no-store' })
      if (!res.ok) return NextResponse.json({ role: 'viewer', domain_id: null, email: '' })
      const data = await res.json()
      return NextResponse.json(data)
    } catch {
      return NextResponse.json({ role: 'viewer', domain_id: null, email: '' })
    }
  }
  ```

- [ ] **Step 2: Create directory and file for `[termId]` route**

  ```bash
  mkdir -p /Users/laxmansrigiri/git_repo/DataGuard/frontend/src/app/api/glossary/\[termId\]
  ```

  Create `frontend/src/app/api/glossary/[termId]/route.ts`:

  ```typescript
  import { NextRequest, NextResponse } from 'next/server'

  export const dynamic = 'force-dynamic'
  const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

  export async function POST(
    req: NextRequest,
    { params }: { params: { termId: string } },
  ) {
    try {
      const { termId } = params
      const action = req.nextUrl.searchParams.get('action')
      if (!action || !['submit', 'approve', 'reject'].includes(action)) {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
      }
      const body = action === 'reject' ? await req.json() : {}
      const res = await fetch(`${BACKEND}/glossary/terms/${termId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
  npx tsc --noEmit 2>&1 | grep -E "me/route|termId" | head -10
  ```

  Expected: no output (no errors on these files).

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/app/api/me/route.ts "frontend/src/app/api/glossary/[termId]/route.ts"
  git commit -m "feat(glossary): add /api/me and /api/glossary/[termId] Next.js proxy routes"
  ```

---

## Task 4: Glossary page workflow UI

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/app/glossary/page.tsx`

**Interfaces:**
- Consumes: `GET /api/me` → `{ role, domain_id }`; `POST /api/glossary/[termId]?action=...` (Task 3)
- Produces: Submit / Approve / Reject buttons per row; reject dialog modal; feedback callout in slide-in panel; `pending_review` filter pill

- [ ] **Step 1: Add `--status-info-*` CSS variables to `frontend/src/app/globals.css`**

  Find the light theme block (it has `--status-ok-bg: #f0fdf4;`). Add after `--status-neutral-bg` / `--status-neutral-text`:

  ```css
  --status-info-bg: #eff6ff;     --status-info-text: #1d4ed8;
  ```

  Find the dark theme block (it has `--status-ok-bg: rgba(22, 163, 74, 0.15);`). Add the dark equivalents:

  ```css
  --status-info-bg:  rgba(59, 130, 246, 0.15);  --status-info-text: #60a5fa;
  ```

- [ ] **Step 2: Update `GlossaryTerm` interface in `frontend/src/app/glossary/page.tsx`**

  Change the interface from:
  ```typescript
  interface GlossaryTerm {
    id: string; name: string; definition: string; domain: string
    synonyms: string[]; owner: string; linkedAssets: number
    status: 'approved' | 'active' | 'draft' | 'deprecated'
  }
  ```
  to:
  ```typescript
  interface GlossaryTerm {
    id: string; name: string; definition: string; domain: string
    synonyms: string[]; owner: string; linkedAssets: number
    status: 'approved' | 'active' | 'draft' | 'deprecated' | 'pending_review'
    reviewedBy: string; reviewNote: string; reviewedAt: string
  }
  ```

- [ ] **Step 3: Update `statusBadge`, `leftBorderColor`, and `statusLabel` helper functions**

  Replace the three helper functions with:
  ```typescript
  function statusBadge(s: string): { bg: string; color: string } {
    if (s === 'approved' || s === 'active') return { bg: 'var(--status-ok-bg)', color: 'var(--status-ok-text)' }
    if (s === 'pending_review') return { bg: 'var(--status-info-bg)', color: 'var(--status-info-text)' }
    if (s === 'draft') return { bg: 'var(--status-warn-bg)', color: 'var(--status-warn-text)' }
    return { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' }
  }

  function leftBorderColor(s: string): string {
    if (s === 'approved' || s === 'active') return 'var(--status-ok-text)'
    if (s === 'pending_review') return 'var(--status-info-text)'
    if (s === 'draft') return 'var(--status-warn-text)'
    return 'var(--border)'
  }

  function statusLabel(s: string): string {
    if (s === 'active') return 'approved'
    if (s === 'pending_review') return 'pending review'
    return s
  }
  ```

- [ ] **Step 4: Add new state variables**

  After the existing `const [deletingId, setDeletingId] = useState<string | null>(null)` line, add:

  ```typescript
  const [currentUser, setCurrentUser] = useState<{ role: string; domain_id: string | null } | null>(null)
  const [rejectTarget, setRejectTarget] = useState<GlossaryTerm | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  ```

- [ ] **Step 5: Fetch current user on mount**

  Add a second `useEffect` (after the existing terms-fetching `useEffect`):

  ```typescript
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(data => setCurrentUser({ role: data.role ?? 'viewer', domain_id: data.domain_id ?? null }))
      .catch(() => setCurrentUser({ role: 'viewer', domain_id: null }))
  }, [])
  ```

- [ ] **Step 6: Update data mapping to include new fields**

  In the existing `useEffect` that calls `fetch('/api/glossary')`, update the `.map()` to add three new fields after `linkedAssets`:

  ```typescript
  status: (['approved', 'active', 'draft', 'deprecated', 'pending_review'] as const).includes(
    t.status as 'approved' | 'active' | 'draft' | 'deprecated' | 'pending_review'
  ) ? (t.status as GlossaryTerm['status']) : 'draft',
  reviewedBy: String(t.reviewed_by ?? ''),
  reviewNote: String(t.review_note ?? ''),
  reviewedAt: String(t.reviewed_at ?? ''),
  ```

- [ ] **Step 7: Update `StatusFilter` type and filter pills**

  Change:
  ```typescript
  type StatusFilter = 'all' | 'approved' | 'active' | 'draft' | 'deprecated'
  ```
  to:
  ```typescript
  type StatusFilter = 'all' | 'approved' | 'pending_review' | 'draft' | 'deprecated'
  ```

  Update the filter logic in the `filtered` computation:
  ```typescript
  const filtered = terms.filter(t => {
    if (domain !== 'All' && t.domain !== domain) return false
    if (statusFilter !== 'all') {
      if (statusFilter === 'approved') {
        if (t.status !== 'approved' && t.status !== 'active') return false
      } else {
        if (t.status !== statusFilter) return false
      }
    }
    if (search) {
      const q = search.toLowerCase()
      if (!t.name.toLowerCase().includes(q) && !t.definition.toLowerCase().includes(q)) return false
    }
    return true
  })
  ```

  Update the status filter pills map to:
  ```typescript
  {([
    ['all', 'All'],
    ['approved', 'Approved'],
    ['pending_review', 'Pending Review'],
    ['draft', 'Draft'],
    ['deprecated', 'Deprecated'],
  ] as [StatusFilter, string][]).map(([f, l]) => (
  ```

- [ ] **Step 8: Add `doAction` helper function**

  Add after the existing `deleteTerm` function:

  ```typescript
  const doAction = async (termId: string, action: string, body: object = {}) => {
    setActionLoading(termId)
    setActionError(null)
    try {
      const res = await fetch(`/api/glossary/${termId}?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 403) { setActionError("You don't have permission to perform this action"); return }
      if (res.status === 400) { setActionError('This term is no longer in the expected state — refresh and try again'); return }
      if (!res.ok) { setActionError('Action failed — please try again'); return }
      const updated = await res.json()
      setTerms(prev => prev.map(t => t.id === termId ? {
        ...t,
        status: updated.status as GlossaryTerm['status'],
        reviewedBy: String(updated.reviewed_by ?? ''),
        reviewNote: String(updated.review_note ?? ''),
        reviewedAt: String(updated.reviewed_at ?? ''),
      } : t))
    } catch { setActionError('Action failed — please try again') }
    finally { setActionLoading(null) }
  }
  ```

  Also compute `isReviewer` just before the `return (`:
  ```typescript
  const isReviewer = currentUser?.role === 'admin' || currentUser?.role === 'domain_owner'
  ```

- [ ] **Step 9: Add action error banner to JSX**

  In the JSX `return`, after the domain tabs + status filter pills `<div>` and before the column headers `<div>`, add:

  ```tsx
  {actionError && (
    <div style={{ padding: '6px 10px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', borderRadius: '6px', fontSize: '11px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
      {actionError}
      <button onClick={() => setActionError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '14px', lineHeight: 1 }}>✕</button>
    </div>
  )}
  ```

- [ ] **Step 10: Add workflow action buttons to each term row**

  Inside the scrollable list, in the term row's button group `<div>` (the div containing Edit and Delete buttons), add workflow buttons **before** Edit:

  ```tsx
  {term.status === 'draft' && (
    <button
      onClick={e => { e.stopPropagation(); doAction(term.id, 'submit') }}
      disabled={actionLoading === term.id}
      style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--status-info-text)', background: 'var(--status-info-bg)', fontSize: '10px', cursor: actionLoading === term.id ? 'not-allowed' : 'pointer', color: 'var(--status-info-text)', opacity: actionLoading === term.id ? 0.6 : 1 }}>
      {actionLoading === term.id ? '…' : 'Submit'}
    </button>
  )}
  {term.status === 'pending_review' && isReviewer && (
    <>
      <button
        onClick={e => { e.stopPropagation(); doAction(term.id, 'approve') }}
        disabled={actionLoading === term.id}
        style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'var(--status-ok-bg)', fontSize: '10px', cursor: actionLoading === term.id ? 'not-allowed' : 'pointer', color: 'var(--status-ok-text)', opacity: actionLoading === term.id ? 0.6 : 1 }}>
        {actionLoading === term.id ? '…' : 'Approve'}
      </button>
      <button
        onClick={e => { e.stopPropagation(); setRejectTarget(term); setRejectNote('') }}
        style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: 'pointer', color: 'var(--status-error-text)' }}>
        Reject
      </button>
    </>
  )}
  ```

- [ ] **Step 11: Add feedback callout to slide-in detail panel**

  In the slide-in panel's content `<div>` (the one with `padding: '12px 14px'`), add after the definition block and before the synonyms block:

  ```tsx
  {popup.status === 'draft' && popup.reviewNote && (
    <div style={{ borderRadius: '6px', border: '1px solid var(--status-warn-text)', background: 'var(--status-warn-bg)', padding: '8px 12px' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--status-warn-text)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Returned with feedback</div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{popup.reviewNote}</div>
      {popup.reviewedBy && (
        <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
          — {popup.reviewedBy}{popup.reviewedAt ? ` on ${popup.reviewedAt.slice(0, 10)}` : ''}
        </div>
      )}
    </div>
  )}
  ```

- [ ] **Step 12: Add reject dialog modal**

  At the end of the JSX `return`, after the edit modal `{editTerm && ...}` block, add:

  ```tsx
  {rejectTarget && (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Reject Term</div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          Returning <strong>{rejectTarget.name}</strong> to draft. Explain what needs to change.
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Feedback (required)</label>
          <textarea
            value={rejectNote}
            onChange={e => setRejectNote(e.target.value)}
            rows={3}
            placeholder="Explain what needs to be revised..."
            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => { setRejectTarget(null); setRejectNote('') }}
            style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={async () => {
              await doAction(rejectTarget.id, 'reject', { review_note: rejectNote })
              setRejectTarget(null)
              setRejectNote('')
            }}
            disabled={!rejectNote.trim() || actionLoading === rejectTarget.id}
            style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--status-error-text)', color: '#fff', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (!rejectNote.trim() || actionLoading === rejectTarget.id) ? 'not-allowed' : 'pointer', opacity: (!rejectNote.trim() || actionLoading === rejectTarget.id) ? 0.6 : 1 }}>
            {actionLoading === rejectTarget.id ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )}
  ```

- [ ] **Step 13: Verify TypeScript compiles with no errors**

  ```bash
  cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
  npx tsc --noEmit 2>&1 | grep "glossary/page" | head -10
  ```

  Expected: no output.

- [ ] **Step 14: Commit**

  ```bash
  git add frontend/src/app/globals.css frontend/src/app/glossary/page.tsx
  git commit -m "feat(glossary): add approval workflow UI — submit/approve/reject buttons, reject dialog, feedback callout"
  ```

---

## Task 5: Governance page — Pending Terms tab

**Files:**
- Modify: `frontend/src/app/governance/page.tsx`

**Interfaces:**
- Consumes: `GET /api/glossary` (existing route); `GET /api/me` (Task 3); `POST /api/glossary/[termId]?action=approve|reject` (Task 3)
- Produces: `pending` tab on Governance page with live count badge, approve/reject actions, inline reject dialog

- [ ] **Step 1: Add `PendingTerm` interface and extend `GovernanceTab` type**

  At the top of the file, change:
  ```typescript
  type GovernanceTab = 'scorecards' | 'policies' | 'violations'
  ```
  to:
  ```typescript
  type GovernanceTab = 'scorecards' | 'policies' | 'violations' | 'pending'
  ```

  Add a new interface after the existing `Violation` interface:
  ```typescript
  interface PendingTerm {
    id: string; name: string; definition: string; domain: string
    createdBy: string; createdAt: string
  }
  ```

- [ ] **Step 2: Add new state variables to `GovernancePage`**

  After the existing `const [policyForm, setPolicyForm] = useState(emptyForm)` line, add:

  ```typescript
  const [pendingTerms, setPendingTerms] = useState<PendingTerm[]>([])
  const [currentUser, setCurrentUser] = useState<{ role: string; domain_id: string | null } | null>(null)
  const [govRejectTarget, setGovRejectTarget] = useState<PendingTerm | null>(null)
  const [govRejectNote, setGovRejectNote] = useState('')
  const [govActionLoading, setGovActionLoading] = useState<string | null>(null)
  const [govActionError, setGovActionError] = useState<string | null>(null)
  ```

- [ ] **Step 3: Add `loadPendingTerms` callback and fetch `/api/me` on mount**

  Add a new `useCallback` after the existing `loadViolations` callback:

  ```typescript
  const loadPendingTerms = useCallback(async () => {
    try {
      const data = await fetch('/api/glossary').then(r => r.json()).catch(() => [])
      const items = Array.isArray(data) ? data : []
      setPendingTerms(
        items
          .filter((t: Record<string, unknown>) => t.status === 'pending_review')
          .map((t: Record<string, unknown>) => ({
            id: String(t.term_id ?? ''),
            name: String(t.term_name ?? ''),
            definition: String(t.definition ?? ''),
            domain: String(t.domain_name ?? ''),
            createdBy: String(t.created_by ?? ''),
            createdAt: String(t.created_at ?? ''),
          }))
      )
    } catch { /* leave empty */ }
  }, [])
  ```

  Add a `useEffect` to fetch current user on mount (after existing `useEffect` calls):
  ```typescript
  useEffect(() => {
    loadPendingTerms()
    fetch('/api/me')
      .then(r => r.json())
      .then(data => setCurrentUser({ role: data.role ?? 'viewer', domain_id: data.domain_id ?? null }))
      .catch(() => setCurrentUser({ role: 'viewer', domain_id: null }))
  }, [loadPendingTerms])
  ```

- [ ] **Step 4: Add `govDoAction` helper function**

  Add after the `loadPendingTerms` callback:

  ```typescript
  const govDoAction = async (termId: string, action: string, body: object = {}) => {
    setGovActionLoading(termId)
    setGovActionError(null)
    try {
      const res = await fetch(`/api/glossary/${termId}?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 403) { setGovActionError("You don't have permission to perform this action"); return }
      if (res.status === 400) { setGovActionError('This term is no longer in the expected state — refresh and try again'); return }
      if (!res.ok) { setGovActionError('Action failed — please try again'); return }
      setPendingTerms(prev => prev.filter(t => t.id !== termId))
    } catch { setGovActionError('Action failed — please try again') }
    finally { setGovActionLoading(null) }
  }
  ```

  Compute `isGovReviewer` just before the JSX `return`:
  ```typescript
  const isGovReviewer = currentUser?.role === 'admin' || currentUser?.role === 'domain_owner'
  ```

- [ ] **Step 5: Add the Pending tab button to the tab bar**

  Find the tab buttons map. It currently renders:
  ```typescript
  {(['scorecards', 'policies', 'violations'] as GovernanceTab[]).map(t => (
    <button key={t} onClick={() => setTab(t)} ...>
      {t === 'scorecards' ? `Scorecards (...)` : t === 'policies' ? `Policies (...)` : `Violations (...)`}
    </button>
  ))}
  ```

  Replace it with:
  ```typescript
  {(['scorecards', 'policies', 'violations', 'pending'] as GovernanceTab[]).map(t => (
    <button key={t} onClick={() => setTab(t)} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: tab === t ? '#1a1a1a' : 'var(--surface-muted)', color: tab === t ? '#fff' : 'var(--text-secondary)', fontWeight: tab === t ? 600 : 400, fontSize: '11px', textTransform: 'capitalize' }}>
      {t === 'scorecards'
        ? `Scorecards (${filteredDomains.length})`
        : t === 'policies'
        ? `Policies (${filteredPolicies.length})`
        : t === 'violations'
        ? `Violations (${violationsLoaded ? filteredViolations.length : '…'})`
        : `Pending (${pendingTerms.length})`}
    </button>
  ))}
  ```

- [ ] **Step 6: Add Pending tab column headers**

  After the `{tab === 'violations' && !loadingViolations && filteredViolations.length > 0 && (` column headers block, add:

  ```tsx
  {tab === 'pending' && pendingTerms.length > 0 && (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 90px 100px 140px', gap: '0 6px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
      {['Term', 'Submitted By', 'Domain', 'Submitted', 'Actions'].map(h => (
        <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
      ))}
    </div>
  )}
  ```

- [ ] **Step 7: Add Pending tab content rows and error banner**

  In the scrollable list section, after the last `{tab === 'violations' && ...}` block, add:

  ```tsx
  {tab === 'pending' && govActionError && (
    <div style={{ padding: '6px 10px', margin: '4px 0', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', borderRadius: '6px', fontSize: '11px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
      {govActionError}
      <button onClick={() => setGovActionError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '14px', lineHeight: 1 }}>✕</button>
    </div>
  )}
  {tab === 'pending' && pendingTerms.length === 0 && (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
      No terms pending review
    </div>
  )}
  {tab === 'pending' && pendingTerms.map(term => (
    <div key={term.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 90px 100px 140px', gap: '0 6px', alignItems: 'center', padding: '5px 6px', borderBottom: '1px solid var(--surface-muted)', borderLeft: '2px solid var(--status-info-text)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)' }}>{term.name}</div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{term.definition}</div>
      </div>
      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{term.createdBy}</span>
      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{term.domain || '—'}</span>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{term.createdAt ? new Date(term.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
      <div style={{ display: 'flex', gap: '4px' }}>
        {isGovReviewer && (
          <>
            <button
              onClick={() => govDoAction(term.id, 'approve')}
              disabled={govActionLoading === term.id}
              style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'var(--status-ok-bg)', fontSize: '10px', cursor: govActionLoading === term.id ? 'not-allowed' : 'pointer', color: 'var(--status-ok-text)', opacity: govActionLoading === term.id ? 0.6 : 1 }}>
              {govActionLoading === term.id ? '…' : 'Approve'}
            </button>
            <button
              onClick={() => { setGovRejectTarget(term); setGovRejectNote('') }}
              style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '10px', cursor: 'pointer', color: 'var(--status-error-text)' }}>
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  ))}
  ```

- [ ] **Step 8: Add inline reject dialog for Governance page**

  At the very end of the JSX `return` (before the final closing `</div>`), add:

  ```tsx
  {govRejectTarget && (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Reject Term</div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          Returning <strong>{govRejectTarget.name}</strong> to draft. Explain what needs to change.
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Feedback (required)</label>
          <textarea
            value={govRejectNote}
            onChange={e => setGovRejectNote(e.target.value)}
            rows={3}
            placeholder="Explain what needs to be revised..."
            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => { setGovRejectTarget(null); setGovRejectNote('') }}
            style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={async () => {
              await govDoAction(govRejectTarget.id, 'reject', { review_note: govRejectNote })
              setGovRejectTarget(null)
              setGovRejectNote('')
            }}
            disabled={!govRejectNote.trim() || govActionLoading === govRejectTarget.id}
            style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--status-error-text)', color: '#fff', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (!govRejectNote.trim() || govActionLoading === govRejectTarget.id) ? 'not-allowed' : 'pointer', opacity: (!govRejectNote.trim() || govActionLoading === govRejectTarget.id) ? 0.6 : 1 }}>
            {govActionLoading === govRejectTarget.id ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )}
  ```

- [ ] **Step 9: Verify TypeScript compiles with no errors**

  ```bash
  cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
  npx tsc --noEmit 2>&1 | grep "governance/page" | head -10
  ```

  Expected: no output.

- [ ] **Step 10: Commit**

  ```bash
  git add frontend/src/app/governance/page.tsx
  git commit -m "feat(governance): add Pending Terms tab with approve/reject workflow"
  ```
