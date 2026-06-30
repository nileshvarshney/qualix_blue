# app/connectors/config.py
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.db.models import SnowflakeConnection


@dataclass
class ConnectorConfig:
    connection_id: str
    database_type: str
    connection_name: str = ""
    # Generic params
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None       # must be decrypted by caller before passing
    # Snowflake-specific
    account: Optional[str] = None
    warehouse: Optional[str] = None
    role: Optional[str] = None
    # BigQuery-specific
    project: Optional[str] = None
    key_file: Optional[str] = None       # path to service-account JSON
    # File / S3
    file_path: Optional[str] = None
    base_url: Optional[str] = None
    auth_type: Optional[str] = None
    connection_string: Optional[str] = None  # must be decrypted by caller
    # Source metadata
    environment: Optional[str] = None   # dev, stage, prod, test
    # Execution tuning
    connect_timeout: int = 30
    query_timeout: int = 300
    ssl_mode: Optional[str] = None   # psycopg2 sslmode: prefer|require|disable|verify-full


def from_orm(conn: "SnowflakeConnection") -> ConnectorConfig:
    """Build ConnectorConfig from a SnowflakeConnection ORM object.

    Caller is responsible for decrypting conn.password before calling this.
    """
    return ConnectorConfig(
        connection_id=conn.connection_id,
        database_type=conn.database_type or "snowflake",
        connection_name=conn.connection_name or "",
        host=conn.host,
        port=int(conn.port) if conn.port else None,
        database=conn.default_database,
        username=conn.sf_user,
        password=conn.password,
        account=conn.account,
        warehouse=conn.warehouse,
        role=conn.role,
        project=conn.project,
        key_file=conn.key_file,
        file_path=conn.file_path,
        base_url=conn.base_url,
        auth_type=conn.auth_type,
        connection_string=conn.connection_string,
        environment=getattr(conn, "environment", None),
    )
