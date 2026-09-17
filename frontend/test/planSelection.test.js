import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanSelection, loadSelectedPlan } from '../src/services/planSelection.js';

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('opening review without a selection makes no optimizer or database request', async () => {
  const selection = createPlanSelection(storage());
  assert.deepEqual(await loadSelectedPlan(selection, () => assert.fail('must not request a plan')), { noSelectedPlan: true });
});

test('refresh preserves exact selection and reloads current database status', async () => {
  const session = storage();
  createPlanSelection(session).set({ planId: 'seven-day-plan' });
  const restored = createPlanSelection(session);
  const result = await loadSelectedPlan(restored, async (id) => {
    assert.equal(id, 'seven-day-plan');
    return { id, status: 'RESERVED' };
  });
  assert.equal(result.status, 'RESERVED');
});

test('failed assessment replaces old plan and keeps actual quantity and horizon', async () => {
  const session = storage();
  const selection = createPlanSelection(session);
  selection.set({ planId: 'old-plan' });
  const outcome = { noSafePlan: true, quantity: 80, horizon: 30, details: { safeCapacity: 0 } };
  selection.set(outcome);
  assert.deepEqual(await loadSelectedPlan(createPlanSelection(session), () => assert.fail('must not load stale plan')), outcome);
});

test('missing plan clears selection but a server outage is not hidden', async () => {
  const selection = createPlanSelection(storage());
  selection.set({ planId: 'removed-plan' });
  assert.deepEqual(await loadSelectedPlan(selection, async () => { throw { status: 404 }; }), { noSelectedPlan: true, missingPlan: true });
  assert.equal(selection.get(), null);
  selection.set({ planId: 'valid-plan' });
  await assert.rejects(loadSelectedPlan(selection, async () => { throw Object.assign(new Error('Unavailable'), { status: 503 }); }), { status: 503 });
  assert.equal(selection.get().planId, 'valid-plan');
});

test('clearing selection removes it across reloads', () => {
  const session = storage();
  const selection = createPlanSelection(session);
  selection.set({ planId: 'previous-user-plan' });
  selection.set(null);
  assert.equal(createPlanSelection(session).get(), null);
});

test('invalid or unavailable browser storage still permits in-session review', () => {
  const selection = createPlanSelection({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  selection.set({ planId: 'safe-plan' });
  assert.equal(selection.get().planId, 'safe-plan');
  assert.equal(createPlanSelection({ getItem: () => 'broken JSON' }).get(), null);
});
