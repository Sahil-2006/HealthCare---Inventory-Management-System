const { createApp } = require('../src/app');
const { createConfig } = require('../src/config');

// Vercel defaults to the deterministic public fixture. A deployment can opt
// into a managed MySQL/FastAPI pair by setting DATA_SOURCE=mysql together with
// DATABASE_HOST and INTELLIGENCE_SERVICE_URL in its protected environment.
const usesManagedMysql = process.env.DATA_SOURCE === 'mysql' && Boolean(process.env.DATABASE_HOST);
const config = createConfig({
  ...process.env,
  DATA_SOURCE: usesManagedMysql ? 'mysql' : 'fixture',
  INTELLIGENCE_SERVICE_URL: process.env.INTELLIGENCE_SERVICE_URL || '',
  // The public fixture API accepts browser calls from the stable public UI.
  // A custom domain can override this through the protected Vercel setting.
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'https://frontend-psi-plum-56.vercel.app'
});

module.exports = createApp(config);
