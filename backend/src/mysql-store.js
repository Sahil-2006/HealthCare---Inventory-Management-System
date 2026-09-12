const mysql = require('mysql2/promise');
const { AppError } = require('./errors');

const DEFAULT_FIXTURE_MEDICINE_ID = 'med-insulin-100iu-vial';

function asNumber(value) {
  return Number(value || 0);
}

function riskForDays(daysRemaining) {
  if (daysRemaining <= 3) return { label: 'CRITICAL', score: 92 };
  if (daysRemaining <= 7) return { label: 'HIGH', score: 72 };
  if (daysRemaining <= 14) return { label: 'MEDIUM', score: 43 };
  return { label: 'LOW', score: 14 };
}

function project(row) {
  const effectiveStock = asNumber(row.effectiveStock);
  const dailyDemand = asNumber(row.dailyDemand);
  const protectedStock = asNumber(row.protectedStock);
  const daysRemaining = dailyDemand > 0 ? Number((effectiveStock / dailyDemand).toFixed(1)) : null;
  const risk = daysRemaining === null ? { label: 'LOW', score: 0 } : riskForDays(daysRemaining);

  return {
    effectiveStock,
    dailyDemand,
    daysRemaining,
    protectedStock,
    safeSurplus: Math.max(0, Number((effectiveStock - protectedStock).toFixed(2))),
    riskLabel: risk.label,
    riskScore: risk.score
  };
}

function createPoolOptions(config) {
  if (config.databaseUrl) return config.databaseUrl;
  return {
    host: config.databaseHost,
    port: config.databasePort,
    database: config.databaseName,
    user: config.databaseUser,
    password: config.databasePassword,
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true
  };
}

