const { createApp } = require('../src/app');
const { createConfig } = require('../src/config');

// Determine data source from environment
const DATABASE_URL = process.env.DATABASE_URL || '';
const usesPostgres = DATABASE_URL && /^(postgres|postgresql):\/\//i.test(DATABASE_URL);
const usesMysql = !usesPostgres && process.env.DATA_SOURCE === 'mysql' && process.env.DATABASE_HOST;
const dataSource = usesPostgres ? 'postgres' : usesMysql ? 'mysql' : process.env.DATA_SOURCE || 'fixture';

// Create config with proper key names
const config = createConfig({
  ...process.env,
  // Vercel supplies NODE_ENV=production through vercel.json. Keeping the
  // local default as development lets the serverless wrapper be smoke-tested
  // without a production signing secret.
  NODE_ENV: process.env.NODE_ENV || (process.env.VERCEL ? 'production' : 'development'),
  DATA_SOURCE: dataSource,
  DATABASE_URL: DATABASE_URL,
  DATABASE_HOST: process.env.DATABASE_HOST || '',
  DATABASE_PORT: process.env.DATABASE_PORT || '3306',
  DATABASE_NAME: process.env.DATABASE_NAME || 'medripple',
  DATABASE_USER: process.env.DATABASE_USER || 'medripple',
  DATABASE_PASSWORD: process.env.DATABASE_PASSWORD || '',
  AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET || '',
  CORS_ORIGINS: process.env.CORS_ORIGINS || '',
  INTELLIGENCE_SERVICE_URL: process.env.INTELLIGENCE_SERVICE_URL || ''
});

// Create Express app
const app = createApp(config);

// Export for Vercel serverless
module.exports = app;
