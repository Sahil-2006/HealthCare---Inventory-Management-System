-- MEDRIPPLE deterministic Supabase dataset
--
-- Run this once, after schema-postgres.sql, in Supabase SQL Editor. It is
-- intentionally additive: re-running it never resets inventory, users,
-- decisions, or verified safety policies. These are simulated records.

BEGIN;

INSERT INTO facilities (
  facility_code, name, facility_type, region, latitude, longitude,
  population_served, remoteness_score, storage_capacity_ml, has_cold_chain
) VALUES
  ('WH-CENTRAL-001', 'Central District Store', 'Warehouse', 'MEDRIPPLE District', 18.522000, 73.857000, 0, 0.05, 250000, TRUE),
  ('DH-CENTRAL-001', 'District Hospital', 'DistrictHospital', 'MEDRIPPLE District', 18.535000, 73.848000, 120000, 0.15, 120000, TRUE),
  ('CHC-RIVER-001', 'River CHC', 'CHC', 'MEDRIPPLE District', 18.501000, 73.891000, 45000, 0.55, 50000, TRUE),
  ('PHC-NAV-001', 'Navjeevan PHC', 'PHC', 'MEDRIPPLE District', 18.472000, 73.928000, 12000, 0.80, 15000, TRUE)
ON CONFLICT (facility_code) DO NOTHING;

INSERT INTO medicines (
  generic_name, strength_value, strength_unit, form, base_unit,
  storage_temp_min_c, storage_temp_max_c, requires_cold_chain,
  criticality_level, shelf_life_days
) VALUES ('Human Insulin', 100, 'IU/mL', 'Vial', 'mL', 2, 8, TRUE, 'HIGH', 730)
ON CONFLICT (generic_name, strength_value, strength_unit, form) DO NOTHING;

WITH ids AS (
  SELECT
    (SELECT medicine_id FROM medicines WHERE generic_name = 'Human Insulin' AND strength_value = 100 AND strength_unit = 'IU/mL' AND form = 'Vial') AS medicine_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'WH-CENTRAL-001') AS central_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'DH-CENTRAL-001') AS hospital_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'CHC-RIVER-001') AS river_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'PHC-NAV-001') AS navjeevan_id
), batches_to_insert AS (
  INSERT INTO batches (medicine_id, batch_number, manufacture_date, expiry_date, quantity_received, supplier_name)
  SELECT medicine_id, batch_number, manufacture_date, expiry_date, quantity_received, 'MEDRIPPLE Demonstration Supply'
  FROM ids CROSS JOIN (VALUES
    ('INS-CENTRAL-001', DATE '2026-01-01', DATE '2027-12-31', 620.00),
    ('INS-HOSPITAL-001', DATE '2026-01-01', DATE '2027-12-31', 260.00),
    ('INS-RIVER-001', DATE '2026-01-01', DATE '2027-11-30', 100.00),
    ('INS-NAV-001', DATE '2026-01-01', DATE '2027-10-31', 22.00)
  ) AS seed(batch_number, manufacture_date, expiry_date, quantity_received)
  WHERE NOT EXISTS (SELECT 1 FROM batches existing WHERE existing.batch_number = seed.batch_number)
  RETURNING batch_id, batch_number
), batch_ids AS (
  SELECT batch_id, batch_number FROM batches WHERE batch_number IN ('INS-CENTRAL-001', 'INS-HOSPITAL-001', 'INS-RIVER-001', 'INS-NAV-001')
  UNION ALL
  SELECT batch_id, batch_number FROM batches_to_insert
), inventory_seed AS (
  SELECT central_id AS facility_id, (SELECT batch_id FROM batch_ids WHERE batch_number = 'INS-CENTRAL-001') AS batch_id, 620.00::DECIMAL AS quantity FROM ids
  UNION ALL SELECT hospital_id, (SELECT batch_id FROM batch_ids WHERE batch_number = 'INS-HOSPITAL-001'), 260.00::DECIMAL FROM ids
  UNION ALL SELECT river_id, (SELECT batch_id FROM batch_ids WHERE batch_number = 'INS-RIVER-001'), 100.00::DECIMAL FROM ids
  UNION ALL SELECT navjeevan_id, (SELECT batch_id FROM batch_ids WHERE batch_number = 'INS-NAV-001'), 22.00::DECIMAL FROM ids
)
INSERT INTO inventory (facility_id, batch_id, quantity_on_hand, status)
SELECT facility_id, batch_id, quantity, 'AVAILABLE' FROM inventory_seed
ON CONFLICT (facility_id, batch_id, status) DO NOTHING;

