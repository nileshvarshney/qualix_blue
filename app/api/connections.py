from __future__ import annotations
from typing import Optional
import asyncio
import re
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.db.models import SnowflakeConnection
from app.core.security import get_current_user
from app.core.encryption import encrypt, decrypt

logger = logging.getLogger("dataguard.connections")
router = APIRouter(prefix="/connections", tags=["Connections"])

MASKED = "***MASKED***"
SUPPORTED_DB_TYPES = ("snowflake", "postgresql", "mysql", "bigquery", "redshift", "mongodb", "csv", "api")

_IDENT_RE = re.compile(r'^[A-Za-z0-9_$]+$')


def _safe_ident(value: str, label: str) -> str:
    if not value or not _IDENT_RE.match(value):
        raise HTTPException(
            400,
            f"Invalid {label} '{value}': identifiers must contain only "
            "letters, digits, underscores, or dollar signs.",
        )
    return value


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConnectionCreate(BaseModel):
    connection_name: str
    database_type: str = "snowflake"
    # Snowflake fields
    account: Optional[str] = None
    sf_user: Optional[str] = None
    password: Optional[str] = None
    warehouse: str = "DQ_EXECUTION_WH"
    role: Optional[str] = None
    default_database: Optional[str] = None
    default_schema: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True
    connection_type: str = "named"
    is_primary_target: bool = False
    # Multi-database fields
    host: Optional[str] = None
    port: Optional[int] = None
    project: Optional[str] = None
    key_file: Optional[str] = None
    connection_string: Optional[str] = None
    file_path: Optional[str] = None
    delimiter: Optional[str] = None
    base_url: Optional[str] = None
    auth_type: Optional[str] = None


class ConnectionUpdate(BaseModel):
    connection_name: Optional[str] = None
    database_type: Optional[str] = None
    account: Optional[str] = None
    sf_user: Optional[str] = None
    password: Optional[str] = None
    warehouse: Optional[str] = None
    role: Optional[str] = None
    default_database: Optional[str] = None
    default_schema: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    connection_type: Optional[str] = None
    is_primary_target: Optional[bool] = None
    host: Optional[str] = None
    port: Optional[int] = None
    project: Optional[str] = None
    key_file: Optional[str] = None
    connection_string: Optional[str] = None
    file_path: Optional[str] = None
    delimiter: Optional[str] = None
    base_url: Optional[str] = None
    auth_type: Optional[str] = None


def _mask(conn: SnowflakeConnection) -> dict:
    return {
        "connection_id": conn.connection_id,
        "connection_name": conn.connection_name,
        "database_type": conn.database_type or "snowflake",
        "account": conn.account,
        "sf_user": conn.sf_user,
        "password": MASKED if conn.password else None,
        "has_password": bool(conn.password),
        "warehouse": conn.warehouse,
        "role": conn.role,
        "default_database": conn.default_database,
        "default_schema": conn.default_schema,
        "description": conn.description,
        "is_active": conn.is_active,
        "connection_type": conn.connection_type,
        "is_primary_target": conn.is_primary_target,
        # Multi-database fields
        "host": conn.host,
        "port": conn.port,
        "project": conn.project,
        "connection_string": MASKED if conn.connection_string else None,
        "file_path": conn.file_path,
        "delimiter": conn.delimiter,
        "base_url": conn.base_url,
        "auth_type": conn.auth_type,
        "last_test_status": conn.last_test_status,
        "last_tested_at": conn.last_tested_at.isoformat() if conn.last_tested_at else None,
        "created_at": conn.created_at.isoformat(),
        "updated_at": conn.updated_at.isoformat(),
    }


def _open_connector(conn: SnowflakeConnection):
    import snowflake.connector
    kwargs = dict(
        account=conn.account,
        user=conn.sf_user,
        password=decrypt(conn.password) or "",
        warehouse=conn.warehouse,
    )
    if conn.role:
        kwargs["role"] = conn.role
    if conn.default_database:
        kwargs["database"] = conn.default_database
    if conn.default_schema:
        kwargs["schema"] = conn.default_schema
    return snowflake.connector.connect(**kwargs)


