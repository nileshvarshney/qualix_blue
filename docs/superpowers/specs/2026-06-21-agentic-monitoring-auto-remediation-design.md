# Agentic Monitoring & Auto-Remediation

## Problem

Today, when a scheduled rule fails, a human must open the Issues page, investigate manually, and decide what to do. The roadmap entry for this feature (Settings → Agentic AI) calls for an autonomous agent that handles the first-response loop: detect the failure, classify it as a known pattern, propose a specific fix, and — with one-click human approval, or fully automatically for configured rule types — apply the change and trigger a re-run.

The Observability page already ships a complete but unwired "Auto-Remediation" config panel (`RemediateConfig`: `enabled`, `threshold`, `rule_types`) that POSTs to `/api/rules/auto-remediate-config`, which currently falls back to an in-memory mock because no backend route exists. This spec wires that panel to a real backend and builds the agent loop behind it.

## Scope

In scope:
- Detect failures via the existing post-run pipeline (no new polling/cron job).
- Classify each failed rule into "auto-fixable" (has a tunable numeric parameter in `rule_config`) or "escalation-only" (no safe parameter to tune).
- Generate a specific proposed fix via the existing AI provider pattern.
- Persist the proposal and surface it on the Issue detail panel with Approve/Reject.
- Auto-apply (no approval) when the Observability config is enabled, the rule type is whitelisted, and severity is not critical.
- Apply = patch the specific `rule_config` field, bump `DQRule.version`, re-run the rule synchronously, record the outcome.
- Real backend for `/rules/auto-remediate-config` (GET/POST), backed by `AppConfig`.

Out of scope:
- Continuous/independent structural monitoring (freshness/volume/schema drift checks that run outside of scheduled rules) — that's the separate "Data Observability Engine" roadmap item.
- Multi-step or multi-rule remediation plans — one rule failure produces one proposal.
- Editing remediation proposals before applying — it's accept-as-is or reject.

## Data Model

### `RemediationProposal` (new table: `dq_remediation_proposals`)

| Column | Type | Notes |
|---|---|---|
| `proposal_id` | String(36) PK | uuid |
| `issue_id` | String(36), FK `dq_issues.issue_id`, indexed | the issue this proposal is attached to |
| `rule_id` | String(36), FK `dq_rules.rule_id` | |
| `run_id` | String(36), FK `dq_rule_runs.run_id` | the failed run that triggered this |
| `asset_id` | String(36), FK `assets.asset_id` | |
| `rule_type` | String(50) | snapshot at proposal time |
| `classification` | String(20) | `auto_fixable` \| `escalation_only` |
| `proposed_action` | Text | human-readable one-line action, AI-generated |
| `config_field` | String(50), nullable | e.g. `max_hours`; null for escalation-only |
| `old_value` | String(50), nullable | stringified old value |
| `new_value` | String(50), nullable | stringified new value |
| `confidence` | String(20), nullable | `high` \| `medium` \| `low`, AI-supplied |
| `status` | String(20), indexed | `pending` \| `auto_applied` \| `approved` \| `rejected` \| `applied` \| `apply_failed` |
| `decided_by` | String(200), nullable | username, or `"system"` for auto-applied |
| `decided_at` | DateTime, nullable | |
| `rerun_run_id` | String(36), nullable | run_id of the post-apply re-run, once it exists |
| `created_at` | DateTime | |

One open (`pending`/`auto_applied`/`approved`) proposal per `(rule_id, asset_id)` at a time — mirrors the existing "one open issue per rule+asset" dedup in `_auto_create_issue`.

### `RemediationExecution` (new table: `dq_remediation_executions`)

Audit trail, one row per apply attempt (including auto-applies and retries after a failed apply).

| Column | Type | Notes |
|---|---|---|
| `execution_id` | String(36) PK | uuid |
| `proposal_id` | String(36), FK | |
| `applied_field` | String(50) | |
| `applied_old_value` | String(50) | |
| `applied_new_value` | String(50) | |
| `triggered_by` | String(200) | username or `"system"` |
| `rerun_status` | String(20), nullable | status of the triggered re-run once known |
| `rerun_run_id` | String(36), nullable | |
| `error_message` | Text, nullable | populated on `apply_failed` |
| `created_at` | DateTime | |

