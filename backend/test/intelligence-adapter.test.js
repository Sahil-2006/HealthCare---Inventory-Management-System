const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const { createIntelligenceAdapter } = require('../src/intelligence-adapter');

test('NO_SAFE_PLAN preserves capacity and escalation details without a fallback', async (t) => {
  const details = { requestedQuantity: 45, safeCapacity: 14.3, unmetQuantity: 30.7, unit: 'mL', recommendedEscalation: ['Review replenishment.'] };
  const server = http.createServer((request, response) => {
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: { code: 'NO_SAFE_PLAN', message: 'No safe plan', details } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const adapter = createIntelligenceAdapter({ intelligenceServiceUrl: `http://127.0.0.1:${server.address().port}`, intelligenceTimeoutMs: 1000 }, {});
  await assert.rejects(adapter.optimize({ quantity: 45, horizonDays: 14 }), (error) => {
    assert.equal(error.code, 'NO_SAFE_PLAN');
    assert.equal(error.status, 422);
    assert.deepEqual(error.details, details);
    return true;
  });
});

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

test('uses the intelligence optimizer plan without discarding batch persistence data', async (t) => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      id: 'plan-ai-001', status: 'PROPOSED', medicine: { id: '7' },
      transfers: [{ fromFacilityId: 'WH-001', toFacilityId: 'PHC-001', medicineId: '7', batchId: 99, quantity: 40 }],
      simulation: {
        baseline: { facilities: [] }, intervention: { facilities: [] }, transferEvaluations: [],
        comparison: { safeToRecommend: true }
      }
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const adapter = createIntelligenceAdapter({ intelligenceServiceUrl: `http://127.0.0.1:${port}`, intelligenceTimeoutMs: 1000 }, {});

  const plan = await adapter.optimize({ destinationFacilityId: 'PHC-001', medicineId: '7', quantity: 40, horizonDays: 7 });

  assert.equal(plan.source, 'INTELLIGENCE_SERVICE');
  assert.equal(plan.transfers[0].batchId, 99);
});
