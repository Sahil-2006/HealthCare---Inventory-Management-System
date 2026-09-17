import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noSafePlanOutcome } from '../src/services/optimizationOutcome.js';

test('safety rejection keeps requested horizon, quantity and live diagnostics', () => {
  const details = { safeCapacity: 14.3, unmetQuantity: 30.7, unit: 'mL' };
  const result = noSafePlanOutcome({ status: 422, code: 'NO_SAFE_PLAN', message: 'No safe plan', details }, { horizon: 14, quantity: 45 });
  assert.deepEqual(result, { noSafePlan: true, horizon: 14, quantity: 45, message: 'No safe plan', details });
  assert.equal(result.scenarios, undefined); // Never invent a successful recommendation.
});

test('an older backend without diagnostics still produces a usable safety state', () => {
  assert.deepEqual(noSafePlanOutcome({ status: 422, code: 'NO_SAFE_PLAN' }, { horizon: 30, quantity: 12 }).details, {});
});

test('network, service, and other validation failures remain errors', () => {
  for (const error of [new TypeError('Failed to fetch'), { status: 503, code: 'INTELLIGENCE_UNAVAILABLE' }, { status: 422, code: 'INVALID_QUANTITY' }]) {
    assert.throws(() => noSafePlanOutcome(error, { horizon: 7, quantity: 45 }), (thrown) => thrown === error);
  }
});
