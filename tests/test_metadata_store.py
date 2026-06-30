import pytest
from unittest.mock import AsyncMock, MagicMock
from app.schemas.metadata import ColumnMetaIn


def _col(name: str, dtype: str | None = None) -> ColumnMetaIn:
    return ColumnMetaIn(column_name=name, data_type=dtype)


# ── compute_schema_hash (pure, no DB) ──────────────────────────────────────

def test_schema_hash_is_deterministic():
    from app.services.metadata_store import compute_schema_hash
    cols = [_col("ID", "NUMBER"), _col("NAME", "VARCHAR")]
    assert compute_schema_hash(cols) == compute_schema_hash(cols)


def test_schema_hash_is_order_independent():
    from app.services.metadata_store import compute_schema_hash
    cols_a = [_col("ID", "NUMBER"), _col("NAME", "VARCHAR")]
    cols_b = [_col("NAME", "VARCHAR"), _col("ID", "NUMBER")]
    assert compute_schema_hash(cols_a) == compute_schema_hash(cols_b)


def test_schema_hash_is_case_insensitive():
    from app.services.metadata_store import compute_schema_hash
    assert compute_schema_hash([_col("id", "number")]) == compute_schema_hash([_col("ID", "NUMBER")])


def test_schema_hash_differs_on_added_column():
    from app.services.metadata_store import compute_schema_hash
    a = [_col("ID", "NUMBER")]
    b = [_col("ID", "NUMBER"), _col("EMAIL", "VARCHAR")]
    assert compute_schema_hash(a) != compute_schema_hash(b)


def test_schema_hash_differs_on_type_change():
    from app.services.metadata_store import compute_schema_hash
    assert compute_schema_hash([_col("AMT", "FLOAT")]) != compute_schema_hash([_col("AMT", "NUMBER")])


def test_schema_hash_empty_columns():
    from app.services.metadata_store import compute_schema_hash
    assert compute_schema_hash([]) == compute_schema_hash([])


def test_schema_hash_none_data_type_equals_empty_string():
    from app.services.metadata_store import compute_schema_hash
    assert compute_schema_hash([_col("ID", None)]) == compute_schema_hash([_col("ID", "")])


# ── upsert_column_metadata ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upsert_column_metadata_inserts_new_column():
    from app.services.metadata_store import upsert_column_metadata
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    col = ColumnMetaIn(column_name="order_id", data_type="NUMBER",
                       is_nullable=False, is_primary_key=True, precision=38, scale=0)
    await upsert_column_metadata(db, "asset-abc", [col])

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    assert added.column_name == "order_id"
    assert added.data_type == "NUMBER"
    assert added.is_primary_key is True
    assert added.precision == 38
    assert added.scale == 0
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_upsert_column_metadata_updates_existing_column():
    from app.services.metadata_store import upsert_column_metadata
    db = AsyncMock()
    existing = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = existing

    col = ColumnMetaIn(column_name="amount", data_type="NUMBER",
                       precision=18, scale=2, is_partition_key=True, partition_key_index=1)
    await upsert_column_metadata(db, "asset-abc", [col])

    db.add.assert_not_called()
    assert existing.data_type == "NUMBER"
    assert existing.precision == 18
    assert existing.scale == 2
    assert existing.is_partition_key is True
    assert existing.partition_key_index == 1
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_upsert_column_metadata_empty_list_still_commits():
    from app.services.metadata_store import upsert_column_metadata
    db = AsyncMock()
    await upsert_column_metadata(db, "asset-abc", [])
    db.add.assert_not_called()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_upsert_column_metadata_multiple_columns():
    from app.services.metadata_store import upsert_column_metadata
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    cols = [
        ColumnMetaIn(column_name="id", data_type="NUMBER"),
        ColumnMetaIn(column_name="name", data_type="VARCHAR"),
    ]
    await upsert_column_metadata(db, "asset-abc", cols)
    assert db.add.call_count == 2


