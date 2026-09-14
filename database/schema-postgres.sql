-- =====================================================================
-- MEDRIPPLE DATABASE SCHEMA - PostgreSQL (Supabase)
-- Converted from MySQL for Supabase deployment
-- Owner: Dhiren (Chemical Engineer & Data Owner)
-- Unit policy: ALL quantities stored in BASE UNITS ONLY.
-- =====================================================================

-- Create custom types for enums
CREATE TYPE facility_type_enum AS ENUM ('PHC','CHC','DistrictHospital','SubCentre','Warehouse');
CREATE TYPE base_unit_enum AS ENUM ('mg','mL','count');
CREATE TYPE criticality_enum AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE inventory_status_enum AS ENUM ('AVAILABLE','RESERVED','IN_TRANSIT','QUARANTINED','EXPIRED');
CREATE TYPE replenishment_status_enum AS ENUM ('SCHEDULED','DELAYED','ARRIVED','CANCELLED');
CREATE TYPE plan_status_enum AS ENUM ('PROPOSED','APPROVED','RESERVED','IN_TRANSIT','DELIVERED','REJECTED','CANCELLED');
CREATE TYPE transfer_status_enum AS ENUM ('PROPOSED','REJECTED_UNSAFE','REJECTED','APPROVED','RESERVED','IN_TRANSIT','DELIVERED','CANCELLED');
CREATE TYPE user_role_enum AS ENUM ('VIEWER','OPERATOR','APPROVER','ADMIN');

-- Drop existing tables if they exist
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS app_users CASCADE;
DROP TABLE IF EXISTS transfers CASCADE;
DROP TABLE IF EXISTS plans CASCADE;
DROP TABLE IF EXISTS routes CASCADE;
DROP TABLE IF EXISTS replenishments CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS facility_safety_stock CASCADE;
DROP TABLE IF EXISTS consumption CASCADE;
DROP TABLE IF EXISTS batches CASCADE;
DROP TABLE IF EXISTS medicines CASCADE;
DROP TABLE IF EXISTS facilities CASCADE;

-- ---------------------------------------------------------------------
-- FACILITIES
-- ---------------------------------------------------------------------
CREATE TABLE facilities (
    facility_id         SERIAL PRIMARY KEY,
    facility_code       VARCHAR(20) NOT NULL UNIQUE,
    name                VARCHAR(120) NOT NULL,
    facility_type       facility_type_enum NOT NULL,
    region              VARCHAR(80) NOT NULL,
    latitude            DECIMAL(9,6) NOT NULL,
    longitude           DECIMAL(9,6) NOT NULL,
    population_served   INT NOT NULL,
    remoteness_score    DECIMAL(4,2) NOT NULL,
    storage_capacity_ml INT NOT NULL,
    has_cold_chain      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- MEDICINES
-- ---------------------------------------------------------------------
CREATE TABLE medicines (
    medicine_id         SERIAL PRIMARY KEY,
    generic_name        VARCHAR(120) NOT NULL,
    strength_value      DECIMAL(10,3) NOT NULL,
    strength_unit       VARCHAR(20) NOT NULL,
    form                VARCHAR(40) NOT NULL,
    base_unit           base_unit_enum NOT NULL,
    storage_temp_min_c  DECIMAL(4,1) NOT NULL,
    storage_temp_max_c  DECIMAL(4,1) NOT NULL,
    requires_cold_chain BOOLEAN NOT NULL DEFAULT FALSE,
    criticality_level   criticality_enum NOT NULL,
    shelf_life_days     INT NOT NULL,
    UNIQUE (generic_name, strength_value, strength_unit, form)
);

-- ---------------------------------------------------------------------
-- BATCHES
-- ---------------------------------------------------------------------
CREATE TABLE batches (
    batch_id            SERIAL PRIMARY KEY,
    medicine_id         INT NOT NULL,
    batch_number        VARCHAR(40) NOT NULL,
    manufacture_date    DATE NOT NULL,
    expiry_date         DATE NOT NULL,
    quantity_received   DECIMAL(12,2) NOT NULL,
    supplier_name       VARCHAR(120),
    quarantined         BOOLEAN NOT NULL DEFAULT FALSE,
    quarantine_reason   VARCHAR(200),
    CONSTRAINT fk_batch_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id),
    CONSTRAINT chk_expiry_after_manufacture CHECK (expiry_date > manufacture_date)
);

