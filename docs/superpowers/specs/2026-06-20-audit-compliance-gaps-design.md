# Audit & Compliance Gaps — Design Spec
**Date:** 2026-06-20
**Status:** Approved

---

## Background

The Compliance & Audit sections are functional but have five identified gaps:

1. No suspicious pattern detection / alerting on audit logs
2. No tamper-evident log storage (logs can be silently modified in the DB)
3. No automated evidence report generation for auditors
4. No audit coverage metrics (what % of governed entity types are being logged)
5. Compliance assessment creates "gap" for any asset with no pre-existing rule mapping — auto-mapping at assessment time is incomplete

CSV export already exists (both `/audit/export` backend and client-side button). Startup auto-mapping (`auto_map_rules_to_controls`) also exists but only runs once at boot.

---

## Scope

Four new backend endpoints, one migration, and targeted additions to two existing frontend pages (`/audit-logs` and `/compliance`). Entirely additive — no existing routes or pages are broken.

---

## 1. Suspicious Pattern Detection

### Backend — `GET /audit/anomalies`

Queries the existing `audit_logs` table for three suspicious patterns over a configurable lookback window (default: last 24 hours):

| Pattern | Threshold | Label |
|---|---|---|
| Auth failures from same `user_email` or IP | ≥ 5 in 1 hour | `brute_force` |
| List/read actions from one `user_email` | ≥ 50 in 1 hour | `bulk_access` |
| Auth success from IP not seen in prior 30 days for that user | first occurrence | `new_location` |

Response shape:
```json
[
  {
    "pattern": "brute_force",
    "severity": "high",
    "user_email": "alice@example.com",
    "ip": "1.2.3.4",
    "event_count": 8,
    "window_start": "2026-06-20T10:00:00",
    "window_end": "2026-06-20T11:00:00",
    "description": "8 auth failures from alice@example.com in 1 hour"
  }
]
```

No new DB tables required — all logic runs as aggregation queries over `audit_logs`.

Query note: `AuditLog` has no dedicated `ip_address` column. Suspicious IP patterns use `user_email` as the grouping key (IP is currently stored only in `old_value`/`new_value` JSON by some callers). The endpoint gracefully degrades if IP data is absent — brute-force and bulk-access still work user-email-only; new-location is skipped if IP data is missing.

### Frontend — `/audit-logs` page

- Add a "Security Alerts" card above the log table that fetches `/api/audit/anomalies` on mount.
- If the response is empty: card not shown.
- If anomalies exist: red-bordered card listing each anomaly with pattern label, severity badge, user, count, and time window. Each row links to a pre-filtered view of the log table.

---

## 2. Tamper-Evident Log Hashes

### Migration — `0027_audit_log_hash.py`

```sql
ALTER TABLE audit_logs ADD COLUMN log_hash VARCHAR(64);
```

Nullable — existing rows remain `NULL` (shown as "unverified" in the UI).

### Hash computation

At every `AuditLog` write, compute and store:

```python
import hashlib, json

def compute_log_hash(log: AuditLog) -> str:
    payload = "|".join([
        log.audit_id,
        log.user_email or "",
        log.action,
        log.entity_type,
        log.entity_id or "",
        log.created_at.isoformat(),
    ])
    return hashlib.sha256(payload.encode()).hexdigest()
```

The hash covers the six immutable identifying fields. `old_value`/`new_value` are intentionally excluded (they are large JSON blobs that may be re-serialised differently across DB drivers — excluding them keeps verification stable).

### Backend — `GET /audit/verify`

Iterates all `audit_logs` rows with a non-null `log_hash`, re-computes the expected hash, and returns:

```json
{
  "total_hashed": 1420,
  "total_unverified": 38,
  "intact": 1420,
  "tampered": 0,
  "tampered_ids": []
}
```

`tampered_ids` lists `audit_id` values where stored hash ≠ computed hash. Endpoint requires `require_admin` guard.

### Frontend — `/audit-logs` page

- "Verify Integrity" button next to the Export button.
- On click: calls `/api/audit/verify`, shows a modal: green "All X records intact" or red "Y records show hash mismatch — IDs: …".
- Stats row shows count of unverified (legacy) records in muted text.

---

## 3. Evidence Report

### Backend — `GET /audit/evidence-report`

Query params: `days` (default 30, max 365), optional `framework_id`.

Response shape:
```json
{
  "generated_at": "2026-06-20T12:00:00Z",
  "period_days": 30,
  "period_start": "2026-05-21",
  "period_end": "2026-06-20",
  "total_events": 842,
  "failed_events": 12,
  "active_users": 7,
  "system_events": 310,
  "events_by_category": { "rule": 180, "asset": 120, "auth": 88, "…": "…" },
  "top_users": [
    { "user_email": "alice@co.com", "event_count": 214 }
  ],
  "compliance_relevant_events": [
    {
      "audit_id": "…",
      "user_email": "…",
      "action": "approve",
      "entity_type": "rule",
      "created_at": "…"
    }
  ],
  "suspicious_event_count": 2
}
```

