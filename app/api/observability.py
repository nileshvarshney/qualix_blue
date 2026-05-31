from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from datetime import datetime, timezone, date, timedelta
from app.db.database import get_db
from app.db.models import DQRule, DQRuleRun, DQQualityScore, SLAConfig
from app.core.security import get_current_user

router = APIRouter(prefix="/observability", tags=["Observability"])


@router.get("/freshness-board")
async def freshness_board(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    """
    For each active freshness_check rule, show freshness status.
    Uses a single subquery to get the latest run per rule — avoids N+1.
    """
    # Batch: fetch all freshness rules and their most recent run in two queries
    rules_result = await db.execute(
        select(DQRule).where(DQRule.rule_type == "freshness_check", DQRule.is_active == True)
    )
    rules = rules_result.scalars().all()
    if not rules:
        return []

    rule_ids = [r.rule_id for r in rules]

    # Get latest run per rule_id using a subquery
    from sqlalchemy import text
    subq = (
        select(
            DQRuleRun.rule_id,
            func.max(DQRuleRun.created_at).label("max_created"),
        )
        .where(DQRuleRun.rule_id.in_(rule_ids))
        .group_by(DQRuleRun.rule_id)
        .subquery()
    )
    latest_runs_res = await db.execute(
        select(DQRuleRun).join(
            subq,
            (DQRuleRun.rule_id == subq.c.rule_id) &
            (DQRuleRun.created_at == subq.c.max_created),
        )
    )
    latest_by_rule = {r.rule_id: r for r in latest_runs_res.scalars().all()}

    now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
    board = []
    for rule in rules:
        latest_run = latest_by_rule.get(rule.rule_id)
        last_run_time = latest_run.created_at if latest_run else None
        hours_since = round((now_dt - last_run_time).total_seconds() / 3600, 2) if last_run_time else None
        config = rule.rule_config or {}
        sla_hours = config.get("max_hours", config.get("sla_hours", 24))
        if hours_since is None:
            status = "unknown"
        elif hours_since <= sla_hours * 0.8:
            status = "on_time"
        elif hours_since <= sla_hours:
            status = "at_risk"
        else:
            status = "breached"
        board.append({
            "rule_id": rule.rule_id, "rule_name": rule.rule_name, "asset_id": rule.asset_id,
            "last_run_time": last_run_time.isoformat() if last_run_time else None,
            "hours_since_last_run": hours_since, "sla_threshold_hours": sla_hours, "status": status,
        })
    return board


@router.get("/sla-breach-timeline")
async def sla_breach_timeline(db: AsyncSession = Depends(get_db)):
    """
    Last 30 days of SLA breach events (quality scores below threshold)
    from DQQualityScore joined with SLAConfig.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).replace(tzinfo=None)
    cutoff_date = (date.today() - timedelta(days=30))

    # Get all SLA configs for assets
    sla_result = await db.execute(
        select(SLAConfig).where(
            SLAConfig.is_active == True,
            SLAConfig.entity_type == "asset",
        )
    )
    sla_configs = {s.entity_id: s for s in sla_result.scalars().all()}

    if not sla_configs:
        return []

    # Get quality scores for those assets in last 30 days
    scores_result = await db.execute(
        select(DQQualityScore)
        .where(
            DQQualityScore.asset_id.in_(list(sla_configs.keys())),
            DQQualityScore.score_level == "table",
            DQQualityScore.score_date >= cutoff_date,
        )
        .order_by(desc(DQQualityScore.score_date))
    )
    scores = scores_result.scalars().all()

    breach_events = []
    for score in scores:
        sla = sla_configs.get(score.asset_id)
        if sla and score.quality_score < sla.min_quality_score:
            breach_events.append({
                "asset_id": score.asset_id,
                "score_date": score.score_date.isoformat() if hasattr(score.score_date, "isoformat") else str(score.score_date),
                "quality_score": score.quality_score,
                "sla_threshold": sla.min_quality_score,
                "breach_gap": round(sla.min_quality_score - score.quality_score, 2),
            })

    return breach_events


@router.get("/quality-heatmap")
async def quality_heatmap(db: AsyncSession = Depends(get_db)):
    """
    Domain x last 7 days grid of avg quality scores.
    Returns {domains: [...], dates: [...], matrix: [[score, ...]]}
    """
    today = date.today()
    dates = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]

    # Get all active domains
    domains_result = await db.execute(select(Domain).where(Domain.is_active == True))
    domains = domains_result.scalars().all()

    cutoff_date = today - timedelta(days=6)

    # Get avg quality scores per domain per day
    scores_result = await db.execute(
        select(
            DQQualityScore.domain_id,
            DQQualityScore.score_date,
            func.avg(DQQualityScore.quality_score).label("avg_score"),
        )
        .where(
            DQQualityScore.score_level == "domain",
            DQQualityScore.score_date >= cutoff_date,
        )
        .group_by(DQQualityScore.domain_id, DQQualityScore.score_date)
    )
    score_lookup: dict[tuple, float] = {}
    for row in scores_result.all():
        day_str = row.score_date.isoformat() if hasattr(row.score_date, "isoformat") else str(row.score_date)
        score_lookup[(row.domain_id, day_str)] = round(float(row.avg_score), 2)

    domain_labels = [{"domain_id": d.domain_id, "domain_name": d.domain_name} for d in domains]

    matrix = []
    for d in domains:
        row_scores = []
        for day_str in dates:
            score = score_lookup.get((d.domain_id, day_str))
            row_scores.append(score)
        matrix.append(row_scores)

    return {
        "domains": domain_labels,
        "dates": dates,
        "matrix": matrix,
    }


# ── §58.3 Real-time SSE Quality Event Stream ──────────────────────────────────

@router.get("/events/stream")
async def quality_events_stream(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """
    Server-Sent Events stream broadcasting recent quality events in real-time.
    Polls the DB every 5 seconds and emits new rule runs, alerts, and anomalies.
    Clients connect with EventSource('/observability/events/stream').
    """
    import asyncio
    import json as _json
    from fastapi.responses import StreamingResponse
    from sqlalchemy import desc
    from app.db.models import DQRuleRun, DQAlert, AnomalyDetection

    async def event_generator():
        last_run_time = datetime.now(timezone.utc).replace(tzinfo=None)
        try:
            while True:
                now = datetime.now(timezone.utc).replace(tzinfo=None)

                # New rule runs since last poll
                runs_res = await db.execute(
                    select(DQRuleRun)
                    .where(DQRuleRun.created_at > last_run_time)
                    .order_by(desc(DQRuleRun.created_at))
                    .limit(20)
                )
                for run in runs_res.scalars().all():
                    payload = _json.dumps({
                        "event": "rule_completed",
                        "run_id": run.run_id,
                        "rule_id": run.rule_id,
                        "asset_id": run.asset_id,
                        "status": run.status,
                        "score": run.quality_score,
                        "ts": run.created_at.isoformat(),
                    })
                    yield f"data: {payload}\n\n"

                # New alerts since last poll
                alerts_res = await db.execute(
                    select(DQAlert)
                    .where(DQAlert.created_at > last_run_time)
                    .order_by(desc(DQAlert.created_at))
                    .limit(10)
                )
                for alert in alerts_res.scalars().all():
                    payload = _json.dumps({
                        "event": "alert_created",
                        "alert_id": alert.alert_id,
                        "domain_id": alert.domain_id,
                        "severity": alert.severity,
                        "ts": alert.created_at.isoformat(),
                    })
                    yield f"data: {payload}\n\n"

                # New anomaly detections since last poll
                anoms_res = await db.execute(
                    select(AnomalyDetection)
                    .where(AnomalyDetection.detected_at > last_run_time)
                    .order_by(desc(AnomalyDetection.detected_at))
                    .limit(10)
                )
                for det in anoms_res.scalars().all():
                    payload = _json.dumps({
                        "event": "anomaly_detected",
                        "detection_id": det.detection_id,
                        "asset_id": det.asset_id,
                        "anomaly_type": det.anomaly_type,
                        "confidence": det.confidence,
                        "ts": det.detected_at.isoformat(),
                    })
                    yield f"data: {payload}\n\n"

                # Heartbeat every poll cycle
                yield f"data: {_json.dumps({'event': 'heartbeat', 'ts': now.isoformat()})}\n\n"
                last_run_time = now
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            pass

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
