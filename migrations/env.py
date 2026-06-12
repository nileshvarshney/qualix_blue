"""Alembic migration environment — uses the same Snowflake engine as the app.

Run migrations with:
    alembic upgrade head
    alembic downgrade -1
"""
from logging.config import fileConfig
from alembic import context
from alembic.ddl.impl import DefaultImpl

# Import all models so metadata is populated
from app.db.database import Base, engine
import app.db.models  # noqa: F401


class SnowflakeImpl(DefaultImpl):
    """Registers the 'snowflake' dialect with Alembic.

    snowflake-sqlalchemy provides the SQLAlchemy dialect but does not
    register an Alembic DefaultImpl, so without this Alembic raises
    `KeyError: 'snowflake'` when configuring the migration context.
    Snowflake auto-commits DDL per statement, matching the base
    `transactional_ddl = False` default.
    """

    __dialect__ = "snowflake"

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (generates SQL script)."""
    from app.db.database import _build_snowflake_url
    context.configure(
        url=str(_build_snowflake_url()),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against the live Snowflake database."""
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Snowflake tracks DDL changes per-statement, not in a transaction block
            transaction_per_migration=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
