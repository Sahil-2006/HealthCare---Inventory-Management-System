const assert = require('node:assert/strict');
const { test } = require('node:test');

const app = require('../api/[...path]');

test('Vercel serverless wrapper serves the fixture API without external services', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'demo.approver@medripple.demo', password: 'MedrippleDemo!2026' })
  });
  const loginPayload = await login.json();
  const response = await fetch(`http://127.0.0.1:${port}/api/region/summary`, {
    headers: {
      authorization: `Bearer ${loginPayload.data.token}`,
      origin: 'https://frontend-psi-plum-56.vercel.app'
    }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(login.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://frontend-psi-plum-56.vercel.app');
  assert.equal(payload.meta.source, 'FIXTURE_STORE');
  assert.equal(typeof payload.data.resilienceScore, 'number');
});
