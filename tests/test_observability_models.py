from __future__ import annotations


def test_continuous_monitoring_config_columns():
    from app.db.models import ContinuousMonitoringConfig
    cols = set(ContinuousMonitoringConfig.__table__.columns.keys())
    assert cols == {
        "config_id", "connection_id", "interval_minutes", "is_enabled",
        "freshness_enabled", "volume_enabled", "schema_drift_enabled",
        "distribution_enabled", "last_run_at", "created_at", "updated_at",
    }
    assert ContinuousMonitoringConfig.__tablename__ == "continuous_monitoring_configs"


def test_volume_baseline_columns():
    from app.db.models import VolumeBaseline
    cols = set(VolumeBaseline.__table__.columns.keys())
    assert cols == {"asset_id", "readings", "updated_at"}
    assert VolumeBaseline.__tablename__ == "volume_baselines"


def test_distribution_baseline_columns():
    from app.db.models import DistributionBaseline
    cols = set(DistributionBaseline.__table__.columns.keys())
    assert cols == {
        "baseline_id", "asset_id", "column_name",
        "baseline_min", "baseline_max", "baseline_avg", "baseline_std_dev",
        "established_at",
    }
    assert DistributionBaseline.__tablename__ == "distribution_baselines"
