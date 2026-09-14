"""In-memory MySQL rows for the optimizer tests, built on tests/simulator_support.py: no Docker, MySQL server or network.

The simulator's rows gain database batch IDs. Insulin (medicine 7, mL, cold chain) to PHC-SIM-001 over 14 days
(30 mL, 40 mL/day, safety stock 560, 600 mL DELAYED to day 8: stockout on day 1, 7 shortage days, 250 mL unmet):
- WH-SIM-001  warehouse, 5000 mL, no consumption and no safety stock row: retained floor = 10% x 5000 = 500,
              safe capacity 4500 mL; 210.25 km, 5.1 h, cold chain
- DH-SIM-001  lowest projected stock 700 on day 6, exactly its safety stock; floor 700 x 1.115 = 780.5: no safe capacity,
              although effective stock minus safety stock is 300
- CHC-SIM-001 route to PHC-SIM-001 is not cold-chain capable
- SC-SIM-001  SubCentre, remoteness 0.72: lowest projected stock 253, floor 147 x 1.71 = 251.37, so safe capacity
              is 1.63 mL (106 mL without the equity reserve); 310 km, 7.6 h, cold chain
"""

from datetime import date
from decimal import Decimal

from tests.simulator_support import (
    HOSPITAL,
    INSULIN,
    INVENTORY_ROWS,
    PHC,
    ROUTE_ROWS,
    SAFETY_ROWS,
    WAREHOUSE,
    FakeDatabase,
    inventory_row,
    mysql_client,
    safety_row,
)

BATCH_IDS = {
    "SIM-001-B02": 2, "SIM-007-B01": 13, "SIM-007-B02": 14, "SIM-007-B03": 15, "SIM-007-B04": 16, "SIM-007-B05": 17,
    "SIM-007-B06": 18, "SIM-007-B07": 19, "SIM-010-B02": 20,
}


def with_batch_ids(rows):
    return [row if "batch_id" in row else {**row, "batch_id": BATCH_IDS[row["batch_number"]]} for row in rows]


def replace_facility_rows(rows, facility_id, medicine_id, *replacements):
    kept = [row for row in rows if not (row["facility_id"] == facility_id and row["medicine_id"] == medicine_id)]
    return kept + list(replacements)


def optimizer_client(**tables):
    """A client over FakeDatabase rows with batch IDs; keyword tables replace the defaults."""
    tables["inventory"] = with_batch_ids(tables.get("inventory", INVENTORY_ROWS))
    return mysql_client(FakeDatabase(**tables))


def multi_source_tables():
    """A 700 mL warehouse (safe capacity 630) and a hospital with safety stock 300 (floor 334.5, safe capacity 365.5)."""
    return {
        "inventory": replace_facility_rows(INVENTORY_ROWS, WAREHOUSE, INSULIN, inventory_row(WAREHOUSE, INSULIN, "SIM-007-B02", "700.00")),
        "safety": [row for row in SAFETY_ROWS if not (row["facility_id"] == HOSPITAL and row["medicine_id"] == INSULIN)]
        + [safety_row(HOSPITAL, INSULIN, "300.00")],
    }


def split_batch_tables():
    """Warehouse insulin in two batches: 200.5 mL expiring first, then 499.5 mL (safe capacity 630 mL)."""
    return {
        "inventory": replace_facility_rows(
            INVENTORY_ROWS, WAREHOUSE, INSULIN,
            inventory_row(WAREHOUSE, INSULIN, "SIM-007-B02", "499.50"),
            inventory_row(WAREHOUSE, INSULIN, "SIM-007-B01", "200.50", expiry=date(2028, 2, 29)),
        ),
    }


def routes_without(origin, destination):
    return [row for row in ROUTE_ROWS if not (row["origin_facility_id"] == origin and row["destination_facility_id"] == destination)]


def no_warehouse_route_tables():
    """Only the subcentre can reach PHC-SIM-001 safely, so its equity reserve decides the outcome."""
    return {"routes": routes_without(WAREHOUSE, PHC)}


def optimize(client, destination, quantity, medicine="7", horizon=14):
    return client.post(
        "/plans/optimize", json={"destinationFacilityId": destination, "medicineId": medicine, "quantity": quantity, "horizonDays": horizon}
    )


def candidate(body, facility_id):
    return next(item for item in body["candidates"] if item["facilityId"] == facility_id)


def details(response):
    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "NO_SAFE_PLAN"
    return error["details"]


def quantity(value):
    return Decimal(value)