-- ---------------------------------------------------------------------
-- INVENTORY
-- ---------------------------------------------------------------------
CREATE TABLE inventory (
    inventory_id        SERIAL PRIMARY KEY,
    facility_id         INT NOT NULL,
    batch_id            INT NOT NULL,
    quantity_on_hand    DECIMAL(12,2) NOT NULL,
    status              inventory_status_enum NOT NULL DEFAULT 'AVAILABLE',
    last_updated        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_inv_facility FOREIGN KEY (facility_id) REFERENCES facilities(facility_id),
    CONSTRAINT fk_inv_batch FOREIGN KEY (batch_id) REFERENCES batches(batch_id),
    CONSTRAINT chk_qty_non_negative CHECK (quantity_on_hand >= 0),
    UNIQUE (facility_id, batch_id, status)
);

-- ---------------------------------------------------------------------
-- CONSUMPTION
-- ---------------------------------------------------------------------
CREATE TABLE consumption (
    consumption_id      SERIAL PRIMARY KEY,
    facility_id         INT NOT NULL,
    medicine_id         INT NOT NULL,
    consumption_date    DATE NOT NULL,
    quantity_consumed   DECIMAL(12,2) NOT NULL,
    CONSTRAINT fk_cons_facility FOREIGN KEY (facility_id) REFERENCES facilities(facility_id),
    CONSTRAINT fk_cons_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id),
    UNIQUE (facility_id, medicine_id, consumption_date)
);

-- ---------------------------------------------------------------------
-- REPLENISHMENTS
-- ---------------------------------------------------------------------
CREATE TABLE replenishments (
    replenishment_id     SERIAL PRIMARY KEY,
    facility_id          INT NOT NULL,
    medicine_id          INT NOT NULL,
    batch_id             INT,
    expected_arrival_date DATE NOT NULL,
    actual_arrival_date   DATE,
    quantity             DECIMAL(12,2) NOT NULL,
    supplier_reliability_score DECIMAL(4,2) NOT NULL,
    status               replenishment_status_enum NOT NULL DEFAULT 'SCHEDULED',
    CONSTRAINT fk_rep_facility FOREIGN KEY (facility_id) REFERENCES facilities(facility_id),
    CONSTRAINT fk_rep_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id),
    CONSTRAINT fk_rep_batch FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
);

-- ---------------------------------------------------------------------
-- ROUTES
-- ---------------------------------------------------------------------
CREATE TABLE routes (
    route_id             SERIAL PRIMARY KEY,
    origin_facility_id   INT NOT NULL,
    destination_facility_id INT NOT NULL,
    distance_km          DECIMAL(8,2) NOT NULL,
    transport_time_hours DECIMAL(6,2) NOT NULL,
    cold_chain_capable   BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_route_origin FOREIGN KEY (origin_facility_id) REFERENCES facilities(facility_id),
    CONSTRAINT fk_route_dest FOREIGN KEY (destination_facility_id) REFERENCES facilities(facility_id),
    UNIQUE (origin_facility_id, destination_facility_id)
);

-- ---------------------------------------------------------------------
-- PLANS
-- ---------------------------------------------------------------------
CREATE TABLE plans (
    plan_id              VARCHAR(64) PRIMARY KEY,
    destination_facility_id INT NOT NULL,
    medicine_id          INT NOT NULL,
    requested_quantity   DECIMAL(12,2) NOT NULL,
    horizon_days         SMALLINT NOT NULL,
    status               plan_status_enum NOT NULL DEFAULT 'PROPOSED',
    rationale            TEXT NOT NULL,
    plan_json            JSONB NOT NULL,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    decided_at           TIMESTAMP NULL,
    decided_by           VARCHAR(120),
    CONSTRAINT chk_plan_quantity_positive CHECK (requested_quantity > 0),
    CONSTRAINT chk_plan_horizon CHECK (horizon_days IN (7, 14, 30)),
    CONSTRAINT fk_plan_destination FOREIGN KEY (destination_facility_id) REFERENCES facilities(facility_id),
    CONSTRAINT fk_plan_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id)
);

