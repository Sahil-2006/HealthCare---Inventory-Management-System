const { DEMO_APPROVER } = require('./auth');
const { createMysqlAuthStore } = require('./mysql-auth-store');
const { createPostgresAuthStore } = require('./postgres-auth-store');

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

function createAuthStore(config) {
  // Auto-detect database type from DATABASE_URL
  const databaseUrl = config.databaseUrl || process.env.DATABASE_URL;
  const dbType = detectDatabaseType(databaseUrl);
  
  if (dbType === 'postgres') {
    console.log('Using PostgreSQL auth store');
    return createPostgresAuthStore(config);
  }
  
  if (config.dataSource === 'mysql' || dbType === 'mysql') {
    console.log('Using MySQL auth store');
    return createMysqlAuthStore(config);
  }
  
  console.log('Using fixture auth store');
  return createFixtureAuthStore();
}

module.exports = { createAuthStore, resetFixtureAuthState };
