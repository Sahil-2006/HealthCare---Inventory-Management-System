const { AppError } = require('./errors');

function validateIntelligenceResponse(payload) {
  if (!payload || typeof payload !== 'object' || !payload.risk || !payload.forecast) {
    throw new Error('The intelligence response is missing forecast or risk data.');
  }
  if (!Number.isFinite(payload.risk.score) || typeof payload.risk.label !== 'string') {
    throw new Error('The intelligence response contains an invalid risk object.');
  }
  return payload;
}

function validateSimulationResponse(payload) {
  if (!payload || typeof payload !== 'object' || !payload.baseline || !payload.intervention || !payload.comparison) {
    throw new Error('The intelligence response is missing scenario data.');
  }
  if (!Array.isArray(payload.baseline.facilities) || !Array.isArray(payload.intervention.facilities)
    || !Array.isArray(payload.transferEvaluations) || typeof payload.comparison.safeToRecommend !== 'boolean') {
    throw new Error('The intelligence response contains an invalid scenario.');
  }
  return payload;
}

function validateOptimizationResponse(payload) {
  if (!payload || typeof payload !== 'object' || payload.status !== 'PROPOSED' || !payload.medicine || !payload.simulation) {
    throw new Error('The intelligence response is missing optimization plan data.');
  }
  if (typeof payload.id !== 'string' || !Array.isArray(payload.transfers) || payload.transfers.length === 0
    || !payload.transfers.every((transfer) => transfer.fromFacilityId && transfer.toFacilityId && transfer.medicineId
      && Number.isFinite(transfer.quantity) && transfer.quantity > 0 && transfer.batchId !== undefined)) {
    throw new Error('The intelligence response contains an invalid optimization plan.');
  }
  validateSimulationResponse(payload.simulation);
  if (payload.simulation.comparison.safeToRecommend !== true) {
    throw new Error('The intelligence response returned an unsafe optimization plan.');
  }
  return payload;
}

async function parseServiceError(response) {
  const payload = await response.json().catch(() => null);
  const code = payload?.error?.code || 'INTELLIGENCE_REQUEST_REJECTED';
  const message = payload?.error?.message || `Intelligence service returned ${response.status}.`;
  return new AppError(response.status, code, message);
}

async function createFallbackForecast({ facilityId, medicineId, horizonDays }, inventoryStore) {
  const profile = await inventoryStore.getScenarioProfile(facilityId, medicineId);
  if (!profile) {
    throw new AppError(404, 'FORECAST_TARGET_NOT_FOUND', 'The requested facility or medicine was not found.');
  }
  const source = inventoryStore.source === 'FIXTURE_STORE' ? 'FIXTURE_FALLBACK' : 'DATABASE_FALLBACK';
  return {
    forecast: {
      dailyDemand: profile.dailyDemand,
      lowerBound: Math.max(0, profile.dailyDemand * 0.9),
      upperBound: profile.dailyDemand * 1.1,
      horizonDays
    },
    risk: { score: profile.riskScore, label: profile.riskLabel },
    stockout: { daysRemaining: profile.daysRemaining, projectedWithinHorizon: profile.daysRemaining <= horizonDays },
    confidence: { label: 'LOW', reason: 'Deterministic fallback; awaiting the tested intelligence service.' },
    cause: profile.incomingArrivalDay && profile.incomingArrivalDay > profile.daysRemaining ? 'SUPPLY_DELAY' : 'INVENTORY_IMBALANCE',
    explanation: profile.incomingArrivalDay && profile.incomingArrivalDay > profile.daysRemaining
      ? 'Simulated stock will deplete before the scheduled replenishment arrives.'
      : 'Simulated coverage is based on effective stock and daily demand.',
    source,
    isFallback: true,
    decisionSupportOnly: true
  };
}

function createIntelligenceAdapter(config, inventoryStore) {
  return {
    async forecast(input) {
      if (!config.intelligenceServiceUrl) return createFallbackForecast(input, inventoryStore);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.intelligenceTimeoutMs);
      try {
        const response = await fetch(`${config.intelligenceServiceUrl}/forecast`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
          signal: controller.signal
        });
        if (!response.ok) {
          const serviceError = await parseServiceError(response);
          if (response.status >= 400 && response.status < 500) throw serviceError;
          throw new Error(serviceError.message);
        }
        const payload = validateIntelligenceResponse(await response.json());
        return { ...payload, source: 'INTELLIGENCE_SERVICE', decisionSupportOnly: true };
      } catch (error) {
        if (error instanceof AppError) throw error;
        return {
          ...(await createFallbackForecast(input, inventoryStore)),
          fallbackReason: error.name === 'AbortError' ? 'INTELLIGENCE_TIMEOUT' : 'INTELLIGENCE_UNAVAILABLE'
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    async simulate(input) {
      if (!config.intelligenceServiceUrl) return null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.intelligenceTimeoutMs);
      try {
        const response = await fetch(`${config.intelligenceServiceUrl}/scenarios/simulate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
          signal: controller.signal
        });
        if (!response.ok) {
          const serviceError = await parseServiceError(response);
          if (response.status >= 400 && response.status < 500) throw serviceError;
          throw new Error(serviceError.message);
        }
        return { ...validateSimulationResponse(await response.json()), source: 'INTELLIGENCE_SERVICE', decisionSupportOnly: true };
      } catch (error) {
        if (error instanceof AppError) throw error;
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
    async optimize(input) {
      if (!config.intelligenceServiceUrl) return null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.intelligenceTimeoutMs);
      try {
        const response = await fetch(`${config.intelligenceServiceUrl}/plans/optimize`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
          signal: controller.signal
        });
        if (!response.ok) {
          const serviceError = await parseServiceError(response);
          // Invalid input and NO_SAFE_PLAN are decision-support results, not
          // outages. Never replace either with a less-safe local plan.
          if (response.status >= 400 && response.status < 500) throw serviceError;
          throw new Error(serviceError.message);
        }
        return {
          ...validateOptimizationResponse(await response.json()),
          source: 'INTELLIGENCE_SERVICE',
          decisionSupportOnly: true
        };
      } catch (error) {
        if (error instanceof AppError) throw error;
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

module.exports = {
  createIntelligenceAdapter,
  validateIntelligenceResponse,
  validateSimulationResponse,
  validateOptimizationResponse,
  createFallbackForecast
};
