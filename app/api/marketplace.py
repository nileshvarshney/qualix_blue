from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.database import get_db
from app.db.models import RuleTemplate, DQRule, DataAsset
from app.core.security import get_current_user
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/marketplace", tags=["Marketplace"])
_now = lambda: datetime.now(timezone.utc).replace(tzinfo=None)

# ── Seed data ─────────────────────────────────────────────────────────────────
_SEED_TEMPLATES = [
    # Finance / Revenue
    ("Invoice ID Not Null",             "null_check",        None,                          "critical", "Finance,Revenue",    "Every invoice must have a non-null invoice ID. Required for GL reconciliation.",         "invoices,billing,required"),
    ("Invoice Amount Positive",         "range_check",       {"min_value": 0},              "high",     "Finance,Revenue",    "Invoice amounts must be greater than or equal to zero.",                                 "invoices,billing,amount"),
    ("Invoice ID Unique",               "uniqueness_check",  None,                          "critical", "Finance,Revenue",    "Invoice IDs must be globally unique to prevent duplicate billing.",                      "invoices,billing,unique"),
    ("Valid Invoice Status",            "accepted_values_check",{"accepted_values":["PAID","PENDING","FAILED","CANCELLED"]},"high","Finance,Revenue","Invoice status must be one of the approved values.","invoices,status,billing"),
    ("GL Account Not Null",             "null_check",        None,                          "critical", "Finance",            "General ledger accounts must always be populated.",                                      "gl,accounting,required"),
    ("Transaction Amount Non-Zero",     "range_check",       {"min_value": 0.01},           "high",     "Finance",            "Transaction amounts must be greater than zero.",                                         "finance,transactions,amount"),
    ("Journal Entry ID Unique",         "uniqueness_check",  None,                          "critical", "Finance",            "Journal entry IDs must be unique across the GL.",                                        "gl,journal,unique"),
    ("Revenue Data Freshness",          "freshness_check",   {"max_hours": 24},             "high",     "Finance,Revenue",    "Revenue tables must be refreshed within 24 hours to meet reporting SLAs.",               "revenue,freshness,sla"),
    # HR / Payroll
    ("Employee ID Not Null",            "null_check",        None,                          "critical", "HR",                 "Every HR record must have a valid employee ID.",                                         "hr,employees,required"),
    ("Employee ID Unique",              "uniqueness_check",  None,                          "critical", "HR",                 "Employee IDs must be unique across the workforce.",                                      "hr,employees,unique"),
    ("Salary Positive",                 "range_check",       {"min_value": 0},              "high",     "HR",                 "Employee salary must be greater than or equal to zero.",                                 "hr,payroll,salary"),
    ("Valid Employment Status",         "accepted_values_check",{"accepted_values":["ACTIVE","INACTIVE","ON_LEAVE","TERMINATED"]},"medium","HR","Employment status must be a valid value.","hr,status"),
    ("Email Format Valid",              "regex_check",       {"pattern":"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"},"medium","HR,GTM,Revenue","Email addresses must conform to standard format.","email,regex,format"),
    ("Payroll Data Freshness",          "freshness_check",   {"max_hours": 48},             "high",     "HR",                 "Payroll tables must be refreshed within 48 hours.",                                      "hr,payroll,freshness"),
    # E-commerce / Operations
    ("Order ID Not Null",               "null_check",        None,                          "critical", "E-commerce,Operations","Every order must have an order ID.",                                                  "orders,ecommerce,required"),
    ("Order Total Positive",            "range_check",       {"min_value": 0},              "high",     "E-commerce",         "Order totals must be greater than or equal to zero.",                                    "orders,ecommerce,amount"),
    ("Valid Order Status",              "accepted_values_check",{"accepted_values":["PENDING","CONFIRMED","SHIPPED","DELIVERED","CANCELLED","REFUNDED"]},"high","E-commerce","Order status must be a recognised value.","orders,status,ecommerce"),
    ("Ship Date After Order Date",      "semantic_consistency_check",{"condition":"ship_date >= order_date OR ship_date IS NULL"},"high","E-commerce,Operations","Shipment date must not precede the order date.","orders,dates,logic"),
    ("Inventory Quantity Non-Negative", "range_check",       {"min_value": 0},              "medium",   "Operations",         "Inventory quantities must not go negative.",                                             "inventory,quantity,ops"),
    # Healthcare
    ("Patient ID Not Null",             "null_check",        None,                          "critical", "Healthcare",         "Every patient record must have a valid patient ID.",                                     "healthcare,patients,required"),
    ("Patient ID Unique",               "uniqueness_check",  None,                          "critical", "Healthcare",         "Patient IDs must be unique to prevent record merge errors.",                            "healthcare,patients,unique"),
    ("Date of Birth Valid",             "range_check",       {"min_value": "1900-01-01"},   "high",     "Healthcare",         "Date of birth must be after 1900 and not in the future.",                               "healthcare,dob,patients"),
    ("Clinical Data Freshness",         "freshness_check",   {"max_hours": 6},              "critical", "Healthcare",         "Clinical records must be refreshed within 6 hours for patient safety.",                 "healthcare,clinical,freshness"),
    # Marketing / GTM
    ("Campaign Start Before End",       "semantic_consistency_check",{"condition":"end_date IS NULL OR end_date >= start_date"},"high","Marketing,GTM","Campaign end date must be after start date.","campaigns,dates,gtm"),
    ("Lead Email Not Null",             "null_check",        None,                          "medium",   "GTM,Marketing",      "Marketing leads must have an email address.",                                            "leads,email,gtm"),
    ("Conversion Rate Bounded",         "range_check",       {"min_value": 0, "max_value": 100},"medium","Marketing,GTM","Conversion rates must be between 0 and 100 percent.","conversion,rate,gtm"),
    # Data governance / general
    ("Table Freshness (Daily)",         "freshness_check",   {"max_hours": 24},             "medium",   "Finance,Revenue,HR,Operations","Generic daily freshness check — table must be updated within 24 hours.","freshness,daily,general"),
    ("Primary Key Not Null",            "null_check",        None,                          "critical", "Finance,Revenue,HR,E-commerce,Operations,Healthcare,GTM","Primary key column must never be null.","pk,required,general"),
    ("Primary Key Unique",              "uniqueness_check",  None,                          "critical", "Finance,Revenue,HR,E-commerce,Operations,Healthcare,GTM","Primary key must be unique across the entire table.","pk,unique,general"),
]


