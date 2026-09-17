from fastapi.testclient import TestClient

from app.config import POSTGRES, Settings, load_settings
from app.main import build_data_source, create_app
from app.postgres_store import PostgreSQLDataSource
from tests.test_mysql_store import FakeDatabase, unavailable_connector


def test_postgres_mode_selects_database_not_fixture():
    settings = load_settings({"DATA_SOURCE": "postgres", "DATABASE_URL": "postgresql://unused/test"})
    source = build_data_source(settings, FakeDatabase().connect)
    assert isinstance(source, PostgreSQLDataSource)
    assert source.name == "POSTGRES"
    snapshot = source.store_for("PHC-TEST-001", "7")
    assert snapshot.get_inventory("PHC-TEST-001", "7").effective_stock(snapshot.as_of) == 33.75


def test_postgres_failure_never_becomes_fixture_forecast():
    settings = Settings(data_source=POSTGRES, database_url="postgresql://unused/test")
    source = build_data_source(settings, unavailable_connector())
    import pytest
    from app.mysql_store import DatabaseUnavailableError
    with pytest.raises(DatabaseUnavailableError):
        source.store_for("PHC-TEST-001", "7")
