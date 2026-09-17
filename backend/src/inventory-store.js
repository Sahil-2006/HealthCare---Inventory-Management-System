const fixture = require('./fixture-store');
const { createMysqlStore } = require('./mysql-store');
const { PostgresInventoryStore } = require('./postgres-store');

function createFixtureStore() {
  return {
    source: 'FIXTURE_STORE',
    async getHealth() {
      return { connected: true, mode: 'fixture' };
    },
    async listFacilities() {
      return fixture.listFacilities();
    },
    async getInventory(facilityId) {
      return fixture.getInventory(facilityId);
    },
    async listMedicines() {
      return [fixture.medicine];
    },
    async getScenarioProfile(facilityId, medicineId) {
      return fixture.getScenarioProfile(facilityId, medicineId);
    },
    async listScenarioProfiles(medicineId) {
      return fixture.listScenarioProfiles(medicineId);
    },
    async getRoute(fromFacilityId, toFacilityId) {
      return fixture.getRoute(fromFacilityId, toFacilityId);
    },
    async selectTransferBatch(facilityId, medicineId, horizonDays) {
      return fixture.selectTransferBatch(facilityId, medicineId, horizonDays);
    },
    async recordPlanDecision() {
      return { storage: 'MEMORY' };
    },
    async persistPlan(plan) {
      return { plan };
    },
    async getPlan() {
      return null;
    },
    async assertQuantityPrecision() {},
    async transitionPlan({ action }) {
      const statusByAction = { DISPATCH: 'IN_TRANSIT', DELIVER: 'DELIVERED', CANCEL: 'CANCELLED' };
      return { storage: 'MEMORY', planStatus: statusByAction[action] };
    },
    async listAuditEvents() {
      return [];
    }
  };
}

function detectDatabaseType(databaseUrl) {
  if (!databaseUrl) return null;
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    return 'postgres';
  }
  if (databaseUrl.startsWith('mysql://')) {
    return 'mysql';
  }
  return null;
}

function createInventoryStore(config) {
  // Auto-detect database type from DATABASE_URL
  const databaseUrl = config.databaseUrl || process.env.DATABASE_URL;
  const dbType = detectDatabaseType(databaseUrl);
  if ((databaseUrl && !dbType) || (config.dataSource === 'postgres' && dbType !== 'postgres')) {
    throw new Error('A valid PostgreSQL DATABASE_URL is required; fixture fallback is disabled for database configuration.');
  }
  
  if (dbType === 'postgres') {
    console.log('Using PostgreSQL store');
    return new PostgresInventoryStore({ ...config, databaseUrl });
  }
  
  if (config.dataSource === 'mysql' || dbType === 'mysql') {
    console.log('Using MySQL store');
    return createMysqlStore(config);
  }
  
  console.log('Using fixture store');
  return createFixtureStore();
}

module.exports = { createInventoryStore };