### `AppConfig` additions

Three new rows seeded in `CONFIG_DEFAULTS` (category `"quality"`):
- `auto_remediation_enabled` — `"false"`
- `auto_remediation_threshold` — `"10"` (quality-score-drop %, stored for parity with the existing UI field; not used in the apply-gate logic for this iteration — see Open Questions)
- `auto_remediation_rule_types` — JSON-encoded array string, e.g. `"[]"`

## Classification

Two fixed buckets, determined by `rule_type`:

**Auto-fixable** (tunable parameter exists in `rule_config`):
| rule_type | field | proposal logic |
|---|---|---|
| `freshness_check` | `max_hours` | new value = max observed delay across last 30 days of runs for this rule, + 20% buffer, rounded up to nearest hour |
| `volume_check` | `min_rows` / `max_rows` (whichever the failing run violated) | new bound = the breaching run's actual row count, adjusted 10% past it in the safe direction |
| `range_check` | `min_value` / `max_value` (whichever was violated) | new bound = observed min/max across last 30 days of passed runs' sample data, with 5% margin |
| `distribution_consistency_check` | `tolerance_pct` | new value = current `tolerance_pct` + half the observed deviation that caused the failure |

**Escalation-only** (no safe parameter): `null_check`, `uniqueness_check`, `schema_drift_check`, `referential_integrity_check`, `referential_sanity_check`, `business_rule_check`, `business_metric_check`, `custom_sql_check`, `llm_semantic_check`, `semantic_consistency_check`, `accepted_values_check`, `regex_check`.

The AI call always runs (for both buckets) to produce `proposed_action` text; only auto-fixable types get a computed `config_field`/`old_value`/`new_value` triple, computed in code from run history (not by the LLM) — the LLM is only used to phrase the action and assign a confidence label, since correctness of the actual number must not depend on the model.

## Backend Flow

1. **`post_run_service._auto_create_issue`** (extended): after creating the issue, call new `app/services/remediation_service.py::generate_proposal(issue, run, rule, asset, db)`.
2. **`generate_proposal`**:
   - Skip if an open proposal already exists for `(rule_id, asset_id)`.
   - Classify `rule.rule_type` into a bucket.
   - If auto-fixable: pull last-30-days `DQRuleRun` history for this rule, compute `old_value`/`new_value` per the table above using plain code (no AI). If history is insufficient (< 3 prior runs), fall back to escalation-only for this occurrence — never auto-tune off one data point.
   - Call the AI provider (same `provider.complete(prompt, system_prompt)` pattern as `generate_remediation_plan`) with the rule, classification, and computed values to produce `proposed_action` text and `confidence`.
   - Insert `RemediationProposal` with `status="pending"`.
   - Check apply-gate (below). If it passes, immediately call `apply_proposal(proposal, triggered_by="system", db)` and the resulting status becomes `auto_applied`/`applied`/`apply_failed` instead of staying `pending`.
3. **Apply-gate** (checked only for `auto_fixable` proposals):
   - `auto_remediation_enabled` is `"true"`, AND
   - `rule.rule_type` is in `auto_remediation_rule_types`, AND
   - `rule.severity != "critical"`.
4. **`apply_proposal(proposal, triggered_by, db)`**:
   - Patch `rule.rule_config[proposal.config_field] = proposal.new_value`, increment `rule.version`.
   - Insert `RemediationExecution` row.
   - Call the existing sync rule-execution path (same internal function backing `POST /execute/rule/{rule_id}/sync`) to re-run the rule immediately.
   - Update `proposal.status` to `applied` (or `auto_applied` if `triggered_by == "system"`), `proposal.rerun_run_id`, `decided_by`, `decided_at`.
   - If the re-run passes, transition the originating issue to `resolved` (reuse existing transition logic/`ISSUE_TRANSITIONS`). If it still fails, leave the issue open and append a note that the auto-fix did not resolve it — no further automatic retry.
   - Wrap apply + re-run in a try/except: on failure, `status="apply_failed"`, `error_message` set, issue left open.

## API

