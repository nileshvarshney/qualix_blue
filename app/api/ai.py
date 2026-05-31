from __future__ import annotations
from typing import Optional
import json as _json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.schemas.ai import (
    GenerateRulesRequest, ExplainFailureRequest, GenerateSQLRequest,
    ClassifyTableRequest, ChatRequest, ChatResponse,
)
from app.services import ai_service
from app.core.security import get_current_user
from app.core.limiter import limiter

router = APIRouter(prefix="/ai", tags=["AI/LLM"])


def _llm_err(e: RuntimeError) -> HTTPException:
    return HTTPException(status_code=503, detail=str(e))


@router.get("/models")
async def list_models(db: AsyncSession = Depends(get_db)):
    """Return the active provider config and available Ollama models."""
    from app.services.config_service import get_value
    from app.core.config import settings
    from app.services.llm_providers import OllamaProvider

    async def cfg(key: str, fallback: str = "") -> str:
        v = await get_value(key, db)
        return v if v else fallback

    provider    = await cfg("llm_provider",   settings.llm_provider or "ollama")
    ollama_url  = await cfg("ollama_base_url", settings.ollama_base_url or "http://localhost:11434")
    ollama_model = await cfg("ollama_model",  settings.ollama_model or "qwen2.5:7b-instruct")

    available: list[str] = []
    if provider == "ollama":
        p = OllamaProvider(ollama_url, ollama_model)
        available = await p.list_models()

    return {
        "provider":        provider,
        "ollama_base_url": ollama_url,
        "ollama_model":    ollama_model,
        "available_models": available,
        "model_installed": ollama_model in available if available else None,
    }


