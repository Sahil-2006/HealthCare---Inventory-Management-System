const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const { createIntelligenceAdapter } = require('../src/intelligence-adapter');

test('database mode fallback forecasts against active database profiles', async () => {
  const requested = [];
  const inventoryStore = {
    source: 'MYSQL',
    async getScenarioProfile(facilityId, medicineId) {
      requested.push({ facilityId, medicineId });
      return {
        facilityId,
        medicineId,
        dailyDemand: 30,
        daysRemaining: 2,
        riskScore: 92,
        riskLabel: 'CRITICAL',
        incomingArrivalDay: 8
      };
    }
  };
  const adapter = createIntelligenceAdapter({ intelligenceServiceUrl: '' }, inventoryStore);
  const forecast = await adapter.forecast({ facilityId: 'PHC-VLR-001', medicineId: '7', horizonDays: 14 });

  assert.deepEqual(requested, [{ facilityId: 'PHC-VLR-001', medicineId: '7' }]);
  assert.equal(forecast.source, 'DATABASE_FALLBACK');
  assert.equal(forecast.isFallback, true);
  assert.equal(forecast.cause, 'SUPPLY_DELAY');
});

test('uses the intelligence service for a compatible ripple simulation', async (t) => {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push({ url: request.url, body: JSON.parse(body) });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        baseline: { facilities: [] },
        intervention: { facilities: [] },
        transferEvaluations: [],
        comparison: { safeToRecommend: true }
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const adapter = createIntelligenceAdapter({ intelligenceServiceUrl: `http://127.0.0.1:${port}`, intelligenceTimeoutMs: 1000 }, {});

  const scenario = await adapter.simulate({ horizonDays: 14, transfers: [] });

  assert.equal(scenario.source, 'INTELLIGENCE_SERVICE');
  assert.equal(scenario.comparison.safeToRecommend, true);
  assert.deepEqual(requests, [{ url: '/scenarios/simulate', body: { horizonDays: 14, transfers: [] } }]);
});