**`app/api/rules.py`** (or new `app/api/remediation.py` — following the existing per-domain file split):
- `GET /rules/auto-remediate-config` → reads the 3 `AppConfig` keys, returns `{enabled, threshold, rule_types, last_updated}`.
- `POST /rules/auto-remediate-config` → validates and writes the 3 keys via `config_service.set_value`, `last_updated = now()`.

**`app/api/issues.py`** additions:
- `GET /issues/{issue_id}/remediation-proposal` → latest `RemediationProposal` for the issue (or 404/null if none).
- `POST /issues/{issue_id}/remediation-proposal/{proposal_id}/approve` → only valid if `status == "pending"` and `classification == "auto_fixable"`; calls `apply_proposal(triggered_by=current_user, ...)`.
- `POST /issues/{issue_id}/remediation-proposal/{proposal_id}/reject` → only valid if `status == "pending"`; sets `status="rejected"`, `decided_by`, `decided_at`.
- Escalation-only proposals get no approve route — only reject (used as "Acknowledge/Dismiss" in the UI).

All write endpoints require `require_write` + `check_domain_access`, matching existing Issues API conventions.

## Frontend

**Next.js proxies** (new, following the `frontend/src/app/api/ai/[...path]/route.ts` pass-through pattern):
- `frontend/src/app/api/rules/auto-remediate-config/route.ts` already exists with a `MOCK_CONFIG` fallback — keep the file, it will now reach the real backend route and the mock fallback becomes pure error-path safety (no change needed there).
- `frontend/src/app/api/issues/[id]/remediation-proposal/route.ts` (GET) and `.../approve/route.ts`, `.../reject/route.ts` (POST) — same proxy shape as the AI routes.

**`IssueDetailPanel.tsx`**: new `ProposedRemediationSection`, rendered below the existing `AiRcaSection`, only when the issue has `rule_id` + `run_id`:
- Fetches `/api/issues/{issueId}/remediation-proposal` on mount.
- Renders nothing if no proposal exists.
- For `auto_fixable` + `pending`: shows `proposed_action`, the old→new value, confidence badge, and **Apply Fix** / **Reject** buttons.
- For `escalation_only` + `pending`: shows `proposed_action` and confidence badge, with a single **Acknowledge** button (calls reject, relabeled in the UI).
- For `auto_applied`/`applied`/`rejected`/`apply_failed`: shows a static status line (e.g. "Auto-applied: max_hours 24 → 30. Re-run passed." or "Apply failed: <error>") with no buttons.

**Observability page**: no changes needed — `RemediateConfig` panel already exists and already calls the (currently mocked) endpoint; once the backend route is real, it works as-is.

## Error Handling

- Proposal generation (AI call) failing must never block issue creation — same try/except pattern already used around `generate_remediation_plan` in `_auto_create_issue`. On failure, no `RemediationProposal` row is created; the issue still appears without a remediation panel.
- Insufficient run history for an auto-fixable type → treated as escalation-only for that occurrence (stated above).
- Apply failing (DB error, execution error) → `status="apply_failed"`, issue stays open, no automatic retry — a human handles it like any other open issue.

## Testing

- Unit tests for the classification table (rule_type → bucket) and the value-computation functions (freshness/volume/range/distribution) against synthetic `DQRuleRun` history.
- Unit test for the apply-gate logic (enabled/rule_types/severity combinations).
- Integration test: simulate a failing `freshness_check` run → assert a `RemediationProposal` is created, and (with config enabled + whitelisted) that `apply_proposal` patches `rule_config`, creates a `RemediationExecution`, and re-runs the rule.
- API tests for the new endpoints (auth/permission checks, invalid state transitions e.g. approving an already-applied proposal).

## Open Questions

- `auto_remediation_threshold` (quality-score-drop %) from the existing UI has no clear hook into a per-rule-failure event model (it implies an aggregate score-drop trigger, which doesn't exist yet at asset level outside of `SLABreachPrediction`). For this iteration, the field is stored and round-tripped through the config API for UI parity, but **not** evaluated in the apply-gate — only `enabled` and `rule_types` gate auto-apply. Revisit if/when the Dataset Quality Forecasting roadmap item lands and an asset-level live score becomes available to compare against this threshold.
