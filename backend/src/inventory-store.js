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
    }
  };
}

function createInventoryStore(config) {
  if (config.dataSource === 'mysql') return createMysqlStore(config);
  return createFixtureStore();
}

module.exports = { createInventoryStore };

