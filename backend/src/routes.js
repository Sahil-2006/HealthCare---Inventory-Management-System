const express = require('express');
const { AppError, asyncHandler } = require('./errors');
const store = require('./fixture-store');
const { validateForecastRequest, validateTransfers, validateOptimizeRequest, validateDecision } = require('./validation');
const { simulateScenario, optimisePlan } = require('./scenario-service');

function success(response, data, meta = {}) {
  response.json({ data, meta: { ...meta, requestId: response.locals.requestId } });
}

function createApiRouter({ intelligenceAdapter, inventoryStore }) {
  const router = express.Router();

  router.get('/region/summary', asyncHandler(async (request, response) => {
    const facilities = await inventoryStore.listFacilities();
    const criticalFacilities = facilities.filter((facility) => facility.riskLabel === 'CRITICAL');
    success(response, {
      resilienceScore: 61,
      earliestStockout: criticalFacilities[0]
        ? { facilityId: criticalFacilities[0].facilityId, facilityName: criticalFacilities[0].facilityName, daysRemaining: criticalFacilities[0].daysRemaining }
        : null,
      criticalFacilityCount: criticalFacilities.length,
      patientDaysAtRisk: 96,
      alerts: criticalFacilities.map((facility) => ({
        facilityId: facility.facilityId, riskLabel: facility.riskLabel, cause: 'SUPPLY_DELAY', daysRemaining: facility.daysRemaining
      })),
      dataFreshness: 'SIMULATED FIXTURE'
    }, { source: inventoryStore.source });
  }));

  router.get('/facilities', asyncHandler(async (request, response) => {
    success(response, await inventoryStore.listFacilities(), { source: inventoryStore.source });
  }));

  router.get('/facilities/:facilityId/inventory', asyncHandler(async (request, response) => {
    const inventory = await inventoryStore.getInventory(request.params.facilityId, request.query.medicineId);
    if (!inventory) throw new AppError(404, 'FACILITY_NOT_FOUND', 'The requested facility was not found.');
    success(response, inventory, { source: inventoryStore.source });
  }));

  router.get('/medicines', asyncHandler(async (request, response) => {
    success(response, await inventoryStore.listMedicines(), { source: inventoryStore.source });
  }));

  router.post('/forecast', asyncHandler(async (request, response) => {
    const input = validateForecastRequest(request.body);
    const forecast = await intelligenceAdapter.forecast(input);
    success(response, forecast, { source: forecast.source, fallback: forecast.source === 'FIXTURE_FALLBACK' });
  }));

  router.post('/scenarios/simulate', (request, response) => {
    const input = validateTransfers(request.body);
    success(response, simulateScenario(input), { source: 'FIXTURE_SIMULATOR' });
  });

  router.post('/plans/optimize', (request, response) => {
    const input = validateOptimizeRequest(request.body);
    success(response, optimisePlan(input, store.createPlan), { source: 'FIXTURE_OPTIMIZER', decisionSupportOnly: true });
  });

  router.get('/plans/:planId', (request, response) => {
    const plan = store.getPlan(request.params.planId);
    if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'The requested plan was not found.');
    success(response, plan, { source: 'FIXTURE_STORE' });
  });

  router.post('/plans/:planId/approve', (request, response) => {
    const decision = validateDecision(request.body);
    const currentPlan = store.getPlan(request.params.planId);
    if (!currentPlan) throw new AppError(404, 'PLAN_NOT_FOUND', 'The requested plan was not found.');
    if (currentPlan.status !== 'PROPOSED') {
      throw new AppError(409, 'PLAN_ALREADY_DECIDED', 'Only a proposed plan can be approved or rejected.');
    }
    const result = store.approvePlan(
      currentPlan.id,
      decision.decision,
      decision.actor,
      decision.note,
      { status: currentPlan.status, transfers: currentPlan.transfers },
      { status: decision.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', transfers: currentPlan.transfers }
    );
    success(response, result, { source: 'FIXTURE_STORE', decisionSupportOnly: true });
  });

  router.get('/audit', (request, response) => success(response, store.listAudits(), { source: 'FIXTURE_STORE' }));
  return router;
}

module.exports = { createApiRouter };