def _fmt(t: RuleTemplate) -> dict:
    return {
        "template_id": t.template_id, "template_name": t.template_name,
        "description": t.description, "rule_type": t.rule_type,
        "default_config": t.default_config, "target_domains": t.target_domains,
        "target_industries": t.target_industries, "tags": t.tags,
        "author_email": t.author_email, "is_public": t.is_public,
        "downloads": t.downloads, "rating": round(t.rating, 1),
        "created_at": t.created_at.isoformat(),
    }


@router.post("/seed")
async def seed_templates(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    """Seed the marketplace with industry-standard rule templates (idempotent)."""
    added = 0
    for (name, rule_type, config, severity, industries, desc, tags) in _SEED_TEMPLATES:
        existing = await db.execute(select(RuleTemplate).where(RuleTemplate.template_name == name))
        if not existing.scalar_one_or_none():
            db.add(RuleTemplate(
                template_id=str(uuid.uuid4()),
                template_name=name,
                description=desc,
                rule_type=rule_type,
                default_config=config,
                target_domains=None,
                target_industries=industries,
                tags=tags,
                author_email="platform@dqg.io",
                is_public=True,
                downloads=0,
                rating=0.0,
                created_at=_now(),
            ))
            added += 1
    await db.commit()
    total_res = await db.execute(select(RuleTemplate).where(RuleTemplate.is_public == True))
    total = len(total_res.scalars().all())
    return {"seeded": added, "total_public_templates": total, "message": f"Added {added} new templates."}


@router.get("/templates/popular")
async def popular_templates(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(RuleTemplate).where(RuleTemplate.is_public == True)
        .order_by(desc(RuleTemplate.downloads)).limit(10)
    )
    return [_fmt(t) for t in result.scalars().all()]


@router.get("/templates/featured")
async def featured_templates(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(
        select(RuleTemplate).where(RuleTemplate.is_public == True, RuleTemplate.rating >= 4.5)
        .order_by(desc(RuleTemplate.rating)).limit(10)
    )
    return [_fmt(t) for t in result.scalars().all()]


@router.get("/templates")
async def list_templates(
    industry: Optional[str] = Query(None),
    domain: Optional[str] = Query(None),
    rule_type: Optional[str] = Query(None),
    is_public: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    q = select(RuleTemplate)
    if is_public is not None:
        q = q.where(RuleTemplate.is_public == is_public)
    if industry:
        q = q.where(RuleTemplate.target_industries.ilike(f"%{industry}%"))
    if domain:
        q = q.where(RuleTemplate.target_domains.ilike(f"%{domain}%"))
    if rule_type:
        q = q.where(RuleTemplate.rule_type == rule_type)
    result = await db.execute(q.order_by(desc(RuleTemplate.downloads)))
    return [_fmt(t) for t in result.scalars().all()]


@router.post("/templates", status_code=201)
async def create_template(payload: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    t = RuleTemplate(
        template_id=str(uuid.uuid4()),
        template_name=payload["template_name"],
        description=payload.get("description"),
        rule_type=payload["rule_type"],
        default_config=payload.get("default_config"),
        target_domains=payload.get("target_domains"),
        target_industries=payload.get("target_industries"),
        tags=payload.get("tags"),
        author_email=user.get("email"),
        is_public=payload.get("is_public", False),
    )
    db.add(t)
    await db.commit()
    return _fmt(t)


@router.get("/templates/recommended")
async def recommended_templates(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    """AI-powered template matching — recommend templates for a given asset (§65.4)."""
    from sqlalchemy import select
    from app.db.models import DataAsset, ColumnMetadata
    from app.services.llm_providers import get_provider_from_db

    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")

    # Get available public templates
    templates_res = await db.execute(
        select(RuleTemplate).where(RuleTemplate.is_public == True).limit(50)
    )
    templates = templates_res.scalars().all()
    if not templates:
        return {"asset_id": asset_id, "recommendations": []}

    # Get column names for context
    cols_res = await db.execute(select(ColumnMetadata.column_name, ColumnMetadata.data_type).where(ColumnMetadata.asset_id == asset_id))
    cols = [f"{r[0]} ({r[1] or 'unknown'})" for r in cols_res.all()]
    col_context = ", ".join(cols[:20]) if cols else "no profiling data available"

    template_list = "\n".join(
        f"- ID={t.template_id} | name={t.template_name} | type={t.rule_type} | industries={t.target_industries or 'all'}"
        for t in templates
    )
    prompt = (
        f"For the table '{asset.sf_table_name}' with columns: {col_context}\n"
        f"Rate these rule templates by relevance (0.0-1.0) and explain why.\n\n"
        f"Templates:\n{template_list}\n\n"
        f"Return JSON: [{{\"template_id\":\"...\",\"match_score\":0.0,\"reason\":\"...\"}}] top 5 only, highest score first."
    )
    try:
        provider = await get_provider_from_db(None, db)
        raw = await provider.complete(prompt, system="Return valid JSON only.")
        import json as _j
        start = raw.find("["); end = raw.rfind("]") + 1
        matches = _j.loads(raw[start:end]) if start >= 0 else []
        # Attach template details
        template_map = {t.template_id: t for t in templates}
        recs = []
        for m in matches[:5]:
            t = template_map.get(m.get("template_id"))
            if t:
                recs.append({**_fmt(t), "match_score": m.get("match_score", 0), "reason": m.get("reason", "")})
    except Exception:
        # Fallback: return top templates by download count
        recs = [_fmt(t) for t in sorted(templates, key=lambda x: x.downloads, reverse=True)[:5]]

    return {"asset_id": asset_id, "sf_table_name": asset.sf_table_name, "recommendations": recs}


@router.get("/templates/{template_id}")
async def get_template(template_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    t = (await db.execute(select(RuleTemplate).where(RuleTemplate.template_id == template_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")
    return _fmt(t)


@router.put("/templates/{template_id}")
async def update_template(template_id: str, payload: dict, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    t = (await db.execute(select(RuleTemplate).where(RuleTemplate.template_id == template_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")
    for field in ("template_name", "description", "default_config", "target_domains",
                  "target_industries", "tags", "is_public"):
        if field in payload:
            setattr(t, field, payload[field])
    await db.commit()
    return _fmt(t)


@router.post("/templates/{template_id}/import")
async def import_template(template_id: str, payload: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    t = (await db.execute(select(RuleTemplate).where(RuleTemplate.template_id == template_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")
    asset_id = payload.get("asset_id")
    if not asset_id:
        raise HTTPException(400, "asset_id is required")
    asset = (await db.execute(select(DataAsset).where(DataAsset.asset_id == asset_id))).scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")

    rule = DQRule(
        rule_id=str(uuid.uuid4()),
        rule_name=t.template_name,
        rule_description=t.description,
        domain_id=asset.domain_id,
        subdomain_id=asset.subdomain_id,
        asset_id=asset_id,
        rule_type=t.rule_type,
        rule_config=t.default_config,
        severity=payload.get("severity", "medium"),
        status="draft",
        created_by=user.get("email"),
    )
    db.add(rule)
    t.downloads = (t.downloads or 0) + 1
    await db.commit()
    return {"rule_id": rule.rule_id, "message": "Template imported as draft rule"}


@router.post("/templates/{template_id}/rate")
async def rate_template(template_id: str, payload: dict, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    t = (await db.execute(select(RuleTemplate).where(RuleTemplate.template_id == template_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")
    new_rating = max(0.0, min(5.0, float(payload.get("rating", 0))))
    t.rating = round((t.rating + new_rating) / 2, 1) if t.rating > 0 else new_rating
    await db.commit()
    return {"template_id": template_id, "rating": t.rating}