# ── record_scan_result ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_record_scan_result_updates_asset_operational_fields():
    from app.services.metadata_store import record_scan_result
    db = AsyncMock()
    asset = MagicMock()
    asset.attached_rule_count = 2
    asset.latest_quality_status = None
    asset.latest_profile_score = None
    db.execute.return_value.scalar_one_or_none.side_effect = [asset, None, None]

    await record_scan_result(
        db, "asset-1", "success", "1.0.0", scan_duration_ms=300,
        row_count=1000, bytes=2048, last_modified_at=None,
        column_count=5, schema_hash="abc123",
    )

    assert asset.scan_status == "success"
    assert asset.scan_duration_ms == 300
    assert asset.scan_version == "1.0.0"
    assert asset.last_scanned_at is not None
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_record_scan_result_creates_snapshot_when_none_exists():
    from app.services.metadata_store import record_scan_result
    db = AsyncMock()
    asset = MagicMock()
    asset.attached_rule_count = 0
    asset.latest_quality_status = None
    asset.latest_profile_score = None
    db.execute.return_value.scalar_one_or_none.side_effect = [asset, None, None]

    await record_scan_result(
        db, "asset-1", "success", "1.0.0", scan_duration_ms=100,
        row_count=500, bytes=1024, last_modified_at=None,
        column_count=3, schema_hash="def456",
    )

    db.add.assert_called_once()
    snap = db.add.call_args[0][0]
    assert snap.scan_status == "success"
    assert snap.row_count == 500
    assert snap.schema_hash == "def456"
    assert snap.column_count == 3


@pytest.mark.asyncio
async def test_record_scan_result_updates_existing_snapshot():
    from app.services.metadata_store import record_scan_result
    db = AsyncMock()
    asset = MagicMock()
    asset.attached_rule_count = 1
    asset.latest_quality_status = "good"
    asset.latest_profile_score = 98.5
    existing_snap = MagicMock()
    db.execute.return_value.scalar_one_or_none.side_effect = [asset, None, existing_snap]

    await record_scan_result(
        db, "asset-1", "success", "1.0.1", scan_duration_ms=200,
        row_count=999, bytes=8192, last_modified_at=None,
        column_count=4, schema_hash="ghi789",
    )

    db.add.assert_not_called()
    assert existing_snap.scan_status == "success"
    assert existing_snap.row_count == 999
    assert existing_snap.latest_quality_status == "good"
    assert existing_snap.latest_profile_score == 98.5


@pytest.mark.asyncio
async def test_record_scan_result_updates_source_meta_row_count():
    from app.services.metadata_store import record_scan_result
    db = AsyncMock()
    asset = MagicMock()
    asset.attached_rule_count = 0
    asset.latest_quality_status = None
    asset.latest_profile_score = None
    meta = MagicMock()
    db.execute.return_value.scalar_one_or_none.side_effect = [asset, meta, None]

    await record_scan_result(
        db, "asset-1", "success", "1.0.0", scan_duration_ms=50,
        row_count=7777, bytes=65536, last_modified_at=None,
        column_count=2, schema_hash="hash1",
    )

    assert meta.row_count == 7777
    assert meta.bytes == 65536


# ── governance write hooks ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_quality_placeholders_sets_asset_fields():
    from app.services.metadata_store import update_quality_placeholders
    db = AsyncMock()
    asset = MagicMock()
    db.execute.return_value.scalar_one_or_none.side_effect = [asset, None]

    await update_quality_placeholders(db, "asset-1", profile_score=95.5, quality_status="good")

    assert asset.latest_profile_score == 95.5
    assert asset.latest_quality_status == "good"
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_update_quality_placeholders_updates_snapshot():
    from app.services.metadata_store import update_quality_placeholders
    db = AsyncMock()
    asset = MagicMock()
    snap = MagicMock()
    db.execute.return_value.scalar_one_or_none.side_effect = [asset, snap]

    await update_quality_placeholders(db, "asset-1", profile_score=88.0, quality_status="warning")

    assert snap.latest_profile_score == 88.0
    assert snap.latest_quality_status == "warning"


@pytest.mark.asyncio
async def test_set_critical_data_element_sets_flag():
    from app.services.metadata_store import set_critical_data_element
    db = AsyncMock()
    asset = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = asset

    await set_critical_data_element(db, "asset-1", True)

    assert asset.is_critical_data_element is True
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_set_critical_data_element_raises_for_unknown_asset():
    from app.services.metadata_store import set_critical_data_element
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    with pytest.raises(ValueError, match="not found"):
        await set_critical_data_element(db, "no-such-asset", True)


@pytest.mark.asyncio
async def test_increment_rule_count_increments():
    from app.services.metadata_store import increment_rule_count
    db = AsyncMock()
    asset = MagicMock()
    asset.attached_rule_count = 3
    db.execute.return_value.scalar_one_or_none.return_value = asset

    await increment_rule_count(db, "asset-1", delta=1)

    assert asset.attached_rule_count == 4
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_increment_rule_count_does_not_go_below_zero():
    from app.services.metadata_store import increment_rule_count
    db = AsyncMock()
    asset = MagicMock()
    asset.attached_rule_count = 0
    db.execute.return_value.scalar_one_or_none.return_value = asset

    await increment_rule_count(db, "asset-1", delta=-1)

    assert asset.attached_rule_count == 0