# ── Diagnostic Test (multi-step with detailed results) ────────────────────────

class TestStep(BaseModel):
    label: str
    status: str  # ok | fail | skip
    detail: str


class ConnectionTestResult(BaseModel):
    success: bool
    status: str  # active | error | inactive
    steps: list[TestStep]
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    suggestion: Optional[str] = None
    latency_ms: Optional[int] = None


class ConnectionTestCredentials(BaseModel):
    account: Optional[str] = None
    sf_user: Optional[str] = None
    password: Optional[str] = None
    warehouse: str = "DQ_EXECUTION_WH"
    role: Optional[str] = None
    default_database: Optional[str] = None
    default_schema: Optional[str] = None
    database_type: str = "snowflake"
    host: Optional[str] = None
    port: Optional[int] = None
    project: Optional[str] = None
    connection_string: Optional[str] = None
    file_path: Optional[str] = None
    base_url: Optional[str] = None


def _test_snowflake_sync(payload) -> dict:
    import snowflake.connector
    import time

    steps = []
    t0 = time.time()

    # Step 1: Validate required fields
    missing = []
    if not payload.account:
        missing.append("Account")
    if not payload.sf_user:
        missing.append("Username")
    if not payload.password:
        missing.append("Password")

    if missing:
        steps.append({"label": "Field validation", "status": "fail", "detail": f"Missing: {', '.join(missing)}"})
        return {
            "success": False, "status": "error", "steps": steps,
            "error_code": "MISSING_FIELDS",
            "error_message": f"Required fields are missing: {', '.join(missing)}",
            "suggestion": "Fill in all required Snowflake connection fields."
        }
    steps.append({"label": "Field validation", "status": "ok", "detail": "All required fields present"})

    # Step 2: Account format
    account = payload.account.replace(".snowflakecomputing.com", "")
    if " " in account or len(account) < 5:
        steps.append({"label": "Account format", "status": "fail", "detail": f'"{account}" is not a valid identifier'})
        return {
            "success": False, "status": "error", "steps": steps,
            "error_code": "INVALID_ACCOUNT",
            "error_message": f"Invalid account identifier: {account}",
            "suggestion": "Find your account in your Snowflake URL: https://<account>.snowflakecomputing.com"
        }
    steps.append({"label": "Account format", "status": "ok", "detail": f"Identifier looks valid: {account}"})

    # Step 3: Connect
    try:
        kwargs = dict(
            account=account,
            user=payload.sf_user,
            password=payload.password,
            warehouse=payload.warehouse or "DQ_EXECUTION_WH",
        )
        if payload.role:
            kwargs["role"] = payload.role
        if payload.default_database:
            kwargs["database"] = payload.default_database
        if payload.default_schema:
            kwargs["schema"] = payload.default_schema

        sf = snowflake.connector.connect(**kwargs)
        steps.append({"label": "Authentication", "status": "ok", "detail": f'Credentials verified for user "{payload.sf_user}"'})

        cur = sf.cursor()
        cur.execute("SELECT CURRENT_VERSION(), CURRENT_ROLE(), CURRENT_WAREHOUSE(), CURRENT_DATABASE()")
        row = cur.fetchone()
        cur.close()
        sf.close()

        latency = int((time.time() - t0) * 1000)
        steps.append({"label": "Warehouse access", "status": "ok", "detail": f'Warehouse "{row[2]}" accessible'})
        if row[3]:
            steps.append({"label": "Database access", "status": "ok", "detail": f'Database "{row[3]}" accessible'})
        steps.append({"label": "Connection verified", "status": "ok", "detail": f"Snowflake v{row[0]}, role={row[1]}"})

        return {"success": True, "status": "active", "steps": steps, "latency_ms": latency}

    except Exception as e:
        err = str(e).lower()
        latency = int((time.time() - t0) * 1000)

        if "incorrect username or password" in err or "390100" in str(e):
            steps.append({"label": "Authentication", "status": "fail", "detail": f'Incorrect credentials for "{payload.sf_user}"'})
            return {
                "success": False, "status": "error", "steps": steps,
                "error_code": "AUTH_FAILED",
                "error_message": "Incorrect username or password.",
                "suggestion": "Verify your Snowflake username and password. Usernames are case-sensitive.",
                "latency_ms": latency
            }
        if "warehouse" in err and ("not exist" in err or "not found" in err):
            steps.append({"label": "Authentication", "status": "ok", "detail": "Credentials accepted"})
            steps.append({"label": "Warehouse access", "status": "fail", "detail": f'Warehouse "{payload.warehouse}" not found'})
            return {
                "success": False, "status": "error", "steps": steps,
                "error_code": "WAREHOUSE_NOT_FOUND",
                "error_message": f'Warehouse "{payload.warehouse}" not found or not accessible.',
                "suggestion": "Check the warehouse name and ensure your role has USAGE privilege.",
                "latency_ms": latency
            }
        if "role" in err and ("not exist" in err or "not granted" in err):
            steps.append({"label": "Role check", "status": "fail", "detail": f'Role "{payload.role}" not available'})
            return {
                "success": False, "status": "error", "steps": steps,
                "error_code": "ROLE_NOT_GRANTED",
                "error_message": f'Role "{payload.role}" is not granted to this user.',
                "suggestion": "Use a role granted to your user, or leave empty for the default role.",
                "latency_ms": latency
            }
        if "mfa" in err or "multi-factor" in err:
            steps.append({"label": "Authentication", "status": "fail", "detail": "MFA required — password-only auth is blocked"})
            return {
                "success": False, "status": "error", "steps": steps,
                "error_code": "MFA_REQUIRED",
                "error_message": "Multi-Factor Authentication is required for this user.",
                "suggestion": "Use a service account with key-pair auth, or disable MFA for this user.",
                "latency_ms": latency
            }

        steps.append({"label": "Connection", "status": "fail", "detail": str(e)[:200]})
        return {
            "success": False, "status": "error", "steps": steps,
            "error_code": "CONNECTION_ERROR",
            "error_message": str(e)[:300],
            "suggestion": "Check credentials, network connectivity, and firewall rules.",
            "latency_ms": latency
        }


