const fs = require('node:fs');
const path = require('node:path');

function postgresTls(config) {
  if (config.environment !== 'production' && !config.databaseSsl) return false;
  const host = new URL(config.databaseUrl).hostname;
  const ssl = { rejectUnauthorized: config.databaseSslRejectUnauthorized !== false };
  if (host.endsWith('.supabase.co') || host.endsWith('.pooler.supabase.com')) {
    ssl.ca = fs.readFileSync(path.join(__dirname, '../certs/supabase-ca.crt'), 'utf8');
  }
  return ssl;
}

module.exports = { postgresTls };
