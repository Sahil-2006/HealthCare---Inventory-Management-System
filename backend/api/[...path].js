const { createApp } = require('../src/app');
const { createConfig } = require('../src/config');

// The public Vercel demo uses deterministic fixture data. MySQL and FastAPI
// remain in compose.yaml because they require persistent external services.
const config = createConfig({
  ...process.env,
  DATA_SOURCE: 'fixture',
  INTELLIGENCE_SERVICE_URL: '',
  // The public fixture API accepts browser calls from the stable public UI.
  // A custom domain can override this through the protected Vercel setting.
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'https://frontend-psi-plum-56.vercel.app'
});

module.exports = createApp(config);