def _test_generic_sync(payload, db_type: str) -> dict:
    steps = []

    required_by_type = {
        "postgresql": ["host", "default_database"],
        "mysql": ["host", "default_database"],
        "redshift": ["host", "default_database", "sf_user"],
        "bigquery": ["project"],
        "mongodb": ["connection_string", "default_database"],
        "csv": ["file_path"],
        "api": ["base_url"],
    }
    labels = {
        "host": "Host", "default_database": "Database", "sf_user": "Username",
        "project": "Project ID", "connection_string": "Connection URI",
        "file_path": "File Path", "base_url": "Base URL"
    }

    required = required_by_type.get(db_type, [])
    missing = [k for k in required if not getattr(payload, k, None)]

    if missing:
        steps.append({"label": "Field validation", "status": "fail", "detail": f"Missing: {', '.join(labels.get(k, k) for k in missing)}"})
        return {
            "success": False, "status": "error", "steps": steps,
            "error_code": "MISSING_FIELDS",
            "error_message": f"Required fields missing: {', '.join(labels.get(k, k) for k in missing)}",
            "suggestion": "Edit the connection and fill in all required fields."
        }
    steps.append({"label": "Field validation", "status": "ok", "detail": "All required fields present"})

    if db_type == "csv":
        fp = payload.file_path or ""
        steps.append({"label": "File path check", "status": "ok", "detail": f"Path accepted: {fp}"})
        steps.append({"label": "Configuration", "status": "ok", "detail": "File access will be validated at query time"})
        return {"success": True, "status": "active", "steps": steps}

    if db_type == "api":
        steps.append({"label": "Endpoint format", "status": "ok", "detail": f"Base URL: {payload.base_url}"})
        steps.append({"label": "Configuration", "status": "ok", "detail": "API access will be validated at query time"})
        return {"success": True, "status": "active", "steps": steps}

    # For DB types needing drivers
    user_info = f"User: {payload.sf_user}, " if payload.sf_user else ""
    steps.append({
        "label": "Credential format", "status": "ok",
        "detail": f"{user_info}Host: {payload.host or 'N/A'}, DB: {payload.default_database or 'N/A'}"
    })
    steps.append({
        "label": "Driver test", "status": "skip",
        "detail": f"Full {db_type.upper()} connection testing requires a database driver on the server."
    })

    return {
        "success": False, "status": "inactive", "steps": steps,
        "error_code": "DRIVER_NOT_INSTALLED",
        "error_message": f"Live {db_type.upper()} connection testing is not yet configured.",
        "suggestion": f'Install the {db_type} driver package to enable live testing.'
    }


