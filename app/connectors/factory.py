# app/connectors/factory.py
from __future__ import annotations
from app.connectors.base import BaseConnector
from app.connectors.config import ConnectorConfig
from app.connectors.errors import ConnectorNotImplementedError

_REGISTRY: dict[str, type[BaseConnector]] = {}


def register_adapter(db_type: str, adapter_cls: type[BaseConnector]) -> None:
    _REGISTRY[db_type.lower()] = adapter_cls


def get_connector(config: ConnectorConfig) -> BaseConnector:
    db_type = (config.database_type or "").lower()
    adapter_cls = _REGISTRY.get(db_type)
    if adapter_cls is None:
        raise ConnectorNotImplementedError(
            f"No connector registered for database type '{db_type}'.",
            suggestion=f"Supported types: {sorted(_REGISTRY.keys())}",
        )
    return adapter_cls(config)


# Adapters are registered in app/connectors/__init__.py on package import.
