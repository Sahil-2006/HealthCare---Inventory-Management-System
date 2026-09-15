const { createApp } = require('../src/app');
const { createConfig } = require('../src/config');

// Select the backing store from the deployment environment. Supabase uses a
// PostgreSQL DATABASE_URL; legacy MySQL deployments can still opt in with
// DATA_SOURCE=mysql and DATABASE_HOST. With neither configured, the public
// fixture remains available for demos and smoke tests.
const usesPostgres = Boolean(process.env.DATABASE_URL) && /^(postgres|postgresql):\/\//i.test(process.env.DATABASE_URL);
const usesManagedMysql = !usesPostgres && process.env.DATA_SOURCE === 'mysql' && Boolean(process.env.DATABASE_HOST);
const config = createConfig({
  ...process.env,
  DATA_SOURCE: usesPostgres ? 'postgres' : usesManagedMysql ? 'mysql' : 'fixture',
  INTELLIGENCE_SERVICE_URL: process.env.INTELLIGENCE_SERVICE_URL || '',
  // The public fixture API accepts browser calls from the stable public UI.
  // A custom domain can override this through the protected Vercel setting.
  CORS_ORIGINS: process.env.CORS_ORIGINS || ''
});

module.exports = createApp(config);
