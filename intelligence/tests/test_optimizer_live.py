"""Opt-in transfer optimizer tests against the real seeded MySQL database. Skipped unless MEDRIPPLE_LIVE_MYSQL=1.

PowerShell example, with the Compose MySQL published on 127.0.0.1:3307:
    $env:MEDRIPPLE_LIVE_MYSQL = "1"; $env:DATABASE_PORT = "3307"; $env:DATABASE_PASSWORD = "medripple_dev_only"
    .\\.venv\\Scripts\\python -m pytest tests/test_optimizer_live.py
"""

import os
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.config import load_settings
from app.main import build_data_source, create_app

pytestmark = pytest.mark.skipif(
    os.environ.get("MEDRIPPLE_LIVE_MYSQL") != "1",
    reason="Set MEDRIPPLE_LIVE_MYSQL=1 and DATABASE_* to test against the seeded MySQL database.",
)

VELLORE = {"destinationFacilityId": "PHC-VLR-001", "medicineId": "7", "quantity": 300, "horizonDays": 14}


@pytest.fixture(scope="module")
def settings():
    return load_settings({**os.environ, "DATA_SOURCE": "mysql"})


@pytest.fixture(scope="module")
def client(settings):
    return TestClient(create_app(data_source=build_data_source(settings)))


@pytest.fixture(scope="module")
def vellore(client):
    response = client.post("/plans/optimize", json=VELLORE)
    assert response.status_code == 200, response.text
    return response


def query(settings, sql, params=()):
    import pymysql

    connection = pymysql.connect(
        host=settings.database_host, port=settings.database_port, user=settings.database_user,
        password=settings.database_password, database=settings.database_name, init_command="SET SESSION TRANSACTION READ ONLY",
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.fetchall()
    finally:
        connection.close()


def table_state(settings):
    state = {table: query(settings, f"SELECT COUNT(*) FROM {table}")[0][0] for table in ("inventory", "batches", "replenishments", "transfers", "audit_events")}
    state["inventory_quantity"] = query(settings, "SELECT COALESCE(SUM(quantity_on_hand), 0) FROM inventory")[0][0]
    state["transfer_quantity"] = query(settings, "SELECT COALESCE(SUM(quantity), 0) FROM transfers")[0][0]
    state["checksums"] = query(settings, "CHECKSUM TABLE inventory, batches, transfers, audit_events")
    return state


def test_vellore_receives_a_safe_plan(vellore):
    body = vellore.json()
    assert (body["status"], body["medicine"]["unit"], body["dataContext"]["dataSource"]) == ("PROPOSED", "mL", "MYSQL")
    assert body["recipient"]["stockoutDayBefore"] == 1 and body["recipient"]["stockoutDayAfter"] is None
    assert body["solver"]["status"] in ("OPTIMAL", "FEASIBLE") and body["validation"]["passed"] is True


def test_plan_uses_existing_usable_database_batches(vellore, settings):
    body = vellore.json()
    use_by = date.fromisoformat(body["dataContext"]["asOfDate"]).toordinal() + body["horizonDays"] - 1
    for item in body["transfers"]:
        assert isinstance(item["batchId"], int)
        [(batch_number, medicine_id, expiry, quarantined)] = query(
            settings, "SELECT batch_number, medicine_id, expiry_date, quarantined FROM batches WHERE batch_id = %s", (item["batchId"],)
        )
        assert (batch_number, str(medicine_id), quarantined) == (item["batchNo"], body["medicine"]["id"], 0)
        assert expiry.toordinal() >= use_by and expiry.isoformat() == item["expiryDate"]
        [(status, on_hand)] = query(
            settings,
            "SELECT i.status, i.quantity_on_hand FROM inventory i JOIN facilities f ON f.facility_id = i.facility_id "
            "WHERE f.facility_code = %s AND i.batch_id = %s",
            (item["fromFacilityId"], item["batchId"]),
        )
        assert status == "AVAILABLE" and float(on_hand) >= item["quantity"]


def test_transfers_total_the_request_and_the_simulator_marks_the_plan_safe(vellore):
    body = vellore.json()
    assert round(sum(item["quantity"] for item in body["transfers"]), 2) == body["requestedQuantity"] == body["allocatedQuantity"] == 300.0
    comparison = body["simulation"]["comparison"]
    assert comparison["safeToRecommend"] is True and comparison["newRisks"] == []


def test_no_donor_becomes_critical(vellore):
    body = vellore.json()
    donors = {item["fromFacilityId"] for item in body["transfers"]}
    after = {item["facilityId"]: item for item in body["simulation"]["intervention"]["facilities"]}
    assert all(after[donor]["riskLabel"] != "CRITICAL" and after[donor]["stockoutDay"] is None for donor in donors)
    assert body["simulation"]["comparison"]["newCriticalFacilities"] == []


def test_repeated_requests_are_identical_and_the_database_is_unchanged(client, settings, vellore):
    before = table_state(settings)
    first, second = client.post("/plans/optimize", json=VELLORE), client.post("/plans/optimize", json=VELLORE)
    assert first.content == second.content == vellore.content
    assert first.json()["id"] == vellore.json()["id"]
    client.post("/plans/optimize", json={**VELLORE, "quantity": 10_000_000})
    assert table_state(settings) == before


def test_impossible_requests_return_no_safe_plan(client):
    huge = client.post("/plans/optimize", json={**VELLORE, "quantity": 10_000_000})
    assert (huge.status_code, huge.json()["error"]["code"]) == (422, "NO_SAFE_PLAN")
    info = huge.json()["error"]["details"]
    assert 0 < info["safeCapacity"] < 10_000_000 and info["unmetQuantity"] == round(10_000_000 - info["safeCapacity"], 2)
    no_cold_chain = client.post("/plans/optimize", json={**VELLORE, "destinationFacilityId": "PHC-TNJ-001"})
    assert (no_cold_chain.status_code, no_cold_chain.json()["error"]["details"]["safeCapacity"]) == (422, 0.0)


@pytest.mark.parametrize("destination, medicine, quantity, unit", [("SC-RMD-001", "10", 12, "count"), ("CHC-TRY-001", "1", 1000.5, "mg")])
def test_other_medicines_and_units_can_be_optimized(client, destination, medicine, quantity, unit):
    response = client.post("/plans/optimize", json={"destinationFacilityId": destination, "medicineId": medicine, "quantity": quantity, "horizonDays": 14})
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["unit"], body["medicine"]["id"], body["allocatedQuantity"]) == (unit, medicine, float(quantity))
    assert body["simulation"]["comparison"]["safeToRecommend"] is True
