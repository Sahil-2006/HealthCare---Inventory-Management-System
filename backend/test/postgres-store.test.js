const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PostgresInventoryStore, project } = require('../src/postgres-store');

const config = {
  databaseUrl: 'postgresql://not-used-in-tests', environment: 'production', simulationDate: '2026-09-11'
};

test('PostgreSQL projection preserves base units and protected safety stock', () => {
  assert.deepEqual(project({ effectiveStock: 90, dailyDemand: 10, protectedStock: 80 }), {
    effectiveStock: 90, dailyDemand: 10, daysRemaining: 9, protectedStock: 80,
    safeSurplus: 10, riskLabel: 'MEDIUM', riskScore: 43
  });
});

test('PostgreSQL store maps Supabase rows to the public API contract', async () => {
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes('FROM medicines')) return { rows: [{
        id: 7, genericName: 'Human Insulin', strengthValue: 100, strengthUnit: 'IU/mL', form: 'Vial',
        unit: 'mL', criticality: 'HIGH', storageMinC: 2, storageMaxC: 8, requiresColdChain: true
      }] };
      if (sql.includes('WITH stock AS')) return { rows: [{
        facilityId: 4, facilityCode: 'PHC-NAV-001', facilityName: 'Navjeevan PHC', facilityType: 'PHC', region: 'MEDRIPPLE District',
        latitude: '18.472000', longitude: '73.928000', populationServed: 12000, remotenessScore: '0.80',
        hasColdChain: true, medicineId: 7, genericName: 'Human Insulin', strengthValue: '100', strengthUnit: 'IU/mL',
        form: 'Vial', unit: 'mL', criticality: 'HIGH', requiresColdChain: true, effectiveStock: '22', recordedStock: '22',
        dailyDemand: '8', protectedStock: '112', incomingSupply: '100', incomingDate: '2026-09-19', incomingArrivalDay: 8
      }] };
      throw new Error(`Unexpected query: ${sql.slice(0, 80)}`);
    },
    async end() {}
  };
  const store = new PostgresInventoryStore(config, { pool });
  const facilities = await store.listFacilities();
  assert.equal(store.source, 'POSTGRES');
  assert.equal(facilities.length, 1);
  assert.equal(facilities[0].facilityId, 'PHC-NAV-001');
  assert.equal(facilities[0].medicine.unit, 'mL');
  assert.equal(facilities[0].riskLabel, 'CRITICAL');
  assert.equal(queries.length, 2);
  assert.equal(queries[1].values[0], '2026-09-11');
});

test('PostgreSQL transfer batch selection keeps stock usable through the requested horizon', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('FROM facilities')) return { rows: [{ id: 1, code: 'WH-CENTRAL-001' }] };
      if (sql.includes('FROM medicines')) return { rows: [{ id: 7, unit: 'mL' }] };
      if (sql.includes('FROM inventory i JOIN batches')) return { rows: [{ batchId: 14, batchNo: 'INS-CENTRAL-001' }] };
      throw new Error(`Unexpected query: ${sql.slice(0, 80)}`);
    },
    async end() {}
  };
  const store = new PostgresInventoryStore(config, { pool });
  const batch = await store.selectTransferBatch('WH-CENTRAL-001', '7', 14);
  assert.deepEqual(batch, { batchId: 14, batchNo: 'INS-CENTRAL-001' });
});

test('PostgreSQL approval reserves stock, transfer rows, and audit atomically', async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('UPDATE plans SET status')) return { rows: [{ plan_id: 'plan-postgres-001' }], rowCount: 1 };
      if (sql.includes('UPDATE inventory i SET')) return { rows: [{ inventory_id: 1 }], rowCount: 1 };
      if (sql.includes('INSERT INTO transfers')) return { rows: [{ transfer_id: 91 }], rowCount: 1 };
      if (sql.includes('INSERT INTO audit_events')) return { rows: [{ audit_id: 101 }], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql.slice(0, 80)}`);
    },
    release() { calls.push({ sql: 'RELEASE' }); }
  };
  const store = new PostgresInventoryStore(config, { pool: { async connect() { return client; }, async end() {} } });
  const result = await store.recordPlanDecision({
    plan: { id: 'plan-postgres-001', horizonDays: 14, transfers: [{ fromFacilityId: 'WH-CENTRAL-001', toFacilityId: 'PHC-NAV-001', medicineId: '7', batchId: 14, quantity: 40 }] },
    decision: 'APPROVE', actor: 'Approver <approver@example.test>', note: 'Reserve approved stock.',
    beforeState: { status: 'PROPOSED' }, afterState: { status: 'RESERVED' }
  });
  assert.equal(result.storage, 'POSTGRES');
  assert.equal(result.planStatus, 'RESERVED');
  assert.equal(result.auditId, 101);
  assert.ok(calls.some((call) => call.sql.includes('UPDATE inventory i SET') && call.sql.includes('safety_stock_qty')));
  assert.equal(calls.at(-1).sql, 'RELEASE');
});