`compliance_relevant_events` = audit rows where `action` in `("approve","reject","create","update","delete","certify","archive")` and `entity_type` in `("rule","governance_policy","glossary_term","data_contract","masking_policy")`.

No new DB tables. The endpoint re-uses the anomalies query to populate `suspicious_event_count`.

### Frontend — `/compliance` page

- "Export Evidence" button in the page header.
- On click: fetches `/api/audit/evidence-report?days=30`, triggers browser download of the JSON as `evidence-report-YYYY-MM-DD.json`.
- A "days" selector (7 / 30 / 90) in the button dropdown.

---

## 4. Audit Coverage Metrics

### Backend — `GET /audit/coverage`

Compares distinct `entity_type` values seen in `audit_logs` against the full list of governed entity types known to the platform:

```python
GOVERNED_TYPES = [
    "rule", "asset", "domain", "subdomain", "user", "connection",
    "schedule", "alert", "sla", "glossary_term", "governance_policy",
    "data_product", "data_contract", "masking_policy", "incident",
    "issue", "team", "tag", "classification",
]
```

Response shape:
```json
{
  "coverage_pct": 84,
  "covered_types": 16,
  "total_governed_types": 19,
  "uncovered_types": ["classification", "tag", "team"],
  "by_type": [
    { "entity_type": "rule", "event_count": 2104, "last_logged": "2026-06-20T11:55:00" },
    { "entity_type": "classification", "event_count": 0, "last_logged": null }
  ]
}
```

No new DB tables. Single aggregation query over `audit_logs`.

### Frontend — `/audit-logs` page

- Add a small "Coverage" stat chip in the top bar alongside the existing "X events / Y users / Z system / W failed" chips.
- Format: `84% coverage` in info-blue. Clicking it shows a tooltip/popover listing uncovered types.

---

## 5. Assessment Auto-Mapping

### Change in `assess_asset` and `assess_all_assets`

When iterating requirements and no `ComplianceMapping` exists for `(asset_id, framework_id, req_id)`:

1. Parse `req.dq_rule_types` (comma-separated string, e.g. `"not_null,uniqueness"`) into a list.
2. Query `DQRule` for active rules on the asset whose `rule_type` is in that list.
3. If a match is found: create a `ComplianceMapping` with `rule_id` set to the first match, then evaluate the most recent passing run as normal.
4. If no match: create a mapping with `rule_id=None` and `status="gap"` (existing behaviour).

This makes first-time assessment useful without requiring any pre-seeded mappings. The same logic applies to both `assess_asset` (single asset) and `assess_all_assets`.

No migration required — `ComplianceMapping.rule_id` is already nullable.

---

## Files Changed

| File | Change |
|---|---|
| `migrations/versions/0027_audit_log_hash.py` | New — add `log_hash` column |
| `app/db/models.py` | Add `log_hash: Mapped[Optional[str]]` to `AuditLog` |
| `app/api/audit.py` | Add `/anomalies`, `/verify`, `/coverage`, `/evidence-report` endpoints; compute hash on all existing `AuditLog` creates |
| `app/api/compliance.py` | Improve `assess_asset` + `assess_all_assets` with auto-mapping logic |
| `frontend/src/app/api/audit/anomalies/route.ts` | New proxy — `GET /audit/anomalies` |
| `frontend/src/app/api/audit/verify/route.ts` | New proxy — `GET /audit/verify` |
| `frontend/src/app/api/audit/coverage/route.ts` | New proxy — `GET /audit/coverage` |
| `frontend/src/app/api/audit/evidence-report/route.ts` | New proxy — `GET /audit/evidence-report?days=` |
| `frontend/src/app/audit-logs/page.tsx` | Add Security Alerts card, Verify Integrity button, Coverage chip |
| `frontend/src/app/compliance/page.tsx` | Add Export Evidence button with days selector |

---

## What Is Not In Scope

- Hash chaining (each row's hash includes the previous row's hash) — adds complexity with marginal benefit for this deployment model.
- Real-time streaming alerts (WebSocket/SSE) for suspicious patterns — `/audit/anomalies` is polled on page load; a scheduled alert job is a separate feature.
- Separate immutable audit DB or write-once PostgreSQL trigger — out of scope; the hash-based approach satisfies the "tamper-evident" requirement at this stage.
- Exporting evidence as PDF or HTML — JSON is sufficient for auditors; formatting is their responsibility.
