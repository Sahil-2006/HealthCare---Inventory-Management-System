const { Pool } = require('pg');
const { AppError } = require('./errors');

const DEFAULT_FIXTURE_MEDICINE_ID = 'med-insulin-100iu-vial';

// PostgreSQL connection pool
let pool = null;

function getPool() {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected pool error:', err);
    });
  }
  return pool;
}

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
  const effectiveStock = asNumber(row.effectivestock || row.effectiveStock);
  const dailyDemand = asNumber(row.dailydemand || row.dailyDemand);
  const protectedStock = asNumber(row.protectedstock || row.protectedStock);
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

function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toScenarioProfile(row) {
  return {
    facilityId: row.facilitycode || row.facilityCode,
    facilityName: row.facilityname || row.facilityName,
    medicineId: String(row.medicineid || row.medicineId),
    medicine: {
      generic_name: row.generic_name,
      strength_value: asNumber(row.strength_value),
      strength_unit: row.strength_unit,
      form: row.form,
      base_unit: row.base_unit,
      criticality_level: row.criticality_level
    },
    ...project(row)
  };
}

function toPlan(row) {
  return {
    planId: row.plan_id,
    destinationFacilityId: row.destination_facility_id,
    medicineId: row.medicine_id,
    requestedQuantity: asNumber(row.requested_quantity),
    horizonDays: row.horizon_days,
    status: row.status,
    rationale: row.rationale,
    planJson: parseJson(row.plan_json, {}),
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by
  };
}

function toTransfer(row) {
  return {
    transferId: row.transfer_id,
    planId: row.plan_id,
    originFacilityId: row.origin_facility_id,
    destinationFacilityId: row.destination_facility_id,
    medicineId: row.medicine_id,
    batchId: row.batch_id,
    quantity: asNumber(row.quantity),
    status: row.status,
    rejectionReason: row.rejection_reason,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at,
    dispatchedAt: row.dispatched_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
    approvedBy: row.approved_by,
    note: row.note
  };
}

class PostgresInventoryStore {
  async getScenarioProfiles() {
    const db = getPool();
    const query = `
      SELECT
        f.facility_code AS "facilityCode",
        f.name AS "facilityName",
        m.medicine_id AS "medicineId",
        m.generic_name,
        m.strength_value,
        m.strength_unit,
        m.form,
        m.base_unit,
        m.criticality_level,
        COALESCE(SUM(i.quantity_on_hand), 0) AS "effectiveStock",
        COALESCE(AVG(c.quantity_consumed), 0) AS "dailyDemand",
        COALESCE(fss.safety_stock_qty, 0) AS "protectedStock"
      FROM facilities f
      CROSS JOIN medicines m
      LEFT JOIN inventory i ON i.facility_id = f.facility_id
        AND i.batch_id IN (
          SELECT batch_id FROM batches WHERE medicine_id = m.medicine_id
        )
        AND i.status = 'AVAILABLE'
      LEFT JOIN (
        SELECT facility_id, medicine_id, AVG(quantity_consumed) AS quantity_consumed
        FROM consumption
        WHERE consumption_date >= CURRENT_DATE - INTERVAL '14 days'
        GROUP BY facility_id, medicine_id
      ) c ON c.facility_id = f.facility_id AND c.medicine_id = m.medicine_id
      LEFT JOIN facility_safety_stock fss
        ON fss.facility_id = f.facility_id AND fss.medicine_id = m.medicine_id
      WHERE f.facility_type <> 'Warehouse'
      GROUP BY
        f.facility_code, f.name, m.medicine_id, m.generic_name,
        m.strength_value, m.strength_unit, m.form, m.base_unit,
        m.criticality_level, fss.safety_stock_qty
      ORDER BY f.facility_id, m.medicine_id
    `;

    const result = await db.query(query);
    return result.rows.map(toScenarioProfile);
  }

  async getScenarioProfileForFacilityAndMedicine(facilityCode, medicineId) {
    const db = getPool();
    const query = `
      SELECT
        f.facility_code AS "facilityCode",
        f.name AS "facilityName",
        m.medicine_id AS "medicineId",
        m.generic_name,
        m.strength_value,
        m.strength_unit,
        m.form,
        m.base_unit,
        m.criticality_level,
        COALESCE(SUM(i.quantity_on_hand), 0) AS "effectiveStock",
        COALESCE(AVG(c.quantity_consumed), 0) AS "dailyDemand",
        COALESCE(fss.safety_stock_qty, 0) AS "protectedStock"
      FROM facilities f
      CROSS JOIN medicines m
      LEFT JOIN inventory i ON i.facility_id = f.facility_id
        AND i.batch_id IN (
          SELECT batch_id FROM batches WHERE medicine_id = m.medicine_id
        )
        AND i.status = 'AVAILABLE'
      LEFT JOIN (
        SELECT facility_id, medicine_id, AVG(quantity_consumed) AS quantity_consumed
        FROM consumption
        WHERE consumption_date >= CURRENT_DATE - INTERVAL '14 days'
        GROUP BY facility_id, medicine_id
      ) c ON c.facility_id = f.facility_id AND c.medicine_id = m.medicine_id
      LEFT JOIN facility_safety_stock fss
        ON fss.facility_id = f.facility_id AND fss.medicine_id = m.medicine_id
      WHERE f.facility_code = $1
        AND m.medicine_id = $2
        AND f.facility_type <> 'Warehouse'
      GROUP BY
        f.facility_code, f.name, m.medicine_id, m.generic_name,
        m.strength_value, m.strength_unit, m.form, m.base_unit,
        m.criticality_level, fss.safety_stock_qty
    `;

    const result = await db.query(query, [facilityCode, parseInt(medicineId)]);
    if (result.rows.length === 0) {
      throw new AppError(`No profile found for facility ${facilityCode} and medicine ${medicineId}`, 404);
    }
    return toScenarioProfile(result.rows[0]);
  }

