from __future__ import annotations
from typing import Optional
"""Simple Z-score anomaly detector using historical DQ rule run quality scores."""
import logging
import math
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

logger = logging.getLogger("dq_platform.anomaly")

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


async def run_zscore_detector(detector_id: str, db: AsyncSession) -> Optional[dict]:
    """
    Fetch the last 30 quality scores for this asset, compute mean+std,
    compare the latest score. Return detection dict or None if no anomaly.
    """
    import uuid
    from app.db.models import AnomalyDetector, AnomalyDetection, DQRuleRun

    detector_res = await db.execute(
        select(AnomalyDetector).where(AnomalyDetector.detector_id == detector_id)
    )
    detector = detector_res.scalar_one_or_none()
    if not detector:
        return None

    runs_res = await db.execute(
        select(DQRuleRun).where(
            DQRuleRun.asset_id == detector.asset_id,
            DQRuleRun.quality_score != None,
        ).order_by(desc(DQRuleRun.created_at)).limit(30)
    )
    runs = runs_res.scalars().all()
    if len(runs) < 5:
        return None  # Not enough history

    scores = [float(r.quality_score) for r in runs]
    latest = scores[0]
    history = scores[1:]

    mean = sum(history) / len(history)
    variance = sum((x - mean) ** 2 for x in history) / len(history)
    std = math.sqrt(variance) if variance > 0 else 0.001

    z_score = abs(latest - mean) / std
    threshold = detector.config.get("z_threshold", 2.5) if detector.config else 2.5

    if z_score > threshold:
        detection = AnomalyDetection(
            detection_id=str(uuid.uuid4()),
            detector_id=detector_id,
            asset_id=detector.asset_id,
            anomaly_type="quality_score_anomaly",
            severity="high" if z_score > 3.5 else "medium",
            observed_value=str(round(latest, 2)),
            expected_range=f"{round(mean - 2*std, 2)} – {round(mean + 2*std, 2)}",
            confidence=min(0.99, round(z_score / (threshold * 2), 2)),
            detected_at=_utcnow(),
        )
        db.add(detection)
        detector.last_trained_at = _utcnow()
        await db.commit()
        logger.info(f"Anomaly detected for asset {detector.asset_id}: z={z_score:.2f}")
        return {
            "detection_id": detection.detection_id,
            "asset_id": detector.asset_id,
            "anomaly_type": "quality_score_anomaly",
            "observed_value": latest,
            "mean": round(mean, 2),
            "std": round(std, 2),
            "z_score": round(z_score, 2),
            "confidence": detection.confidence,
        }
    return None
