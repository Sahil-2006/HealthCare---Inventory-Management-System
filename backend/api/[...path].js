const { createApp } = require('../src/app');
const { createConfig } = require('../src/config');

// The public Vercel demo uses deterministic fixture data. MySQL and FastAPI
// remain in compose.yaml because they require persistent external services.
const config = createConfig({
  ...process.env,
  DATA_SOURCE: 'fixture',
  INTELLIGENCE_SERVICE_URL: '',
  CORS_ORIGINS: ''
});

module.exports = createApp(config);