  async createPlan(planData) {
    const db = getPool();
    const query = `
      INSERT INTO plans (
        plan_id, destination_facility_id, medicine_id,
        requested_quantity, horizon_days, status, rationale, plan_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      planData.plan_id,
      planData.destination_facility_id,
      planData.medicine_id,
      planData.requested_quantity,
      planData.horizon_days,
      planData.status || 'PROPOSED',
      planData.rationale,
      JSON.stringify(planData.plan_json)
    ];

    const result = await db.query(query, values);
    return toPlan(result.rows[0]);
  }

  async getPlanById(planId) {
    const db = getPool();
    const result = await db.query('SELECT * FROM plans WHERE plan_id = $1', [planId]);
    if (result.rows.length === 0) {
      throw new AppError(`Plan ${planId} not found`, 404);
    }
    return toPlan(result.rows[0]);
  }

  async updatePlanStatus(planId, status, decidedBy = null) {
    const db = getPool();
    const query = `
      UPDATE plans
      SET status = $1, decided_at = CURRENT_TIMESTAMP, decided_by = $2
      WHERE plan_id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [status, decidedBy, planId]);
    if (result.rows.length === 0) {
      throw new AppError(`Plan ${planId} not found`, 404);
    }
    return toPlan(result.rows[0]);
  }

  async getTransfersByPlanId(planId) {
    const db = getPool();
    const result = await db.query(
      'SELECT * FROM transfers WHERE plan_id = $1 ORDER BY transfer_id',
      [planId]
    );
    return result.rows.map(toTransfer);
  }

  async createTransfer(transferData) {
    const db = getPool();
    const query = `
      INSERT INTO transfers (
        plan_id, origin_facility_id, destination_facility_id,
        medicine_id, batch_id, quantity, status, note
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      transferData.plan_id,
      transferData.origin_facility_id,
      transferData.destination_facility_id,
      transferData.medicine_id,
      transferData.batch_id,
      transferData.quantity,
      transferData.status || 'PROPOSED',
      transferData.note || null
    ];

    const result = await db.query(query, values);
    return toTransfer(result.rows[0]);
  }

  async updateTransferStatus(transferId, status, approvedBy = null, rejectionReason = null) {
    const db = getPool();
    const updates = ['status = $1'];
    const values = [status];
    let paramIndex = 2;

    if (status === 'APPROVED') {
      updates.push(`approved_at = CURRENT_TIMESTAMP`);
      updates.push(`approved_by = $${paramIndex}`);
      values.push(approvedBy);
      paramIndex++;
    }

    if (rejectionReason) {
      updates.push(`rejection_reason = $${paramIndex}`);
      values.push(rejectionReason);
      paramIndex++;
    }

    values.push(transferId);

    const query = `
      UPDATE transfers
      SET ${updates.join(', ')}
      WHERE transfer_id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    if (result.rows.length === 0) {
      throw new AppError(`Transfer ${transferId} not found`, 404);
    }
    return toTransfer(result.rows[0]);
  }

  async getFacilities() {
    const db = getPool();
    const result = await db.query('SELECT * FROM facilities ORDER BY facility_id');
    return result.rows;
  }

  async getMedicines() {
    const db = getPool();
    const result = await db.query('SELECT * FROM medicines ORDER BY medicine_id');
    return result.rows;
  }

  async createAuditEvent(eventData) {
    const db = getPool();
    const query = `
      INSERT INTO audit_events (
        entity_type, entity_id, action, actor, note,
        before_state_json, after_state_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      eventData.entity_type,
      eventData.entity_id,
      eventData.action,
      eventData.actor,
      eventData.note || null,
      eventData.before_state_json ? JSON.stringify(eventData.before_state_json) : null,
      eventData.after_state_json ? JSON.stringify(eventData.after_state_json) : null
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  async getAuditEvents(entityType = null, entityId = null, limit = 100) {
    const db = getPool();
    let query = 'SELECT * FROM audit_events';
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (entityType) {
      conditions.push(`entity_type = $${paramIndex}`);
      values.push(entityType);
      paramIndex++;
    }

    if (entityId) {
      conditions.push(`entity_id = $${paramIndex}`);
      values.push(entityId);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY event_timestamp DESC LIMIT $${paramIndex}`;
    values.push(limit);

    const result = await db.query(query, values);
    return result.rows;
  }

  async close() {
    if (pool) {
      await pool.end();
      pool = null;
    }
  }
}

module.exports = { PostgresInventoryStore };