@router.post("/test-credentials")
async def test_credentials(payload: ConnectionTestCredentials):
    """Test connection credentials inline with multi-step diagnostics."""
    db_type = payload.database_type or "snowflake"
    if db_type not in SUPPORTED_DB_TYPES:
        return {"success": False, "status": "error", "steps": [], "error_message": f"Unsupported database type: {db_type}"}

    if db_type == "snowflake":
        return await asyncio.to_thread(_test_snowflake_sync, payload)
    else:
        return await asyncio.to_thread(_test_generic_sync, payload, db_type)


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.post("")
async def create_connection(
    payload: ConnectionCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    if payload.database_type not in SUPPORTED_DB_TYPES:
        raise HTTPException(400, f"Unsupported database type: {payload.database_type}")
    data = payload.model_dump()
    if data.get("password"):
        data["password"] = encrypt(data["password"])
    if data.get("connection_string"):
        data["connection_string"] = encrypt(data["connection_string"])
    # For non-Snowflake types, provide defaults for required Snowflake columns
    if payload.database_type != "snowflake":
        data.setdefault("account", payload.host or payload.base_url or payload.project or "N/A")
        data.setdefault("sf_user", data.get("sf_user") or "N/A")
    conn = SnowflakeConnection(connection_id=str(uuid.uuid4()), **data)
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return _mask(conn)


@router.get("")
async def list_connections(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
    database_type: Optional[str] = None,
):
    stmt = select(SnowflakeConnection).order_by(SnowflakeConnection.connection_name)
    if database_type:
        stmt = stmt.where(SnowflakeConnection.database_type == database_type)
    result = await db.execute(stmt)
    return [_mask(c) for c in result.scalars().all()]


@router.get("/supported-types")
async def supported_types():
    """Return the list of supported database connection types."""
    return {
        "types": [
            {"id": "snowflake", "name": "Snowflake", "icon": "snowflake", "category": "cloud"},
            {"id": "postgresql", "name": "PostgreSQL", "icon": "database", "category": "relational"},
            {"id": "mysql", "name": "MySQL", "icon": "database", "category": "relational"},
            {"id": "bigquery", "name": "BigQuery", "icon": "cloud", "category": "cloud"},
            {"id": "redshift", "name": "Redshift", "icon": "cloud", "category": "cloud"},
            {"id": "mongodb", "name": "MongoDB", "icon": "database", "category": "nosql"},
            {"id": "csv", "name": "CSV / File", "icon": "file", "category": "file"},
            {"id": "api", "name": "REST API", "icon": "globe", "category": "api"},
        ]
    }


# ── Primary Target ────────────────────────────────────────────────────────────

@router.get("/primary-target")
async def get_primary_target(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.is_primary_target == True)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "No primary target connection configured")
    return _mask(conn)


@router.get("/{connection_id}")
async def get_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")
    return _mask(conn)


