const { createApp } = require('../backend/src/app');
const { createConfig } = require('../backend/src/config');

// Vercel serves the reviewable fixture vertical slice. The MySQL and FastAPI
// production-like stack remains in compose.yaml because it needs persistent
// storage and a separately running intelligence container.
const config = createConfig({
  ...process.env,
  DATA_SOURCE: 'fixture',
  INTELLIGENCE_SERVICE_URL: '',
  CORS_ORIGINS: ''
});

module.exports = createApp(config);
