const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createMysqlStore, project } = require('../src/mysql-store');

const config = {
  databaseUrl: '', databaseHost: '127.0.0.1', databasePort: 3306, databaseName: 'medripple',
  databaseUser: 'medripple', databasePassword: '', simulationDate: '2026-09-11'
};

test('database projection preserves base units and protected safety stock', () => {
  assert.deepEqual(project({ effectiveStock: 90, dailyDemand: 10, protectedStock: 80 }), {
    effectiveStock: 90,
    dailyDemand: 10,
    daysRemaining: 9,
    protectedStock: 80,
    safeSurplus: 10,
    riskLabel: 'MEDIUM',
    riskScore: 43
  });
});

test('MySQL store maps the database facility read model to the public API contract', async () => {
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes('FROM medicines') && sql.includes("generic_name = 'Human Insulin'")) {
        return [[{ id: 7, genericName: 'Human Insulin', strengthValue: 100, strengthUnit: 'IU/mL', form: 'Vial', unit: 'mL', criticality: 'CRITICAL', storageMinC: 2, storageMaxC: 8, requiresColdChain: 1 }]];
      }
      if (sql.includes('FROM facilities f') && sql.includes('CROSS JOIN medicines m')) {
        return [[{ facilityId: 6, facilityCode: 'PHC-VLR-001', facilityName: 'Vellore Primary Health Centre', facilityType: 'PHC', region: 'Vellore', latitude: 12.916517, longitude: 79.1325, populationServed: 78000, remotenessScore: 4, medicineId: 7, genericName: 'Human Insulin', strengthValue: 100, strengthUnit: 'IU/mL', form: 'Vial', unit: 'mL', criticality: 'CRITICAL', effectiveStock: 120, recordedStock: 125, dailyDemand: 30, protectedStock: 300, incomingSupply: 0, incomingDate: null }]];
      }
      throw new Error(`Unexpected query: ${sql.slice(0, 80)}`);
    },
    async end() {}
  };
  const store = createMysqlStore(config, { pool });
  const facilities = await store.listFacilities();

  assert.equal(facilities.length, 1);
  assert.equal(facilities[0].facilityId, 'PHC-VLR-001');
  assert.equal(facilities[0].medicine.unit, 'mL');
  assert.equal(facilities[0].riskLabel, 'HIGH');
  assert.equal(queries.length, 2);
});

test('MySQL transfer batch selection requires expiry through the selected horizon', async () => {
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes('FROM facilities') && sql.includes('facility_code = ?')) return [[{ id: 1, code: 'WH-001' }]];
      if (sql.includes('FROM medicines') && sql.includes('CAST(medicine_id AS CHAR)')) return [[{ id: 7, unit: 'mL' }]];
      if (sql.includes('FROM inventory i JOIN batches')) return [[{ batchId: 14, batchNo: 'TN-007-B01-26' }]];
      throw new Error(`Unexpected query: ${sql.slice(0, 80)}`);
    },
    async end() {}
  };
  const store = createMysqlStore(config, { pool });
  const batch = await store.selectTransferBatch('WH-001', '7', 14);
  assert.equal(batch.batchId, 14);
  const selection = queries.find((item) => item.sql.includes('FROM inventory i JOIN batches'));
  assert.match(selection.sql, /DATE_ADD\(\?, INTERVAL \? DAY\)/);
  assert.deepEqual(selection.values, [1, 7, '2026-09-11', 13]);
});

test('MySQL quantity precision rejects a fractional count and more than two decimals', async () => {
  const countPool = {
    async query() { return [[{ id: 8, unit: 'count' }]]; },
    async end() {}
  };
  const countStore = createMysqlStore(config, { pool: countPool });
  await assert.rejects(() => countStore.assertQuantityPrecision('8', 3.5), { code: 'INVALID_QUANTITY_PRECISION' });

  const liquidPool = {
    async query() { return [[{ id: 7, unit: 'mL' }]]; },
    async end() {}
  };
  const liquidStore = createMysqlStore(config, { pool: liquidPool });
  await assert.rejects(() => liquidStore.assertQuantityPrecision('7', 3.125), { code: 'INVALID_QUANTITY_PRECISION' });
  await liquidStore.assertQuantityPrecision('7', 3.12);
});