@router.put("/{connection_id}")
async def update_connection(
    connection_id: str,
    payload: ConnectionUpdate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "password":
            if value == MASKED:
                continue
            value = encrypt(value) if value else value
        if field == "connection_string":
            if value == MASKED:
                continue
            value = encrypt(value) if value else value
        setattr(conn, field, value)
    conn.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(conn)
    return _mask(conn)


@router.delete("/{connection_id}")
async def delete_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")
    await db.delete(conn)
    await db.commit()
    return {"message": "Connection deleted"}


@router.put("/{connection_id}/set-primary-target")
async def set_primary_target(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")

    existing = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.is_primary_target == True)
    )
    for old in existing.scalars().all():
        old.is_primary_target = False
        old.connection_type = "named"

    conn.is_primary_target = True
    conn.connection_type = "target"
    conn.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(conn)
    return _mask(conn)


# ── Test saved connection ────────────────────────────────────────────────────

@router.post("/{connection_id}/test")
async def test_connection(connection_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")

    db_type = conn.database_type or "snowflake"

    if db_type == "snowflake":
        if not conn.password:
            return {"success": False, "status": "error", "steps": [{"label": "Password", "status": "fail", "detail": "No password saved"}]}

        class _Payload:
            pass

        p = _Payload()
        p.account = conn.account
        p.sf_user = conn.sf_user
        p.password = decrypt(conn.password) or ""
        p.warehouse = conn.warehouse
        p.role = conn.role
        p.default_database = conn.default_database
        p.default_schema = conn.default_schema
        test_result = await asyncio.to_thread(_test_snowflake_sync, p)
    else:
        class _Payload:
            pass

        p = _Payload()
        for attr in ("host", "port", "sf_user", "default_database", "project",
                     "file_path", "base_url", "connection_string"):
            setattr(p, attr, getattr(conn, attr, None))
        if conn.connection_string:
            p.connection_string = decrypt(conn.connection_string)
        test_result = await asyncio.to_thread(_test_generic_sync, p, db_type)

    # Update connection status
    conn.last_test_status = "active" if test_result.get("success") else "error"
    conn.last_tested_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()

    return test_result


# ── Browse (Snowflake-specific) ──────────────────────────────────────────────

async def _get_conn_or_404(connection_id: str, db: AsyncSession) -> SnowflakeConnection:
    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")
    return conn


@router.get("/{connection_id}/databases")
async def browse_databases(connection_id: str, db: AsyncSession = Depends(get_db)):
    conn = await _get_conn_or_404(connection_id, db)

    def _run():
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute("SHOW DATABASES")
        rows = cur.fetchall()
        col_names = [d[0].lower() for d in cur.description]
        cur.close()
        sf.close()
        return [dict(zip(col_names, r)) for r in rows]

    try:
        dbs = await asyncio.to_thread(_run)
        return {
            "databases": [
                {
                    "name": d.get("name", ""),
                    "owner": d.get("owner", ""),
                    "comment": d.get("comment", ""),
                    "created_on": str(d.get("created_on", "")),
                }
                for d in dbs
                if d.get("name", "").upper() not in ("SNOWFLAKE", "SNOWFLAKE_SAMPLE_DATA")
            ]
        }
    except Exception as e:
        return {"databases": [], "error": str(e)}


@router.get("/{connection_id}/schemas")
async def browse_schemas(
    connection_id: str,
    database: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    conn = await _get_conn_or_404(connection_id, db)
    db_safe = _safe_ident(database, "database")

    def _run():
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute(f'SHOW SCHEMAS IN DATABASE "{db_safe}"')
        rows = cur.fetchall()
        col_names = [d[0].lower() for d in cur.description]
        cur.close()
        sf.close()
        return [dict(zip(col_names, r)) for r in rows]

    try:
        schemas = await asyncio.to_thread(_run)
        return {
            "schemas": [
                {
                    "name": s.get("name", ""),
                    "owner": s.get("owner", ""),
                    "comment": s.get("comment", ""),
                }
                for s in schemas
                if s.get("name", "").upper() != "INFORMATION_SCHEMA"
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        return {"schemas": [], "error": str(e)}


@router.get("/{connection_id}/columns")
async def browse_columns(
    connection_id: str,
    database: str = Query(...),
    schema: str = Query(...),
    table: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    conn = await _get_conn_or_404(connection_id, db)
    db_safe = _safe_ident(database, "database")
    schema_safe = _safe_ident(schema, "schema")
    table_safe = _safe_ident(table, "table")

    def _run():
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute(f"""
            SELECT column_name, data_type, is_nullable, ordinal_position,
                   COALESCE(comment, '') AS comment
            FROM "{db_safe}".INFORMATION_SCHEMA.COLUMNS
            WHERE UPPER(table_schema) = '{schema_safe.upper()}'
              AND UPPER(table_name)   = '{table_safe.upper()}'
            ORDER BY ordinal_position
        """)
        rows = cur.fetchall()
        col_names = [d[0].lower() for d in cur.description]
        cur.close()
        sf.close()
        return [dict(zip(col_names, r)) for r in rows]

    try:
        columns = await asyncio.to_thread(_run)
        return {"columns": columns, "database": database, "schema": schema, "table": table}
    except HTTPException:
        raise
    except Exception as e:
        return {"columns": [], "error": str(e)}


@router.get("/{connection_id}/tables")
async def browse_tables(
    connection_id: str,
    database: str = Query(...),
    schema: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    conn = await _get_conn_or_404(connection_id, db)
    db_safe = _safe_ident(database, "database")
    schema_safe = _safe_ident(schema, "schema")

    def _run():
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute(f"""
            SELECT table_name, table_type,
                   COALESCE(row_count, 0)  AS row_count,
                   COALESCE(bytes, 0)      AS bytes,
                   COALESCE(comment, '')   AS comment,
                   last_altered
            FROM "{db_safe}".INFORMATION_SCHEMA.TABLES
            WHERE UPPER(table_schema) = '{schema_safe.upper()}'
            ORDER BY table_name
        """)
        rows = cur.fetchall()
        col_names = [d[0].lower() for d in cur.description]
        tables = [dict(zip(col_names, r)) for r in rows]

        view_defs: dict[str, str] = {}
        view_names = [t["table_name"] for t in tables if str(t.get("table_type", "")).upper() == "VIEW"]
        if view_names:
            cur.execute(f"""
                SELECT table_name, view_definition
                FROM "{db_safe}".INFORMATION_SCHEMA.VIEWS
                WHERE UPPER(table_schema) = '{schema_safe.upper()}'
            """)
            for vrow in cur.fetchall():
                view_defs[vrow[0].upper()] = vrow[1] or ""

        cur.close()
        sf.close()

        for t in tables:
            t["view_definition"] = view_defs.get(t["table_name"].upper(), "") or None
        return tables

    try:
        tables = await asyncio.to_thread(_run)
        return {"tables": tables, "database": database, "schema": schema}
    except HTTPException:
        raise
    except Exception as e:
        return {"tables": [], "error": str(e)}


# ── Data Preview (for Live Data Browser) ─────────────────────────────────────

@router.get("/{connection_id}/preview")
async def preview_data(
    connection_id: str,
    database: str = Query(...),
    schema: str = Query(...),
    table: str = Query(...),
    limit: int = Query(25, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Preview the first N rows of a table — powers the Live Data Browser."""
    conn = await _get_conn_or_404(connection_id, db)
    db_safe = _safe_ident(database, "database")
    schema_safe = _safe_ident(schema, "schema")
    table_safe = _safe_ident(table, "table")

    def _run():
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute(f'SELECT * FROM "{db_safe}"."{schema_safe}"."{table_safe}" LIMIT {limit}')
        col_names = [d[0] for d in cur.description]
        col_types = [d[1].__name__ if hasattr(d[1], '__name__') else str(d[1]) for d in cur.description]
        rows = [list(r) for r in cur.fetchall()]
        cur.close()
        sf.close()
        return {"columns": col_names, "column_types": col_types, "rows": rows, "row_count": len(rows)}

    try:
        data = await asyncio.to_thread(_run)
        return {"data": data, "database": database, "schema": schema, "table": table}
    except HTTPException:
        raise
    except Exception as e:
        return {"data": None, "error": str(e)}
