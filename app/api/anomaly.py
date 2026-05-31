from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.database import get_db
from app.db.models import AnomalyDetector, AnomalyDetection, DQRuleRun
from app.core.security import get_current_user
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/anomaly", tags=["Anomaly Detection"])
_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


@router.post("/detectors", status_code=201)
async def create_detector(payload: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    row = AnomalyDetector(
        detector_id=str(uuid.uuid4()),
        asset_id=payload["asset_id"],
        column_name=payload.get("column_name"),
        detector_type=payload.get("detector_type", "zscore"),
        config=payload.get("config"),
        is_active=True,
        created_by=user.get("email"),
    )
    db.add(row)
    await db.commit()
    return {"detector_id": row.detector_id, "asset_id": row.asset_id, "detector_type": row.detector_type}


@router.get("/detectors")
async def list_detectors(asset_id: Optional[str] = None, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    q = select(AnomalyDetector).where(AnomalyDetector.is_active == True)
    if asset_id:
        q = q.where(AnomalyDetector.asset_id == asset_id)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [{"detector_id": r.detector_id, "asset_id": r.asset_id, "column_name": r.column_name,
             "detector_type": r.detector_type, "last_trained_at": r.last_trained_at.isoformat() if r.last_trained_at else None} for r in rows]


@router.delete("/detectors/{detector_id}", status_code=204)
async def deactivate_detector(detector_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    row = (await db.execute(select(AnomalyDetector).where(AnomalyDetector.detector_id == detector_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Detector not found")
    row.is_active = False
    await db.commit()


@router.post("/detectors/{detector_id}/run")
async def run_detector(detector_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    import math
    detector = (await db.execute(select(AnomalyDetector).where(AnomalyDetector.detector_id == detector_id))).scalar_one_or_none()
    if not detector:
        raise HTTPException(404, "Detector not found")

    runs_res = await db.execute(
        select(DQRuleRun).where(
            DQRuleRun.asset_id == detector.asset_id,
            DQRuleRun.quality_score != None,
        ).order_by(desc(DQRuleRun.created_at)).limit(30)
    )
    runs = runs_res.scalars().all()
    if len(runs) < 5:
        return {"anomaly_found": False, "reason": "Insufficient history (need at least 5 runs)"}

    scores = [float(r.quality_score) for r in runs]
    latest = scores[0]
    history = scores[1:]
    mean = sum(history) / len(history)
    variance = sum((x - mean) ** 2 for x in history) / len(history)
    std = math.sqrt(variance) if variance > 0 else 0.001
    z_score = abs(latest - mean) / std
    threshold = max(0.1, (detector.config or {}).get("z_threshold", 2.5))

    if z_score > threshold:
        # Clamp confidence to [0, 0.99]; avoid divide-by-zero
        raw_confidence = z_score / (threshold * 2) if threshold > 0 else 0
        confidence = round(min(0.99, max(0.0, raw_confidence)), 2)
        detection = AnomalyDetection(
            detection_id=str(uuid.uuid4()),
            detector_id=detector_id,
            asset_id=detector.asset_id,
            anomaly_type="quality_score_anomaly",
            severity="high" if z_score > 3.5 else "medium",
            observed_value=str(round(latest, 2)),
            expected_range=f"{round(mean - 2*std, 2)} – {round(mean + 2*std, 2)}",
            confidence=confidence,
            detected_at=_now(),
        )
        db.add(detection)
        detector.last_trained_at = _now()
        await db.commit()
        return {"anomaly_found": True, "detection_id": detection.detection_id,
                "z_score": round(z_score, 2), "observed": latest, "mean": round(mean, 2)}
    detector.last_trained_at = _now()
    await db.commit()
    return {"anomaly_found": False, "z_score": round(z_score, 2), "threshold": threshold}


@router.get("/detections")
async def list_detections(asset_id: Optional[str] = None, is_acknowledged: Optional[bool] = None,
                           db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    q = select(AnomalyDetection)
    if asset_id:
        q = q.where(AnomalyDetection.asset_id == asset_id)
    if is_acknowledged is not None:
        q = q.where(AnomalyDetection.is_acknowledged == is_acknowledged)
    q = q.order_by(desc(AnomalyDetection.detected_at)).limit(100)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [{"detection_id": r.detection_id, "asset_id": r.asset_id, "anomaly_type": r.anomaly_type,
             "severity": r.severity, "observed_value": r.observed_value, "expected_range": r.expected_range,
             "confidence": r.confidence, "detected_at": r.detected_at.isoformat(),
             "is_acknowledged": r.is_acknowledged} for r in rows]


@router.post("/detections/{detection_id}/acknowledge")
async def acknowledge_detection(detection_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    row = (await db.execute(select(AnomalyDetection).where(AnomalyDetection.detection_id == detection_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Detection not found")
    row.is_acknowledged = True
    await db.commit()
    return {"message": "Acknowledged"}