WITH ids AS (
  SELECT
    (SELECT medicine_id FROM medicines WHERE generic_name = 'Human Insulin' AND strength_value = 100 AND strength_unit = 'IU/mL' AND form = 'Vial') AS medicine_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'WH-CENTRAL-001') AS central_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'DH-CENTRAL-001') AS hospital_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'CHC-RIVER-001') AS river_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'PHC-NAV-001') AS navjeevan_id
), safety_seed AS (
  SELECT central_id AS facility_id, medicine_id, 280.00::DECIMAL AS safety_stock_qty, '14 days of simulated warehouse demand' AS basis FROM ids
  UNION ALL SELECT hospital_id, medicine_id, 260.00::DECIMAL, '10 days of simulated hospital demand' FROM ids
  UNION ALL SELECT river_id, medicine_id, 80.00::DECIMAL, '10 days of simulated CHC demand' FROM ids
  UNION ALL SELECT navjeevan_id, medicine_id, 112.00::DECIMAL, '14 days of simulated PHC demand' FROM ids
)
INSERT INTO facility_safety_stock (facility_id, medicine_id, safety_stock_qty, basis, confirmed_by_aaryan)
SELECT facility_id, medicine_id, safety_stock_qty, basis, FALSE FROM safety_seed
ON CONFLICT (facility_id, medicine_id) DO NOTHING;

WITH ids AS (
  SELECT
    (SELECT medicine_id FROM medicines WHERE generic_name = 'Human Insulin' AND strength_value = 100 AND strength_unit = 'IU/mL' AND form = 'Vial') AS medicine_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'WH-CENTRAL-001') AS central_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'DH-CENTRAL-001') AS hospital_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'CHC-RIVER-001') AS river_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'PHC-NAV-001') AS navjeevan_id
), daily AS (
  SELECT central_id AS facility_id, medicine_id, 20.00::DECIMAL AS quantity, day::DATE AS consumption_date
  FROM ids CROSS JOIN generate_series(DATE '2026-08-29', DATE '2026-09-11', INTERVAL '1 day') AS day
  UNION ALL
  SELECT hospital_id, medicine_id, 26.00::DECIMAL, day::DATE
  FROM ids CROSS JOIN generate_series(DATE '2026-08-29', DATE '2026-09-11', INTERVAL '1 day') AS day
  UNION ALL
  SELECT river_id, medicine_id, 8.00::DECIMAL, day::DATE
  FROM ids CROSS JOIN generate_series(DATE '2026-08-29', DATE '2026-09-11', INTERVAL '1 day') AS day
  UNION ALL
  SELECT navjeevan_id, medicine_id, 8.00::DECIMAL, day::DATE
  FROM ids CROSS JOIN generate_series(DATE '2026-08-29', DATE '2026-09-11', INTERVAL '1 day') AS day
)
INSERT INTO consumption (facility_id, medicine_id, consumption_date, quantity_consumed)
SELECT facility_id, medicine_id, consumption_date, quantity FROM daily
ON CONFLICT (facility_id, medicine_id, consumption_date) DO NOTHING;

WITH ids AS (
  SELECT
    (SELECT medicine_id FROM medicines WHERE generic_name = 'Human Insulin' AND strength_value = 100 AND strength_unit = 'IU/mL' AND form = 'Vial') AS medicine_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'PHC-NAV-001') AS navjeevan_id
)
INSERT INTO replenishments (facility_id, medicine_id, expected_arrival_date, quantity, supplier_reliability_score, status)
SELECT navjeevan_id, medicine_id, DATE '2026-09-19', 100.00, 0.85, 'DELAYED' FROM ids
WHERE NOT EXISTS (
  SELECT 1 FROM replenishments r WHERE r.facility_id = ids.navjeevan_id AND r.medicine_id = ids.medicine_id
    AND r.expected_arrival_date = DATE '2026-09-19'
);

WITH ids AS (
  SELECT
    (SELECT facility_id FROM facilities WHERE facility_code = 'WH-CENTRAL-001') AS central_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'DH-CENTRAL-001') AS hospital_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'CHC-RIVER-001') AS river_id,
    (SELECT facility_id FROM facilities WHERE facility_code = 'PHC-NAV-001') AS navjeevan_id
), route_seed AS (
  SELECT central_id AS origin_facility_id, navjeevan_id AS destination_facility_id, 22.00::DECIMAL AS distance_km, 1.2::DECIMAL AS transport_time_hours FROM ids
  UNION ALL SELECT hospital_id, navjeevan_id, 18.00::DECIMAL, 1.0::DECIMAL FROM ids
  UNION ALL SELECT river_id, navjeevan_id, 14.00::DECIMAL, 0.8::DECIMAL FROM ids
)
INSERT INTO routes (origin_facility_id, destination_facility_id, distance_km, transport_time_hours, cold_chain_capable)
SELECT origin_facility_id, destination_facility_id, distance_km, transport_time_hours, TRUE FROM route_seed
ON CONFLICT (origin_facility_id, destination_facility_id) DO NOTHING;

-- Accounts are created through signup. Grant an approver role only to a
-- verified operator; never seed public passwords into the deployed database.

COMMIT;
