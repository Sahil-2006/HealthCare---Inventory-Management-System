const fixture = require('./fixture-store');
const { createMysqlStore } = require('./mysql-store');

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

function createInventoryStore(config) {
  if (config.dataSource === 'mysql') return createMysqlStore(config);
  return createFixtureStore();
}

module.exports = { createInventoryStore };