function createMysqlStore(config, dependencies = {}) {
  const pool = dependencies.pool || mysql.createPool(createPoolOptions(config));

  async function query(sql, values = []) {
    try {
      const [rows] = await pool.query(sql, values);
      return rows;
    } catch (error) {
      throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The MEDRIPPLE database is unavailable. Check the MySQL connection and run the database seed.', {
        databaseCode: error.code
      });
    }
  }

  async function resolveFacility(facilityId) {
    const rows = await query(
      `SELECT facility_id AS id, facility_code AS code, name, facility_type AS type
       FROM facilities
       WHERE facility_code = ? OR CAST(facility_id AS CHAR) = ?
       LIMIT 1`,
      [facilityId, facilityId]
    );
    return rows[0] || null;
  }

  async function resolveMedicine(medicineId) {
    const requestedId = String(medicineId);
    const rows = await query(
      `SELECT medicine_id AS id, generic_name AS genericName, strength_value AS strengthValue,
              strength_unit AS strengthUnit, form, base_unit AS unit,
              criticality_level AS criticality, storage_temp_min_c AS storageMinC,
              storage_temp_max_c AS storageMaxC, requires_cold_chain AS requiresColdChain
       FROM medicines
       WHERE CAST(medicine_id AS CHAR) = ?
          OR (generic_name = 'Human Insulin' AND ? = ?)
       LIMIT 1`,
      [requestedId, requestedId, DEFAULT_FIXTURE_MEDICINE_ID]
    );
    return rows[0] || null;
  }

  async function listFacilityMedicineRows(medicine) {
    return query(
      `SELECT
          f.facility_id AS facilityId,
          f.facility_code AS facilityCode,
          f.name AS facilityName,
          f.facility_type AS facilityType,
          f.region,
          f.latitude,
          f.longitude,
          f.population_served AS populationServed,
          f.remoteness_score AS remotenessScore,
          m.medicine_id AS medicineId,
          m.generic_name AS genericName,
          m.strength_value AS strengthValue,
          m.strength_unit AS strengthUnit,
          m.form,
          m.base_unit AS unit,
          m.criticality_level AS criticality,
          COALESCE(stock.effective_stock, 0) AS effectiveStock,
          COALESCE(stock.recorded_stock, 0) AS recordedStock,
          COALESCE(demand.daily_demand, 0) AS dailyDemand,
          COALESCE(safety.safety_stock_qty, 0) AS protectedStock,
          COALESCE(incoming.quantity, 0) AS incomingSupply,
          incoming.expected_arrival_date AS incomingDate
       FROM facilities f
       CROSS JOIN medicines m
       LEFT JOIN (
          SELECT i.facility_id, b.medicine_id,
                 SUM(CASE WHEN i.status = 'AVAILABLE' AND b.quarantined = FALSE AND b.expiry_date >= ? THEN i.quantity_on_hand ELSE 0 END) AS effective_stock,
                 SUM(i.quantity_on_hand) AS recorded_stock
          FROM inventory i
          JOIN batches b ON b.batch_id = i.batch_id
          GROUP BY i.facility_id, b.medicine_id
       ) stock ON stock.facility_id = f.facility_id AND stock.medicine_id = m.medicine_id
       LEFT JOIN (
          SELECT facility_id, medicine_id, AVG(quantity_consumed) AS daily_demand
          FROM consumption
          WHERE consumption_date BETWEEN DATE_SUB(?, INTERVAL 13 DAY) AND ?
          GROUP BY facility_id, medicine_id
       ) demand ON demand.facility_id = f.facility_id AND demand.medicine_id = m.medicine_id
       LEFT JOIN facility_safety_stock safety
         ON safety.facility_id = f.facility_id AND safety.medicine_id = m.medicine_id
       LEFT JOIN (
          SELECT r.facility_id, r.medicine_id, r.quantity, r.expected_arrival_date
          FROM replenishments r
          JOIN (
            SELECT facility_id, medicine_id, MIN(expected_arrival_date) AS next_arrival
            FROM replenishments
            WHERE status IN ('SCHEDULED', 'DELAYED') AND expected_arrival_date >= ?
            GROUP BY facility_id, medicine_id
          ) next_r ON next_r.facility_id = r.facility_id
              AND next_r.medicine_id = r.medicine_id
              AND next_r.next_arrival = r.expected_arrival_date
       ) incoming ON incoming.facility_id = f.facility_id AND incoming.medicine_id = m.medicine_id
       WHERE m.medicine_id = ?
       ORDER BY f.facility_id`,
      [config.simulationDate, config.simulationDate, config.simulationDate, config.simulationDate, medicine.id]
    );
  }

  return {
    source: 'MYSQL',
    async getHealth() {
      await query('SELECT 1 AS connected');
      return { connected: true, mode: 'mysql' };
    },
    async listFacilities() {
      const medicine = await resolveMedicine(DEFAULT_FIXTURE_MEDICINE_ID);
      if (!medicine) return [];
      const rows = await listFacilityMedicineRows(medicine);
      return rows.map((row) => ({
        id: row.facilityCode,
        facilityId: row.facilityCode,
        name: row.facilityName,
        type: row.facilityType,
        district: row.region,
        latitude: asNumber(row.latitude),
        longitude: asNumber(row.longitude),
        populationServed: asNumber(row.populationServed),
        remotenessScore: asNumber(row.remotenessScore),
        medicineId: String(row.medicineId),
        medicine: {
          id: String(row.medicineId),
          genericName: row.genericName,
          strength: `${row.strengthValue} ${row.strengthUnit}`,
          dosageForm: row.form,
          unit: row.unit,
          criticality: row.criticality
        },
        ...project(row),
        incomingSupply: asNumber(row.incomingSupply),
        incomingDate: row.incomingDate || null,
        dataFreshness: `SIMULATED DATABASE AS OF ${config.simulationDate}`
      }));
    },
    async getInventory(facilityId, medicineId = DEFAULT_FIXTURE_MEDICINE_ID) {
      const [facility, medicine] = await Promise.all([resolveFacility(facilityId), resolveMedicine(medicineId)]);
      if (!facility || !medicine) return null;

      const [batches, stockRows, demandRows, replenishmentRows] = await Promise.all([
        query(
          `SELECT b.batch_id AS batchId, b.batch_number AS batchNo, i.quantity_on_hand AS quantity,
                  b.expiry_date AS expiryDate,
                  CASE WHEN b.quarantined = TRUE OR i.status = 'QUARANTINED' THEN 'QUARANTINED'
                       WHEN i.status = 'EXPIRED' OR b.expiry_date < ? THEN 'EXPIRED'
                       ELSE i.status END AS status
           FROM inventory i
           JOIN batches b ON b.batch_id = i.batch_id
           WHERE i.facility_id = ? AND b.medicine_id = ?
           ORDER BY b.expiry_date ASC, b.batch_id ASC`,
          [config.simulationDate, facility.id, medicine.id]
        ),
        query(
          `SELECT
             COALESCE(SUM(i.quantity_on_hand), 0) AS recordedStock,
             COALESCE(SUM(CASE WHEN i.status = 'AVAILABLE' AND b.quarantined = FALSE AND b.expiry_date >= ? THEN i.quantity_on_hand ELSE 0 END), 0) AS effectiveStock
           FROM inventory i
           JOIN batches b ON b.batch_id = i.batch_id
           WHERE i.facility_id = ? AND b.medicine_id = ?`,
          [config.simulationDate, facility.id, medicine.id]
        ),
        query(
          `SELECT COALESCE(AVG(quantity_consumed), 0) AS dailyConsumption
           FROM consumption
           WHERE facility_id = ? AND medicine_id = ?
             AND consumption_date BETWEEN DATE_SUB(?, INTERVAL 13 DAY) AND ?`,
          [facility.id, medicine.id, config.simulationDate, config.simulationDate]
        ),
        query(
          `SELECT quantity, expected_arrival_date AS expectedArrivalDate, status
           FROM replenishments
           WHERE facility_id = ? AND medicine_id = ?
             AND status IN ('SCHEDULED', 'DELAYED') AND expected_arrival_date >= ?
           ORDER BY expected_arrival_date ASC
           LIMIT 1`,
          [facility.id, medicine.id, config.simulationDate]
        )
      ]);
      const stock = stockRows[0] || {};
      const replenishment = replenishmentRows[0] || null;
      const recordedStock = asNumber(stock.recordedStock);
      const effectiveStock = asNumber(stock.effectiveStock);

      return {
        facility: { id: facility.code, name: facility.name, type: facility.type },
        medicine: {
          id: String(medicine.id), genericName: medicine.genericName,
          strength: `${medicine.strengthValue} ${medicine.strengthUnit}`,
          dosageForm: medicine.form, unit: medicine.unit, criticality: medicine.criticality,
          storage: `${medicine.storageMinC}-${medicine.storageMaxC} C`
        },
        recordedStock,
        effectiveStock,
        excludedStock: Math.max(0, Number((recordedStock - effectiveStock).toFixed(2))),
        dailyConsumption: asNumber(demandRows[0]?.dailyConsumption),
        incomingReplenishment: replenishment
          ? { quantity: asNumber(replenishment.quantity), expectedArrivalDate: replenishment.expectedArrivalDate, status: replenishment.status }
          : null,
        batches: batches.map((batch) => ({ ...batch, quantity: asNumber(batch.quantity) })),
        fixtureAssumptions: [`All quantities are stored in ${medicine.unit}.`, `Database simulation date: ${config.simulationDate}.`]
      };
    },
    async listMedicines() {
      const rows = await query(
        `SELECT medicine_id AS id, generic_name AS genericName, strength_value AS strengthValue,
                strength_unit AS strengthUnit, form AS dosageForm, base_unit AS unit,
                criticality_level AS criticality, storage_temp_min_c AS storageMinC,
                storage_temp_max_c AS storageMaxC, requires_cold_chain AS requiresColdChain
         FROM medicines ORDER BY medicine_id`
      );
      return rows.map((medicine) => ({
        ...medicine,
        id: String(medicine.id),
        strength: `${medicine.strengthValue} ${medicine.strengthUnit}`,
        storage: `${medicine.storageMinC}-${medicine.storageMaxC} C`,
        requiresColdChain: Number(medicine.requiresColdChain) === 1
      }));
    },
    async close() {
      await pool.end();
    }
  };
}

module.exports = { createMysqlStore, createPoolOptions, project, riskForDays };
