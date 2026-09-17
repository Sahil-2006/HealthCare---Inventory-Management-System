const assert = require('node:assert/strict');
const { test } = require('node:test');
const { postgresTls } = require('../src/postgres-tls');
const { createPlanStore } = require('../src/plan-store');

test('Supabase production TLS verifies certificates using the official CA', () => {
  const ssl = postgresTls({ environment: 'production', databaseUrl: 'postgresql://postgres@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres' });
  assert.equal(ssl.rejectUnauthorized, true);
  assert.match(ssl.ca, /BEGIN CERTIFICATE/);
});

test('PostgreSQL approval audit matches RESERVED lifecycle status', async () => {
  const store = createPlanStore();
  store.create({ id: 'plan-test', transfers: [] });
  let captured;
  const result = await store.decide('plan-test', { decision: 'APPROVE', actor: 'Test', note: 'Reserve stock' }, {
    source: 'POSTGRES', async recordPlanDecision(input) { captured = input; return { planStatus: 'RESERVED', storage: 'POSTGRES' }; }
  });
  assert.equal(captured.afterState.status, 'RESERVED');
  assert.equal(result.audit.afterState.status, 'RESERVED');
});
