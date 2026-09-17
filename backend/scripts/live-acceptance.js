// Explicit live check: creates one OPERATOR and a proposed plan, never reserves
// or transfers inventory. Credentials stay in memory and are never logged.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

async function main() {
  const base = process.env.ACCEPTANCE_BASE_URL;
  if (!base?.startsWith('https://')) throw new Error('Set ACCEPTANCE_BASE_URL to the intended HTTPS backend.');
  const email = `acceptance-${crypto.randomUUID()}@example.test`;
  const password = `${crypto.randomBytes(24).toString('base64url')}9a`;
  let token;
  async function call(path, body, expectedStatus = 200) {
    const response = await fetch(`${base}${path}`, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(60000),
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json();
    assert.equal(response.status, expectedStatus, `${path}: ${payload.error?.code || response.status}`);
    return payload;
  }
  assert.equal((await call('/health')).data.dataSource, 'POSTGRES');
  await call('/api/facilities', null, 401);
  const registered = (await call('/api/auth/signup', { name: 'Deployment Acceptance Operator', email, password })).data;
  assert.equal(registered.user.role, 'OPERATOR');
  const login = (await call('/api/auth/login', { email, password })).data;
  token = login.token;
  assert.equal(login.user.id, registered.user.id);
  assert.equal((await call('/api/auth/me')).data.user.id, registered.user.id);
  const facilities = (await call('/api/facilities')).data;
  assert.ok(facilities.length >= 2);
  const target = facilities.find((row) => row.facilityId === 'PHC-NAV-001');
  assert.ok(target);
  const medicineId = target.medicine.id;
  const inventory = (await call(`/api/facilities/${target.facilityId}/inventory?medicineId=${medicineId}`)).data;
  assert.ok(inventory.effectiveStock > 0);
  const forecast = (await call('/api/forecast', { facilityId: target.facilityId, medicineId, horizonDays: 14 })).data;
  assert.equal(forecast.source, 'INTELLIGENCE_SERVICE');
  assert.equal(forecast.dataContext.dataSource, 'POSTGRES');
  const plan = (await call('/api/plans/optimize', { destinationFacilityId: target.facilityId, medicineId, quantity: 45, horizonDays: 14 })).data;
  assert.equal(plan.simulation.comparison.safeToRecommend, true);
  assert.equal((await call(`/api/plans/${plan.id}`)).data.id, plan.id);
  await call(`/api/plans/${plan.id}/approve`, { decision: 'APPROVE', note: 'Unauthorized acceptance probe; must not mutate stock.' }, 403);
  const after = (await call(`/api/facilities/${target.facilityId}/inventory?medicineId=${medicineId}`)).data;
  assert.equal(after.effectiveStock, inventory.effectiveStock);
  assert.ok(Array.isArray((await call('/api/audit')).data));
  console.log(JSON.stringify({ passed: true, source: 'POSTGRES', facilityCount: facilities.length,
    persistentSignupLogin: true, accountId: registered.user.id, accountEmail: email,
    forecastModel: forecast.modelVersion, planId: plan.id,
    solver: plan.solver?.algorithm, operatorApprovalDenied: true, inventoryUnchanged: true }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
