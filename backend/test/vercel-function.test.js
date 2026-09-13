const assert = require('node:assert/strict');
const { test } = require('node:test');

const app = require('../../api/[...path]');

test('Vercel serverless wrapper serves the fixture API without external services', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/region/summary`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.meta.source, 'FIXTURE_STORE');
  assert.equal(typeof payload.data.resilienceScore, 'number');
});