CREATE INDEX idx_plans_status_created ON plans(status, created_at);

-- ---------------------------------------------------------------------
-- TRANSFERS
-- ---------------------------------------------------------------------
CREATE TABLE transfers (
    transfer_id          SERIAL PRIMARY KEY,
    plan_id              VARCHAR(64) NOT NULL,
    origin_facility_id   INT NOT NULL,
    destination_facility_id INT NOT NULL,
    medicine_id          INT NOT NULL,
    batch_id             INT NOT NULL,
    quantity             DECIMAL(12,2) NOT NULL,
    status               transfer_status_enum NOT NULL DEFAULT 'PROPOSED',
    rejection_reason     VARCHAR(200),
    requested_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at          TIMESTAMP NULL,
    dispatched_at        TIMESTAMP NULL,
    delivered_at         TIMESTAMP NULL,
    cancelled_at         TIMESTAMP NULL,
    approved_by          VARCHAR(120),
    note                 VARCHAR(500),
    CONSTRAINT fk_tr_origin FOREIGN KEY (origin_facility_id) REFERENCES facilities(facility_id),
    CONSTRAINT fk_tr_dest FOREIGN KEY (destination_facility_id) REFERENCES facilities(facility_id),
    CONSTRAINT fk_tr_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id),
    CONSTRAINT fk_tr_batch FOREIGN KEY (batch_id) REFERENCES batches(batch_id),
    CONSTRAINT fk_tr_plan FOREIGN KEY (plan_id) REFERENCES plans(plan_id),
    CONSTRAINT chk_transfer_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX idx_transfers_plan_status ON transfers(plan_id, status);

-- ---------------------------------------------------------------------
-- AUDIT EVENTS
-- ---------------------------------------------------------------------
CREATE TABLE audit_events (
    audit_id             SERIAL PRIMARY KEY,
    entity_type          VARCHAR(40) NOT NULL,
    entity_id            VARCHAR(64) NOT NULL,
    action               VARCHAR(40) NOT NULL,
    actor                VARCHAR(120) NOT NULL,
    note                 VARCHAR(500),
    before_state_json    JSONB,
    after_state_json     JSONB,
    event_timestamp      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- APPLICATION USERS
-- ---------------------------------------------------------------------
CREATE TABLE app_users (
    user_id              UUID PRIMARY KEY,
    full_name            VARCHAR(120) NOT NULL,
    email                VARCHAR(254) NOT NULL UNIQUE,
    password_hash        VARCHAR(255) NOT NULL,
    role                 user_role_enum NOT NULL DEFAULT 'OPERATOR',
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at        TIMESTAMP NULL
);

-- ---------------------------------------------------------------------
-- FACILITY_SAFETY_STOCK
-- ---------------------------------------------------------------------
CREATE TABLE facility_safety_stock (
    facility_id          INT NOT NULL,
    medicine_id          INT NOT NULL,
    safety_stock_qty     DECIMAL(12,2) NOT NULL,
    basis                VARCHAR(200),
    confirmed_by_aaryan  BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (facility_id, medicine_id),
    CONSTRAINT fk_fss_facility FOREIGN KEY (facility_id) REFERENCES facilities(facility_id),
    CONSTRAINT fk_fss_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id)
);

-- Create indexes for performance
CREATE INDEX idx_inventory_facility ON inventory(facility_id);
CREATE INDEX idx_inventory_batch ON inventory(batch_id);
CREATE INDEX idx_consumption_facility_medicine ON consumption(facility_id, medicine_id);
CREATE INDEX idx_consumption_date ON consumption(consumption_date);
CREATE INDEX idx_replenishments_facility ON replenishments(facility_id);
CREATE INDEX idx_transfers_status ON transfers(status);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