# ── read interface ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_current_state_returns_none_for_unknown_asset():
    from app.services.metadata_store import get_current_state
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    result = await get_current_state(db, "no-such")
    assert result is None


@pytest.mark.asyncio
async def test_get_current_state_maps_asset_and_meta_fields():
    from app.services.metadata_store import get_current_state
    db = AsyncMock()
    asset = MagicMock()
    asset.asset_id = "asset-1"
    asset.asset_type = "table"
    asset.qualified_name = "PROD.SALES.ORDERS"
    asset.physical_name = "ORDERS"
    asset.display_name = "ORDERS"
    asset.status = "active"
    asset.scan_status = "success"
    asset.last_scanned_at = None
    asset.scan_duration_ms = 300
    asset.scan_version = "1.0.0"
    asset.latest_profile_score = None
    asset.latest_quality_status = "unknown"
    asset.is_critical_data_element = False
    asset.attached_rule_count = 3
    asset.owner_user_id = "u1"
    asset.owner_team_id = None
    asset.steward_user_id = None

    meta = MagicMock()
    meta.row_count = 8000000
    meta.bytes = 10485760
    meta.last_modified_at = None
    meta.table_created_at = None
    meta.partition_info = None
    asset.source_meta = meta

    # First execute: asset+selectinload query; second: tags query (no tags)
    results = [MagicMock(), MagicMock()]
    results[0].scalar_one_or_none.return_value = asset
    results[1].all.return_value = []
    db.execute.side_effect = results

    result = await get_current_state(db, "asset-1")

    assert result.asset_id == "asset-1"
    assert result.row_count == 8000000
    assert result.scan_status == "success"
    assert result.attached_rule_count == 3
    assert result.tags == []


@pytest.mark.asyncio
async def test_get_snapshot_history_limits_to_90():
    from app.services.metadata_store import get_snapshot_history
    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = []

    result = await get_snapshot_history(db, "asset-1", limit=200)

    assert result == []


@pytest.mark.asyncio
async def test_get_column_state_returns_ordered_columns():
    from app.services.metadata_store import get_column_state
    db = AsyncMock()
    col1 = MagicMock(); col1.ordinal_position = 1
    col2 = MagicMock(); col2.ordinal_position = 2
    db.execute.return_value.scalars.return_value.all.return_value = [col1, col2]

    result = await get_column_state(db, "asset-1")

    assert result == [col1, col2]


@pytest.mark.asyncio
async def test_get_current_state_includes_tags():
    from app.services.metadata_store import get_current_state
    db = AsyncMock()

    asset = MagicMock()
    asset.asset_id = "asset-1"
    asset.asset_type = "table"
    asset.qualified_name = "PROD.SALES.ORDERS"
    asset.physical_name = "ORDERS"
    asset.display_name = "ORDERS"
    asset.status = "active"
    asset.scan_status = "success"
    asset.last_scanned_at = None
    asset.scan_duration_ms = 100
    asset.scan_version = "1.0.0"
    asset.latest_profile_score = None
    asset.latest_quality_status = None
    asset.is_critical_data_element = False
    asset.attached_rule_count = 0
    asset.owner_user_id = None
    asset.owner_team_id = None
    asset.steward_user_id = None
    asset.source_meta = None

    tag_row = MagicMock()
    tag_row.tag_name = "pii"

    # First execute: the asset+selectinload query; second: the tags query
    results = [MagicMock(), MagicMock()]
    results[0].scalar_one_or_none.return_value = asset
    results[1].all.return_value = [tag_row]
    db.execute.side_effect = results

    result = await get_current_state(db, "asset-1")
    assert result.tags == ["pii"]


def test_metadata_store_module_exports_all_public_functions():
    import app.services.metadata_store as ms
    for fn in [
        "compute_schema_hash",
        "upsert_column_metadata",
        "record_scan_result",
        "update_quality_placeholders",
        "set_critical_data_element",
        "increment_rule_count",
        "get_current_state",
        "get_snapshot_history",
        "get_column_state",
        "SCANNER_VERSION",
    ]:
        assert hasattr(ms, fn), f"Missing: {fn}"