@router.post("/generate-rules")
@limiter.limit("20/minute")
async def generate_rules(
    request: Request,
    payload: GenerateRulesRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        rules = await ai_service.generate_rules(
            payload.domain, payload.subdomain, payload.table_name,
            payload.columns, payload.context, payload.provider, db,
        )
        return {"rules": rules, "count": len(rules)}
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/explain-failure")
@limiter.limit("20/minute")
async def explain_failure(
    request: Request,
    payload: ExplainFailureRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        explanation = await ai_service.explain_failure(
            payload.run_id, payload.rule_id, payload.provider, db,
        )
        return {"explanation": explanation, "run_id": payload.run_id, "rule_id": payload.rule_id}
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/generate-sql")
@limiter.limit("20/minute")
async def generate_sql(
    request: Request,
    payload: GenerateSQLRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        sql = await ai_service.generate_sql(
            payload.description, payload.table_name, payload.schema_name,
            payload.database_name, payload.columns, payload.provider, db,
        )
        return {"sql": sql}
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/classify-table")
async def classify_table(
    payload: ClassifyTableRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        result = await ai_service.classify_table(
            payload.table_name, payload.columns, payload.provider, db,
        )
        return result
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat(
    request: Request,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        history = [{"role": h.role, "content": h.content} for h in (payload.history or [])]
        response = await ai_service.chat(
            payload.message, payload.context, payload.provider, db, history=history,
        )
        from app.services.config_service import get_value
        from app.core.config import settings
        provider = payload.provider or await get_value("llm_provider", db) or settings.llm_provider
        return ChatResponse(response=response, provider=provider)
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/chat/stream")
@limiter.limit("30/minute")
async def chat_stream(
    request: Request,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Server-Sent Events endpoint. Streams tokens from Ollama as they are generated.
    Each event: data: {"token": "...", "done": false}
    Final event: data: {"token": "", "done": true, "provider": "ollama"}
    """
    import httpx
    from app.services.config_service import get_value
    from app.core.config import settings

    async def cfg(key: str, fallback: str = "") -> str:
        v = await get_value(key, db)
        return v if v else fallback

    provider_name = (payload.provider or await cfg("llm_provider", settings.llm_provider) or "ollama").lower()

    # Non-Ollama providers: call once and wrap as a single SSE event.
    # Keep the await INSIDE the generator so any RuntimeError becomes an error
    # SSE event rather than an HTTP 503 response code.
    if provider_name != "ollama":
        async def non_stream():
            try:
                response = await ai_service.chat(
                    payload.message, payload.context, payload.provider, db
                )
                yield f"data: {_json.dumps({'token': response, 'done': False})}\n\n"
                yield f"data: {_json.dumps({'token': '', 'done': True, 'provider': provider_name})}\n\n"
            except RuntimeError as e:
                yield f"data: {_json.dumps({'error': str(e), 'done': True})}\n\n"
        return StreamingResponse(
            non_stream(), media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    base_url = (await cfg("ollama_base_url", settings.ollama_base_url or "http://localhost:11434")).rstrip("/")
    model    =  await cfg("ollama_model",    settings.ollama_model    or "qwen2.5:1.5b")

    # Auto-gather context from DB if none provided by frontend
    context = payload.context
    if not context:
        context = await ai_service.gather_platform_context(payload.message, db)

    ctx = f"\n\nLive Platform Data:\n{ai_service._compress_context(context)}\n" if context else ""
    prompt = f"{ctx}\nQuestion: {payload.message}"

    # Build multi-turn message array with bounded history
    trimmed = ai_service._trim_history([{"role": h.role, "content": h.content} for h in (payload.history or [])])
    messages = [{"role": "system", "content": ai_service.PLATFORM_SYSTEM}]
    for h in trimmed:
        messages.append(h)
    messages.append({"role": "user", "content": prompt})

    async def stream_tokens():
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream(
                    "POST",
                    f"{base_url}/api/chat",
                    json={"model": model, "messages": messages, "stream": True},
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = _json.loads(line)
                            token = chunk.get("message", {}).get("content", "")
                            done  = chunk.get("done", False)
                            yield f"data: {_json.dumps({'token': token, 'done': done, 'provider': provider_name})}\n\n"
                            if done:
                                break
                        except Exception:
                            continue
        except httpx.ConnectError:
            err = (f"Cannot connect to Ollama at {base_url}. "
                   "If running in Docker use http://host.docker.internal:11434")
            yield f"data: {_json.dumps({'error': err, 'done': True})}\n\n"
        except Exception as e:
            yield f"data: {_json.dumps({'error': str(e), 'done': True})}\n\n"

    return StreamingResponse(stream_tokens(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── §47 Advanced AI Endpoints ─────────────────────────────────────────────────

@router.post("/discover-pii/{asset_id}")
@limiter.limit("10/minute")
async def discover_pii(
    request: Request,
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Scan column names and types to identify likely PII columns (§62.3)."""
    from sqlalchemy import select
    from app.db.models import ColumnMetadata, DataAsset
    from app.services.llm_providers import get_provider_from_db

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")

    cols_res = await db.execute(select(ColumnMetadata).where(ColumnMetadata.asset_id == asset_id))
    cols = cols_res.scalars().all()
    if not cols:
        return {"asset_id": asset_id, "findings": [], "message": "No column metadata — run profiling first"}

    col_list = "\n".join(f"- {c.column_name} ({c.data_type or 'unknown'})" for c in cols)
    prompt = (
        f"Table: {asset.sf_table_name}\nColumns:\n{col_list}\n\n"
        f"Classify each column as PII, SENSITIVE, CONFIDENTIAL, or PUBLIC.\n"
        f"Return JSON array: "
        f'[{{"column_name":"...","pii_type":"...","confidence":0.0-1.0,"suggested_classification":"..."}}]'
    )
    try:
        from app.services.ai_service import _SYS_JSON_ONLY
        provider = await get_provider_from_db(None, db)
        raw = await provider.complete(prompt, system=_SYS_JSON_ONLY, max_tokens=900)
        import json as _j
        start = raw.find("[")
        end   = raw.rfind("]") + 1
        findings = _j.loads(raw[start:end]) if start >= 0 else []
    except Exception:
        findings = []

    return {"asset_id": asset_id, "sf_table_name": asset.sf_table_name, "findings": findings}


@router.post("/rules/from-natural-language")
@limiter.limit("20/minute")
async def rule_from_natural_language(
    request: Request,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Convert plain-English rule to structured JSON.
    Supports iterative refinement via `prior_result` + `refinement` fields.
    payload: {description, asset_id?, domain_context?, provider?, prior_result?, refinement?}
    """
    from sqlalchemy import select
    from app.db.models import DataAsset
    from app.services.llm_providers import get_provider_from_db

    description  = payload.get("description", "")
    asset_id     = payload.get("asset_id", "")
    prior_result = payload.get("prior_result")
    refinement   = payload.get("refinement", "")

    if not description:
        raise HTTPException(400, "description is required")

    asset_name = ""
    if asset_id:
        asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))
        asset = asset_res.scalar_one_or_none()
        asset_name = f"{asset.sf_schema_name}.{asset.sf_table_name}" if asset else ""

    sys_nl = (
        "Convert a plain-English data quality rule to a structured JSON definition. "
        "Return ONLY JSON: {rule_type, target_column, severity, rule_config, rule_description, suggested_sql}. "
        "rule_type options: null_check, uniqueness_check, accepted_values_check, range_check, "
        "freshness_check, volume_check, regex_check, business_rule_check, custom_sql_check, "
        "semantic_consistency_check. severity: critical|high|medium|low."
    )

    if prior_result and refinement:
        import json as _j
        prompt = (
            f"Table: {asset_name or 'unknown'}\n"
            f"Domain: {payload.get('domain_context', '')}\n"
            f"Original rule: {description}\n"
            f"Previous result: {_j.dumps(prior_result)}\n"
            f"Refinement request: {refinement}\n"
            f"Return an improved version of the rule definition."
        )
    else:
        prompt = (
            f"Table: {asset_name or 'unknown'}\n"
            f"Domain: {payload.get('domain_context', '')}\n"
            f"Rule: {description}"
        )

    try:
        provider = await get_provider_from_db(payload.get("provider"), db)
        raw = await provider.complete(prompt, system=sys_nl, max_tokens=500)
        import json as _j
        start = raw.find("{"); end = raw.rfind("}") + 1
        result = _j.loads(raw[start:end]) if start >= 0 else {}
    except Exception as e:
        raise HTTPException(503, f"LLM error: {e}")

    return {
        "asset_id": asset_id,
        "input_description": description,
        "refinement": refinement or None,
        "rule_definition": result,
    }


@router.post("/rca/{run_id}")
async def trigger_rca(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Root Cause Analysis — enriched with 30-run trend, day/hour patterns, sibling failures."""
    from sqlalchemy import select, desc, func
    from app.db.models import DQRuleRun, DQRule, DataAsset
    from app.services.llm_providers import get_provider_from_db
    import json as _j
    from collections import Counter
    from datetime import timedelta

    run_res = await db.execute(select(DQRuleRun).where(DQRuleRun.run_id == run_id))
    run = run_res.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "Run not found")

    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == run.rule_id))
    rule = rule_res.scalar_one_or_none()

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == run.asset_id))
    asset = asset_res.scalar_one_or_none()

    # Last 30 runs for same rule
    hist_res = await db.execute(
        select(DQRuleRun)
        .where(DQRuleRun.rule_id == run.rule_id)
        .order_by(desc(DQRuleRun.created_at))
        .limit(30)
    )
    history = hist_res.scalars().all()
    fail_pcts = [r.failure_percentage for r in history if r.failure_percentage is not None]
    fail_statuses = Counter(r.status for r in history)
    fail_days = Counter(
        r.created_at.strftime("%A") for r in history if r.status == "failed" and r.created_at
    )
    fail_hours = Counter(
        r.created_at.hour for r in history if r.status == "failed" and r.created_at
    )
    avg_fail_pct = f"{sum(fail_pcts)/len(fail_pcts):.1f}%" if fail_pcts else "N/A"
    trend_summary = (
        f"Last {len(history)} runs: {fail_statuses.get('passed',0)} passed, "
        f"{fail_statuses.get('failed',0)} failed, {fail_statuses.get('error',0)} errors. "
        f"Avg failure %: {avg_fail_pct} across {len(fail_pcts)} runs. "
        f"Most failures on: {fail_days.most_common(2)}. "
        f"Peak failure hours: {fail_hours.most_common(2)}."
    ) if history else "No run history available."

    # Sibling failures in same domain ±2h
    window = timedelta(hours=2)
    sibling_res = await db.execute(
        select(func.count(DQRuleRun.run_id))
        .where(
            DQRuleRun.domain_id == run.domain_id,
            DQRuleRun.status == "failed",
            DQRuleRun.asset_id != run.asset_id,
            DQRuleRun.created_at >= (run.created_at - window),
            DQRuleRun.created_at <= (run.created_at + window),
        )
    )
    sibling_failures = sibling_res.scalar() or 0

    context = (
        f"Rule: {rule.rule_name if rule else run.rule_id}\n"
        f"Rule type: {rule.rule_type if rule else 'unknown'}\n"
        f"Severity: {rule.severity if rule else 'unknown'}\n"
        f"Table: {asset.sf_table_name if asset else run.asset_id}\n"
        f"Failed rows: {run.failed_rows_count} / {run.total_rows_scanned} "
        f"({run.failure_percentage or 0.0:.1f}%)\n"
        f"Error message: {run.error_message or 'none'}\n"
        f"Executed SQL: {(run.executed_sql or '')[:400]}\n"
        f"--- Historical trend ---\n{trend_summary}\n"
        f"Sibling asset failures in same domain ±2h: {sibling_failures}\n"
    )

    sys_rca = (
        "You are a data engineering expert. Analyse the data quality failure. "
        "Consider the historical trend and sibling failures when identifying the root cause. "
        "Return ONLY valid JSON: {root_cause, explanation, confidence (0-1), "
        "contributing_factors (list), recommended_action (object: step, priority, owner_role, estimated_effort), "
        "pattern_detected (string or null)}"
    )
    try:
        provider = await get_provider_from_db(None, db)
        raw = await provider.complete(context, system=sys_rca, max_tokens=900)
        start = raw.find("{"); end = raw.rfind("}") + 1
        rca = _j.loads(raw[start:end]) if start >= 0 else {"root_cause": "Analysis unavailable", "explanation": raw}
    except Exception as e:
        rca = {"root_cause": "LLM unavailable", "explanation": str(e), "confidence": 0}

    return {
        "run_id": run_id,
        "rule_id": run.rule_id,
        "asset_id": run.asset_id,
        "trend_summary": trend_summary,
        "sibling_failures_in_window": sibling_failures,
        "rca": rca,
    }


@router.post("/chat/governance")
@limiter.limit("30/minute")
async def governance_chat(
    request: Request,
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Governance-focused chat using GOVERNANCE_SYSTEM prompt and live violation/approval context."""
    try:
        from app.services.ai_service import (
            gather_governance_context, GOVERNANCE_SYSTEM,
            _compress_context, _trim_history,
        )
        from app.services.llm_providers import get_provider_from_db as _gpfdb
        from app.services.config_service import get_value
        from app.core.config import settings

        gov_ctx = payload.context or await gather_governance_context(db)
        ctx_block = f"\n\nLive Governance Data:\n{_compress_context(gov_ctx)}\n"
        prompt = f"{ctx_block}\nQuestion: {payload.message}"

        trimmed = _trim_history([{"role": h.role, "content": h.content} for h in (payload.history or [])])
        provider = await _gpfdb(payload.provider, db)

        if hasattr(provider, "complete_messages"):
            messages = [{"role": "system", "content": GOVERNANCE_SYSTEM}]
            for h in trimmed:
                messages.append({"role": h["role"], "content": h["content"]})
            messages.append({"role": "user", "content": prompt})
            response = await provider.complete_messages(messages)
        else:
            response = await provider.complete(prompt, GOVERNANCE_SYSTEM, max_tokens=1500)

        active_provider = payload.provider or await get_value("llm_provider", db) or settings.llm_provider
        return ChatResponse(response=response, provider=active_provider)
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/incidents/{incident_id}/explain")
@limiter.limit("20/minute")
async def explain_incident_endpoint(
    request: Request,
    incident_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Explain a quality incident in business terms, aggregating all related rule failures."""
    try:
        explanation = await ai_service.explain_incident(
            incident_id, payload.get("provider"), db
        )
        return {"incident_id": incident_id, "explanation": explanation}
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/assets/{asset_id}/generate-description")
@limiter.limit("20/minute")
async def generate_asset_description(
    request: Request,
    asset_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Generate and save a business description for a data asset using its column metadata."""
    try:
        description = await ai_service.generate_asset_description(
            asset_id, payload.get("provider"), db
        )
        return {"asset_id": asset_id, "description": description}
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/assets/{asset_id}/generate-column-docs")
@limiter.limit("10/minute")
async def generate_column_docs(
    request: Request,
    asset_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Generate and save column descriptions for all columns on a data asset."""
    try:
        result = await ai_service.generate_column_docs(
            asset_id, payload.get("provider"), db
        )
        return result
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/glossary/suggest-terms")
@limiter.limit("10/minute")
async def suggest_glossary_terms(
    request: Request,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Suggest new business glossary terms based on registered data assets."""
    try:
        terms = await ai_service.suggest_glossary_terms(
            payload.get("domain_id"), payload.get("provider"), db
        )
        return {"suggestions": terms, "count": len(terms)}
    except RuntimeError as e:
        raise _llm_err(e)


@router.get("/governance/review-queue")
@limiter.limit("20/minute")
async def steward_review_queue(
    request: Request,
    provider: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """AI-prioritised governance review queue with violations and pending approvals."""
    try:
        return await ai_service.get_steward_review_queue(provider, db)
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/governance/violations/{violation_id}/suggest-resolution")
@limiter.limit("20/minute")
async def suggest_violation_resolution(
    request: Request,
    violation_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Draft a professional resolution note for a governance policy violation."""
    try:
        resolution = await ai_service.suggest_violation_resolution(
            violation_id, payload.get("provider"), db
        )
        return {"violation_id": violation_id, "suggested_resolution": resolution}
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/assets/{asset_id}/predict-quality")
@limiter.limit("10/minute")
async def predict_asset_quality(
    request: Request,
    asset_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Predict whether an asset will fail quality checks in the next 7 days."""
    try:
        return await ai_service.predict_asset_quality(
            asset_id, payload.get("provider"), db
        )
    except RuntimeError as e:
        raise _llm_err(e)


@router.get("/assets/at-risk")
@limiter.limit("5/minute")
async def at_risk_assets(
    request: Request,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return assets with highest predicted quality risk from last nightly prediction run."""
    from sqlalchemy import select, desc
    from app.db.models import AnomalyDetection, AnomalyDetector, DataAsset, Domain

    det_res = await db.execute(
        select(AnomalyDetection, AnomalyDetector, DataAsset, Domain)
        .join(AnomalyDetector, AnomalyDetection.detector_id == AnomalyDetector.detector_id)
        .join(DataAsset, AnomalyDetection.asset_id == DataAsset.asset_id)
        .join(Domain, DataAsset.domain_id == Domain.domain_id)
        .where(
            AnomalyDetector.detector_type == "llm_predictor",
            AnomalyDetection.anomaly_type == "quality_forecast",
            AnomalyDetection.is_acknowledged == False,
        )
        .order_by(desc(AnomalyDetection.detected_at))
        .limit(limit * 3)
    )
    rows = det_res.all()

    seen: set[str] = set()
    results = []
    for r in rows:
        aid = r.AnomalyDetection.asset_id
        if aid in seen:
            continue
        seen.add(aid)
        results.append({
            "asset_id": aid,
            "table": f"{r.DataAsset.sf_schema_name}.{r.DataAsset.sf_table_name}",
            "domain": r.Domain.domain_name,
            "risk_level": r.AnomalyDetection.severity,
            "confidence": r.AnomalyDetection.confidence,
            "observed": r.AnomalyDetection.observed_value,
            "detected_at": str(r.AnomalyDetection.detected_at),
        })
        if len(results) >= limit:
            break

    return {"at_risk_assets": results, "count": len(results)}


@router.post("/assets/{asset_id}/remediation-plan")
@limiter.limit("10/minute")
async def asset_remediation_plan(
    request: Request,
    asset_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Generate structured remediation plan for an asset's recent quality failures."""
    try:
        return await ai_service.generate_remediation_plan(
            asset_id, payload.get("provider"), db
        )
    except RuntimeError as e:
        raise _llm_err(e)


@router.post("/rules/{rule_id}/remediation-playbook")
@limiter.limit("20/minute")
async def rule_remediation_playbook(
    request: Request,
    rule_id: str,
    payload: dict = {},
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Generate a focused remediation playbook for a specific rule."""
    from sqlalchemy import select, desc
    from app.db.models import DQRule, DQRuleRun, DataAsset
    from app.services.llm_providers import get_provider_from_db
    from app.services.ai_service import _REMEDIATION_HINTS
    import json as _j

    rule_res = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = rule_res.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == rule.asset_id))
    asset = asset_res.scalar_one_or_none()

    runs_res = await db.execute(
        select(DQRuleRun)
        .where(DQRuleRun.rule_id == rule_id)
        .order_by(desc(DQRuleRun.created_at))
        .limit(20)
    )
    runs = runs_res.scalars().all()
    fail_pcts = [r.failure_percentage for r in runs if r.failure_percentage is not None]
    avg_fail  = sum(fail_pcts) / len(fail_pcts) if fail_pcts else 0
    fail_count = sum(1 for r in runs if r.status in ("failed", "error"))

    hint = _REMEDIATION_HINTS.get(rule.rule_type, "Review rule logic and source data quality.")

    sys_play = (
        "You are a data engineering expert. Generate a 3-5 step remediation playbook. "
        "Return ONLY valid JSON: {\"playbook_title\": \"...\", \"steps\": [{\"step\": N, "
        "\"action\": \"...\", \"who\": \"...\", \"how\": \"...\", \"done_when\": \"...\"}], "
        "\"prevention_tip\": \"single sentence\"}"
    )
    prompt = (
        f"Rule: {rule.rule_name}\n"
        f"Type: {rule.rule_type}\n"
        f"Severity: {rule.severity}\n"
        f"Column: {rule.target_column or 'N/A'}\n"
        f"Table: {asset.sf_table_name if asset else rule.asset_id}\n"
        f"Description: {rule.rule_description or 'N/A'}\n"
        f"Last {len(runs)} runs: {fail_count} failed, avg failure rate {avg_fail:.1f}%\n"
        f"Rule config: {rule.rule_config}\n"
        f"Playbook hint: {hint}\n\n"
        "Generate a specific remediation playbook."
    )

    try:
        provider = await get_provider_from_db(payload.get("provider"), db)
        raw = await provider.complete(prompt, sys_play, max_tokens=900)
        start = raw.find("{"); end = raw.rfind("}") + 1
        playbook = _j.loads(raw[start:end]) if start >= 0 else {}
    except Exception as e:
        raise HTTPException(503, f"LLM error: {e}")

    return {"rule_id": rule_id, "rule_name": rule.rule_name, "rule_type": rule.rule_type, "playbook": playbook}


# ── §70 Agentic Tool-Use Interface ───────────────────────────────────────────
# Ported from Repo 2: Claude AI agent with tool execution loop

class AgentChatRequest(BaseModel):
    messages: list[dict]  # [{role, content}]


AGENT_TOOLS = [
    {
        "name": "list_connections",
        "description": "List all data source connections configured in DataGuard",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "list_rules",
        "description": "List data quality rules. Can filter by category, status, or severity.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Filter by category (completeness, accuracy, uniqueness, validity, timeliness, consistency)"},
                "severity": {"type": "string", "description": "Filter by severity (critical, high, medium, low)"},
                "status": {"type": "string", "description": "Filter by status (active, pending_review, draft)"},
                "limit": {"type": "integer", "description": "Max results (default 20)"}
            },
            "required": []
        }
    },
    {
        "name": "get_dashboard_stats",
        "description": "Get overall platform statistics: quality scores, rule counts, alert summary, domain health",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "get_alerts",
        "description": "Get recent quality alerts and their status",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Filter: open, acknowledged, resolved"},
                "severity": {"type": "string", "description": "Filter: critical, high, medium, low"},
                "limit": {"type": "integer", "description": "Max results (default 10)"}
            },
            "required": []
        }
    },
    {
        "name": "get_domains",
        "description": "List all data domains with their quality scores and asset counts",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "get_recent_runs",
        "description": "Get recent rule execution results with pass/fail details",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max results (default 10)"},
                "status": {"type": "string", "description": "Filter: passed, failed, error"}
            },
            "required": []
        }
    },
    {
        "name": "search_assets",
        "description": "Search data assets (tables/views) by name or description",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search term for table/asset name"},
                "limit": {"type": "integer", "description": "Max results (default 10)"}
            },
            "required": []
        }
    },
    {
        "name": "execute_rules",
        "description": "Trigger execution of quality rules for a specific asset",
        "input_schema": {
            "type": "object",
            "properties": {
                "asset_id": {"type": "string", "description": "Asset ID to run rules for"}
            },
            "required": ["asset_id"]
        }
    },
    {
        "name": "discover_warehouse_schema",
        "description": "Browse a connected warehouse to discover databases, schemas, and tables. Use this first to find what tables exist before querying data. Call with just connection_id to list databases; add database to list schemas; add database+schema to list tables with row counts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "connection_id": {"type": "string", "description": "Connection ID (use list_connections to find it)"},
                "database": {"type": "string", "description": "Database name to browse schemas/tables in"},
                "schema": {"type": "string", "description": "Schema name to list tables in (requires database)"}
            },
            "required": ["connection_id"]
        }
    },
    {
        "name": "get_table_columns",
        "description": "Get detailed column information for a specific table including column names, data types, nullability, and sample values. Use this to understand what data a table contains before writing a query.",
        "input_schema": {
            "type": "object",
            "properties": {
                "connection_id": {"type": "string", "description": "Connection ID"},
                "database": {"type": "string", "description": "Database name"},
                "schema": {"type": "string", "description": "Schema name"},
                "table": {"type": "string", "description": "Table name"}
            },
            "required": ["connection_id", "database", "schema", "table"]
        }
    },
    {
        "name": "query_warehouse",
        "description": "Execute a SQL query against the connected warehouse and return results. Use this after discovering tables and columns to answer analytical questions like 'top 20 sales by region' or 'average order value per month'. Only SELECT queries are allowed. Results are limited to 100 rows.",
        "input_schema": {
            "type": "object",
            "properties": {
                "connection_id": {"type": "string", "description": "Connection ID"},
                "sql": {"type": "string", "description": "The SELECT SQL query to execute"},
                "limit": {"type": "integer", "description": "Max rows to return (default 100, max 500)"}
            },
            "required": ["connection_id", "sql"]
        }
    },
    {
        "name": "explain_columns",
        "description": "Explain what columns in a table mean, how they are derived, their data types, relationships, and statistical profile. Use this when the user asks how metrics are calculated or what a column represents.",
        "input_schema": {
            "type": "object",
            "properties": {
                "connection_id": {"type": "string", "description": "Connection ID"},
                "database": {"type": "string", "description": "Database name"},
                "schema": {"type": "string", "description": "Schema name"},
                "table": {"type": "string", "description": "Table name"},
                "columns": {"type": "array", "items": {"type": "string"}, "description": "Specific columns to explain (optional, explains all if omitted)"}
            },
            "required": ["connection_id", "database", "schema", "table"]
        }
    },
]


async def _execute_agent_tool(tool_name: str, tool_input: dict, db: AsyncSession) -> dict:
    """Execute an agent tool and return the result."""
    from sqlalchemy import select, desc, func
    from app.db.models import (
        SnowflakeConnection, DQRule, DQRuleRun, DQAlert,
        Domain, Subdomain, DataAsset, DQQualityScore
    )

    try:
        if tool_name == "list_connections":
            result = await db.execute(
                select(SnowflakeConnection).order_by(SnowflakeConnection.connection_name)
            )
            conns = result.scalars().all()
            return {
                "connections": [
                    {
                        "id": c.connection_id, "name": c.connection_name,
                        "type": c.database_type or "snowflake",
                        "status": "active" if c.is_active else "inactive",
                        "account": c.account, "warehouse": c.warehouse,
                        "host": c.host, "database": c.default_database,
                    }
                    for c in conns
                ],
                "total": len(conns)
            }

        elif tool_name == "list_rules":
            stmt = select(DQRule).order_by(desc(DQRule.created_at))
            if tool_input.get("severity"):
                stmt = stmt.where(DQRule.severity == tool_input["severity"])
            if tool_input.get("status"):
                stmt = stmt.where(DQRule.status == tool_input["status"])
            if tool_input.get("category"):
                stmt = stmt.where(DQRule.rule_category == tool_input["category"])
            stmt = stmt.limit(tool_input.get("limit", 20))
            result = await db.execute(stmt)
            rules = result.scalars().all()
            return {
                "rules": [
                    {
                        "id": r.rule_id, "name": r.rule_name, "type": r.rule_type,
                        "category": r.rule_category, "severity": r.severity,
                        "status": r.status, "is_active": r.is_active,
                        "target_column": r.target_column,
                    }
                    for r in rules
                ],
                "total": len(rules)
            }

        elif tool_name == "get_dashboard_stats":
            rules_count = (await db.execute(select(func.count(DQRule.rule_id)))).scalar() or 0
            active_rules = (await db.execute(
                select(func.count(DQRule.rule_id)).where(DQRule.is_active == True)
            )).scalar() or 0
            assets_count = (await db.execute(select(func.count(DataAsset.asset_id)))).scalar() or 0
            domains_count = (await db.execute(select(func.count(Domain.domain_id)))).scalar() or 0
            open_alerts = (await db.execute(
                select(func.count(DQAlert.alert_id)).where(DQAlert.status == "open")
            )).scalar() or 0
            critical_alerts = (await db.execute(
                select(func.count(DQAlert.alert_id)).where(
                    DQAlert.status == "open", DQAlert.severity == "critical"
                )
            )).scalar() or 0

            # Latest global quality score
            latest_score = await db.execute(
                select(DQQualityScore)
                .where(DQQualityScore.level == "global")
                .order_by(desc(DQQualityScore.calculated_at))
                .limit(1)
            )
            score_row = latest_score.scalar_one_or_none()
            overall_score = score_row.score if score_row else None

            return {
                "total_rules": rules_count,
                "active_rules": active_rules,
                "total_assets": assets_count,
                "total_domains": domains_count,
                "open_alerts": open_alerts,
                "critical_alerts": critical_alerts,
                "overall_quality_score": overall_score,
            }

        elif tool_name == "get_alerts":
            stmt = select(DQAlert).order_by(desc(DQAlert.created_at))
            if tool_input.get("status"):
                stmt = stmt.where(DQAlert.status == tool_input["status"])
            if tool_input.get("severity"):
                stmt = stmt.where(DQAlert.severity == tool_input["severity"])
            stmt = stmt.limit(tool_input.get("limit", 10))
            result = await db.execute(stmt)
            alerts = result.scalars().all()
            return {
                "alerts": [
                    {
                        "id": a.alert_id, "severity": a.severity,
                        "status": a.status, "message": a.message,
                        "created_at": a.created_at.isoformat() if a.created_at else None,
                    }
                    for a in alerts
                ],
                "total": len(alerts)
            }

        elif tool_name == "get_domains":
            result = await db.execute(select(Domain).order_by(Domain.domain_name))
            domains = result.scalars().all()
            domain_data = []
            for d in domains:
                asset_count = (await db.execute(
                    select(func.count(DataAsset.asset_id)).where(DataAsset.domain_id == d.domain_id)
                )).scalar() or 0
                rule_count = (await db.execute(
                    select(func.count(DQRule.rule_id)).where(DQRule.domain_id == d.domain_id)
                )).scalar() or 0
                domain_data.append({
                    "id": d.domain_id, "name": d.domain_name,
                    "description": d.description,
                    "asset_count": asset_count, "rule_count": rule_count,
                })
            return {"domains": domain_data, "total": len(domain_data)}

        elif tool_name == "get_recent_runs":
            stmt = select(DQRuleRun).order_by(desc(DQRuleRun.created_at))
            if tool_input.get("status"):
                stmt = stmt.where(DQRuleRun.status == tool_input["status"])
            stmt = stmt.limit(tool_input.get("limit", 10))
            result = await db.execute(stmt)
            runs = result.scalars().all()
            return {
                "runs": [
                    {
                        "id": r.run_id, "rule_id": r.rule_id, "status": r.status,
                        "total_rows": r.total_rows_scanned, "failed_rows": r.failed_rows_count,
                        "failure_pct": r.failure_percentage,
                        "executed_at": r.created_at.isoformat() if r.created_at else None,
                    }
                    for r in runs
                ],
                "total": len(runs)
            }

        elif tool_name == "search_assets":
            query = tool_input.get("query", "")
            stmt = select(DataAsset).where(
                DataAsset.sf_table_name.ilike(f"%{query}%")
            ).limit(tool_input.get("limit", 10))
            result = await db.execute(stmt)
            assets = result.scalars().all()
            return {
                "assets": [
                    {
                        "id": a.asset_id, "table": a.sf_table_name,
                        "schema": a.sf_schema_name, "database": a.sf_database_name,
                        "domain_id": a.domain_id, "certification": a.certification_status,
                        "criticality": a.criticality,
                    }
                    for a in assets
                ],
                "total": len(assets)
            }

        elif tool_name == "execute_rules":
            asset_id = tool_input.get("asset_id")
            if not asset_id:
                return {"error": "asset_id is required"}
            # Find active rules for this asset
            result = await db.execute(
                select(DQRule).where(DQRule.asset_id == asset_id, DQRule.is_active == True)
            )
            rules = result.scalars().all()
            return {
                "message": f"Found {len(rules)} active rules for asset. Use the /execute/bulk endpoint to trigger execution.",
                "rule_count": len(rules),
                "rules": [{"id": r.rule_id, "name": r.rule_name, "type": r.rule_type} for r in rules]
            }

        elif tool_name == "discover_warehouse_schema":
            conn_id = tool_input.get("connection_id")
            if not conn_id:
                return {"error": "connection_id is required"}
            conn_res = await db.execute(
                select(SnowflakeConnection).where(SnowflakeConnection.connection_id == conn_id)
            )
            conn = conn_res.scalar_one_or_none()
            if not conn:
                return {"error": f"Connection '{conn_id}' not found"}

            from app.api.connections import _open_connector, _safe_ident
            database = tool_input.get("database")
            schema = tool_input.get("schema")

            def _browse():
                sf = _open_connector(conn)
                cur = sf.cursor()
                try:
                    if database and schema:
                        db_s = _safe_ident(database, "database")
                        sc_s = _safe_ident(schema, "schema")
                        cur.execute(f"""
                            SELECT table_name, table_type,
                                   COALESCE(row_count, 0) AS row_count,
                                   COALESCE(comment, '') AS comment
                            FROM "{db_s}".INFORMATION_SCHEMA.TABLES
                            WHERE UPPER(table_schema) = '{sc_s.upper()}'
                            ORDER BY table_name
                        """)
                        rows = cur.fetchall()
                        return {
                            "level": "tables",
                            "database": database,
                            "schema": schema,
                            "tables": [
                                {"name": r[0], "type": r[1], "row_count": r[2], "comment": r[3]}
                                for r in rows
                            ],
                        }
                    elif database:
                        db_s = _safe_ident(database, "database")
                        cur.execute(f'SHOW SCHEMAS IN DATABASE "{db_s}"')
                        rows = cur.fetchall()
                        col_names = [d[0].lower() for d in cur.description]
                        return {
                            "level": "schemas",
                            "database": database,
                            "schemas": [
                                dict(zip(col_names, r)).get("name", "")
                                for r in rows
                                if dict(zip(col_names, r)).get("name", "").upper() != "INFORMATION_SCHEMA"
                            ],
                        }
                    else:
                        cur.execute("SHOW DATABASES")
                        rows = cur.fetchall()
                        col_names = [d[0].lower() for d in cur.description]
                        return {
                            "level": "databases",
                            "databases": [
                                dict(zip(col_names, r)).get("name", "")
                                for r in rows
                                if dict(zip(col_names, r)).get("name", "").upper()
                                not in ("SNOWFLAKE", "SNOWFLAKE_SAMPLE_DATA")
                            ],
                        }
                finally:
                    cur.close()
                    sf.close()

            import asyncio as _aio
            return await _aio.to_thread(_browse)

        elif tool_name == "get_table_columns":
            conn_id = tool_input.get("connection_id")
            database = tool_input.get("database", "")
            schema = tool_input.get("schema", "")
            table = tool_input.get("table", "")
            if not all([conn_id, database, schema, table]):
                return {"error": "connection_id, database, schema, and table are all required"}

            conn_res = await db.execute(
                select(SnowflakeConnection).where(SnowflakeConnection.connection_id == conn_id)
            )
            conn = conn_res.scalar_one_or_none()
            if not conn:
                return {"error": f"Connection '{conn_id}' not found"}

            from app.api.connections import _open_connector, _safe_ident

            def _cols():
                sf = _open_connector(conn)
                cur = sf.cursor()
                db_s = _safe_ident(database, "database")
                sc_s = _safe_ident(schema, "schema")
                tb_s = _safe_ident(table, "table")
                try:
                    cur.execute(f"""
                        SELECT column_name, data_type, is_nullable, ordinal_position,
                               COALESCE(comment, '') AS comment
                        FROM "{db_s}".INFORMATION_SCHEMA.COLUMNS
                        WHERE UPPER(table_schema) = '{sc_s.upper()}'
                          AND UPPER(table_name) = '{tb_s.upper()}'
                        ORDER BY ordinal_position
                    """)
                    col_rows = cur.fetchall()
                    columns = [
                        {"name": r[0], "type": r[1], "nullable": r[2], "position": r[3], "comment": r[4]}
                        for r in col_rows
                    ]
                    # Fetch a few sample rows to help understand the data
                    cur.execute(f'SELECT * FROM "{db_s}"."{sc_s}"."{tb_s}" LIMIT 5')
                    sample_col_names = [d[0] for d in cur.description]
                    sample_rows = [list(r) for r in cur.fetchall()]
                    return {
                        "table": f"{database}.{schema}.{table}",
                        "column_count": len(columns),
                        "columns": columns,
                        "sample_columns": sample_col_names,
                        "sample_rows": sample_rows,
                    }
                finally:
                    cur.close()
                    sf.close()

            import asyncio as _aio
            return await _aio.to_thread(_cols)

        elif tool_name == "query_warehouse":
            conn_id = tool_input.get("connection_id")
            sql = tool_input.get("sql", "").strip()
            row_limit = min(tool_input.get("limit", 100), 500)

            if not conn_id or not sql:
                return {"error": "connection_id and sql are required"}

            # Safety: only allow SELECT statements
            sql_upper = sql.upper().lstrip()
            if not sql_upper.startswith("SELECT") and not sql_upper.startswith("WITH"):
                return {"error": "Only SELECT queries are allowed for safety. No INSERT/UPDATE/DELETE/DROP."}
            # Block dangerous patterns
            import re as _re
            _BLOCKED = _re.compile(r'\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|MERGE)\b', _re.IGNORECASE)
            if _BLOCKED.search(sql):
                return {"error": "Query contains disallowed statements. Only SELECT/WITH queries are permitted."}

            conn_res = await db.execute(
                select(SnowflakeConnection).where(SnowflakeConnection.connection_id == conn_id)
            )
            conn = conn_res.scalar_one_or_none()
            if not conn:
                return {"error": f"Connection '{conn_id}' not found"}

            from app.api.connections import _open_connector

            def _query():
                sf = _open_connector(conn)
                cur = sf.cursor()
                try:
                    # Wrap in a LIMIT if not already limited
                    exec_sql = sql.rstrip(";")
                    if "LIMIT" not in sql.upper():
                        exec_sql = f"SELECT * FROM ({exec_sql}) AS _q LIMIT {row_limit}"
                    cur.execute(exec_sql)
                    col_names = [d[0] for d in cur.description]
                    rows = [list(r) for r in cur.fetchall()]
                    return {
                        "columns": col_names,
                        "rows": rows,
                        "row_count": len(rows),
                        "sql_executed": exec_sql,
                    }
                finally:
                    cur.close()
                    sf.close()

            import asyncio as _aio
            return await _aio.to_thread(_query)

        elif tool_name == "explain_columns":
            conn_id = tool_input.get("connection_id")
            database = tool_input.get("database", "")
            schema = tool_input.get("schema", "")
            table = tool_input.get("table", "")
            target_cols = tool_input.get("columns", [])

            if not all([conn_id, database, schema, table]):
                return {"error": "connection_id, database, schema, and table are all required"}

            conn_res = await db.execute(
                select(SnowflakeConnection).where(SnowflakeConnection.connection_id == conn_id)
            )
            conn = conn_res.scalar_one_or_none()
            if not conn:
                return {"error": f"Connection '{conn_id}' not found"}

            from app.api.connections import _open_connector, _safe_ident

            def _explain():
                sf = _open_connector(conn)
                cur = sf.cursor()
                db_s = _safe_ident(database, "database")
                sc_s = _safe_ident(schema, "schema")
                tb_s = _safe_ident(table, "table")
                try:
                    # Get column metadata
                    cur.execute(f"""
                        SELECT column_name, data_type, is_nullable, ordinal_position,
                               COALESCE(comment, '') AS comment
                        FROM "{db_s}".INFORMATION_SCHEMA.COLUMNS
                        WHERE UPPER(table_schema) = '{sc_s.upper()}'
                          AND UPPER(table_name) = '{tb_s.upper()}'
                        ORDER BY ordinal_position
                    """)
                    all_cols = [
                        {"name": r[0], "type": r[1], "nullable": r[2], "position": r[3], "comment": r[4]}
                        for r in cur.fetchall()
                    ]
                    if target_cols:
                        upper_targets = {c.upper() for c in target_cols}
                        all_cols = [c for c in all_cols if c["name"].upper() in upper_targets]

                    # Check if table is a view and get the definition
                    cur.execute(f"""
                        SELECT table_type FROM "{db_s}".INFORMATION_SCHEMA.TABLES
                        WHERE UPPER(table_schema) = '{sc_s.upper()}'
                          AND UPPER(table_name) = '{tb_s.upper()}'
                    """)
                    table_type_row = cur.fetchone()
                    table_type = table_type_row[0] if table_type_row else "BASE TABLE"

                    view_definition = None
                    if table_type and "VIEW" in str(table_type).upper():
                        cur.execute(f"""
                            SELECT view_definition FROM "{db_s}".INFORMATION_SCHEMA.VIEWS
                            WHERE UPPER(table_schema) = '{sc_s.upper()}'
                              AND UPPER(table_name) = '{tb_s.upper()}'
                        """)
                        vrow = cur.fetchone()
                        view_definition = vrow[0] if vrow else None

                    # Get basic stats for numeric/date columns
                    stat_cols = [c for c in all_cols if any(
                        t in c["type"].upper() for t in ("NUMBER", "INT", "FLOAT", "DECIMAL", "DOUBLE", "DATE", "TIMESTAMP")
                    )]
                    stats = {}
                    for c in stat_cols[:10]:
                        try:
                            cn = c["name"]
                            cur.execute(f"""
                                SELECT COUNT(*) AS total, COUNT("{cn}") AS non_null,
                                       COUNT(DISTINCT "{cn}") AS distinct_vals,
                                       MIN("{cn}") AS min_val, MAX("{cn}") AS max_val
                                FROM "{db_s}"."{sc_s}"."{tb_s}"
                            """)
                            sr = cur.fetchone()
                            stats[cn] = {
                                "total_rows": sr[0], "non_null": sr[1],
                                "distinct_values": sr[2], "min": str(sr[3]), "max": str(sr[4]),
                            }
                        except Exception:
                            pass

                    return {
                        "table": f"{database}.{schema}.{table}",
                        "table_type": table_type,
                        "view_definition": view_definition,
                        "columns": all_cols,
                        "column_stats": stats,
                    }
                finally:
                    cur.close()
                    sf.close()

            import asyncio as _aio
            return await _aio.to_thread(_explain)

        else:
            return {"error": f"Unknown tool: {tool_name}"}

    except Exception as e:
        return {"error": str(e)}


@router.post("/agent")
async def agent_chat(
    payload: AgentChatRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Agentic AI interface with tool execution loop.
    The AI can query platform data, list rules/connections/alerts,
    and provide intelligent recommendations.
    """
    from app.services.llm_providers import get_provider_from_db
    from app.services.config_service import get_value
    from app.core.config import settings

    # Get the active LLM provider
    provider_name = await get_value("llm_provider", db) or settings.llm_provider or "ollama"

    system_prompt = """You are DataGuard AI, an expert Data Quality & Governance assistant.
You have access to tools that let you query the DataGuard platform AND connected data warehouses in real-time.

PLATFORM TOOLS (metadata, rules, alerts):
- list_connections → find available warehouse connections
- get_dashboard_stats → platform health overview
- list_rules / get_alerts / get_domains / get_recent_runs / search_assets → platform data

WAREHOUSE QUERY TOOLS (live data from connected warehouses):
When users ask analytical questions about their data (e.g., "top 20 sales by region", "average revenue per month"):
1. Use list_connections to find the connection ID
2. Use discover_warehouse_schema to browse databases → schemas → tables
3. Use get_table_columns to see column names, types, and sample data
4. Use query_warehouse to execute a SQL query and return results
5. Use explain_columns to describe what columns mean, how views derive them, and column statistics

WORKFLOW for analytical questions:
- First discover what tables exist, then inspect columns, then write and execute SQL
- Present results in a clear markdown table
- Explain what the data shows and how metrics are derived
- If a table is a VIEW, explain_columns will show the view definition (the SQL that derives the columns)

Be conversational, helpful, and proactive. Format responses with markdown for readability.
Always explain the data quality impact and recommend next steps."""

    messages = payload.messages

    # Try Anthropic provider first (best for tool use)
    anthropic_key = await get_value("anthropic_api_key", db) or settings.anthropic_api_key or ""
    openai_key = await get_value("openai_api_key", db) or settings.openai_api_key or ""

    if anthropic_key:
        return await _agent_loop_anthropic(anthropic_key, system_prompt, messages, db)
    elif openai_key:
        return await _agent_loop_openai(openai_key, system_prompt, messages, db)
    else:
        # Fallback: use configured provider without tool use
        return await _agent_loop_fallback(system_prompt, messages, db)


async def _agent_loop_anthropic(api_key: str, system_prompt: str, messages: list[dict], db: AsyncSession) -> dict:
    """Agentic loop using Anthropic Claude with native tool use."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    # Convert tools to Anthropic format
    anthropic_tools = []
    for t in AGENT_TOOLS:
        anthropic_tools.append({
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["input_schema"]
        })

    anthropic_messages = [{"role": m["role"], "content": m["content"]} for m in messages]

    final_response = ""
    tools_used = []
    current_messages = list(anthropic_messages)

    for _ in range(5):  # max 5 iterations
        try:
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2048,
                system=system_prompt,
                tools=anthropic_tools,
                messages=current_messages,
            )
        except Exception as e:
            return {"response": f"AI service error: {str(e)}", "tools_used": tools_used}

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    tools_used.append(block.name)
                    result = await _execute_agent_tool(block.name, block.input, db)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": _json.dumps(result, default=str)
                    })

            current_messages.append({"role": "assistant", "content": response.content})
            current_messages.append({"role": "user", "content": tool_results})
        else:
            for block in response.content:
                if hasattr(block, "text"):
                    final_response = block.text
                    break
            break

    return {"response": final_response, "tools_used": tools_used}


async def _agent_loop_openai(api_key: str, system_prompt: str, messages: list[dict], db: AsyncSession) -> dict:
    """Agentic loop using OpenAI with function calling."""
    import openai

    client = openai.OpenAI(api_key=api_key)

    openai_tools = []
    for t in AGENT_TOOLS:
        openai_tools.append({
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"]
            }
        })

    openai_messages = [{"role": "system", "content": system_prompt}]
    openai_messages.extend([{"role": m["role"], "content": m["content"]} for m in messages])

    tools_used = []

    for _ in range(5):
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=openai_messages,
                tools=openai_tools,
            )
        except Exception as e:
            return {"response": f"AI service error: {str(e)}", "tools_used": tools_used}

        choice = response.choices[0]
        if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
            openai_messages.append(choice.message)
            for tc in choice.message.tool_calls:
                tools_used.append(tc.function.name)
                args = _json.loads(tc.function.arguments) if tc.function.arguments else {}
                result = await _execute_agent_tool(tc.function.name, args, db)
                openai_messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": _json.dumps(result, default=str)
                })
        else:
            return {"response": choice.message.content or "", "tools_used": tools_used}

    return {"response": "Agent reached maximum iterations.", "tools_used": tools_used}


async def _agent_loop_fallback(system_prompt: str, messages: list[dict], db: AsyncSession) -> dict:
    """Fallback: use the configured LLM provider without tool use."""
    from app.services.llm_providers import get_provider_from_db

    # Gather some context automatically
    context_parts = []
    try:
        stats = await _execute_agent_tool("get_dashboard_stats", {}, db)
        context_parts.append(f"Platform stats: {_json.dumps(stats, default=str)}")
    except Exception:
        pass

    provider = await get_provider_from_db(None, db)
    user_msg = messages[-1]["content"] if messages else ""
    ctx = "\n".join(context_parts)
    prompt = f"Platform context:\n{ctx}\n\nUser question: {user_msg}" if ctx else user_msg

    try:
        response = await provider.complete(prompt, system=system_prompt, max_tokens=1500)
        return {"response": response, "tools_used": []}
    except Exception as e:
        return {"response": f"AI service error: {str(e)}", "tools_used": []}


@router.post("/incidents/{incident_id}/generate-postmortem")
async def generate_postmortem(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Auto-generate a post-mortem draft for a resolved incident (§67.3)."""
    from sqlalchemy import select
    from app.db.models import QualityIncident, DataAsset
    from app.services.llm_providers import get_provider_from_db

    inc_res = await db.execute(select(QualityIncident).where(QualityIncident.incident_id == incident_id))
    incident = inc_res.scalar_one_or_none()
    if not incident:
        raise HTTPException(404, "Incident not found")

    asset_res = await db.execute(select(DataAsset).where(DataAsset.asset_id == incident.asset_id))
    asset = asset_res.scalar_one_or_none()

    context = (
        f"Incident: {incident.title or 'Data quality incident'}\n"
        f"Table: {asset.sf_table_name if asset else incident.asset_id}\n"
        f"Severity: {incident.severity}\n"
        f"Status: {incident.status}\n"
        f"Time to detect: {incident.ttd_minutes} minutes\n"
        f"Time to resolve: {incident.ttr_minutes} minutes\n"
        f"RCA: {incident.rca_report}\n"
    )
    sys_pm = (
        "You are a senior data engineering lead. Write a concise formal post-mortem in Markdown. "
        "Sections: Executive Summary, Timeline, Root Cause, Contributing Factors, "
        "Impact, Remediation Steps, Action Items."
    )
    prompt = f"Incident details:\n{context}"
    try:
        provider = await get_provider_from_db(None, db)
        postmortem = await provider.complete(prompt, system=sys_pm, max_tokens=2000)
    except Exception as e:
        postmortem = f"Post-mortem generation failed: {e}"

    return {
        "incident_id": incident_id,
        "postmortem": postmortem,
        "generated_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