function decisionPlan() {
  return {
    id: 'plan-atomic-001', horizonDays: 14,
    transfers: [{ fromFacilityId: 'WH-001', toFacilityId: 'PHC-001', medicineId: '7', batchId: 14, quantity: 40 }]
  };
}

test('MySQL approval reserves donor stock, transfer item, and audit in one transaction', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('UPDATE plans')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE inventory i')) return [{ affectedRows: 1 }];
      if (sql.includes('INSERT INTO transfers')) return [{ affectedRows: 1, insertId: 91 }];
      if (sql.includes('INSERT INTO audit_events')) return [{ insertId: 101 }];
      throw new Error(`Unexpected transaction query: ${sql.slice(0, 80)}`);
    }
  };
  const store = createMysqlStore(config, { pool: { async getConnection() { return connection; }, async end() {} } });
  const result = await store.recordPlanDecision({
    plan: decisionPlan(), decision: 'APPROVE', actor: 'Approver <approver@example.test>', note: 'Reserve approved stock.',
    beforeState: { status: 'PROPOSED' }, afterState: { status: 'RESERVED' }
  });
  assert.equal(result.planStatus, 'RESERVED');
  assert.deepEqual(calls.filter((item) => typeof item === 'string'), ['BEGIN', 'COMMIT', 'RELEASE']);
  const stockUpdate = calls.find((item) => item.sql?.includes('UPDATE inventory i'));
  assert.match(stockUpdate.sql, /i\.quantity_on_hand - \? >= COALESCE\(safety\.safety_stock_qty, 0\)/);
  assert.deepEqual(stockUpdate.values, [40, 'WH-001', 14, '7', '2026-09-11', 13, 40, 40]);
  assert.ok(calls.some((item) => item.sql?.includes('INSERT INTO transfers') && item.values[0] === 'plan-atomic-001'));
});

test('MySQL stale stock rolls back without persisting a transfer or audit event', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
    async query(sql) {
      calls.push(sql);
      if (sql.includes('UPDATE plans')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE inventory i')) return [{ affectedRows: 0 }];
      throw new Error(`Unexpected transaction query: ${sql.slice(0, 80)}`);
    }
  };
  const store = createMysqlStore(config, { pool: { async getConnection() { return connection; }, async end() {} } });
  await assert.rejects(
    () => store.recordPlanDecision({ plan: decisionPlan(), decision: 'APPROVE', actor: 'Approver <approver@example.test>', note: 'Reserve.', beforeState: {}, afterState: {} }),
    { code: 'PLAN_STOCK_CHANGED' }
  );
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(!calls.some((item) => typeof item === 'string' && item.includes('INSERT INTO transfers')));
  assert.ok(!calls.some((item) => typeof item === 'string' && item.includes('INSERT INTO audit_events')));
});

test('MySQL delivery adds the reserved batch to recipient inventory and audits it', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('UPDATE plans SET status')) return [{ affectedRows: 1 }];
      if (sql.includes('FROM transfers WHERE plan_id')) return [[{ id: 91, originFacilityId: 1, destinationFacilityId: 2, batchId: 14, quantity: 40 }]];
      if (sql.includes('INSERT INTO inventory')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE transfers SET status')) return [{ affectedRows: 1 }];
      if (sql.includes('INSERT INTO audit_events')) return [{ insertId: 102 }];
      throw new Error(`Unexpected transaction query: ${sql.slice(0, 80)}`);
    }
  };
  const store = createMysqlStore(config, { pool: { async getConnection() { return connection; }, async end() {} } });
  const result = await store.transitionPlan({
    plan: decisionPlan(), action: 'DELIVER', actor: 'Approver <approver@example.test>', note: 'Receipt checked.', beforeState: { status: 'IN_TRANSIT' }
  });
  assert.equal(result.planStatus, 'DELIVERED');
  assert.deepEqual(calls.filter((item) => typeof item === 'string'), ['BEGIN', 'COMMIT', 'RELEASE']);
  const recipientInventory = calls.find((item) => item.sql?.includes('INSERT INTO inventory'));
  assert.deepEqual(recipientInventory.values, [2, 14, 40]);
});

