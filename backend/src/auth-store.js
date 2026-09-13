const { DEMO_APPROVER } = require('./auth');
const { createMysqlAuthStore } = require('./mysql-auth-store');

let fixtureUsers = new Map();

function cloneUser(user) {
  return user ? { ...user } : null;
}

function resetFixtureAuthState() {
  fixtureUsers = new Map([[DEMO_APPROVER.email, { ...DEMO_APPROVER }]]);
}

resetFixtureAuthState();

function createFixtureAuthStore() {
  return {
    source: 'MEMORY',
    async findByEmail(email) {
      return cloneUser(fixtureUsers.get(email));
    },
    async create(user) {
      fixtureUsers.set(user.email, { ...user });
      return cloneUser(user);
    },
    async recordLogin() {
      return undefined;
    }
  };
}

function createAuthStore(config) {
  return config.dataSource === 'mysql' ? createMysqlAuthStore(config) : createFixtureAuthStore();
}

module.exports = { createAuthStore, resetFixtureAuthState };
