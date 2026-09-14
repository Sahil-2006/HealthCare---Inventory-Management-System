const express = require('express');
const { AppError, asyncHandler } = require('./errors');
const { publicUser, requireAuthentication, requireRole } = require('./auth');
const { validateForecastRequest, validateTransfers, validateOptimizeRequest, validateDecision } = require('./validation');
const { simulateScenario, optimisePlan } = require('./scenario-service');
const { createPlanStore } = require('./plan-store');

function success(response, data, meta = {}) {
  response.json({ data, meta: { ...meta, requestId: response.locals.requestId } });
}

function createApiRouter({ authService, intelligenceAdapter, inventoryStore }) {
  const router = express.Router();
  const planStore = createPlanStore();
  const runScenario = async (input) => (await intelligenceAdapter.simulate(input))
    || simulateScenario(input, inventoryStore);
  const runOptimization = async (input) => {
    const intelligencePlan = await intelligenceAdapter.optimize(input);
    if (!intelligencePlan) return optimisePlan(input, inventoryStore, planStore, runScenario);
    return planStore.create({
      ...intelligencePlan,
      medicine: intelligencePlan.medicine,
      destinationFacilityId: intelligencePlan.destinationFacilityId,
      horizonDays: intelligencePlan.horizonDays,
      transfers: intelligencePlan.transfers,
      rationale: intelligencePlan.rationale,
      assumptions: intelligencePlan.assumptions,
      simulation: intelligencePlan.simulation
    });
  };

  router.post('/auth/signup', asyncHandler(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    success(response, await authService.register(request.body), { authentication: true });
  }));

  router.post('/auth/login', asyncHandler(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    success(response, await authService.login(request.body), { authentication: true });
  }));

  router.get('/auth/me', requireAuthentication(authService), (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    success(response, { user: publicUser(request.user) }, { authentication: true });
  });

  router.post('/auth/logout', requireAuthentication(authService), (request, response) => {
    // JWT sessions are stateless. The client removes its token; expiry bounds
    // any copied token without keeping a server-side session table.
    response.setHeader('Cache-Control', 'no-store');
    success(response, { loggedOut: true }, { authentication: true });
  });

  router.use(requireAuthentication(authService));

  router.get('/region/summary', asyncHandler(async (request, response) => {
    const facilities = await inventoryStore.listFacilities();
    const criticalFacilities = facilities.filter((facility) => facility.riskLabel === 'CRITICAL');
    const sortedByCoverage = [...facilities]
      .filter((facility) => facility.daysRemaining !== null)
      .sort((left, right) => left.daysRemaining - right.daysRemaining);
    const averageRisk = facilities.length
      ? facilities.reduce((total, facility) => total + facility.riskScore, 0) / facilities.length
      : 0;
    const patientDaysAtRisk = facilities.reduce((total, facility) => {
      const shortageBeforeWeekEnd = Math.max(0, 7 - (facility.daysRemaining || 0));
      return total + Math.ceil(shortageBeforeWeekEnd * facility.dailyDemand);
    }, 0);
    success(response, {
      resilienceScore: Math.max(0, Math.round(100 - averageRisk)),
      earliestStockout: sortedByCoverage[0]
        ? { facilityId: sortedByCoverage[0].facilityId, facilityName: sortedByCoverage[0].name || sortedByCoverage[0].facilityName, daysRemaining: sortedByCoverage[0].daysRemaining }
        : null,
      criticalFacilityCount: criticalFacilities.length,
      patientDaysAtRisk,
      alerts: criticalFacilities.map((facility) => ({
        facilityId: facility.facilityId, riskLabel: facility.riskLabel, cause: 'LOW_SIMULATED_COVERAGE', daysRemaining: facility.daysRemaining
      })),
      dataFreshness: inventoryStore.source === 'MYSQL' ? 'SIMULATED DATABASE' : 'SIMULATED FIXTURE'
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
    success(response, forecast, { source: forecast.source, fallback: forecast.isFallback === true });
  }));

  router.post('/scenarios/simulate', asyncHandler(async (request, response) => {
    const input = validateTransfers(request.body);
    const scenario = await runScenario(input);
    success(response, scenario, {
      source: scenario.source || inventoryStore.source,
      fallback: scenario.source !== 'INTELLIGENCE_SERVICE'
    });
  }));

  router.post('/plans/optimize', asyncHandler(async (request, response) => {
    const input = validateOptimizeRequest(request.body);
    const plan = await runOptimization(input);
    success(response, plan, {
      source: plan.source || plan.simulation?.source || inventoryStore.source,
      fallback: (plan.source || plan.simulation?.source) !== 'INTELLIGENCE_SERVICE',
      decisionSupportOnly: true
    });
  }));

  router.get('/plans/:planId', (request, response) => {
    const plan = planStore.get(request.params.planId);
    if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'The requested plan was not found.');
    success(response, plan, { source: inventoryStore.source });
  });

  router.post('/plans/:planId/approve', requireRole('APPROVER', 'ADMIN'), asyncHandler(async (request, response) => {
    const decision = validateDecision(request.body);
    const actor = `${request.user.name} <${request.user.email}>`;
    const result = await planStore.decide(request.params.planId, { ...decision, actor }, inventoryStore);
    success(response, result, { source: inventoryStore.source, decisionSupportOnly: true });
  }));

  router.get('/audit', asyncHandler(async (request, response) => {
    const auditEvents = inventoryStore.source === 'MYSQL'
      ? await inventoryStore.listAuditEvents()
      : planStore.listAudits();
    success(response, auditEvents, { source: inventoryStore.source });
  }));
  return router;
}

module.exports = { createApiRouter };
